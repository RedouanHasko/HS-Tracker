import { GoogleGenAI, ApiError } from '@google/genai';
import { Language } from '../types';

const STORAGE_KEY = 'hs_tracker_gemini_api_key';
const MODEL_STORAGE_KEY = 'hs_tracker_gemini_model';

export const GEMINI_MODEL_IDS = [
  'gemini-3-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
] as const;

export type GeminiModelId = (typeof GEMINI_MODEL_IDS)[number];

/** Newest-first; auto-fallback when quota or model unavailable */
export const GEMINI_MODEL_OPTIONS: { id: GeminiModelId; label: string }[] = [
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash (newest)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (high quota)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (legacy)' },
];

const DEFAULT_MODEL: GeminiModelId = 'gemini-3-flash';

const FALLBACK_MODELS: GeminiModelId[] = [...GEMINI_MODEL_IDS];

function isKnownModel(id: string): id is GeminiModelId {
  return (GEMINI_MODEL_IDS as readonly string[]).includes(id);
}

/** API key: user setting in localStorage, or build-time VITE_GEMINI_API_KEY */
export function getGeminiApiKey(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || '';
}

export function saveGeminiApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearGeminiApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Key saved via the in-app UI (localStorage only — not .env fallback) */
export function getStoredGeminiApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export type GeminiApiKeySource = 'browser' | 'env' | 'none';

export function getGeminiApiKeySource(): GeminiApiKeySource {
  if (getStoredGeminiApiKey()) return 'browser';
  const env = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  if (env) return 'env';
  return 'none';
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 10;
}

/** Preferred model from UI, .env, or default */
export function getGeminiModel(): GeminiModelId {
  const envModel = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY)?.trim();
    if (stored && isKnownModel(stored)) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  if (envModel && isKnownModel(envModel)) {
    return envModel;
  }
  return DEFAULT_MODEL;
}

export function saveGeminiModel(model: GeminiModelId): void {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export type GeminiErrorCode =
  | 'MISSING_API_KEY'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMIT'
  | 'INVALID_KEY'
  | 'UNKNOWN';

export interface ParsedGeminiError {
  code: GeminiErrorCode;
  retrySeconds?: number;
}

function extractApiPayload(err: unknown): { status?: number; message: string } {
  if (err instanceof ApiError) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof Error) {
    return { status: (err as ApiError).status, message: err.message };
  }
  return { message: String(err) };
}

/** Parse Google API errors (including JSON blobs in message) into a stable code */
export function parseGeminiError(err: unknown): ParsedGeminiError {
  const { status, message: raw } = extractApiPayload(err);

  let apiMessage = raw;
  let apiStatus = status;
  try {
    const json =
      raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    if (json?.error?.message) apiMessage = json.error.message;
    if (json?.error?.code) apiStatus = json.error.code;
    if (json?.error?.status === 'RESOURCE_EXHAUSTED') apiStatus = 429;
  } catch {
    /* use raw message */
  }

  const retryMatch =
    apiMessage.match(/retry in ([\d.]+)s/i) ||
    apiMessage.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  const retrySeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : undefined;

  if (raw === 'MISSING_API_KEY' || apiMessage === 'MISSING_API_KEY') {
    return { code: 'MISSING_API_KEY' };
  }

  if (apiStatus === 401 || apiStatus === 403 || /API key not valid|PERMISSION_DENIED/i.test(apiMessage)) {
    return { code: 'INVALID_KEY' };
  }

  const isQuota =
    apiStatus === 429 ||
    /RESOURCE_EXHAUSTED|quota exceeded|limit:\s*0/i.test(apiMessage);

  if (isQuota) {
    const isZeroQuota = /limit:\s*0/i.test(apiMessage);
    return {
      code: isZeroQuota ? 'QUOTA_EXCEEDED' : 'RATE_LIMIT',
      retrySeconds,
    };
  }

  return { code: 'UNKNOWN' };
}

