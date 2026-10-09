import { Language } from '../types';

/**
 * Voice companion I/O: microphone dictation (Web Speech API) plus spoken replies
 * (speech synthesis). Pure helpers stay unit-tested; browser objects are touched
 * only inside guarded factories so SSR/tests never crash.
 */

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>>;
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isVoiceInputSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function recognitionLocale(language: Language): string {
  // ar-SA has the widest Chrome STT support; fr-FR / en-US otherwise.
  return language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-SA' : 'en-US';
}

/** Speech locales the user can talk in — independent of the UI language. */
export const SPEECH_LOCALES = [
  { id: 'en-US', short: 'EN' },
  { id: 'fr-FR', short: 'FR' },
  { id: 'ar-SA', short: 'AR' },
] as const;

export function defaultSpeechLocale(language: Language): string {
  return recognitionLocale(language);
}

export function languageForSpeechLocale(locale: string): Language {
  const short = locale.toLowerCase().split('-')[0];
  return short === 'fr' ? 'fr' : short === 'ar' ? 'ar' : 'en';
}

/** Derive running final + interim transcripts from one recognition result event.
 * Every event carries the session's complete result list, so the event alone
 * is the source of truth — no external accumulator (which would double-count). */
export function mergeSpeechResult(event: SpeechResultEvent): { finalText: string; display: string } {
  let finalText = '';
  let interim = '';
  for (let i = 0; i < event.results.length; i++) {
    const alt = event.results[i][0];
    if (!alt) continue;
    if ((alt as { isFinal?: boolean }).isFinal) finalText += `${alt.transcript} `;
    else interim += alt.transcript;
  }
  return { finalText, display: `${finalText}${interim}`.trim() };
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(locale: string): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;
    const target = locale.toLowerCase();
    const short = target.split('-')[0];
    return (
      voices.find((v) => v.lang.toLowerCase() === target && v.localService) ||
      voices.find((v) => v.lang.toLowerCase() === target) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(short) && v.localService) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(short)) ||
      null
    );
  } catch {
    return null;
  }
}

/** Strip chat markdown so the spoken reply sounds like a human, not markup. */
export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Status beeps (⚠ ✓ ↩ ↪ …) are UI noise — never read aloud. */
export function isSpeakableAssistantText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('⚠')) return false;
  if (/^[✓↩↪ℹ️]/.test(trimmed)) return false;
  return true;
}

export interface SpeakOptions {
  language: Language;
  /** Overrides the UI language for the spoken voice (multilingual calls). */
  speechLocale?: string;
  rate?: number;
  onEnd?: () => void;
}

/** Speak an assistant reply. No-op where synthesis is unavailable. Returns false then. */
export function speakText(text: string, options: SpeakOptions): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const clean = stripMarkdownForSpeech(text);
  if (!clean) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const locale = options.speechLocale || recognitionLocale(options.language);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = locale;
    utterance.rate = options.rate ?? 1;
    const voice = pickVoice(locale);
    if (voice) utterance.voice = voice;
    if (options.onEnd) utterance.onend = options.onEnd;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/**
 * Worst-case speaking time for a reply — safety net for browsers where
 * utterance.onend occasionally never fires (known Chromium quirk on long
 * utterances). The caller resumes listening when this elapses without onEnd.
 */
export function estimatedSpeechMs(text: string, rate = 1): number {
  const chars = stripMarkdownForSpeech(text).length;
  return Math.min(90000, Math.max(4000, (chars * 90) / Math.max(0.5, rate) + 2500));
}

export function stopSpeaking(): void {
  try {
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}
