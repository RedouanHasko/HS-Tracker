import { Task, TaskCostLine, TaskMedia, TaskAttachment, Language, Project, Subtask } from '../types';

/** Ensure legacy tasks have empty arrays for new fields */
export function normalizeTask(task: Task): Task {
  return {
    ...task,
    subtasks: task.subtasks ?? [],
    notes: task.notes ?? '',
    costLines: task.costLines ?? [],
    beforeImages: task.beforeImages ?? [],
    afterImages: task.afterImages ?? [],
    progressImages: task.progressImages ?? [],
    attachments: task.attachments ?? [],
  };
}

/** Subtask completion for kanban badges and progress bars */
export function subtaskProgress(task: Task): { done: number; total: number } {
  const list = task.subtasks ?? [];
  return { done: list.filter((s) => s.isCompleted).length, total: list.length };
}

export function createSubtask(title: string): Subtask {
  return {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
    isCompleted: false,
  };
}

export function taskTotalCost(task: Task): number {
  return (task.costLines ?? []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
}

export const WORK_CATEGORIES = [
  { id: 'painting', en: 'Painting', fr: 'Peinture', ar: 'دهان' },
  { id: 'plumbing', en: 'Plumbing', fr: 'Plomberie', ar: 'سباكة' },
  { id: 'electrical', en: 'Electrical', fr: 'Électricité', ar: 'كهرباء' },
  { id: 'tiling', en: 'Tiling', fr: 'Carrelage', ar: 'بلاط' },
  { id: 'carpentry', en: 'Carpentry', fr: 'Menuiserie', ar: 'نجارة' },
  { id: 'general', en: 'General', fr: 'Général', ar: 'عام' },
  { id: 'other', en: 'Other', fr: 'Autre', ar: 'أخرى' },
] as const;

export function categoryLabel(id: string | undefined, language: Language): string {
  const cat = WORK_CATEGORIES.find((c) => c.id === id);
  if (!cat) return id || '—';
  return cat[language] || cat.en;
}

export const TASK_DETAIL_LABELS = {
  en: {
    title: 'Task details',
    notes: 'Notes',
    worker: 'Worker / Contractor',
    category: 'Work type',
    before: 'Before',
    after: 'After',
    progress: 'Progress',
    costs: 'Cost breakdown',
    addCost: 'Add line',
    labor: 'Labor',
    materials: 'Materials',
    equipment: 'Equipment',
    other: 'Other',
    total: 'Total',
    attachments: 'Invoices & files',
    uploadPhoto: 'Upload photo',
    uploadFile: 'Upload file',
    compressing: 'Compressing…',
    uploading: 'Uploading…',
    saved: 'Saved',
    invoice: 'Invoice',
    receipt: 'Receipt',
    caption: 'Caption',
    delete: 'Remove',
    save: 'Save changes',
    close: 'Close',
    compressionSaved: 'Compressed',
    maxFileSize: 'Max 2 MB for documents',
    pdfFreePlanNotice:
      'PDF files need a paid Firebase plan (Blaze). On the free plan, take a photo of your invoice or receipt (JPG/PNG) — it will be compressed automatically.',
    pdfUploadBlocked:
      'PDF upload is not available on the free plan. Please photograph the document with your phone and upload it as an image.',
    openFile: 'Open',
    noImages: 'No photos yet',
    noFiles: 'No files yet',
    label: 'Label',
    amount: 'Amount',
    subtasks: 'Subtasks',
    addSubtask: 'Add subtask',
    subtaskPlaceholder: 'e.g. Sand walls, apply primer…',
    subtasksEmpty: 'Break this task into smaller steps',
    subtasksDone: 'done',
  },
  fr: {
    title: 'Détails de la tâche',
    notes: 'Notes',
    worker: 'Ouvrier / Prestataire',
    category: 'Type de travaux',
    before: 'Avant',
    after: 'Après',
    progress: 'En cours',
    costs: 'Détail des coûts',
    addCost: 'Ajouter ligne',
    labor: 'Main d\'œuvre',
    materials: 'Matériaux',
    equipment: 'Équipement',
    other: 'Autre',
    total: 'Total',
    attachments: 'Factures & fichiers',
    uploadPhoto: 'Ajouter photo',
    uploadFile: 'Ajouter fichier',
    compressing: 'Compression…',
    uploading: 'Envoi…',
    saved: 'Enregistré',
    invoice: 'Facture',
    receipt: 'Reçu',
    caption: 'Légende',
    delete: 'Supprimer',
    save: 'Enregistrer',
    close: 'Fermer',
    compressionSaved: 'Compressé',
    maxFileSize: 'Max 2 Mo pour les documents',
    pdfFreePlanNotice:
      'Les PDF nécessitent le plan Blaze (payant). En gratuit, photographiez votre facture ou reçu (JPG/PNG) — compression automatique.',
    pdfUploadBlocked:
      'Les PDF ne sont pas disponibles en plan gratuit. Photographiez le document et importez-le en image.',
    openFile: 'Ouvrir',
    noImages: 'Aucune photo',
    noFiles: 'Aucun fichier',
    label: 'Libellé',
    amount: 'Montant',
    subtasks: 'Sous-tâches',
    addSubtask: 'Ajouter',
    subtaskPlaceholder: 'ex. Poncer, sous-couche…',
    subtasksEmpty: 'Découpez cette tâche en étapes',
    subtasksDone: 'terminées',
  },
  ar: {
    title: 'تفاصيل المهمة',
    notes: 'ملاحظات',
    worker: 'العامل / المقاول',
    category: 'نوع العمل',
    before: 'قبل',
    after: 'بعد',
    progress: 'أثناء التنفيذ',
    costs: 'تفاصيل التكاليف',
    addCost: 'إضافة بند',
    labor: 'اليد العاملة',
    materials: 'المواد',
    equipment: 'المعدات',
    other: 'أخرى',
    total: 'المجموع',
    attachments: 'الفواتير والملفات',
    uploadPhoto: 'رفع صورة',
    uploadFile: 'رفع ملف',
    compressing: 'جاري الضغط…',
    uploading: 'جاري الرفع…',
    saved: 'تم الحفظ',
    invoice: 'فاتورة',
    receipt: 'إيصال',
    caption: 'وصف',
    delete: 'حذف',
    save: 'حفظ التغييرات',
    close: 'إغلاق',
    compressionSaved: 'تم الضغط',
    maxFileSize: 'حد أقصى 2 ميجا للمستندات',
    pdfFreePlanNotice:
      'ملفات PDF تحتاج خطة Blaze المدفوعة. في الخطة المجانية، صوّر الفاتورة أو الإيصال (JPG/PNG) وسيتم ضغطها تلقائياً.',
    pdfUploadBlocked:
      'رفع PDF غير متاح في الخطة المجانية. صوّر المستند وارفعه كصورة.',
    openFile: 'فتح',
    noImages: 'لا توجد صور',
    noFiles: 'لا توجد ملفات',
    label: 'الوصف',
    amount: 'المبلغ',
    subtasks: 'المهام الفرعية',
    addSubtask: 'إضافة',
    subtaskPlaceholder: 'مثال: صنفرة، طبقة أساس…',
    subtasksEmpty: 'قسّم المهمة إلى خطوات أصغر',
    subtasksDone: 'منجزة',
  },
};

export type TaskDetailLabels = typeof TASK_DETAIL_LABELS.en;

export function emptyCostLine(): TaskCostLine {
  return {
    id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    type: 'materials',
    amount: 0,
    notes: '',
  };
}

export function memberOptions(project: Project): { email: string; name: string }[] {
  return project.members.map((m) => ({ email: m.email, name: m.name }));
}
