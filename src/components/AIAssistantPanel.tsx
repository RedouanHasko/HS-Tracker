import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Send,
  Loader2,
  ImagePlus,
  Undo2,
  Redo2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Phone,
  PhoneOff,
  Key,
  Check,
  AlertTriangle,
  Sparkles,
  Eye,
  EyeOff,
  Trash2,
  MessageSquarePlus,
  RotateCcw,
} from 'lucide-react';
import { Project, Language, UserRole, TimelineActivity } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';
import { ProjectPermissions, getProjectPermissions, resolveUserRole } from '../utils/permissions';
import { resolveProjectFromParams } from '../utils/aiWorkspaceContext';
import { AIUIAction, userWantsNavigation } from '../utils/aiNavigation';
import {
  AIProposedAction,
  applyAIActions,
  AIApplyContext,
  sanitizeProposedActions,
  getMissingFieldsForAction,
  isInformationalQuery,
  parseAIConfirmationMessage,
  isAICancellationMessage,
  extractTaskIdFromAction,
  extractExpenseIdFromAction,
  findRentalBooking,
} from '../utils/aiActions';
import { parseDocumentDraft, AIDocumentDraft } from '../utils/aiDocumentDraft';
import { buildRentalPaymentReceiptDraft } from '../utils/rentalPaymentReceipt';
import { inferRentalBookingAction } from '../utils/aiRentalIntent';
import { inferConstructionAction } from '../utils/aiConstructionIntent';
import { askProjectAssistant, AISessionHints, AIChatTurn } from '../utils/aiAgent';
import {
  getStoredGeminiApiKey,
  saveGeminiApiKey,
  clearGeminiApiKey,
  hasGeminiApiKey,
  getGeminiApiKeySource,
  getGeminiModel,
  saveGeminiModel,
  GEMINI_MODEL_OPTIONS,
  GeminiModelId,
  formatGeminiError,
} from '../lib/geminiClient';
import {
  applyAIUndoEntry,
  loadUndoStack,
  pushUndoSnapshot,
  removeUndoEntry,
  undoStackSize,
} from '../utils/aiUndoStack';
import { InlineLoader } from './ui/AppLoader';
import AssistantMessage from './AssistantMessage';
import {
  getSpeechRecognitionConstructor,
  isSpeakableAssistantText,
  mergeSpeechResult,
  recognitionLocale,
  speakText,
  stopSpeaking,
  estimatedSpeechMs,
  SPEECH_LOCALES,
  defaultSpeechLocale,
} from '../utils/voice';
import { saveActivityToDB } from '../lib/db';
import { buildActivityMemberEmails } from '../utils/activityHelpers';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: AIProposedAction[];
  pending?: boolean;
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  /** Active workspace when inside a project; null on dashboard */
  activeProject: Project | null;
  language: Language;
  userEmail: string;
  userName: string;
  onApplyProject: (project: Project) => Promise<void>;
  onApplyDocumentDraft?: (draft: AIDocumentDraft, projectId: string) => void;
  /** Navigate tabs / open tasks / switch projects — runs immediately (no confirm) */
  onNavigate?: (actions: AIUIAction[]) => void;
  onSelectProject?: (projectId: string) => void;
}