const ERROR_LABELS: Record<GeminiErrorCode, Record<Language, string>> = {
  MISSING_API_KEY: {
    en: 'Add your Gemini API key in the key settings (top-right of this panel).',
    fr: 'Ajoutez votre clé API Gemini via l’icône clé en haut à droite.',
    ar: 'أضف مفتاح Gemini API من إعدادات المفتاح (أعلى اليمين).',
  },
  QUOTA_EXCEEDED: {
    en:
      'Gemini free quota is exhausted or not enabled for this API key (limit: 0). Try: (1) pick “2.5 Flash Lite” in key settings, (2) create a new key at aistudio.google.com/apikey, (3) wait until tomorrow, or (4) enable billing on your Google AI project.',
    fr:
      'Quota Gemini gratuit épuisé ou inactif (limite : 0). Essayez : modèle « 2.5 Flash Lite », nouvelle clé sur aistudio.google.com/apikey, attendre demain, ou activer la facturation Google AI.',
    ar:
      'حصة Gemini المجانية منتهية أو غير مفعّلة (الحد: 0). جرّب: نموذج «2.5 Flash Lite»، مفتاح جديد من aistudio.google.com/apikey، الانتظار حتى الغد، أو تفعيل الفوترة في Google AI.',
  },
  RATE_LIMIT: {
    en: 'Too many requests — please wait a minute and try again.',
    fr: 'Trop de requêtes — patientez une minute puis réessayez.',
    ar: 'طلبات كثيرة — انتظر دقيقة ثم أعد المحاولة.',
  },
  INVALID_KEY: {
    en: 'Invalid API key. Open key settings and paste a valid key from Google AI Studio.',
    fr: 'Clé API invalide. Ouvrez les paramètres clé et collez une clé valide.',
    ar: 'مفتاح API غير صالح. افتح إعدادات المفتاح والصق مفتاحاً صالحاً.',
  },
  UNKNOWN: {
    en: 'Something went wrong talking to Gemini. Try again or switch model in key settings.',
    fr: 'Erreur Gemini. Réessayez ou changez de modèle dans les paramètres clé.',
    ar: 'حدث خطأ مع Gemini. أعد المحاولة أو غيّر النموذج في إعدادات المفتاح.',
  },
};

/** User-facing error text (never raw JSON) */
export function formatGeminiError(err: unknown, language: Language = 'en'): string {
  const parsed = parseGeminiError(err);
  let text = ERROR_LABELS[parsed.code][language] || ERROR_LABELS[parsed.code].en;
  if (parsed.code === 'RATE_LIMIT' && parsed.retrySeconds) {
    const wait =
      language === 'en'
        ? ` Retry in about ${parsed.retrySeconds}s.`
        : language === 'fr'
          ? ` Réessayez dans ~${parsed.retrySeconds}s.`
          : ` أعد المحاولة بعد ~${parsed.retrySeconds} ثانية.`;
    text += wait;
  }
  return text;
}

function isModelFallbackError(err: unknown): boolean {
  const { code } = parseGeminiError(err);
  if (code === 'QUOTA_EXCEEDED' || code === 'RATE_LIMIT') return true;
  const msg = extractApiPayload(err).message;
  return /NOT_FOUND|not found|is not supported|invalid model|404/i.test(msg);
}

function modelAttemptOrder(): GeminiModelId[] {
  const preferred = getGeminiModel();
  return [...new Set([preferred, ...FALLBACK_MODELS])];
}

/**
 * Call Gemini from the browser (free tier via Google AI Studio key).
 * Tries fallback models when a model hits quota / rate limits.
 */
export async function callGeminiJSON<T>(
  systemInstruction: string,
  userParts: GeminiPart[],
  model?: GeminiModelId
): Promise<T> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = model ? [model] : modelAttemptOrder();
  let lastError: unknown;

  for (const modelId of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: userParts }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      });

      const text = response.text?.trim();
      if (!text) throw new Error('Empty AI response');

      try {
        return JSON.parse(text) as T;
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]) as T;
        throw new Error('Could not parse AI response as JSON');
      }
    } catch (err) {
      lastError = err;
      if (!model && isModelFallbackError(err) && modelId !== modelsToTry[modelsToTry.length - 1]) {
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('Gemini request failed');
}

/** Read a File as base64 (no data: prefix) for vision requests */
export function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({ mimeType: file.type || 'image/jpeg', data: base64 });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
