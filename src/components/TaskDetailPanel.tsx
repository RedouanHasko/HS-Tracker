import React, { useState, useRef } from 'react';
import {
  X,
  Save,
  Upload,
  Trash2,
  Image as ImageIcon,
  FileText,
  Loader2,
  ExternalLink,
  Plus,
  User,
} from 'lucide-react';
import { Task, TaskMedia, TaskAttachment, Language, Project, TaskCostLine } from '../types';
import TaskSubtasksSection from './TaskSubtasksSection';
import type { ConfirmRequest } from './ConfirmDialog';
import {
  normalizeTask,
  taskTotalCost,
  TASK_DETAIL_LABELS,
  WORK_CATEGORIES,
  emptyCostLine,
  memberOptions,
} from '../utils/taskHelpers';
import { formErrorText, validateCostLines } from '../utils/forms';
import {
  TASK_PRIORITY_ORDER,
  TASK_STATUS_ORDER,
  taskOwnerEmail,
  taskPriorityLabel,
  taskStatusLabel,
  withTaskOwner,
} from '../utils/taskState';
import { compressImageForSparkPlan, compressImageFile, formatFileSize, MAX_ATTACHMENT_BYTES, MAX_SPARK_ATTACHMENT_BYTES } from '../utils/imageCompression';
import { uploadProjectTaskFile, deleteStorageFile, stripTaskMediaUrlsForSave, resolveTaskMediaUrl, isUsingFirestoreMedia } from '../lib/storage';
import { syncProjectAccessFieldsIfNeeded } from '../lib/db';
import { auth } from '../lib/firebase';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { motion } from 'motion/react';
import { useMotionConfig } from '../utils/motionPresets';

interface TaskDetailPanelProps {
  key?: React.Key;
  task: Task;
  project: Project;
  language: Language;
  canEdit: boolean;
  onClose: () => void;
  onSave: (updatedTask: Task) => void;
  /** Parent-owned confirmation modal before destructive actions */
  onRequestConfirm?: (req: ConfirmRequest) => void;
}