const LABELS = {
  en: {
    title: 'AI Assistant',
    subtitle: 'Ask, analyze receipts, or request changes — you confirm before anything saves.',
    placeholder: 'e.g. Mark painting task as done, or summarize budget…',
    send: 'Send',
    voice: 'Voice input',
    listening: 'Listening… tap to stop',
    speakReplies: 'Spoken replies',
    conversation: 'Hands-free conversation',
    conversationOn: 'Hands-free on — speak, I listen, reply aloud, repeat. Tap to stop.',
    attach: 'Receipt photo',
    confirm: 'Validate ✓ — Apply changes',
    confirmOne: 'Validate',
    validateAll: 'Validate all',
    skip: 'Skip',
    redo: 'Redo',
    redoHint: 'Ask AI to regenerate this proposal differently',
    dismiss: 'Dismiss',
    undo: 'Undo last AI change',
    undoCount: 'undo steps',
    setupKey: 'Gemini API key',
    keyHint: 'Free key from Google AI Studio — stored only in your browser.',
    saveKey: 'Save key',
    keySettings: 'API key settings',
    removeKey: 'Remove saved key',
    keySaved: 'API key saved in this browser.',
    keyRemoved: 'Saved key removed.',
    keyFromEnv: 'A key is also set in .env (VITE_GEMINI_API_KEY). Remove it there to disable AI in dev builds.',
    keyActive: 'Key active',
    keyMissing: 'No key — assistant disabled',
    getKeyLink: 'Get free API key',
    close: 'Close',
    modelLabel: 'Model',
    modelHint: 'Auto-fallback tries newer models first (3 Flash → 3.1 Lite → 2.5) if one hits quota.',
    newChat: 'New chat',
    newChatDone: 'Started a fresh conversation.',
    noKey: 'Add your Gemini API key to enable the assistant.',
    thinking: 'Thinking…',
    readOnly: 'Read-only: I can answer questions but cannot change data.',
    proposed: 'Proposed actions (requires your approval):',
    applied: 'Changes applied to Firestore.',
    partial: 'Some actions failed:',
    welcome:
      'Ask about **all workspaces** or the **current project** — budget, tasks, invoices. I propose changes — *you* confirm before anything saves.',
  },
  fr: {
    title: 'Assistant IA',
    subtitle: 'Posez des questions — vous confirmez avant toute modification.',
    placeholder: 'ex. Marquer la tâche peinture terminée…',
    send: 'Envoyer',
    voice: 'Saisie vocale',
    listening: 'Écoute… touchez pour arrêter',
    speakReplies: 'Réponses vocales',
    conversation: 'Conversation mains-libres',
    conversationOn: 'Mains-libres actif — parlez, j’écoute et je réponds à voix haute.',
    attach: 'Photo reçu',
    confirm: 'Valider ✓ — Appliquer',
    confirmOne: 'Valider',
    validateAll: 'Tout valider',
    skip: 'Passer',    redo: 'Refaire',
    redoHint: 'Régénérer la proposition différemment',
    dismiss: 'Ignorer',
    undo: 'Annuler dernière action IA',
    undoCount: 'annulations',
    setupKey: 'Clé API Gemini',
    keyHint: 'Clé gratuite Google AI Studio — stockée dans votre navigateur.',
    saveKey: 'Enregistrer',
    keySettings: 'Clé API',
    removeKey: 'Supprimer la clé',
    keySaved: 'Clé enregistrée dans ce navigateur.',
    keyRemoved: 'Clé supprimée.',
    keyFromEnv: 'Une clé est définie dans .env (VITE_GEMINI_API_KEY). Supprimez-la là pour désactiver l\'IA en dev.',
    keyActive: 'Clé active',
    keyMissing: 'Aucune clé — assistant désactivé',
    getKeyLink: 'Obtenir une clé gratuite',
    close: 'Fermer',
    modelLabel: 'Modèle',
    modelHint: 'Bascule auto vers un autre modèle (3 Flash → 3.1 Lite → 2.5) si quota dépassé.',
    newChat: 'Nouveau chat',
    newChatDone: 'Nouvelle conversation démarrée.',
    noKey: 'Ajoutez votre clé API Gemini.',
    thinking: 'Réflexion…',
    readOnly: 'Lecture seule : réponses uniquement.',
    proposed: 'Actions proposées :',
    applied: 'Modifications enregistrées.',
    partial: 'Certaines actions ont échoué :',
    welcome: '**Budget**, **tâches**, **factures** — je propose, *vous* validez avant enregistrement.',
  },
  ar: {
    title: 'المساعد الذكي',
    subtitle: 'اسأل وارفق صور الفواتير — أنت توافق قبل أي تعديل.',
    placeholder: 'مثال: اجعل مهمة الدهان منجزة…',
    send: 'إرسال',
    voice: 'إدخال صوتي',
    listening: 'أستمع… اضغط للإيقاف',
    speakReplies: 'ردود صوتية',
    conversation: 'محادثة بدون استخدام اليدين',
    conversationOn: 'وضع المحادثة مفعّل — تحدث وسأستمع وأرد صوتيًا.',
    attach: 'صورة إيصال',
    confirm: 'تأكيد ✓ — تطبيق',
    confirmOne: 'تأكيد',
    validateAll: 'تأكيد الكل',
    skip: 'تخطي',
    redo: 'إعادة',
    redoHint: 'إعادة إنشاء الاقتراح بشكل مختلف',
    dismiss: 'تجاهل',
    undo: 'تراجع عن آخر تغيير',
    undoCount: 'تراجع',
    setupKey: 'مفتاح Gemini',
    keyHint: 'مفتاح مجاني من Google AI Studio — يُحفظ في متصفحك فقط.',
    saveKey: 'حفظ',
    keySettings: 'إعدادات المفتاح',
    removeKey: 'حذف المفتاح المحفوظ',
    keySaved: 'تم حفظ المفتاح في هذا المتصفح.',
    keyRemoved: 'تم حذف المفتاح.',
    keyFromEnv: 'يوجد مفتاح في .env (VITE_GEMINI_API_KEY). احذفه هناك لتعطيل الذكاء الاصطناعي في التطوير.',
    keyActive: 'المفتاح مفعّل',
    keyMissing: 'لا يوجد مفتاح — المساعد معطّل',
    getKeyLink: 'احصل على مفتاح مجاني',
    close: 'إغلاق',
    modelLabel: 'النموذج',
    modelHint: 'تبديل تلقائي بين النماذج (3 Flash → 3.1 Lite → 2.5) عند نفاد الحصة.',
    newChat: 'محادثة جديدة',
    newChatDone: 'بدأت محادثة جديدة.',
    noKey: 'أضف مفتاح Gemini API.',
    thinking: 'جاري التفكير…',
    readOnly: 'قراءة فقط: إجابات بدون تعديل.',
    proposed: 'إجراءات مقترحة:',
    applied: 'تم حفظ التغييرات.',
    partial: 'فشل بعض الإجراءات:',
    welcome: 'اسأل عن **الميزانية** و**المهام** و**الفواتير** — أقترح وأنت *توافق* قبل الحفظ.',
  },
};

/**
 * In-browser AI assistant: Gemini + confirm-before-write + undo stack.
 */
function aiActionToActivityType(type: AIProposedAction['type']): TimelineActivity['actionType'] {
  switch (type) {
    case 'add_expense':
      return 'expense_added';
    case 'update_expense':
      return 'expense_updated';
    case 'delete_expense':
      return 'expense_deleted';
    case 'create_task':
    case 'add_subtask':
      return 'task_created';
    case 'update_task':
    case 'update_task_status':
    case 'toggle_subtask':
      return 'task_updated';
    case 'delete_task':
      return 'task_deleted';
    case 'prepare_document':
      return 'document_added';
    default:
      return 'status_changed';
  }
}

