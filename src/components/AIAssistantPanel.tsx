import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Send,
  Loader2,
  ImagePlus,
  Undo2,
  Key,
  Check,
  AlertTriangle,
  Sparkles,
  Eye,
  EyeOff,
  Trash2,
  MessageSquarePlus,
} from 'lucide-react';
import { Project, Language, UserRole } from '../types';
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
  isInformationalQuery,
  extractTaskIdFromAction,
  extractExpenseIdFromAction,
} from '../utils/aiActions';
import { parseDocumentDraft, AIDocumentDraft } from '../utils/aiDocumentDraft';
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
import { pushUndoSnapshot, popUndoSnapshot, undoStackSize } from '../utils/aiUndoStack';
import { InlineLoader } from './ui/AppLoader';
import AssistantMessage from './AssistantMessage';

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
    attach: 'Receipt photo',
    confirm: 'Apply changes',
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
    attach: 'Photo reçu',
    confirm: 'Appliquer',
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
    attach: 'صورة إيصال',
    confirm: 'تطبيق',
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
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [showRemoveKeyConfirm, setShowRemoveKeyConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const conversationProjectRef = useRef<string>(project?.id ?? 'workspace');

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
      setUndoCount(project ? undoStackSize(project.id) : 0);
      if (!hasGeminiApiKey()) {
        setShowKeyModal(true);
      }
      if (scopeKey !== conversationProjectRef.current) {
        conversationProjectRef.current = scopeKey;
        setMessages([welcomeMessage()]);
        setSessionHints({});
        setPendingActions(null);
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

  const handleSend = async () => {
    if (busy || (!input.trim() && !imageFile)) return;
    if (!keyConfigured) return;

    const userText = input.trim() || (imageFile ? t.attach : '');
    const historyBeforeSend = buildHistoryForApi(messages);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: userText + (imageFile ? ` 📎 ${imageFile.name}` : ''),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
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
        sessionHints,
        historyBeforeSend
      );
      let actions = sanitizeProposedActions(response.proposedActions);

      if (project) {
        const ctx = buildApplyCtx(project);
        if (ctx.perm.isReadOnly) {
          actions = actions.filter((a) => a.type === 'prepare_document');
        }
      }

      if (!imageFile && isInformationalQuery(userText) && !userWantsNavigation(userText)) {
        actions = [];
      }

      if (response.uiActions?.length && onNavigate) {
        onNavigate(response.uiActions);
        onClose();
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

  const handleConfirmActions = async () => {
    if (!pendingActions?.length) return;

    const docAction = pendingActions.find((a) => a.type === 'prepare_document');
    const projectActions = pendingActions.filter((a) => a.type !== 'prepare_document');

    const notes: string[] = [];

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
        pushUndoSnapshot(target);
        const { project: next, errors } = applyAIActions(target, actionsForProject, ctx);
        await onApplyProject(next);
        onSelectProject?.(next.id);

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

        setUndoCount(undoStackSize(target.id));
        if (errors.length > 0) notes.push(`${t.partial}\n${errors.join('\n')}`);
        else notes.push(t.applied);
      }
    }

    if (docAction && onApplyDocumentDraft) {
      const docTarget = resolveProjectFromParams(projects, docAction.params, project);
      if (docTarget) {
        onApplyDocumentDraft(parseDocumentDraft(docAction.params), docTarget.id);
        onSelectProject?.(docTarget.id);
        notes.push(
          language === 'en'
            ? 'Document draft ready — open Invoices & Vouchers tab, review, then Print.'
            : language === 'fr'
              ? 'Brouillon prêt — onglet Factures, vérifiez puis Imprimer.'
              : 'المسودة جاهزة — راجع الفواتير ثم اطبع.'
        );
      }
    }

    if (notes.length) {
      setMessages((m) => [...m, { id: `sys_${Date.now()}`, role: 'assistant', text: `✓ ${notes.join('\n')}` }]);
    }
    setPendingActions(null);
    setPendingMessageId(null);
  };

  const handleDismissActions = () => {
    setPendingActions(null);
    setPendingMessageId(null);
  };

  const handleUndo = async () => {
    const undoProject = project ?? projects[0];
    if (!undoProject) return;
    const prev = popUndoSnapshot(undoProject.id);
    if (!prev) return;
    await onApplyProject(prev);
    setUndoCount(undoStackSize(undoProject.id));
    onSelectProject?.(prev.id);
    setMessages((m) => [
      ...m,
      { id: `undo_${Date.now()}`, role: 'assistant', text: '↩ Undo applied — project restored to previous state.' },
    ]);
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmActions}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-cyan-600 py-2 text-[11px] font-bold text-white"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t.confirm}
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
          {undoCount > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {t.undo} ({undoCount})
            </button>
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