/** Lazy-loaded thumbnail for Firestore-backed media */
function TaskMediaThumb({ media, alt }: { media: TaskMedia; alt: string }) {
  const [src, setSrc] = useState(media.url || '');
  const [loading, setLoading] = useState(!media.url);

  React.useEffect(() => {
    let cancelled = false;
    if (media.url) {
      setSrc(media.url);
      setLoading(false);
      return;
    }
    resolveTaskMediaUrl(media.storagePath).then((url) => {
      if (!cancelled) {
        setSrc(url);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [media.storagePath, media.url]);

  if (loading) {
    return <div className="flex h-full w-full items-center justify-center bg-slate-200 dark:bg-slate-800"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }
  if (!src) return null;
  return <img src={src} alt={alt} className="h-full w-full object-cover" />;
}

/** Image grid with upload for before / after / progress photos */
function PhotoSection({
  title,
  images,
  category,
  projectId,
  taskId,
  project,
  canEdit,
  language,
  labels,
  onImagesChange,
  onRequestConfirm,
}: {
  title: string;
  images: TaskMedia[];
  category: 'before' | 'after' | 'progress';
  projectId: string;
  taskId: string;
  project: Project;
  canEdit: boolean;
  language: Language;
  labels: (typeof TASK_DETAIL_LABELS)['en'];
  onImagesChange: (images: TaskMedia[]) => void;
  onRequestConfirm?: (req: ConfirmRequest) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = '';
    setBusy(true);
    setStatus(labels.compressing);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await syncProjectAccessFieldsIfNeeded(uid, project);
      }
      const uploaded: TaskMedia[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        if (files.length > 1) {
          setStatus(`${labels.compressing} ${i + 1}/${files.length}`);
        }
        const { blob, originalSize, compressedSize, fileName } = isUsingFirestoreMedia()
          ? await compressImageForSparkPlan(file)
          : await compressImageFile(file);
        setStatus(`${labels.compressionSaved}: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`);
        setStatus(labels.uploading);
        const { url, storagePath, sizeBytes } = await uploadProjectTaskFile(
          projectId,
          taskId,
          category,
          blob,
          fileName
        );
        uploaded.push({
          id: `img_${Date.now()}_${i}`,
          url,
          storagePath,
          uploadDate: new Date().toISOString(),
          sizeBytes,
          originalName: file.name,
        });
      }
      if (uploaded.length > 0) {
        onImagesChange([...images, ...uploaded]);
        setStatus(labels.saved);
      } else {
        setStatus('');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 4000);
    }
  };

  const removeImage = async (media: TaskMedia) => {
    const run = async () => {
      await deleteStorageFile(media.storagePath);
      onImagesChange(images.filter((i) => i.id !== media.id));
    };
    if (onRequestConfirm) {
      const msg =
        language === 'fr'
          ? 'Supprimer cette photo du dossier de la tâche ?'
          : language === 'ar'
            ? 'حذف هذه الصورة من المهمة؟'
            : 'Remove this photo from the task?';
      onRequestConfirm({
        title: labels.delete,
        message: msg,
        onConfirm: run,
      });
    } else {
      await run();
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h4>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {labels.uploadPhoto}
            </button>
          </>
        )}
      </div>
      {status && <p className="mb-2 text-[10px] text-sky-600 dark:text-sky-400">{status}</p>}
      {images.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-slate-400">{labels.noImages}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <TaskMediaThumb media={img} alt={img.caption || title} />
              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-[9px] text-white">
                {formatFileSize(img.sizeBytes)}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeImage(img)}
                  className="absolute right-1 top-1 rounded bg-red-500/90 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  title={labels.delete}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full task detail panel: before/after photos, notes, worker, cost lines, invoices.
 * Images are compressed in the browser before Firebase Storage upload.
 */
export default function TaskDetailPanel({
  task: initialTask,
  project,
  language,
  canEdit,
  onClose,
  onSave,
  onRequestConfirm,
}: TaskDetailPanelProps) {
  const labels = TASK_DETAIL_LABELS[language];
  const [task, setTask] = useState(() => normalizeTask(initialTask));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileStatus, setFileStatus] = useState('');
  const [pdfBlockedMessage, setPdfBlockedMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFreePlan = isUsingFirestoreMedia();

  const update = (patch: Partial<Task>) => setTask((t) => ({ ...t, ...patch }));

  const handleSave = async () => {
    if (!task.title.trim()) {
      setSaveError(
        language === 'fr' ? 'Le titre de la tâche est requis.' : language === 'ar' ? 'عنوان المهمة مطلوب.' : 'A task title is required.'
      );
      return;
    }
    const badLine = validateCostLines(
      (task.costLines || []).map((line) => ({ label: line.label, amount: line.amount }))
    );
    if (badLine) {
      setSaveError(
        `${formErrorText(badLine.code, language)} (${language === 'fr' ? 'ligne' : language === 'ar' ? 'البند' : 'line'} ${badLine.index + 1})`
      );
      return;
    }
    setSaveError('');
    setSaving(true);
    try {
      const toSave: Task = {
        ...task,
        beforeImages: stripTaskMediaUrlsForSave(task.beforeImages || []),
        afterImages: stripTaskMediaUrlsForSave(task.afterImages || []),
        progressImages: stripTaskMediaUrlsForSave(task.progressImages || []),
        attachments: stripTaskMediaUrlsForSave(task.attachments || []) as TaskAttachment[],
      };
      onSave(toSave);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const maxAttachment = onFreePlan ? MAX_SPARK_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES;

  const isPdfFile = (file: File) =>
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = '';
    setFileStatus('');
    setPdfBlockedMessage('');

    if (onFreePlan && files.some((file) => isPdfFile(file))) {
      setPdfBlockedMessage(labels.pdfUploadBlocked);
      return;
    }

    setFileBusy(true);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await syncProjectAccessFieldsIfNeeded(uid, project);
      }
      const uploaded: TaskAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let blob: Blob = file;
        let fileName = file.name;
        let sizeBytes = file.size;
        const mimeType = file.type || 'application/octet-stream';

        if (file.type.startsWith('image/')) {
          setFileStatus(files.length > 1 ? `${labels.compressing} ${i + 1}/${files.length}` : labels.compressing);
          const compressed = onFreePlan
            ? await compressImageForSparkPlan(file)
            : await compressImageFile(file);
          blob = compressed.blob;
          fileName = compressed.fileName;
          sizeBytes = compressed.compressedSize;
          setFileStatus(`${labels.compressionSaved}: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)}`);
        } else if (onFreePlan && isPdfFile(file)) {
          setPdfBlockedMessage(labels.pdfUploadBlocked);
          continue;
        } else if (file.size > maxAttachment) {
          throw new Error(labels.maxFileSize);
        }

        setFileStatus(labels.uploading);
        const { url, storagePath } = await uploadProjectTaskFile(
          project.id,
          task.id,
          'attachments',
          blob,
          fileName,
          mimeType
        );

        uploaded.push({
          id: `att_${Date.now()}_${i}`,
          title: file.name,
          url,
          storagePath,
          fileType: file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('image/') ? 'image' : 'other',
          sizeBytes,
          uploadDate: new Date().toISOString(),
          kind: file.name.toLowerCase().includes('facture') || file.name.toLowerCase().includes('invoice') ? 'invoice' : 'receipt',
        });
      }

      if (uploaded.length > 0) {
        update({ attachments: [...(task.attachments || []), ...uploaded] });
        setFileStatus(labels.saved);
      } else {
        setFileStatus('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setFileStatus(msg);
    } finally {
      setFileBusy(false);
      setTimeout(() => setFileStatus(''), 4000);
    }
  };

  const removeAttachment = async (att: TaskAttachment) => {
    const run = async () => {
      await deleteStorageFile(att.storagePath);
      update({ attachments: (task.attachments || []).filter((a) => a.id !== att.id) });
    };
    if (onRequestConfirm) {
      const msg =
        language === 'fr'
          ? `Supprimer « ${att.title} » ?`
          : language === 'ar'
            ? `حذف « ${att.title} »؟`
            : `Remove "${att.title}"?`;
      onRequestConfirm({ title: labels.delete, message: msg, onConfirm: run });
    } else {
      await run();
    }
  };

  const promptRemoveCostLine = (lineId: string, description: string) => {
    const run = () =>
      update({ costLines: (task.costLines || []).filter((l) => l.id !== lineId) });
    const msg =
      language === 'fr'
        ? `Supprimer la ligne « ${description || 'sans titre' } » ?`
        : language === 'ar'
          ? `حذف البند « ${description || 'بدون عنوان'} »؟`
          : `Remove cost line "${description || 'untitled'}"?`;
    if (onRequestConfirm) {
      onRequestConfirm({ title: labels.delete, message: msg, onConfirm: run });
    } else {
      run();
    }
  };

  const promptRemoveSubtask = (subtaskId: string, title: string) => {
    const run = () =>
      update({ subtasks: (task.subtasks || []).filter((s) => s.id !== subtaskId) });
    const msg =
      language === 'fr'
        ? `Supprimer la sous-tâche « ${title} » ?`
        : language === 'ar'
          ? `حذف المهمة الفرعية « ${title} »؟`
          : `Remove subtask "${title}"?`;
    if (onRequestConfirm) {
      onRequestConfirm({ title: labels.delete, message: msg, onConfirm: run });
    } else {
      run();
    }
  };

  const costTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      labor: labels.labor,
      materials: labels.materials,
      equipment: labels.equipment,
      other: labels.other,
    };
    return map[type] || type;
  };

  const members = memberOptions(project);
  const total = taskTotalCost(task);
  const { modal, modalVariants, overlayVariants, overlay } = useMotionConfig();

  useEscapeToClose(true, onClose);

  return (
    <motion.div
      className="fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={overlayVariants}
      transition={overlay}
    >
      <motion.button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm max-sm:backdrop-blur-none transform-gpu"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      <motion.div
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={modal}
        className="panel-motion-gpu relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0 pr-4 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">{labels.title}</p>
            {canEdit ? (
              <input
                value={task.title}
                onChange={(e) => update({ title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder={language === 'en' ? 'Task title' : language === 'fr' ? 'Titre de la tâche' : 'عنوان المهمة'}
              />
            ) : (
              <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">{task.title}</h2>
            )}
            {canEdit ? (
              <textarea
                value={task.description || ''}
                onChange={(e) => update({ description: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                placeholder={language === 'en' ? 'Description' : language === 'fr' ? 'Description' : 'الوصف'}
              />
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">{task.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {onFreePlan && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
              {language === 'en'
                ? 'Free plan: photos are compressed (~180 KB each) and saved in Firestore — no Cloud Storage or credit card needed.'
                : language === 'fr'
                ? 'Plan gratuit : photos compressées (~180 Ko) dans Firestore — pas de Cloud Storage requis.'
                : 'الخطة المجانية: الصور مضغوطة (~180 ك.ب) في Firestore — بدون Cloud Storage.'}
            </p>
          )}
          {/* Status, priority & assignee — the basics the kanban column depends on */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {language === 'fr' ? 'Statut' : language === 'ar' ? 'الحالة' : 'Status'}
              </label>
              {canEdit ? (
                <select
                  value={task.status}
                  onChange={(e) => update({ status: e.target.value as Task['status'] })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {TASK_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{taskStatusLabel(s, language)}</option>
                  ))}
                </select>
              ) : (
                <p className="py-2 text-sm font-medium">{taskStatusLabel(task.status, language)}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {language === 'fr' ? 'Priorité' : language === 'ar' ? 'الأولوية' : 'Priority'}
              </label>
              {canEdit ? (
                <select
                  value={task.priority}
                  onChange={(e) => update({ priority: e.target.value as Task['priority'] })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {TASK_PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>{taskPriorityLabel(p, language)}</option>
                  ))}
                </select>
              ) : (
                <p className="py-2 text-sm font-medium">{taskPriorityLabel(task.priority, language)}</p>
              )}
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <User className="h-3 w-3" />
                {language === 'fr' ? 'Assigné à' : language === 'ar' ? 'مُسند إلى' : 'Assigned to'}
              </label>
              {canEdit ? (
                <select
                  value={taskOwnerEmail(task)}
                  onChange={(e) => setTask((t) => withTaskOwner(t, e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {members.map((m) => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <p className="py-2 text-sm font-medium">
                  {members.find((m) => m.email === taskOwnerEmail(task))?.name || taskOwnerEmail(task) || '—'}
                </p>
              )}
            </div>
          </div>

          {/* Worker & category */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <User className="h-3 w-3" /> {labels.worker}
              </label>
              {canEdit ? (
                <select
                  value={taskOwnerEmail(task)}
                  onChange={(e) => setTask((t) => withTaskOwner(t, e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {members.map((m) => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm font-medium">{members.find((m) => m.email === taskOwnerEmail(task))?.name || taskOwnerEmail(task)}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{labels.category}</label>
              {canEdit ? (
                <select
                  value={task.workCategory || 'general'}
                  onChange={(e) => update({ workCategory: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {WORK_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c[language]}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm">{WORK_CATEGORIES.find((c) => c.id === task.workCategory)?.[language] || '—'}</p>
              )}
            </div>
          </div>

          {/* Schedule controls */}
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {language === 'fr' ? 'Échéance' : language === 'ar' ? 'الموعد النهائي' : 'Deadline'}
                </label>
                <input type="date" readOnly={!canEdit} value={task.deadline || ''} onChange={(e) => update({ deadline: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {language === 'fr' ? 'Échéance de référence' : language === 'ar' ? 'الموعد الأساسي' : 'Baseline deadline'}
                </label>
                <input type="date" readOnly={!canEdit} value={task.baselineDeadline || ''} onChange={(e) => update({ baselineDeadline: e.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700">
                <input type="checkbox" disabled={!canEdit} checked={Boolean(task.milestone)} onChange={(e) => update({ milestone: e.target.checked })} />
                {language === 'fr' ? 'Jalon du projet' : language === 'ar' ? 'مرحلة رئيسية' : 'Project milestone'}
              </label>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {language === 'fr' ? 'Raison du blocage' : language === 'ar' ? 'سبب التعطيل' : 'Blocker reason'}
              </label>
              <input readOnly={!canEdit} value={task.blockedReason || ''} onChange={(e) => update({ blockedReason: e.target.value })} placeholder={language === 'fr' ? 'Laisser vide si non bloqué' : language === 'ar' ? 'اتركه فارغاً إذا لم تكن المهمة معطلة' : 'Leave empty when the task is not blocked'} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </div>
            {project.tasks.some((item) => item.id !== task.id) && <div className="mt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{language === 'fr' ? 'Dépend de' : language === 'ar' ? 'تعتمد على' : 'Depends on'}</p>
              <div className="grid gap-2 sm:grid-cols-2">{project.tasks.filter((item) => item.id !== task.id).map((item) => <label key={item.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" disabled={!canEdit} checked={(task.dependencyIds || []).includes(item.id)} onChange={(e) => update({ dependencyIds: e.target.checked ? [...(task.dependencyIds || []), item.id] : (task.dependencyIds || []).filter((dependencyId) => dependencyId !== item.id) })} />{item.title}</label>)}</div>
            </div>}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{labels.notes}</label>
            <textarea
              rows={3}
              readOnly={!canEdit}
              value={task.notes || ''}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Site conditions, paint brand, room dimensions…"
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          {/* Subtasks checklist */}
          <TaskSubtasksSection
            subtasks={task.subtasks || []}
            canEdit={canEdit}
            labels={labels}
            language={language}
            onChange={(subtasks) => update({ subtasks })}
            onRequestRemove={promptRemoveSubtask}
          />

          {/* Before / After */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PhotoSection
              title={labels.before}
              images={task.beforeImages || []}
              category="before"
              projectId={project.id}
              taskId={task.id}
              project={project}
              canEdit={canEdit}
              language={language}
              labels={labels}
              onImagesChange={(beforeImages) => update({ beforeImages })}
              onRequestConfirm={onRequestConfirm}
            />
            <PhotoSection
              title={labels.after}
              images={task.afterImages || []}
              category="after"
              projectId={project.id}
              taskId={task.id}
              project={project}
              canEdit={canEdit}
              language={language}
              labels={labels}
              onImagesChange={(afterImages) => update({ afterImages })}
              onRequestConfirm={onRequestConfirm}
            />
          </div>

          {/* Cost breakdown */}
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{labels.costs}</h3>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => update({ costLines: [...(task.costLines || []), emptyCostLine()] })}
                  className="flex items-center gap-1 text-xs font-semibold text-sky-600"
                >
                  <Plus className="h-3.5 w-3.5" /> {labels.addCost}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {(task.costLines || []).map((line, idx) => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    readOnly={!canEdit}
                    value={line.label}
                    onChange={(e) => {
                      const costLines = [...(task.costLines || [])];
                      costLines[idx] = { ...line, label: e.target.value };
                      update({ costLines });
                      setSaveError('');
                    }}
                    placeholder={labels.label}
                    className="col-span-5 min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <select
                    disabled={!canEdit}
                    value={line.type}
                    onChange={(e) => {
                      const costLines = [...(task.costLines || [])];
                      costLines[idx] = { ...line, type: e.target.value as TaskCostLine['type'] };
                      update({ costLines });
                    }}
                    className="col-span-3 rounded border border-slate-200 px-1 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="labor">{labels.labor}</option>
                    <option value="materials">{labels.materials}</option>
                    <option value="equipment">{labels.equipment}</option>
                    <option value="other">{labels.other}</option>
                  </select>
                  <input
                    type="number"
                    readOnly={!canEdit}
                    min={0}
                    step="any"
                    value={line.amount || ''}
                    onChange={(e) => {
                      const costLines = [...(task.costLines || [])];
                      const next = Number(e.target.value);
                      costLines[idx] = { ...line, amount: Number.isNaN(next) ? 0 : Math.max(0, next) };
                      update({ costLines });
                      setSaveError('');
                    }}
                    placeholder={labels.amount}
                    className="col-span-3 min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-950"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => promptRemoveCostLine(line.id, line.label)}
                      className="col-span-1 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {labels.total}: {total.toLocaleString()} {project.currency}
              </span>
            </div>
          </div>

          {/* Attachments */}
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                <FileText className="h-4 w-4 text-sky-500" /> {labels.attachments}
              </h3>
              {canEdit && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={onFreePlan ? 'image/*' : 'image/*,application/pdf'}
                    multiple
                    className="hidden"
                    onChange={handleAttachmentUpload}
                  />
                  <button
                    type="button"
                    disabled={fileBusy}
                    onClick={() => {
                      setPdfBlockedMessage('');
                      fileInputRef.current?.click();
                    }}
                    className="flex items-center gap-1 text-xs font-semibold text-sky-600 disabled:opacity-50"
                  >
                    {fileBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {labels.uploadFile}
                  </button>
                </>
              )}
            </div>
            {onFreePlan && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{labels.pdfFreePlanNotice}</span>
                </p>
              </div>
            )}
            {pdfBlockedMessage && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-950/20" role="alert">
                <p className="text-[11px] font-medium leading-relaxed text-red-800 dark:text-red-300">
                  {pdfBlockedMessage}
                </p>
              </div>
            )}
            <p className="mb-2 text-[10px] text-slate-400">
              {onFreePlan ? labels.compressionSaved : `${labels.maxFileSize} · ${labels.compressionSaved}`}
            </p>
            {fileStatus && <p className="mb-2 text-[10px] text-sky-600">{fileStatus}</p>}
            {(task.attachments || []).length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">{labels.noFiles}</p>
            ) : (
              <ul className="space-y-2">
                {(task.attachments || []).map((att) => (
                  <li key={att.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/50">
                    <div className="flex min-w-0 items-center gap-2">
                      {att.fileType === 'image' ? <ImageIcon className="h-4 w-4 shrink-0 text-sky-500" /> : <FileText className="h-4 w-4 shrink-0 text-amber-500" />}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{att.title}</p>
                        <p className="text-[10px] text-slate-400">
                          {att.kind === 'invoice' ? labels.invoice : labels.receipt} · {formatFileSize(att.sizeBytes)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          const url = await resolveTaskMediaUrl(att.storagePath, att.url);
                          if (url) window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                        className="rounded p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                        title={labels.openFile}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      {canEdit && (
                        <button type="button" onClick={() => removeAttachment(att)} className="rounded p-1.5 text-slate-400 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          {saveError && (
            <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            {labels.close}
          </button>
          {canEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-900 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {labels.save}
            </button>
          )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