export default function AIAssistantPanel({
  open,
  onClose,
  projects,
  activeProject,
  language,
  userEmail,
  userName,
  onApplyProject,
  onApplyDocumentDraft,
  onNavigate,
  onSelectProject,
}: AIAssistantPanelProps) {
  const t = LABELS[language];
  const project = activeProject;
  const workspaceMode = !activeProject;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(getStoredGeminiApiKey());
  const [keyConfigured, setKeyConfigured] = useState(hasGeminiApiKey());
  const [keySource, setKeySource] = useState(getGeminiApiKeySource());
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showKeyPlain, setShowKeyPlain] = useState(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(getGeminiModel());
  const [keyFeedback, setKeyFeedback] = useState<string | null>(null);
  const [sessionHints, setSessionHints] = useState<AISessionHints>({});
  const [undoCount, setUndoCount] = useState(0);
  const [pendingActions, setPendingActions] = useState<AIProposedAction[] | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<AIUIAction[] | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [showRemoveKeyConfirm, setShowRemoveKeyConfirm] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastUserRequest, setLastUserRequest] = useState('');
  const [redoSnapshot, setRedoSnapshot] = useState<Project | null>(null);
  /** Spoken replies for every assistant message (speech synthesis). */
  const [voiceReplies, setVoiceReplies] = useState(false);
  /** Hands-free loop: continuous listening, auto-send, spoken replies. */
  const [conversationMode, setConversationMode] = useState(false);
  /** Talking language — independent of the UI language for multilingual calls. */
  const [speechLocale, setSpeechLocale] = useState<string>(() =>
    localStorage.getItem('hs_tracker_speech_locale') || defaultSpeechLocale(language)
  );
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const conversationProjectRef = useRef<string>(project?.id ?? 'workspace');
  const conversationModeRef = useRef(false);
  const manualStopRef = useRef(false);
  const sendTimerRef = useRef<number | null>(null);
  const lastAutoSentRef = useRef('');
  const spokenRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const speechLocaleRef = useRef(speechLocale);
  speechLocaleRef.current = speechLocale;
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => undefined);
  const startListeningRef = useRef<() => void>(() => undefined);

  const stopVoiceInput = (leaveConversationOn = false) => {
    manualStopRef.current = true;
    if (sendTimerRef.current !== null) {
      window.clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
    setListening(false);
    if (!leaveConversationOn) {
      conversationModeRef.current = false;
      setConversationMode(false);
    }
  };

  const startListening = () => {
    const SR = getSpeechRecognitionConstructor();
    if (!SR) {
      setMessages((m) => [...m, {
        id: `sys_${Date.now()}`,
        role: 'assistant',
        text: language === 'fr'
          ? '⚠ Voix non supportée ici — utilisez Chrome sur HTTPS (ou localhost) et autorisez le micro, puis réessayez. Sinon tapez votre demande.'
          : language === 'ar'
            ? '⚠ الصوت غير مدعوم هنا — استخدم Chrome عبر HTTPS (أو localhost) واسمح بالميكروفون، أو اكتب طلبك.'
            : '⚠ Voice not supported here — use Chrome over HTTPS (or localhost), allow the mic, then retry. Or type instead.',
      }]);
      return;
    }
    if (window.isSecureContext === false) {
      setMessages((m) => [...m, {
        id: `sys_${Date.now()}`,
        role: 'assistant',
        text: language === 'fr'
          ? '⚠ Le micro exige HTTPS ou localhost — ouvrez l’app en HTTPS puis réessayez.'
          : '⚠ Mic requires HTTPS or localhost — open the app over HTTPS and retry.',
      }]);
      return;
    }
    try {
      stopSpeaking();
      manualStopRef.current = false;
      const rec = new SR();
      rec.lang = speechLocaleRef.current;
      rec.interimResults = true;
      // Single-shot utterances even hands-free: each session's results are fresh,
      // so finals never double-count and every utterance auto-sends exactly once.
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const merged = mergeSpeechResult(event);
        if (merged.display) setInput(merged.display);
        // Hands-free: a settled final transcript auto-sends after a short pause.
        const handsFree = conversationModeRef.current;
        const finalText = merged.finalText.trim();
        if (handsFree && finalText && finalText !== lastAutoSentRef.current) {
          if (sendTimerRef.current !== null) window.clearTimeout(sendTimerRef.current);
          sendTimerRef.current = window.setTimeout(() => {
            sendTimerRef.current = null;
            lastAutoSentRef.current = finalText;
            void sendRef.current(finalText);
          }, 900);
        }
      };
      rec.onerror = (event) => {
        const code = String(event?.error || '');
        if (code === 'aborted') return;
        setListening(false);
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          conversationModeRef.current = false;
          setConversationMode(false);
          setMessages((m) => [...m, {
            id: `sys_${Date.now()}`,
            role: 'assistant',
            text: language === 'fr'
              ? '⚠ Micro bloqué — autorisez le micro dans le navigateur puis réessayez.'
              : language === 'ar'
                ? '⚠ تم حظر الميكروفون — اسمح بالميكروفون في المتصفح ثم أعد المحاولة.'
                : '⚠ Mic blocked — allow microphone in the browser, then retry.',
          }]);
        } else if (code === 'no-speech' || code === 'audio-capture') {
          // Single-shot dictation reports silence; the hands-free loop restarts quietly.
          if (!conversationModeRef.current) {
            setMessages((m) => [...m, {
              id: `sys_${Date.now()}`,
              role: 'assistant',
              text: language === 'fr'
                ? '⚠ Je n’ai rien entendu — rapprochez-vous du micro et réessayez.'
                : language === 'ar'
                  ? '⚠ لم أسمع شيئًا — اقترب من الميكروفون وحاول مجددًا.'
                  : '⚠ Heard nothing — move closer to the mic and retry.',
            }]);
          }
        }
      };
      rec.onend = () => {
        recognitionRef.current = null;
        setListening(false);
        // Hands-free loop: a finished utterance restarts listening automatically.
        if (conversationModeRef.current && !manualStopRef.current && open) {
          startListeningRef.current();
        }
      };
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
      // Safety stop after 25s (some browsers never fire onend).
      window.setTimeout(() => {
        try { if (recognitionRef.current === rec) rec.stop(); } catch { /* noop */ }
      }, 25000);
    } catch {
      setListening(false);
    }
  };
  startListeningRef.current = startListening;

  const toggleVoiceInput = () => {
    if (listening) {
      stopVoiceInput();
      return;
    }
    lastAutoSentRef.current = '';
    startListening();
  };

  const toggleConversationMode = () => {
    if (conversationModeRef.current) {
      stopVoiceInput();
      stopSpeaking();
      return;
    }
    conversationModeRef.current = true;
    setConversationMode(true);
    lastAutoSentRef.current = '';
    startListening();
  };

  useEffect(() => () => {
    manualStopRef.current = true;
    if (sendTimerRef.current !== null) window.clearTimeout(sendTimerRef.current);
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    stopSpeaking();
  }, []);

  // Spoken replies: the newest speakable assistant message is read aloud when
  // voice replies (or hands-free conversation) are on. The mic pauses while the
  // companion talks, then the loop resumes.
  useEffect(() => {
    if (!open || (!voiceReplies && !conversationMode)) return;
    const last = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.pending && isSpeakableAssistantText(m.text));
    if (!last || last.id === spokenRef.current) return;
    spokenRef.current = last.id;
    manualStopRef.current = true;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
    setListening(false);
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    let resumed = false;
    const resumeListening = () => {
      if (resumed) return;
      resumed = true;
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
      if (conversationModeRef.current && open) startListeningRef.current();
    };
    speakText(last.text, {
      language,
      speechLocale: speechLocaleRef.current,
      onEnd: resumeListening,
    });
    // Safety net: some browsers never fire utterance.onend on long replies.
    resumeTimerRef.current = window.setTimeout(resumeListening, estimatedSpeechMs(last.text));
  }, [messages, open, voiceReplies, conversationMode, language]);

  const isReadOnlyForProject = (p: Project) => {
    const role = resolveUserRole(p, userEmail);
    return getProjectPermissions(role).isReadOnly;
  };

  const welcomeMessage = (): ChatMessage => ({
    id: 'welcome',
    role: 'assistant',
    text:
      workspaceMode
        ? `${t.welcome}\n\n${language === 'en' ? 'You are on the **dashboard** — I can open workspaces, summarize all projects, or apply changes when you name the project.' : language === 'fr' ? 'Vous êtes sur le **tableau de bord** — je peux ouvrir un chantier ou résumer tous les projets.' : 'أنت على **لوحة التحكم** — يمكنني فتح مساحة عمل أو تلخيص كل المشاريع.'}`
        : isReadOnlyForProject(project!)
          ? `${t.welcome}\n\n${t.readOnly}`
          : t.welcome,
  });

  const buildApplyCtx = (target: Project): AIApplyContext => {
    const role = resolveUserRole(target, userEmail);
    return {
      userEmail,
      userName,
      userRole: role,
      perm: getProjectPermissions(role),
    };
  };

  const buildHistoryForApi = (list: ChatMessage[]): AIChatTurn[] =>
    list
      .filter((m) => m.id !== 'welcome' && !m.pending && !m.text.startsWith('⚠'))
      .map((m) => ({ role: m.role, text: m.text }));

  const startNewConversation = () => {
    setSessionHints({});
    setPendingActions(null);
    setPendingNavigation(null);
    setPendingMessageId(null);
    setInput('');
    setImageFile(null);
    setMessages([
      welcomeMessage(),
      { id: `sys_${Date.now()}`, role: 'assistant', text: t.newChatDone },
    ]);
  };

  const applyCtx: AIApplyContext = project
    ? buildApplyCtx(project)
    : {
        userEmail,
        userName,
        userRole: 'read_only',
        perm: getProjectPermissions('read_only'),
      };

  const refreshKeyState = () => {
    setKeyConfigured(hasGeminiApiKey());
    setKeySource(getGeminiApiKeySource());
  };

  const openKeyModal = () => {
    setApiKeyInput(getStoredGeminiApiKey());
    setSelectedModel(getGeminiModel());
    setKeyFeedback(null);
    setShowKeyPlain(false);
    setShowKeyModal(true);
    refreshKeyState();
  };

  useEffect(() => {
    if (open) {
      refreshKeyState();
      const scopeKey = project?.id ?? 'workspace';
      if (project) {
        void undoStackSize(project.id, userEmail).then(setUndoCount);
      } else {
        setUndoCount(0);
      }
      if (!hasGeminiApiKey()) {
        setShowKeyModal(true);
      }
      if (scopeKey !== conversationProjectRef.current) {
        conversationProjectRef.current = scopeKey;
        setSessionHints({});
        setPendingActions(null);
        setPendingNavigation(null);
        setPendingMessageId(null);
      } else if (messages.length === 0) {
        setMessages([welcomeMessage()]);
      }
    }
  }, [open, project?.id, workspaceMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pendingActions]);

  const handleSaveKey = () => {
    if (apiKeyInput.trim()) {
      saveGeminiApiKey(apiKeyInput);
    }
    saveGeminiModel(selectedModel);
    refreshKeyState();
    setKeyFeedback(t.keySaved);
  };

  const handleRemoveKey = () => {
    clearGeminiApiKey();
    setApiKeyInput('');
    refreshKeyState();
    setKeyFeedback(t.keyRemoved);
    setShowRemoveKeyConfirm(false);
  };

  const handleSend = async (textOverride?: string) => {
    const rawText = (textOverride ?? input).trim();
    if (busy || (!rawText && !imageFile)) return;

    const userText = rawText || (imageFile ? t.attach : '');
    // Barge-in: a new request silences the current spoken reply.
    stopSpeaking();
    const confirmation = !imageFile ? parseAIConfirmationMessage(userText) : null;

    if (confirmation) {
      setMessages((messages) => [
        ...messages,
        { id: `u_${Date.now()}`, role: 'user', text: userText },
      ]);
      setInput('');
      if (pendingActions?.length) {
        await handleConfirmActions(confirmation.followUp);
      } else {
        setMessages((messages) => [
          ...messages,
          {
            id: `sys_${Date.now()}`,
            role: 'assistant',
            text: language === 'fr'
              ? 'Aucune modification structurée n’est en attente. Rien n’a été enregistré.'
              : language === 'ar'
                ? 'لا يوجد تغيير منظم بانتظار التأكيد. لم يتم حفظ أي شيء.'
                : 'There is no pending structured change to apply. Nothing was saved.',
          },
        ]);
      }
      return;
    }

    if (!imageFile && isAICancellationMessage(userText)) {
      setMessages((messages) => [
        ...messages,
        { id: `u_${Date.now()}`, role: 'user', text: userText },
        {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          text: language === 'fr'
            ? 'Proposition annulée. Aucune donnée n’a été modifiée.'
            : language === 'ar'
              ? 'تم إلغاء الاقتراح. لم يتم تعديل أي بيانات.'
              : 'Proposal dismissed. No data was changed.',
        },
      ]);
      setInput('');
      handleDismissActions();
      return;
    }

    if (!keyConfigured) return;

    const historyBeforeSend = buildHistoryForApi(messages);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: userText + (imageFile ? ` 📎 ${imageFile.name}` : ''),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLastUserRequest(userText);
    setRedoSnapshot(null);
    setBusy(true);

    const assistantId = `a_${Date.now()}`;
    setMessages((m) => [...m, { id: assistantId, role: 'assistant', text: t.thinking, pending: true }]);

    try {
      const response = await askProjectAssistant(
        projects,
        project,
        userEmail,
        userText,
        imageFile,
        { ...sessionHints, spoken: voiceReplies || conversationMode },
        historyBeforeSend
      );
      let actions = sanitizeProposedActions(response.proposedActions);
      if (actions.length === 0) {
        const inferredBooking = inferRentalBookingAction(userText, projects, project);
        if (inferredBooking) {
          actions = [inferredBooking];
          const target = resolveProjectFromParams(projects, inferredBooking.params, project);
          response.message = language === 'fr'
            ? `Réservation préparée pour ${inferredBooking.params.clientName} dans ${target?.rentalProperty?.buildingNumber || target?.name || 'le logement'}. Confirmez pour l’enregistrer.`
            : language === 'ar'
              ? `تم إعداد الحجز للعميل ${inferredBooking.params.clientName} في ${target?.rentalProperty?.buildingNumber || target?.name || 'العقار'}. أكّد لحفظه.`
              : `Booking prepared for ${inferredBooking.params.clientName} at ${target?.rentalProperty?.buildingNumber || target?.name || 'the property'}. Confirm to save it.`;
        } else {
          // Team-private fallback: "open tasks for Msallah and add task X" must
          // still propose the task even if the model only navigates.
          const inferredBuild = inferConstructionAction(userText, projects, project);
          if (inferredBuild) {
            actions = [inferredBuild];
            if (/shall i proceed|do you want|confirmez|voulez-vous/i.test(response.message)) {
              response.message = language === 'fr'
                ? `J’ai préparé : ${inferredBuild.summary}. Validez pour l’enregistrer.`
                : language === 'ar'
                  ? `جهزت: ${inferredBuild.summary}. أكّد للحفظ.`
                  : `Prepared: ${inferredBuild.summary}. Press Validate to save it.`;
            } else {
              response.message = `${response.message}\n\n${language === 'fr' ? 'Préparé' : language === 'ar' ? 'تم التجهيز' : 'Prepared'}: ${inferredBuild.summary}. ${language === 'fr' ? 'Validez pour enregistrer.' : language === 'ar' ? 'أكّد للحفظ.' : 'Press Validate to save.'}`;
            }
          }
        }
      }

      if (project) {
        const ctx = buildApplyCtx(project);
        if (ctx.perm.isReadOnly) {
          actions = actions.filter((a) => a.type === 'prepare_document');
        }
      }

      if (!imageFile && isInformationalQuery(userText) && !userWantsNavigation(userText)) {
        actions = [];
      }

      // Required-field guard: ask for missing details instead of proposing broken actions.
      const missingAsk: string[] = [];
      for (const a of actions) {
        const miss = getMissingFieldsForAction(a);
        if (miss.length > 0) missingAsk.push(`• ${a.summary} — ${language === 'fr' ? 'manque' : language === 'ar' ? 'ينقص' : 'missing'}: ${miss.join(', ')}`);
      }
      if (missingAsk.length > 0) {
        response.message = `${response.message}\n\n${language === 'fr' ? 'Il me manque un détail :' : language === 'ar' ? 'ينقصني تفصيل:' : 'I need one more detail:'}\n${missingAsk.join('\n')}\n${language === 'fr' ? 'Répondez avec le détail manquant.' : language === 'ar' ? 'أجب بالتفصيل الناقص.' : 'Reply with the missing detail.'}`;
        actions = [];
      }

      // Navigation runs immediately (even for mixed "open X + add Y"):
      // the user sees the right screen while the data change waits for Validate.
      if (response.uiActions?.length && onNavigate) {
        onNavigate(response.uiActions);
        setPendingNavigation(null);
        if (actions.length === 0) onClose();
      }

      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { id: assistantId, role: 'assistant', text: response.message, actions }
            : msg
        )
      );

      if (actions.length > 0) {
        setPendingActions(actions);
        setPendingMessageId(assistantId);
      }

      setImageFile(null);
    } catch (err) {
      const errText = formatGeminiError(err, language);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId ? { id: assistantId, role: 'assistant', text: `⚠ ${errText}` } : msg
        )
      );
    } finally {
      setBusy(false);
    }
  };
  sendRef.current = handleSend;

  // Closing the panel ends any voice activity (listening + speaking).
  useEffect(() => {
    if (!open) {
      stopVoiceInput();
      stopSpeaking();
      spokenRef.current = null;
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    }
  }, [open]);

  const handleConfirmActions = async (confirmationFollowUp = '', onlyActions?: AIProposedAction[]) => {
    const toApply = onlyActions ?? pendingActions;
    if (!toApply?.length || busy) return;
    setBusy(true);

    // Companion actions land in the project history like any manual change,
    // so the activity feed shows what the assistant did and who asked for it.
    const logCompanionHistory = async (target: Project, applied: AIProposedAction[]) => {
      const cleanEmail = userEmail.toLowerCase();
      for (const action of applied) {
        try {
          await saveActivityToDB(userEmail, {
            id: `act_${Date.now()}_${action.id}`,
            projectId: target.id,
            userEmail: cleanEmail,
            userName: `${userName} (AI companion)`,
            actionType: aiActionToActivityType(action.type),
            actionDetails: `Companion applied: ${action.summary}`,
            timestamp: new Date().toISOString(),
            memberEmails: buildActivityMemberEmails(target),
            targetTitle: action.summary,
          });
        } catch (error) {
          console.warn('Companion history write skipped:', error);
        }
      }
    };

    try {
      const docAction = toApply.find((a) => a.type === 'prepare_document');
      const projectActions = toApply.filter((a) => a.type !== 'prepare_document');

      const notes: string[] = [];
      let paymentReceiptDraft: { draft: AIDocumentDraft; projectId: string } | null = null;
      let lastAppliedProject: Project | null = null;

      if (projectActions.length > 0) {
      const grouped = new Map<string, AIProposedAction[]>();
      for (const action of projectActions) {
        const target = resolveProjectFromParams(projects, action.params, project);
        if (!target) {
          notes.push(
            language === 'en'
              ? `Could not find workspace for: ${action.summary}`
              : language === 'fr'
                ? `Chantier introuvable : ${action.summary}`
                : `تعذر العثور على المشروع: ${action.summary}`
          );
          continue;
        }
        const list = grouped.get(target.id) ?? [];
        list.push(action);
        grouped.set(target.id, list);
      }

      for (const [projectId, actionsForProject] of grouped) {
        const target =
          projects.find((p) => p.id === projectId) ?? project;
        if (!target) continue;

        const ctx = buildApplyCtx(target);
        const { project: next, errors } = applyAIActions(target, actionsForProject, ctx);
        const undoEntry = await pushUndoSnapshot(target, next, userEmail);
        try {
          await onApplyProject(next);
        } catch (error) {
          if (undoEntry) await removeUndoEntry(undoEntry).catch(() => undefined);
          throw error;
        }
        lastAppliedProject = next;
        conversationProjectRef.current = next.id;
        onSelectProject?.(next.id);

        for (const action of actionsForProject) {
          if (action.type !== 'record_booking_payment' || action.params.prepareReceipt === false) continue;
          const booking = findRentalBooking(next, action.params);
          const payment = booking?.payments?.[booking.payments.length - 1];
          if (booking && payment) {
            paymentReceiptDraft = {
              draft: buildRentalPaymentReceiptDraft(next, booking, payment),
              projectId: next.id,
            };
          }
        }

        let lastTaskId: string | null = null;
        let lastExpenseId: string | null = null;
        for (const a of actionsForProject) {
          const tid = extractTaskIdFromAction(target, a);
          if (tid) lastTaskId = tid;
          const eid = extractExpenseIdFromAction(target, a);
          if (eid) lastExpenseId = eid;
        }
        if (lastTaskId || lastExpenseId) {
          setSessionHints((s) => ({
            ...s,
            ...(lastTaskId ? { lastTaskId } : {}),
            ...(lastExpenseId ? { lastExpenseId } : {}),
          }));
        }

        setUndoCount(await undoStackSize(target.id, userEmail));
        await logCompanionHistory(next, actionsForProject);
        if (errors.length > 0) notes.push(`${t.partial}\n${errors.join('\n')}`);
        else notes.push(t.applied);
      }
      }

      if (paymentReceiptDraft && onApplyDocumentDraft) {
      onApplyDocumentDraft(paymentReceiptDraft.draft, paymentReceiptDraft.projectId);
      onSelectProject?.(paymentReceiptDraft.projectId);
      notes.push(
        language === 'fr'
          ? 'Paiement enregistré et reçu ouvert. Utilisez Annuler pour restaurer les données précédentes.'
          : 'Payment recorded and receipt opened. Use Undo to restore the previous data.'
      );
      }

      if (docAction && onApplyDocumentDraft) {
      const docTarget = resolveProjectFromParams(projects, docAction.params, project);
      if (docTarget) {
        const draft = parseDocumentDraft(docAction.params);
        onApplyDocumentDraft(draft, docTarget.id);
        onSelectProject?.(docTarget.id);
        notes.push(
          language === 'en'
            ? draft.autoExport
              ? 'Document draft ready. Opening the PDF print dialog.'
              : 'Document draft ready - open Invoices & Vouchers, review, then print.'
            : language === 'fr'
              ? draft.autoExport
                ? "Brouillon prêt. Ouverture de l'impression PDF."
                : 'Brouillon prêt - vérifiez-le dans Factures puis imprimez.'
              : 'المسودة جاهزة — راجع الفواتير ثم اطبع.'
        );
      }
      }

      if (notes.length) {
        setMessages((m) => [...m, { id: `sys_${Date.now()}`, role: 'assistant', text: `✓ ${notes.join('\n')}` }]);
      }
      // Partial approval: validated actions leave the queue, the rest stay pending.
      const appliedIds = new Set(toApply.map((a) => a.id));
      const messageId = pendingMessageId;
      const remaining = (pendingActions ?? []).filter((a) => !appliedIds.has(a.id));
      setPendingActions(remaining.length > 0 ? remaining : null);
      if (remaining.length === 0) {
        setPendingMessageId(null);
      } else if (messageId) {
        setMessages((m) =>
          m.map((msg) => (msg.id === messageId ? { ...msg, actions: remaining } : msg))
        );
      }
      const fullyApplied = remaining.length === 0;
      const followUpNavigation: AIUIAction[] =
        confirmationFollowUp && lastAppliedProject
          ? [
              { type: 'open_project', params: { projectId: lastAppliedProject.id } },
              confirmationFollowUp.match(/\b(booking|bookings|reservation|reservations|stay|guest|client)\b/i)
                ? { type: 'open_tab', params: { tab: 'rental' } }
                : confirmationFollowUp.match(/\b(invoice|invoices|voucher|receipt|document)\b/i)
                  ? { type: 'open_tab', params: { tab: 'docs' } }
                  : confirmationFollowUp.match(/\b(task|tasks|roadmap)\b/i)
                    ? { type: 'open_tab', params: { tab: 'tasks' } }
                    : confirmationFollowUp.match(/\b(expense|expenses|cost|ledger)\b/i)
                      ? { type: 'open_tab', params: { tab: 'expenses' } }
                      : { type: 'open_tab', params: { tab: 'overview' } },
            ]
          : [];
      const navigationToRun = fullyApplied
        ? (followUpNavigation.length > 0 ? followUpNavigation : pendingNavigation)
        : [];
      if (navigationToRun?.length && onNavigate) {
        onNavigate(navigationToRun);
        setPendingNavigation(null);
        if (fullyApplied) onClose();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessages((messages) => [
        ...messages,
        {
          id: `error_${Date.now()}`,
          role: 'assistant',
          text: language === 'fr'
            ? `⚠ L’enregistrement a échoué. Aucune confirmation de sauvegarde n’a été reçue. Réessayez ou vérifiez Firebase.\n${detail}`
            : language === 'ar'
              ? `⚠ فشل الحفظ ولم يتم تأكيد الكتابة في Firebase. أعد المحاولة أو تحقق من الاتصال.\n${detail}`
              : `⚠ Save failed. Firebase did not confirm the write. Retry or check the connection.\n${detail}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleDismissActions = () => {
    setPendingActions(null);
    setPendingMessageId(null);
    setPendingNavigation(null);
  };

  const handleSkipAction = (actionId: string) => {
    const remaining = (pendingActions ?? []).filter((a) => a.id !== actionId);
    const messageId = pendingMessageId;
    setPendingActions(remaining.length > 0 ? remaining : null);
    if (remaining.length === 0) {
      setPendingMessageId(null);
      setPendingNavigation(null);
    } else if (messageId) {
      setMessages((m) =>
        m.map((msg) => (msg.id === messageId ? { ...msg, actions: remaining } : msg))
      );
    }
  };

  const handleUndo = async () => {
    const undoProject = project ?? projects[0];
    if (!undoProject) return;
    const [entry] = await loadUndoStack(undoProject.id, userEmail);
    if (!entry) return;
    setRedoSnapshot(undoProject);
    const restored = applyAIUndoEntry(undoProject, entry);
    await onApplyProject(restored);
    await removeUndoEntry(entry);
    setUndoCount(await undoStackSize(undoProject.id, userEmail));
    onSelectProject?.(restored.id);
    setMessages((m) => [
      ...m,
      { id: `undo_${Date.now()}`, role: 'assistant', text: '↩ Undo applied — project restored to previous state. Use Redo to re-apply.' },
    ]);
  };

  const handleRedoSnapshot = async () => {
    if (!redoSnapshot) return;
    await onApplyProject(redoSnapshot);
    onSelectProject?.(redoSnapshot.id);
    setRedoSnapshot(null);
    setMessages((m) => [
      ...m,
      { id: `redo_${Date.now()}`, role: 'assistant', text: '↪ Redo applied — change re-applied. Validate again if needed.' },
    ]);
  };

  /** Regenerate the last proposal with a correction hint — "redo" flow. */
  const handleRedoProposal = async () => {
    if (busy || !lastUserRequest) return;
    handleDismissActions();
    setMessages((m) => [
      ...m,
      { id: `u_${Date.now()}`, role: 'user', text: `${lastUserRequest} (redo: propose differently, keep it simple)` },
    ]);
    setBusy(true);
    const assistantId = `a_${Date.now()}`;
    setMessages((m) => [...m, { id: assistantId, role: 'assistant', text: t.thinking, pending: true }]);
    try {
      const response = await askProjectAssistant(
        projects, project, userEmail,
        `${lastUserRequest}\n[REDO: previous proposal was dismissed. Propose again, simpler and with exact required fields. If something is missing, ask one short question with no actions.]`,
        null, { ...sessionHints, spoken: voiceReplies || conversationMode }, buildHistoryForApi(messages),
      );
      const actions = sanitizeProposedActions(response.proposedActions);
      setMessages((m) => m.map((msg) =>
        msg.id === assistantId ? { id: assistantId, role: 'assistant', text: response.message, actions } : msg));
      if (actions.length > 0) {
        setPendingActions(actions);
        setPendingMessageId(assistantId);
      }
      if (response.uiActions?.length && onNavigate && actions.length === 0) {
        onNavigate(response.uiActions);
        onClose();
      }
    } catch (err) {
      const errText = formatGeminiError(err, language);
      setMessages((m) => m.map((msg) =>
        msg.id === assistantId ? { id: assistantId, role: 'assistant', text: `⚠ ${errText}` } : msg));
    } finally {
      setBusy(false);
    }
  };

  useEscapeToClose(open, onClose);
  const { drawer, drawerRightVariants, overlayVariants, overlay } = useMotionConfig();

  return (
    <AnimatePresence>
      {open && (
    <div className="fixed inset-0 z-[140] flex items-end justify-end p-0 sm:p-4">
      <motion.button
        type="button"
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={overlay}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] max-sm:backdrop-blur-none transform-gpu"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      <motion.div
        variants={drawerRightVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={drawer}
        className="panel-motion-gpu relative flex h-[min(92vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-4 w-4 shrink-0 text-cyan-500" />
              {t.title}
            </h2>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{t.subtitle}</p>
            <p className={`mt-1 text-[9px] font-medium ${keyConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {keyConfigured ? t.keyActive : t.keyMissing}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                if (voiceReplies) stopSpeaking();
                setVoiceReplies((v) => !v);
              }}
              title={t.speakReplies}
              aria-pressed={voiceReplies}
              className={`rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                voiceReplies ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'
              }`}
            >
              {voiceReplies ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={toggleConversationMode}
              title={conversationMode ? t.conversationOn : t.conversation}
              aria-pressed={conversationMode}
              className={`rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                conversationMode
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'text-slate-400'
              }`}
            >
              {conversationMode ? <PhoneOff className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={startNewConversation}
              title={t.newChat}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={openKeyModal}
              title={t.keySettings}
              className={`relative rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                keyConfigured
                  ? 'text-cyan-600 dark:text-cyan-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              <Key className="h-5 w-5" />
              {!keyConfigured && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {conversationMode && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              </span>
              {listening ? t.listening : t.conversationOn}
            </span>
            <select
              value={speechLocale}
              onChange={(e) => {
                setSpeechLocale(e.target.value);
                localStorage.setItem('hs_tracker_speech_locale', e.target.value);
                lastAutoSentRef.current = '';
              }}
              aria-label={t.conversation}
              className="rounded-md border border-emerald-300 bg-white px-1.5 py-1 font-mono text-[10px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
            >
              {SPEECH_LOCALES.map((locale) => (
                <option key={locale.id} value={locale.id}>
                  {locale.short} · {locale.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <AnimatePresence>
          {showKeyModal && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                onClick={() => setShowKeyModal(false)}
                aria-label={t.close}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <Key className="h-4 w-4 text-cyan-500" />
                      {t.keySettings}
                    </h3>
                    <p className="mt-1 text-[10px] leading-snug text-slate-500">{t.keyHint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(false)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {keySource === 'env' && (
                  <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] leading-relaxed text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200">
                    {t.keyFromEnv}
                  </p>
                )}

                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {t.setupKey}
                </label>
                <div className="relative mb-3">
                  <input
                    type={showKeyPlain ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setKeyFeedback(null);
                    }}
                    placeholder="AIza…"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyPlain((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title={showKeyPlain ? 'Hide' : 'Show'}
                  >
                    {showKeyPlain ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <label className="mb-1 mt-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {t.modelLabel}
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value as GeminiModelId);
                    setKeyFeedback(null);
                  }}
                  className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                >
                  {GEMINI_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="mb-3 text-[9px] leading-snug text-slate-400">{t.modelHint}</p>

                {keyFeedback && (
                  <p className="mb-3 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{keyFeedback}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveKey}
                    disabled={!keyConfigured && !apiKeyInput.trim()}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t.saveKey}
                  </button>
                  {getStoredGeminiApiKey() && (
                    <button
                      type="button"
                      onClick={() => setShowRemoveKeyConfirm(true)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.removeKey}
                    </button>
                  )}
                </div>

                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block text-[10px] font-medium text-cyan-700 underline dark:text-cyan-400"
                >
                  {t.getKeyLink} →
                </a>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {msg.pending ? (
                  <span className="flex items-center gap-2">
                    <InlineLoader className="h-4 w-4" />
                    {msg.text}
                  </span>
                ) : (
                  <AssistantMessage text={msg.text} variant={msg.role} />
                )}
                {msg.actions && msg.actions.length > 0 && msg.id === pendingMessageId && (
                  <ul className="mt-2 space-y-1 border-t border-slate-200/50 pt-2 dark:border-slate-600">
                    {msg.actions.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start gap-1.5 text-[10px] font-medium text-slate-700 dark:text-slate-300"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                        {a.summary}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {pendingActions && pendingActions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="shrink-0 border-t border-cyan-200 bg-cyan-50 px-4 py-3 dark:border-cyan-900/50 dark:bg-cyan-950/30"
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:text-cyan-300">
                {t.proposed}
              </p>
              <ul className="mb-2 max-h-36 space-y-1.5 overflow-y-auto">
                {pendingActions.map((action) => (
                  <li
                    key={action.id}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-200/70 bg-white/70 px-2 py-1.5 dark:border-cyan-900/50 dark:bg-slate-900/60"
                  >
                    <span className="min-w-0 flex-1 text-[10px] font-medium leading-snug text-slate-700 dark:text-slate-300">
                      {action.summary}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleConfirmActions('', [action])}
                      disabled={busy}
                      title={t.confirmOne}
                      className="flex shrink-0 items-center gap-0.5 rounded-md bg-cyan-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {t.confirmOne}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkipAction(action.id)}
                      disabled={busy}
                      title={t.skip}
                      aria-label={t.skip}
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmActions()}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-cyan-600 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {pendingActions.length > 1 ? t.validateAll : t.confirm}
                </button>
                <button
                  type="button"
                  onClick={handleRedoProposal}
                  disabled={busy}
                  title={t.redoHint}
                  className="flex items-center justify-center gap-1 rounded-lg border border-cyan-300 px-3 py-2 text-[11px] font-bold text-cyan-700 disabled:opacity-40 dark:border-cyan-800 dark:text-cyan-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t.redo}
                </button>
                <button
                  type="button"
                  onClick={handleDismissActions}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                >
                  {t.dismiss}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0 border-t border-slate-100 p-3 dark:border-slate-800">
          {(undoCount > 0 || redoSnapshot) && (
            <div className="mb-2 flex gap-2">
              {undoCount > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {t.undo} ({undoCount})
                </button>
              )}
              {redoSnapshot && (
                <button
                  type="button"
                  onClick={handleRedoSnapshot}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                  Redo
                </button>
              )}
            </div>
          )}
          {imageFile && (
            <p className="mb-1 truncate text-[10px] text-cyan-600">📎 {imageFile.name}</p>
          )}
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              disabled={!keyConfigured || busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700"
              title={t.attach}
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!keyConfigured || busy}
              onClick={toggleVoiceInput}
              className={`rounded-lg border p-2 disabled:opacity-40 ${listening || conversationMode ? 'border-red-400 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700'}`}
              title={conversationMode ? t.conversationOn : listening ? t.listening : t.voice}
            >
              {listening || conversationMode ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <input
              type="text"
              value={input}
              disabled={!keyConfigured || busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={t.placeholder}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              disabled={!keyConfigured || busy || (!input.trim() && !imageFile)}
              onClick={handleSend}
              className="rounded-lg bg-slate-900 p-2 text-white disabled:opacity-40 dark:bg-cyan-600"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        open={showRemoveKeyConfirm}
        title={language === 'en' ? 'Remove API key?' : language === 'fr' ? 'Supprimer la clé API ?' : 'حذف مفتاح API؟'}
        message={
          language === 'en'
            ? 'Your saved Gemini API key will be removed from this browser. You can add it again later.'
            : language === 'fr'
              ? 'La clé Gemini enregistrée sera supprimée de ce navigateur.'
              : 'سيتم حذف مفتاح Gemini المحفوظ من هذا المتصفح.'
        }
        language={language}
        onConfirm={handleRemoveKey}
        onCancel={() => setShowRemoveKeyConfirm(false)}
      />
    </div>
      )}
    </AnimatePresence>
  );
}
