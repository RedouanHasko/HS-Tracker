import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TopNavbar from './TopNavbar';
import TaskDetailPanel from './TaskDetailPanel';
import TaskKanbanBoard from './TaskKanbanBoard';
import DocumentPartySelector from './DocumentPartySelector';
import ConfirmDialog, { ConfirmRequest } from './ConfirmDialog';
import ExpenseReceiptField, { ExpenseReceiptDraft } from './ExpenseReceiptField';
import ExpenseReceiptThumb from './ExpenseReceiptThumb';
import { AppLoader, FadeIn } from './ui/AppLoader';
import { AnimatePresence, motion } from 'motion/react';
import { 
  Settings,
  Users, 
  DollarSign, 
  CheckSquare, 
  Plus, 
  Trash2, 
  Pencil,
  Check, 
  Calendar, 
  MapPin, 
  User as UserIcon, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  X,
  CreditCard,
  PlusCircle,
  HelpCircle,
  TrendingUp,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Search,
  Filter,
  Moon,
  Sun,
  FileText,
  Image as ImageIcon,
  ReceiptText,
  Download,
  Building,
  Menu,
  Upload,
  Loader2
} from 'lucide-react';
import { 
  Project, 
  Expense, 
  Task, 
  Subtask, 
  UserRole, 
  ExpenseCategory, 
  Language, 
  TimelineActivity,
  Reimbursement,
  Invitation,
  ProjectMember,
  DocumentParty,
  DocumentRecipientKind,
  DocumentKind,
  DocumentLineColumn,
  DocumentPresetsMap,
  PendingNotificationNav,
  TaskMedia,
  ProjectType,
  RentalBooking,
  RentalBookingPayment,
  RentalPaymentMethod,
  RentalBookingStatus,
  RentalOwnerPayment,
  Photo,
  PhotoType,
} from '../types';
import {
  bookingMonthSlice,
  isOwnerExpense,
  rentalBookingCommission,
  rentalBookingCommissionRate,
  rentalBookingBalanceDue,
  rentalBookingOpeningBalance,
  rentalBookingPaidAmount,
  rentalBookingOverpayment,
  rentalBookingRate,
  rentalBookingStatusForDates,
  rentalDaysBetween,
  addRentalBookingPayment,
  removeRentalBookingPayment,
  syncRentalBookingPaymentTotals,
} from '../utils/rentalAccounting';
import { buildRentalPaymentReceiptDraft } from '../utils/rentalPaymentReceipt';
import { rentalText } from '../utils/rentalTranslations';
import DatePickerInput from './ui/DatePickerInput';

const EXPENSES_PER_PAGE = 11;
const GALLERY_ITEMS_PER_PAGE = 12;
const MAX_GALLERY_BATCH = 10;

type DocumentLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  sourceExpenseId?: string;
  baseAmount?: number;
  commissionPercent?: number;
};
import { TRANSLATIONS, calculateSettlements } from '../utils/mockData';

const EXPORT_COLUMNS = [
  { key: 'date', labelEn: 'Date', labelFr: 'Date', labelAr: 'التاريخ' },
  { key: 'title', labelEn: 'Title', labelFr: 'Titre', labelAr: 'العنوان' },
  { key: 'description', labelEn: 'Description', labelFr: 'Description', labelAr: 'الوصف' },
  { key: 'supplier', labelEn: 'Supplier', labelFr: 'Fournisseur', labelAr: 'المورد' },
  { key: 'category', labelEn: 'Category', labelFr: 'Catégorie', labelAr: 'الفئة' },
  { key: 'amount', labelEn: 'Cost Amount', labelFr: 'Montant', labelAr: 'المبلغ' },
  { key: 'commission', labelEn: 'Commission %', labelFr: 'Commission %', labelAr: 'العمولة' },
  { key: 'invoicePrice', labelEn: 'Invoice Price', labelFr: 'Prix Facture', labelAr: 'سعر الفاتورة' },
  { key: 'paidBy', labelEn: 'Paid By', labelFr: 'Payé Par', labelAr: 'الدافع' },
  { key: 'currency', labelEn: 'Currency', labelFr: 'Devise', labelAr: 'العملة' },
  { key: 'notes', labelEn: 'Notes', labelFr: 'Notes', labelAr: 'ملاحظات' },
  { key: 'section', labelEn: 'Section', labelFr: 'Section', labelAr: 'القسم' },
];
import {
  loadDocumentParties,
  upsertDocumentParty,
  deleteDocumentParty,
  loadDocumentPresets,
  saveDocumentPresets,
  generateDocNumber,
  createPartyFromFields,
  billToLabel,
  updatePresetForKind,
  DEFAULT_DOC_PRESETS,
} from '../utils/documentProfiles';
import { resolveUserRole, getProjectPermissions, canEditTask, canDeleteTask, canEditExpense, canDeleteExpense, isProjectOwner, needsProjectAccessFieldSync } from '../utils/permissions';
import { describeSubtaskChanges, buildActivityMemberEmails } from '../utils/activityHelpers';
import { AIDocumentDraft } from '../utils/aiDocumentDraft';
import { pulseElementById, PendingAiNav } from '../utils/aiNavigation';
import { saveCivilDocumentAsPdf } from '../utils/printCivilDocument';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import ProjectActivityFeed from './ProjectActivityFeed';
import ProjectActivityHistoryPanel from './ProjectActivityHistoryPanel';
import { useAuth } from '../lib/AuthContext';
import { 
  saveProjectToDB, 
  saveActivityToDB, 
  deleteProjectFromDB,
  upsertNotification,
  subscribeToProject,
  subscribeToActivities,
  findUserProfile,
  sendProjectInvitation,
  revokeProjectInvitation,
  syncProjectAccessFieldsIfNeeded,
} from '../lib/db';
import {
  uploadExpenseReceipt,
  deleteStorageFile,
  stripTaskMediaUrlsForSave,
  formatMediaUploadError,
  resolveTaskMediaUrl,
  uploadProjectGalleryImage,
  isUsingFirestoreMedia,
} from '../lib/storage';
import {
  compressImageFile,
  compressImageForSparkPlan,
  formatFileSize,
} from '../utils/imageCompression';

interface ProjectDetailProps {
  projectId: string;
  openSettingsOnLoad?: boolean;
  onOpenSettingsConsumed?: () => void;
  onBack: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  sidebarToggleLabel?: string;
  /** AI navigation: open new-project dialog on dashboard */
  onOpenCreateProject?: () => void;
  unreadCount?: number;
  onToggleNotifications?: () => void;
  pendingNav?: PendingNotificationNav | null;
  onPendingNavConsumed?: () => void;
  pendingAiNav?: PendingAiNav | null;
  onPendingAiNavConsumed?: () => void;
  pendingDocumentDraft?: AIDocumentDraft | null;
  onPendingDocumentDraftConsumed?: () => void;
}

export default function ProjectDetail({ 
  projectId, 
  openSettingsOnLoad = false,
  onOpenSettingsConsumed,
  onBack, 
  language,
  onLanguageChange,
  theme, 
  onThemeToggle,
  sidebarOpen = true,
  onToggleSidebar,
  sidebarToggleLabel = 'Toggle sidebar',
  onOpenCreateProject,
  unreadCount = 0,
  onToggleNotifications,
  pendingNav,
  onPendingNavConsumed,
  pendingAiNav,
  onPendingAiNavConsumed,
  pendingDocumentDraft,
  onPendingDocumentDraftConsumed,
}: ProjectDetailProps) {
  const { user } = useAuth();
  const t = TRANSLATIONS[language];

  // Load and state track active project
  const [project, setProject] = useState<Project | null>(null);
  const [projectActivities, setProjectActivities] = useState<TimelineActivity[]>([]);
  
  // Tab Switcher state
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'tasks' | 'docs' | 'gallery' | 'rental'>('overview');
  const [resolvedGalleryUrls, setResolvedGalleryUrls] = useState<Record<string, string>>({});
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPhotoType, setGalleryPhotoType] = useState<PhotoType>('progress');
  const [galleryUploadBusy, setGalleryUploadBusy] = useState(false);
  const [galleryUploadStatus, setGalleryUploadStatus] = useState('');
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Modal displays
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [aiFocusId, setAiFocusId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmRequest | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const addMemberPanelRef = useRef<HTMLDivElement>(null);

  const requestConfirm = (req: ConfirmRequest) => setConfirmDialog(req);
  const closeConfirm = () => setConfirmDialog(null);

  const showAlert = useCallback(
    (title: string, message: string, variant: 'info' | 'danger' = 'info') => {
      setConfirmDialog({ title, message, mode: 'alert', variant });
    },
    []
  );

  const confirmLabels = {
    deleteProject: {
      en: { title: 'Delete this project?', message: (name: string) => `Permanently remove "${name}" and all its expenses, tasks, and records. This cannot be undone.` },
      fr: { title: 'Supprimer ce projet ?', message: (name: string) => `Supprimer définitivement « ${name} » et toutes ses dépenses, tâches et données. Action irréversible.` },
      ar: { title: 'حذف هذا المشروع؟', message: (name: string) => `إزالة « ${name} » وجميع مصاريفه ومهامه وسجلاته نهائياً. لا يمكن التراجع.` },
    },
    deleteExpense: {
      en: { title: 'Delete expense?', message: (name: string) => `Remove "${name}" from the ledger?` },
      fr: { title: 'Supprimer la dépense ?', message: (name: string) => `Retirer « ${name} » du registre ?` },
      ar: { title: 'حذف المصروف؟', message: (name: string) => `إزالة « ${name} » من السجل؟` },
    },
    deleteTask: {
      en: { title: 'Delete task?', message: (name: string) => `Remove task "${name}" and its details?` },
      fr: { title: 'Supprimer la tâche ?', message: (name: string) => `Supprimer la tâche « ${name} » ?` },
      ar: { title: 'حذف المهمة؟', message: (name: string) => `حذف المهمة « ${name} »؟` },
    },
    deleteReimbursement: {
      en: { title: 'Delete settlement?', message: 'Remove this recorded reimbursement from the project?' },
      fr: { title: 'Supprimer le remboursement ?', message: 'Retirer ce remboursement enregistré du projet ?' },
      ar: { title: 'حذف التسوية؟', message: 'إزالة هذا السداد المسجل من المشروع؟' },
    },
    removeMember: {
      en: { title: 'Remove member?', message: (name: string) => `Remove ${name} from this project workspace?` },
      fr: { title: 'Retirer le membre ?', message: (name: string) => `Retirer ${name} de cet espace projet ?` },
      ar: { title: 'إزالة العضو؟', message: (name: string) => `إزالة ${name} من مساحة المشروع؟` },
    },
    cancelInvite: {
      en: { title: 'Cancel invitation?', message: (name: string) => `Cancel the pending invitation for ${name}? They will no longer be able to join from the invite.` },
      fr: { title: 'Annuler l’invitation ?', message: (name: string) => `Annuler l’invitation en attente pour ${name} ?` },
      ar: { title: 'إلغاء الدعوة؟', message: (name: string) => `إلغاء الدعوة المعلقة لـ ${name}؟` },
    },
  } as const;

  const cl = <K extends keyof typeof confirmLabels>(key: K) =>
    confirmLabels[key][language] as (typeof confirmLabels)[K][Language];

  // Add Expense form states
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseCommission, setExpenseCommission] = useState<number>(0);
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory>('materials');
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [expenseSupplier, setExpenseSupplier] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [expenseRentalChargeTo, setExpenseRentalChargeTo] = useState<NonNullable<Expense['rentalChargeTo']>>('owner');
  const [expenseRentalBookingId, setExpenseRentalBookingId] = useState('');
  const [expenseReceiptDraft, setExpenseReceiptDraft] = useState<ExpenseReceiptDraft | null>(null);
  const [removeExpenseReceipt, setRemoveExpenseReceipt] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [selectedExportCols, setSelectedExportCols] = useState<Set<string>>(new Set(['date', 'title', 'category', 'amount', 'paidBy']));

  const [showReimbursementModal, setShowReimbursementModal] = useState(false);
  const [editingReimbursementId, setEditingReimbursementId] = useState<string | null>(null);
  const [reimbFrom, setReimbFrom] = useState('');
  const [reimbTo, setReimbTo] = useState('');
  const [reimbAmount, setReimbAmount] = useState(0);
  const [reimbDate, setReimbDate] = useState('');
  const [reimbSaving, setReimbSaving] = useState(false);

  const closeReimbursementModal = useCallback(() => {
    setShowReimbursementModal(false);
    setEditingReimbursementId(null);
    setReimbFrom('');
    setReimbTo('');
    setReimbAmount(0);
    setReimbDate('');
  }, []);

  const resetExpenseForm = useCallback(() => {
    setExpenseReceiptDraft((draft) => {
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      return null;
    });
    setExpenseTitle('');
    setExpenseDesc('');
    setExpenseAmount(0);
    setExpenseCommission(0);
    setExpenseSupplier('');
    setExpenseNotes('');
    setExpenseDate('');
    setExpenseRentalChargeTo('owner');
    setExpenseRentalBookingId('');
    setEditingExpenseId(null);
    setRemoveExpenseReceipt(false);
  }, []);

  const closeExpenseModal = useCallback(() => {
    resetExpenseForm();
    setShowAddExpense(false);
  }, [resetExpenseForm]);

  const openAddExpenseModal = useCallback(() => {
    resetExpenseForm();
    setExpensePaidBy(
      project?.members.find((m) => m.status === 'accepted' || !m.status)?.email ||
        project?.members[0]?.email ||
        (user?.email || '').toLowerCase()
    );
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setEditingExpenseId(null);
    setShowAddExpense(true);
  }, [resetExpenseForm, project, user?.email]);

  const openEditExpenseModal = useCallback((exp: Expense) => {
    resetExpenseForm();
    setEditingExpenseId(exp.id);
    setExpenseTitle(exp.title);
    setExpenseDesc(exp.description === 'No details provided.' ? '' : exp.description);
    setExpenseAmount(exp.amount);
    setExpenseCommission(exp.commissionPercent || 0);
    setExpenseCat(exp.category);
    setExpensePaidBy(exp.paidBy);
    setExpenseSupplier(exp.supplier === t.dashboard ? '' : exp.supplier);
    setExpenseNotes(exp.notes || '');
    setExpenseDate(exp.date);
    setExpenseRentalChargeTo(exp.rentalChargeTo || 'owner');
    setExpenseRentalBookingId(exp.rentalBookingId || '');
    setShowAddExpense(true);
  }, [resetExpenseForm, t.dashboard]);

  const closeAddExpenseModal = closeExpenseModal;

  useClickOutside(addMemberPanelRef, () => setShowAddMember(false), showAddMember);
  useEscapeToClose(showAddExpense, closeAddExpenseModal);
  useEscapeToClose(showReimbursementModal, closeReimbursementModal);
  useEscapeToClose(showAddTask, () => setShowAddTask(false));
  useEscapeToClose(showSettings, () => setShowSettings(false));
  useEscapeToClose(showAddMember, () => setShowAddMember(false));

  // Add Task form states
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignedTo, setTaskAssignedTo] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  
  // Custom member states
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('contributor');
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState<string | null>(null);

  // Edit Project settings states
  const [editName, setEditName] = useState('');
  const [editClient, setEditClient] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editBudget, setEditBudget] = useState(0);
  const [editCurrency, setEditCurrency] = useState('');
  const [editStatus, setEditStatus] = useState<Project['status']>('in_progress');
  const [editProjectType, setEditProjectType] = useState<ProjectType>('construction');
  const [editRentalOwnerName, setEditRentalOwnerName] = useState('');
  const [editRentalOwnerPhone, setEditRentalOwnerPhone] = useState('');
  const [editRentalOwnerEmail, setEditRentalOwnerEmail] = useState('');
  const [editRentalBuildingNumber, setEditRentalBuildingNumber] = useState('');
  const [editRentalPricePerNight, setEditRentalPricePerNight] = useState(0);
  const [editRentalCommissionRate, setEditRentalCommissionRate] = useState(10);
  const [editRentalNotes, setEditRentalNotes] = useState('');

  // Expense search & filters
  const [expenseQuery, setExpenseQuery] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');
  const [expensePaidByFilter, setExpensePaidByFilter] = useState<string>('all');
  const [expensePage, setExpensePage] = useState(1);

  // Intelligent dynamic Invoice / Recu / Bon generator states
  const [docType, setDocType] = useState<DocumentKind>('invoice');
  const [docPresets, setDocPresets] = useState<DocumentPresetsMap>(DEFAULT_DOC_PRESETS);
  const [documentParties, setDocumentParties] = useState<DocumentParty[]>([]);
  const [docNumber, setDocNumber] = useState(() => generateDocNumber(DEFAULT_DOC_PRESETS.invoice.prefix));
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docDueDate, setDocDueDate] = useState(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [docLogo, setDocLogo] = useState<string | null>(null);
  const [docPaperFormat, setDocPaperFormat] = useState<'A4'>('A4');

  const [docSenderName, setDocSenderName] = useState('');
  const [docSenderEmail, setDocSenderEmail] = useState('');
  const [docSenderPhone, setDocSenderPhone] = useState('');
  const [docSenderAddress, setDocSenderAddress] = useState('');

  const [docRecipientKind, setDocRecipientKind] = useState<DocumentRecipientKind>('client');
  const [docClientName, setDocClientName] = useState('');
  const [docClientEmail, setDocClientEmail] = useState('');
  const [docClientPhone, setDocClientPhone] = useState('');
  const [docClientAddress, setDocClientAddress] = useState('');

  const [docTaxRate, setDocTaxRate] = useState<number>(DEFAULT_DOC_PRESETS.invoice.taxRate);
  const [docNotes, setDocNotes] = useState('');
  const [docVisibleColumns, setDocVisibleColumns] = useState<DocumentLineColumn[]>(DEFAULT_DOC_PRESETS.invoice.visibleColumns);

  // Items included in the printed sheet
  const [docItems, setDocItems] = useState<DocumentLineItem[]>([]);

  // Item builder fields
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

  const docSubtotal = docItems.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  const docTotal = docSubtotal * (1 + docTaxRate / 100);

  const exportPickerRef = useRef<HTMLDivElement>(null);

  const handleToggleExpenseIntoDoc = (expense: Expense) => {
    const exists = docItems.find(item => item.sourceExpenseId === expense.id || item.id === expense.id);
    if (exists) {
      setDocItems(docItems.filter(item => item.sourceExpenseId !== expense.id && item.id !== expense.id));
    } else {
      const commissionPercent = Math.max(0, expense.commissionPercent || 0);
      const parsedItem = {
        id: expense.id,
        description: `${expense.title} (${language === 'en' ? 'Ref expense' : language === 'fr' ? 'Réf' : 'المرجع'}${expense.supplier ? ` - ${expense.supplier}` : ''})`,
        quantity: 1,
        unitPrice: expense.amount * (1 + commissionPercent / 100),
        sourceExpenseId: expense.id,
        baseAmount: expense.amount,
        commissionPercent,
      };
      setDocItems([...docItems, parsedItem]);
    }
  };

  useClickOutside(exportPickerRef, () => setShowExportPicker(false), showExportPicker);

  const handleExportExpensesExcel = () => {
    const colsOrder = ['date', 'title', 'description', 'supplier', 'category', 'amount', 'commission', 'invoicePrice', 'paidBy', 'currency', 'notes', 'section'];
    const activeCols = colsOrder.filter(c => selectedExportCols.has(c));
    const colLabels = activeCols.map(k => {
      const col = EXPORT_COLUMNS.find(c => c.key === k)!;
      return language === 'en' ? col.labelEn : language === 'fr' ? col.labelFr : col.labelAr;
    });

    const rows: (string | number)[][] = [colLabels];
    for (const exp of filteredExpenses) {
      const sectionTitle = exp.sectionId ? project.sections.find(s => s.id === exp.sectionId)?.title || '' : '';
      const payerName = project.members.find(m => m.email === exp.paidBy)?.name || exp.paidBy;
      const invoicePrice = exp.commissionPercent ? exp.amount + (exp.amount * exp.commissionPercent / 100) : exp.amount;
      const row: (string | number)[] = [];
      for (const k of activeCols) {
        switch (k) {
          case 'date': row.push(exp.date); break;
          case 'title': row.push(exp.title); break;
          case 'description': row.push(exp.description === 'No details provided.' ? '' : exp.description); break;
          case 'supplier': row.push(exp.supplier); break;
          case 'category': row.push(t.categories[exp.category]); break;
          case 'amount': row.push(exp.amount); break;
          case 'commission': row.push(exp.commissionPercent || 0); break;
          case 'invoicePrice': row.push(invoicePrice); break;
          case 'paidBy': row.push(payerName); break;
          case 'currency': row.push(project.currency); break;
          case 'notes': row.push(exp.notes || ''); break;
          case 'section': row.push(sectionTitle); break;
          default: row.push(''); break;
        }
      }
      rows.push(row);
    }

    const escapeCsvCell = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_expenses.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    setShowExportPicker(false);
  };

  const handleRemoveDocItem = (id: string) => {
    setDocItems(docItems.filter(item => item.id !== id));
  };

  const updateDocItem = (id: string, patch: Partial<DocumentLineItem>) => {
    setDocItems((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const updateDocumentItemCommission = (id: string, commissionPercent: number) => {
    setDocItems((items) => items.map((item) => {
      if (item.id !== id) return item;
      const rate = Math.max(0, commissionPercent || 0);
      const baseAmount = item.baseAmount ?? item.unitPrice;
      return { ...item, baseAmount, commissionPercent: rate, unitPrice: baseAmount * (1 + rate / 100) };
    }));
  };

  const toggleDocumentColumn = (column: DocumentLineColumn) => {
    const visibleColumns = docVisibleColumns.includes(column)
      ? docVisibleColumns.filter((value) => value !== column)
      : [...docVisibleColumns, column];
    setDocVisibleColumns(visibleColumns);
    persistCurrentDocPreset({ visibleColumns });
  };

  const handleSaveDocumentAsPdf = useCallback(() => {
    const typeLabel =
      docType === 'invoice' ? 'Invoice' : docType === 'voucher' ? 'Voucher' : 'Receipt';
    saveCivilDocumentAsPdf(`${typeLabel}_${docNumber || 'document'}`);
  }, [docType, docNumber]);

  /** Persist per-document-type preset (tax, notes, paper) for the active type */
  const persistCurrentDocPreset = useCallback(
    (patch: Partial<DocumentPresetsMap[DocumentKind]>) => {
      if (!user?.uid) return;
      const updated = updatePresetForKind(docPresets, docType, patch);
      setDocPresets(updated);
      saveDocumentPresets(user.uid, updated);
    },
    [user?.uid, docPresets, docType]
  );

  const switchDocType = useCallback(
    (kind: DocumentKind) => {
      let presets = docPresets;
      if (user?.uid) {
        presets = updatePresetForKind(docPresets, docType, {
          taxRate: docTaxRate,
          defaultNotes: docNotes,
          paperFormat: docPaperFormat,
          visibleColumns: docVisibleColumns,
        });
        setDocPresets(presets);
        saveDocumentPresets(user.uid, presets);
      }
      const preset = presets[kind];
      setDocType(kind);
      setDocNumber(generateDocNumber(preset.prefix));
      setDocTaxRate(preset.taxRate);
      setDocNotes(preset.defaultNotes);
      setDocPaperFormat('A4');
      setDocVisibleColumns(preset.visibleColumns);
    },
    [user?.uid, docPresets, docType, docTaxRate, docNotes, docPaperFormat, docVisibleColumns]
  );

  const handleSaveDocumentParty = (role: 'issuer' | 'recipient', label: string) => {
    if (!user?.uid) return;
    const fields =
      role === 'issuer'
        ? { name: docSenderName, email: docSenderEmail, phone: docSenderPhone, address: docSenderAddress }
        : { name: docClientName, email: docClientEmail, phone: docClientPhone, address: docClientAddress };
    const party = createPartyFromFields(role, label, fields, role === 'recipient' ? docRecipientKind : undefined);
    setDocumentParties(upsertDocumentParty(user.uid, party));
  };

  const handleSelectDocumentParty = (party: DocumentParty) => {
    if (party.role === 'issuer') {
      setDocSenderName(party.name);
      setDocSenderEmail(party.email);
      setDocSenderPhone(party.phone);
      setDocSenderAddress(party.address);
    } else {
      setDocClientName(party.name);
      setDocClientEmail(party.email);
      setDocClientPhone(party.phone);
      setDocClientAddress(party.address);
      if (party.recipientKind) setDocRecipientKind(party.recipientKind);
    }
  };

  const handleDeleteDocumentParty = (partyId: string) => {
    if (!user?.uid) return;
    setDocumentParties(deleteDocumentParty(user.uid, partyId));
  };

  useEffect(() => {
    if (!user?.uid) return;
    setDocumentParties(loadDocumentParties(user.uid));
    const presets = loadDocumentPresets(user.uid);
    setDocPresets(presets);
    const initial = presets.invoice;
    setDocNumber(generateDocNumber(initial.prefix));
    setDocTaxRate(initial.taxRate);
    setDocNotes(initial.defaultNotes);
    setDocPaperFormat('A4');
    setDocVisibleColumns(initial.visibleColumns);
  }, [user?.uid]);

  useEffect(() => {
    if (!projectId) return;

    // Utilize subscribeToProject for automatic real-time synchronization between members
    const unsubscribe = subscribeToProject(projectId, (found) => {
      if (found) {
        setProject(found);
        
        // Prep edit states
        setEditName(found.name);
        setEditClient(found.clientName);
        setEditAddress(found.address);
        setEditDesc(found.description);
        setEditBudget(found.budget);
        setEditCurrency(found.currency);
        setEditStatus(found.status);
        setEditProjectType(found.projectType || 'construction');
        setEditRentalOwnerName(found.rentalProperty?.ownerName || found.clientName || '');
        setEditRentalOwnerPhone(found.rentalProperty?.ownerPhone || '');
        setEditRentalOwnerEmail(found.rentalProperty?.ownerEmail || '');
        setEditRentalBuildingNumber(found.rentalProperty?.buildingNumber || found.address || '');
        setEditRentalPricePerNight(found.rentalProperty?.pricePerNight || 0);
        setEditRentalCommissionRate(found.rentalProperty?.commissionRate ?? 10);
        setEditRentalNotes(found.rentalProperty?.notes || '');

        // Prep form select defaults
        if (found.members.length > 0) {
          setExpensePaidBy(found.members[0].email);
          setTaskAssignedTo(found.members[0].email);
        }
      } else {
        setProject(null);
        onBack();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [projectId, language]);

  // Keep Firestore access lists in sync so receipt/media uploads pass security rules
  useEffect(() => {
    if (!project || !user?.uid || !needsProjectAccessFieldSync(project)) return;
    syncProjectAccessFieldsIfNeeded(user.uid, project).catch((err) => {
      console.warn('Project access field sync failed:', err);
    });
  }, [project, user?.uid]);

  useEffect(() => {
    if (project?.projectType !== 'rental' && activeTab === 'rental') {
      setActiveTab('overview');
    }
  }, [project?.projectType, activeTab]);

  useEffect(() => {
    if (!projectId || !user?.email) return;
    const unsub = subscribeToActivities(projectId, user.email, setProjectActivities);
    return () => unsub();
  }, [projectId, user?.email]);

  /** Fill Invoices & Vouchers tab from AI draft, then open for review/print */
  const applyDocumentDraftFromAI = useCallback(
    (draft: AIDocumentDraft) => {
      const kind = draft.docType || 'invoice';
      setDocType(kind);
      setDocNumber(
        draft.docNumber ||
          generateDocNumber((docPresets[kind] || DEFAULT_DOC_PRESETS[kind]).prefix)
      );
      if (draft.docDate) setDocDate(draft.docDate);
      if (draft.docDueDate) setDocDueDate(draft.docDueDate);
      if (draft.taxRate != null) setDocTaxRate(draft.taxRate);
      if (draft.notes != null) setDocNotes(draft.notes);
      if (draft.paperFormat) setDocPaperFormat(draft.paperFormat);
      if (draft.issuerName != null) setDocSenderName(draft.issuerName);
      if (draft.issuerEmail != null) setDocSenderEmail(draft.issuerEmail);
      if (draft.issuerPhone != null) setDocSenderPhone(draft.issuerPhone);
      if (draft.issuerAddress != null) setDocSenderAddress(draft.issuerAddress);
      if (draft.recipientName != null) setDocClientName(draft.recipientName);
      if (draft.recipientEmail != null) setDocClientEmail(draft.recipientEmail);
      if (draft.recipientPhone != null) setDocClientPhone(draft.recipientPhone);
      if (draft.recipientAddress != null) setDocClientAddress(draft.recipientAddress);
      if (draft.recipientKind) setDocRecipientKind(draft.recipientKind);
      if (draft.items?.length) {
        setDocItems(
          draft.items.map((item, i) => ({
            id: `doc_ai_${Date.now()}_${i}`,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }))
        );
      }
      setActiveTab('docs');
    },
    [docPresets]
  );

  const flashAiFocus = useCallback((elementId: string) => {
    setAiFocusId(elementId);
    pulseElementById(elementId);
    window.setTimeout(() => setAiFocusId(null), 3500);
  }, []);

  /** Open the right tab/task when AI navigates from dashboard or in-project */
  useEffect(() => {
    if (!pendingAiNav || pendingAiNav.projectId !== projectId || !project) return;

    if (pendingAiNav.tab) setActiveTab(pendingAiNav.tab);
    if (pendingAiNav.taskId) {
      setSelectedTaskId(pendingAiNav.taskId);
      const cardId = `task-card-${pendingAiNav.taskId}`;
      window.setTimeout(() => flashAiFocus(cardId), 350);
    }
    if (pendingAiNav.expenseId) {
      setActiveTab('expenses');
      window.setTimeout(() => flashAiFocus(`expense-row-${pendingAiNav.expenseId}`), 350);
    }
    if (pendingAiNav.openActivityHistory) setShowActivityHistory(true);
    if (
      pendingAiNav.openProjectSettings &&
      getProjectPermissions(resolveUserRole(project, user?.email || '')).canModifySettings
    ) {
      setShowSettings(true);
    }
    onPendingAiNavConsumed?.();
  }, [pendingAiNav, projectId, project, user?.email, onPendingAiNavConsumed, flashAiFocus]);

  useEffect(() => {
    if (!pendingDocumentDraft || !project) return;
    applyDocumentDraftFromAI(pendingDocumentDraft);
    onPendingDocumentDraftConsumed?.();
    if (pendingDocumentDraft.autoExport) {
      window.setTimeout(handleSaveDocumentAsPdf, 450);
    }
  }, [
    pendingDocumentDraft,
    project,
    applyDocumentDraftFromAI,
    handleSaveDocumentAsPdf,
    onPendingDocumentDraftConsumed,
  ]);

  /** Open the right tab/task when user clicks a notification */
  useEffect(() => {
    if (!pendingNav || pendingNav.projectId !== projectId || !project) return;

    if (pendingNav.tab) setActiveTab(pendingNav.tab);
    if (pendingNav.taskId) {
      setSelectedTaskId(pendingNav.taskId);
      const cardId = `task-card-${pendingNav.taskId}`;
      window.setTimeout(() => {
        setAiFocusId(cardId);
        pulseElementById(cardId);
        window.setTimeout(() => setAiFocusId(null), 3500);
      }, 350);
    }
    onPendingNavConsumed?.();
  }, [pendingNav, projectId, project, onPendingNavConsumed]);

  useEffect(() => {
    if (!openSettingsOnLoad || !project || !user?.email) return;
    const role = resolveUserRole(project, user.email);
    if (getProjectPermissions(role).canModifySettings) {
      setShowSettings(true);
    }
    onOpenSettingsConsumed?.();
  }, [openSettingsOnLoad, project, user?.email, onOpenSettingsConsumed]);

  const galleryItems = useMemo(() => {
    if (!project) return [];

    const projectItems = (project.photos || []).map((photo) => ({
      id: `project_${photo.id}`,
      photoId: photo.id,
      title: photo.title,
      category: photo.type,
      date: photo.uploadDate,
      url: photo.url,
      storagePath: photo.storagePath || '',
      taskTitle: '',
      isProjectPhoto: true,
    }));
    const taskItems = project.tasks.flatMap((task) =>
      ([
        ['before', task.beforeImages || []],
        ['progress', task.progressImages || []],
        ['after', task.afterImages || []],
      ] as const).flatMap(([category, media]) =>
        media.map((item) => ({
          id: `${task.id}_${category}_${item.id}`,
          photoId: '',
          title: item.caption || item.originalName || task.title,
          category,
          date: item.uploadDate,
          url: item.url || '',
          storagePath: item.storagePath,
          taskTitle: task.title,
          isProjectPhoto: false,
        }))
      )
    );

    return [...projectItems, ...taskItems].sort((left, right) =>
      String(right.date || '').localeCompare(String(left.date || ''))
    );
  }, [project]);

  const galleryPageCount = Math.max(1, Math.ceil(galleryItems.length / GALLERY_ITEMS_PER_PAGE));
  const visibleGalleryItems = useMemo(() => {
    const start = (galleryPage - 1) * GALLERY_ITEMS_PER_PAGE;
    return galleryItems.slice(start, start + GALLERY_ITEMS_PER_PAGE);
  }, [galleryItems, galleryPage]);

  useEffect(() => {
    if (galleryPage > galleryPageCount) setGalleryPage(galleryPageCount);
  }, [galleryPage, galleryPageCount]);

  useEffect(() => {
    if (activeTab !== 'gallery') return;
    let cancelled = false;
    const unresolved = visibleGalleryItems.filter(
      (item) =>
        item.storagePath &&
        !item.url &&
        !Object.prototype.hasOwnProperty.call(resolvedGalleryUrls, item.id)
    );
    if (unresolved.length === 0) return;

    Promise.all(
      unresolved.map(async (item) => ({
        id: item.id,
        url: await resolveTaskMediaUrl(item.storagePath, item.url).catch(() => ''),
      }))
    ).then((resolved) => {
      if (cancelled) return;
      setResolvedGalleryUrls((current) => {
        const next = { ...current };
        for (const item of resolved) {
          next[item.id] = item.url;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, visibleGalleryItems, resolvedGalleryUrls]);

  if (!project) {
    return (
      <AppLoader
        label={
          language === 'en'
            ? 'Loading project workspace…'
            : language === 'fr'
              ? 'Chargement de l\'espace projet…'
              : 'جاري تحميل مساحة المشروع…'
        }
      />
    );
  }

  const recipientQuickFill: {
    label: string;
    fields: { name: string; email: string; phone: string; address: string };
    kind?: DocumentRecipientKind;
  }[] = [];
  if (project.clientName) {
    recipientQuickFill.push({
      label: language === 'en' ? 'Project client' : language === 'fr' ? 'Client du projet' : 'عميل المشروع',
      fields: { name: project.clientName, email: '', phone: '', address: project.address || '' },
      kind: 'client',
    });
  }
  project.members
    .filter((m) => m.status === 'accepted' || !m.status)
    .forEach((m) => {
      recipientQuickFill.push({
        label: m.name,
        fields: { name: m.name, email: m.email, phone: '', address: '' },
        kind: 'member',
      });
    });

  // Cost and dues calculations (respecting reimbursements inside calculateSettlements)
  const { totalSpent, paidMap, expectedShares, settlements } = calculateSettlements(project);

  const hasBudget = project.projectType === 'construction' && project.budget > 0;
  // Construction and rental workspaces track project finances, not personal debt settlements.
  // Legacy service data remains preserved, but it is the only historical context that can expose this UI.
  const isSettlementWorkspace = project.projectType === 'service';
  const percentSpent = hasBudget ? Math.round((totalSpent / project.budget) * 100) : 0;
  const rentalBookings = project.rentalBookings || [];
  const rentalRevenue = rentalBookings.reduce((s, b) => s + b.totalAmount, 0);
  const rentalCommission = rentalBookings.reduce((s, b) => s + b.commission, 0);
  const rentalOwnerPayout = rentalBookings.reduce((s, b) => s + b.ownerPayout, 0);
  const rentalPaid = rentalBookings.reduce((s, b) => s + rentalBookingPaidAmount(b), 0);
  const rentalBalanceDue = rentalBookings.reduce((s, b) => s + rentalBookingBalanceDue(b), 0);
  const rentalNetOwner = rentalOwnerPayout - totalSpent;

  const userEmail = (user?.email || '').toLowerCase();
  const userRole = resolveUserRole(project, userEmail);
  const perm = getProjectPermissions(userRole);

  const denyWrite = (action: string) => {
    const msg =
      language === 'en'
        ? `You don't have permission to ${action}. Your role is read-only.`
        : language === 'fr'
          ? `Permission refusée (${action}). Votre rôle est lecture seule.`
          : `ليس لديك صلاحية لـ ${action}. دورك للقراءة فقط.`;
    showAlert(
      language === 'en' ? 'Permission denied' : language === 'fr' ? 'Permission refusée' : 'صلاحية مرفوضة',
      msg,
      'info'
    );
  };

  // Sync state back to Firebase (reverts local state if Firestore rejects the write). Returns true on success.
  const syncProjectChanges = async (updatedProj: Project): Promise<boolean> => {
    if (!user?.uid) return false;
    const previous = project;
    setProject(updatedProj);
    try {
      await saveProjectToDB(user.uid, updatedProj);
      window.dispatchEvent(new Event('storage'));
      return true;
    } catch (e) {
      console.error(e);
      setProject(previous);
      const isPermission =
        e instanceof Error &&
        (e.message.includes('permission') ||
          e.message.includes('PERMISSION_DENIED') ||
          e.message.includes('insufficient'));
      const msg = isPermission
        ? language === 'en'
          ? 'Could not save changes. Your role may not allow this action, or the project access list is out of date. Ask the project owner to re-save the project or deploy the latest security rules.'
          : language === 'fr'
            ? 'Enregistrement impossible. Votre rôle ne permet peut-être pas cette action. Demandez au propriétaire du projet de réessayer.'
            : 'تعذر الحفظ. قد لا تسمح لك صلاحيتك بهذا الإجراء. اطلب من مالك المشروع إعادة المحاولة.'
        : language === 'en'
          ? 'Could not save changes. Please check your connection and try again.'
          : language === 'fr'
            ? 'Enregistrement impossible. Vérifiez votre connexion et réessayez.'
            : 'تعذر الحفظ. تحقق من الاتصال وحاول مرة أخرى.';
      showAlert(
        language === 'en' ? 'Save failed' : language === 'fr' ? 'Échec de l’enregistrement' : 'فشل الحفظ',
        msg,
        'danger'
      );
      return false;
    }
  };

  const trackActivity = async (
    type: TimelineActivity['actionType'],
    details: string,
    meta?: Pick<TimelineActivity, 'targetType' | 'targetId' | 'targetTitle'>
  ) => {
    if (!user?.uid || !project) return;
    const newAct: TimelineActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      userEmail: user.email || 'system',
      userName: user.displayName || user.email?.split('@')[0] || 'System',
      actionType: type,
      actionDetails: details,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      memberEmails: buildActivityMemberEmails(project),
      ...meta,
    };
    try {
      await saveActivityToDB(user.uid, newAct);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected: File[] = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (selected.length === 0) return;
    if (!perm.canUploadTaskMedia) {
      denyWrite('upload project photos');
      return;
    }

    const files = selected.filter((file) => file.type.startsWith('image/')).slice(0, MAX_GALLERY_BATCH);
    if (files.length === 0) {
      showAlert('Unsupported files', 'Please select JPG, PNG, WEBP, or other image files.');
      return;
    }
    if ((project.photos || []).length + files.length > 500) {
      showAlert('Gallery limit reached', 'A project can contain up to 500 project-level photos.');
      return;
    }

    setGalleryUploadBusy(true);
    const uploaded: Array<{ photo: Photo; displayUrl: string }> = [];
    try {
      if (user?.uid) await syncProjectAccessFieldsIfNeeded(user.uid, project);

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setGalleryUploadStatus(
          `${language === 'fr' ? 'Compression' : language === 'ar' ? 'ضغط' : 'Compressing'} ${index + 1}/${files.length}: ${file.name}`
        );
        const compressed = isUsingFirestoreMedia()
          ? await compressImageForSparkPlan(file)
          : await compressImageFile(file);
        setGalleryUploadStatus(
          `${language === 'fr' ? 'Envoi' : language === 'ar' ? 'رفع' : 'Uploading'} ${index + 1}/${files.length} (${formatFileSize(compressed.compressedSize)})`
        );
        const result = await uploadProjectGalleryImage(
          project.id,
          compressed.blob,
          compressed.fileName,
          compressed.blob.type || 'image/jpeg'
        );
        const photoId = `photo_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
        uploaded.push({
          photo: {
            id: photoId,
            title: file.name.replace(/\.[^.]+$/, '') || 'Project photo',
            url: isUsingFirestoreMedia() ? '' : result.url,
            storagePath: result.storagePath,
            sizeBytes: result.sizeBytes,
            originalName: file.name,
            type: galleryPhotoType,
            comments: [],
            tags: [],
            uploadDate: new Date().toISOString(),
          },
          displayUrl: result.url,
        });
      }

      const ok = await syncProjectChanges({
        ...project,
        photos: [...(project.photos || []), ...uploaded.map(({ photo }) => photo)],
      });
      if (!ok) {
        await Promise.all(uploaded.map(({ photo }) => deleteStorageFile(photo.storagePath || '')));
        return;
      }

      setResolvedGalleryUrls((current) => {
        const next = { ...current };
        uploaded.forEach(({ photo, displayUrl }) => {
          next[`project_${photo.id}`] = displayUrl;
        });
        return next;
      });
      setGalleryPage(1);
      setGalleryUploadStatus(
        language === 'fr'
          ? `${uploaded.length} photo(s) enregistrée(s)`
          : language === 'ar'
            ? `تم حفظ ${uploaded.length} صورة`
            : `${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} saved`
      );
      await trackActivity(
        'photo_uploaded',
        `Uploaded ${uploaded.length} project photo${uploaded.length === 1 ? '' : 's'}.`,
        { targetType: 'project', targetId: project.id, targetTitle: project.name }
      );
    } catch (error) {
      await Promise.all(uploaded.map(({ photo }) => deleteStorageFile(photo.storagePath || '')));
      setGalleryUploadStatus(formatMediaUploadError(error));
    } finally {
      setGalleryUploadBusy(false);
      window.setTimeout(() => setGalleryUploadStatus(''), 5000);
    }
  };

  const promptDeleteGalleryPhoto = (photoId: string) => {
    const photo = (project.photos || []).find((item) => item.id === photoId);
    if (!photo) return;
    requestConfirm({
      title:
        language === 'fr'
          ? 'Supprimer la photo'
          : language === 'ar'
            ? 'حذف الصورة'
            : 'Delete photo',
      message:
        language === 'fr'
          ? `Supprimer définitivement « ${photo.title} » de ce projet ?`
          : language === 'ar'
            ? `هل تريد حذف "${photo.title}" نهائيا من هذا المشروع؟`
            : `Permanently remove "${photo.title}" from this project?`,
      onConfirm: async () => {
        const ok = await syncProjectChanges({
          ...project,
          photos: (project.photos || []).filter((item) => item.id !== photoId),
        });
        if (!ok) return;
        if (photo.storagePath) await deleteStorageFile(photo.storagePath);
        setResolvedGalleryUrls((current) => {
          const next = { ...current };
          delete next[`project_${photoId}`];
          return next;
        });
      },
    });
  };

  const memberDisplayName = (email: string) =>
    project.members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.name || email;

  const checkTaskEdit = (task: Task, action: 'edit' | 'delete') => {
    const allowed = action === 'delete' ? canDeleteTask(task, project, userEmail, userRole) : canEditTask(task, project, userEmail, userRole);
    if (!allowed) {
      const msg =
        language === 'en'
          ? 'You cannot modify this task — it was created by the project owner or another member.'
          : language === 'fr'
            ? 'Modification impossible — tâche protégée par son créateur.'
            : 'لا يمكنك تعديل هذه المهمة — محمية من قبل منشئها.';
      showAlert(
        language === 'en' ? 'Task protected' : language === 'fr' ? 'Tâche protégée' : 'مهمة محمية',
        msg,
        'info'
      );
    }
    return allowed;
  };

  const checkExpenseEdit = (expense: Expense, action: 'edit' | 'delete') => {
    const allowed =
      action === 'delete'
        ? canDeleteExpense(expense, project, userEmail, userRole)
        : canEditExpense(expense, project, userEmail, userRole);
    if (!allowed) {
      const msg =
        language === 'en'
          ? 'You cannot modify this expense — it was logged by the project owner or another member.'
          : language === 'fr'
            ? 'Modification impossible — dépense protégée par son créateur.'
            : 'لا يمكنك تعديل هذا المصروف — مسجل من قبل مالك المشروع أو عضو آخر.';
      showAlert(
        language === 'en' ? 'Expense protected' : language === 'fr' ? 'Dépense protégée' : 'مصروف محمي',
        msg,
        'info'
      );
    }
    return allowed;
  };

  // Create or update expense
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = Boolean(editingExpenseId);
    const existing = isEdit ? project.expenses.find((ex) => ex.id === editingExpenseId) : undefined;

    if (isEdit) {
      if (!existing || !checkExpenseEdit(existing, 'edit')) return;
    } else if (!perm.canManageExpenses) {
      denyWrite('add expenses');
      return;
    }

    if (!expenseTitle.trim() || expenseAmount <= 0 || expenseSaving) return;

    setExpenseSaving(true);
    const expenseId = isEdit ? editingExpenseId! : `exp_${Date.now()}`;
    let receiptFiles: TaskMedia[] = existing?.receiptFiles ? [...existing.receiptFiles] : [];

    try {
      if (expenseReceiptDraft) {
        if (user?.uid) {
          await syncProjectAccessFieldsIfNeeded(user.uid, project);
        }
        const { file } = expenseReceiptDraft;
        const { url, storagePath, sizeBytes } = await uploadExpenseReceipt(
          project.id,
          expenseId,
          file,
          file.name,
          file.type || 'image/jpeg'
        );
        receiptFiles = [
          {
            id: `rcpt_${Date.now()}`,
            url,
            storagePath,
            uploadDate: new Date().toISOString(),
            sizeBytes,
            originalName: file.name,
            ...(expenseSupplier.trim() ? { caption: expenseSupplier.trim() } : {}),
          },
        ];
        for (const media of existing?.receiptFiles || []) {
          if (media.storagePath) {
            await deleteStorageFile(media.storagePath);
          }
        }
      } else if (removeExpenseReceipt && existing?.receiptFiles?.length) {
        for (const media of existing.receiptFiles) {
          if (media.storagePath) {
            await deleteStorageFile(media.storagePath);
          }
        }
        receiptFiles = [];
      }

      const expensePayload: Expense = {
        id: expenseId,
        title: expenseTitle.trim(),
        description: expenseDesc.trim() || 'No details provided.',
        amount: Number(expenseAmount),
        commissionPercent: expenseCommission > 0 ? expenseCommission : undefined,
        currency: project.currency,
        category: expenseCat,
        date: expenseDate || new Date().toISOString().split('T')[0],
        paidBy:
          expensePaidBy ||
          project.members.find((m) => m.status === 'accepted' || !m.status)?.email ||
          project.members[0]?.email ||
          userEmail,
        supplier: expenseSupplier.trim() || t.dashboard,
        receipts: existing?.receipts || [],
        ...(receiptFiles.length > 0 ? { receiptFiles: stripTaskMediaUrlsForSave(receiptFiles) } : {}),
        ...(expenseNotes.trim() ? { notes: expenseNotes.trim() } : {}),
        ...(project.projectType === 'rental' ? { rentalChargeTo: expenseRentalChargeTo } : {}),
        ...(project.projectType === 'rental' && expenseRentalBookingId ? { rentalBookingId: expenseRentalBookingId } : {}),
        createdBy: existing?.createdBy || userEmail,
        createdByName: existing?.createdByName || user?.displayName || memberDisplayName(userEmail),
      };

      const previousAmount = existing?.amount || 0;
      const updatedExpenses = isEdit
        ? project.expenses.map((ex) => (ex.id === expenseId ? expensePayload : ex))
        : [...project.expenses, expensePayload];

      const newTotalSpent = totalSpent - previousAmount + expensePayload.amount;
      const isOverBudget = newTotalSpent > project.budget;

      const ok = await syncProjectChanges({ ...project, expenses: updatedExpenses });
      if (!ok) return;

      await trackActivity(
        isEdit ? 'expense_updated' : 'expense_added',
        isEdit
          ? `Updated expense "${expensePayload.title}" (${expensePayload.amount.toLocaleString()} ${project.currency}).`
          : `Logged expense "${expensePayload.title}" (${expensePayload.amount.toLocaleString()} ${project.currency}).`,
        { targetType: 'expense', targetId: expensePayload.id, targetTitle: expensePayload.title }
      );

      if (isOverBudget && user?.uid) {
        try {
          await upsertNotification(user.uid, {
            id: `budget_exceeded_${project.id}`,
            category: 'budget_exceeded',
            type: 'alert',
            projectId: project.id,
            projectName: project.name,
            text: `Budget cap of ${project.budget.toLocaleString()} ${project.currency} was exceeded! Spent: ${newTotalSpent.toLocaleString()} ${project.currency}.`,
            read: false,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            action: { projectId: project.id, tab: 'expenses' },
          });
        } catch (err) {
          console.error(err);
        }
      }

      closeExpenseModal();
    } catch (err) {
      console.error('Save expense failed:', err);
      const detail = formatMediaUploadError(err);
      showAlert(
        language === 'en' ? 'Save failed' : language === 'fr' ? 'Échec de l’enregistrement' : 'فشل الحفظ',
        detail,
        'danger'
      );
    } finally {
      setExpenseSaving(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (expId: string) => {
    const item = project.expenses.find(e => e.id === expId);
    if (!item) return;
    if (!checkExpenseEdit(item, 'delete')) return;
    const filtered = project.expenses.filter(e => e.id !== expId);
    const ok = await syncProjectChanges({ ...project, expenses: filtered });
    if (!ok) return;
    for (const media of item.receiptFiles || []) {
      if (media.storagePath) {
        deleteStorageFile(media.storagePath).catch(console.error);
      }
    }
    await trackActivity('expense_deleted', `Removed expense "${item.title}" (${item.amount.toLocaleString()} ${project.currency}).`, {
      targetType: 'expense',
      targetId: item.id,
      targetTitle: item.title,
    });
  };

  // Add Reimbursement / Settle Debt
  const handleRecordReimbursement = async (from: string, to: string, amount: number) => {
    if (!perm.canManageReimbursements) {
      denyWrite('record settlements');
      return;
    }
    const fromMember = project.members.find(m => m.email === from);
    const toMember = project.members.find(m => m.email === to);

    const newReimb: Reimbursement = {
      id: `reimb_${Date.now()}`,
      from,
      fromName: fromMember ? fromMember.name : from,
      to,
      toName: toMember ? toMember.name : to,
      amount: Math.round(amount * 100) / 100,
      date: new Date().toISOString().split('T')[0]
    };

    const updatedProj = {
      ...project,
      reimbursements: [...(project.reimbursements || []), newReimb]
    };

    const ok = await syncProjectChanges(updatedProj);
    if (ok) {
      await trackActivity('expense_added', `Settled payment dues: ${newReimb.fromName} paid ${newReimb.toName} (${newReimb.amount.toLocaleString()} ${project.currency}).`);
    }
  };

  // Undo / Delete Reimbursement
  const handleDeleteReimbursement = async (id: string) => {
    if (!perm.canManageReimbursements) {
      denyWrite('delete settlements');
      return;
    }
    const target = (project.reimbursements || []).find(r => r.id === id);
    const filtered = (project.reimbursements || []).filter(r => r.id !== id);
    const ok = await syncProjectChanges({ ...project, reimbursements: filtered });
    if (ok && target) {
      await trackActivity('expense_added', `Cancelled recorded settlement reimbursement: ${target.fromName} to ${target.toName}.`);
    }
  };

  const openEditReimbursementModal = (r: Reimbursement) => {
    setEditingReimbursementId(r.id);
    setReimbFrom(r.from);
    setReimbTo(r.to);
    setReimbAmount(r.amount);
    setReimbDate(r.date);
    setShowReimbursementModal(true);
  };

  const handleReimbursementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perm.canManageReimbursements || !editingReimbursementId || reimbSaving) return;
    if (!reimbFrom || !reimbTo || reimbAmount <= 0) return;

    setReimbSaving(true);
    try {
      const fromMember = project.members.find((m) => m.email === reimbFrom);
      const toMember = project.members.find((m) => m.email === reimbTo);
      const updatedReimb: Reimbursement = {
        id: editingReimbursementId,
        from: reimbFrom,
        fromName: fromMember?.name || reimbFrom,
        to: reimbTo,
        toName: toMember?.name || reimbTo,
        amount: Math.round(reimbAmount * 100) / 100,
        date: reimbDate || new Date().toISOString().split('T')[0],
      };

      const reimbursements = (project.reimbursements || []).map((r) =>
        r.id === editingReimbursementId ? updatedReimb : r
      );
      const ok = await syncProjectChanges({ ...project, reimbursements });
      if (ok) {
        await trackActivity(
          'expense_updated',
          `Updated settlement: ${updatedReimb.fromName} → ${updatedReimb.toName} (${updatedReimb.amount.toLocaleString()} ${project.currency}).`
        );
        closeReimbursementModal();
      }
    } finally {
      setReimbSaving(false);
    }
  };

  // Update member role (managers+ only; project owner email cannot be changed)
  const handleMemberRoleChange = async (email: string, newRole: UserRole) => {
    if (!perm.canManageMembers) {
      denyWrite('change member roles');
      return;
    }
    if (email.toLowerCase() === project.creatorEmail.toLowerCase()) return;

    const member = project.members.find((m) => m.email.toLowerCase() === email.toLowerCase());
    if (!member || member.role === newRole) return;

    const updatedMembers = project.members.map((m) =>
      m.email.toLowerCase() === email.toLowerCase() ? { ...m, role: newRole } : m
    );
    const ok = await syncProjectChanges({ ...project, members: updatedMembers });
    if (ok) {
      await trackActivity('member_joined', `Changed ${member.name}'s role to ${newRole.replace('_', ' ')}.`);
    }
  };

  // Add Partner Workspace Member with Profile Checking and Real-time Invitations
  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perm.canManageMembers) {
      denyWrite('invite members');
      return;
    }
    if (!newMemberEmail.trim()) return;

    setMemberSearchLoading(true);
    setMemberSearchError(null);

    try {
      const queryStr = newMemberEmail.trim();
      let targetEmail = queryStr.toLowerCase();
      let targetName = targetEmail.split('@')[0];

      // 1. Query registered user profiles
      const foundProfile = await findUserProfile(queryStr);
      if (foundProfile) {
        targetEmail = (foundProfile.email || targetEmail).toLowerCase();
        targetName = foundProfile.fullName || targetName;
      }

      // 2. Prevent duplicate entries
      const emailInUse = project.members.some(m => m.email.toLowerCase() === targetEmail);
      if (emailInUse) {
        setMemberSearchError("This collaborator is already registered inside this project workspace.");
        setMemberSearchLoading(false);
        return;
      }

      // 3. Create a member with Pending status
      const inviteId = `invite_${Date.now()}`;
      const pendingMember: ProjectMember = {
        email: targetEmail,
        name: targetName,
        role: newMemberRole,
        status: 'pending',
        invitationId: inviteId,
        avatar: foundProfile?.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetName)}&backgroundColor=0284c7`
      };

      const updatedProj = {
        ...project,
        members: [...project.members, pendingMember]
      };

      // 4. Save project synchronously
      await syncProjectChanges(updatedProj);

      // 5. Send invitation
      const invitation: Invitation = {
        id: inviteId,
        projectId: project.id,
        projectName: project.name,
        ownerEmail: (user?.email || '').toLowerCase(),
        ownerName: user?.displayName || 'Project Architect',
        inviteeEmail: targetEmail,
        role: newMemberRole,
        status: 'pending',
        timestamp: new Date().toISOString()
      };
      await sendProjectInvitation(invitation);

      // Invitee bell notification is synced via subscribeToInvitations → syncInvitationNotifications
      await trackActivity('member_joined', `Sent collaboration invitation to ${targetName} (${targetEmail}) as ${newMemberRole}.`);

      // Reset
      setNewMemberEmail('');
      setNewMemberName('');
      setNewMemberRole('contributor');
      setShowAddMember(false);
    } catch (err) {
      console.error(err);
      setMemberSearchError("Error searching global directory. Please verify input user info.");
    } finally {
      setMemberSearchLoading(false);
    }
  };

  // Delete Project Partner (or cancel a pending invitation)
  const handleRemoveMember = async (email: string, invitationId?: string) => {
    if (!perm.canManageMembers) {
      denyWrite('remove members');
      return;
    }
    if (email.toLowerCase() === project.creatorEmail.toLowerCase()) {
      showAlert(
        language === 'en' ? 'Cannot remove owner' : language === 'fr' ? 'Impossible de retirer le propriétaire' : 'لا يمكن إزالة المالك',
        language === 'en'
          ? 'Cannot remove the primary project owner.'
          : language === 'fr'
            ? 'Impossible de retirer le propriétaire principal du projet.'
            : 'لا يمكن إزالة مالك المشروع الرئيسي.',
        'info'
      );
      return;
    }

    const member = project.members.find((m) => m.email.toLowerCase() === email.toLowerCase());
    const invId = invitationId || member?.invitationId;

    try {
      if (invId) {
        await revokeProjectInvitation(invId);
      }
    } catch (e) {
      console.error('Failed to revoke invitation:', e);
      const msg =
        language === 'en'
          ? 'Could not cancel the invitation. Please try again.'
          : language === 'fr'
            ? 'Impossible d’annuler l’invitation. Réessayez.'
            : 'تعذر إلغاء الدعوة. حاول مرة أخرى.';
      showAlert(
        language === 'en' ? 'Task protected' : language === 'fr' ? 'Tâche protégée' : 'مهمة محمية',
        msg,
        'info'
      );
      return;
    }

    const filtered = project.members.filter((m) => m.email.toLowerCase() !== email.toLowerCase());
    const ok = await syncProjectChanges({ ...project, members: filtered });
    if (!ok) return;

    const wasPending = member?.status === 'pending';
    await trackActivity(
      'member_joined',
      wasPending
        ? `Revoked collaboration invitation for ${email}.`
        : `Removed project partner: ${email}.`
    );
  };

  const handleDeleteProject = async () => {
    if (!user?.uid || !project || !isProjectOwner(project, userEmail)) return;
    setDeletingProject(true);
    try {
      await deleteProjectFromDB(user.uid, project.id);
      setShowSettings(false);
      onBack();
    } catch (e) {
      console.error('Delete project failed:', e);
    } finally {
      setDeletingProject(false);
    }
  };

  const promptDeleteProject = () => {
    if (!project) return;
    const labels = cl('deleteProject');
    requestConfirm({
      title: labels.title,
      message: labels.message(project.name),
      onConfirm: handleDeleteProject,
    });
  };

  const promptDeleteExpense = (expId: string) => {
    const item = project?.expenses.find((e) => e.id === expId);
    if (!item) return;
    const labels = cl('deleteExpense');
    requestConfirm({
      title: labels.title,
      message: labels.message(item.title),
      onConfirm: () => handleDeleteExpense(expId),
    });
  };

  const promptDeleteTask = (taskId: string) => {
    const task = project?.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const labels = cl('deleteTask');
    requestConfirm({
      title: labels.title,
      message: labels.message(task.title),
      onConfirm: () => handleDeleteTask(taskId),
    });
  };

  const promptDeleteReimbursement = (id: string) => {
    const labels = cl('deleteReimbursement');
    requestConfirm({
      title: labels.title,
      message: labels.message,
      onConfirm: () => handleDeleteReimbursement(id),
    });
  };

  const promptRemoveMember = (email: string, name: string, isPendingInvite = false) => {
    const labels = isPendingInvite ? cl('cancelInvite') : cl('removeMember');
    const member = project.members.find((m) => m.email.toLowerCase() === email.toLowerCase());
    requestConfirm({
      title: labels.title,
      message: labels.message(name),
      onConfirm: () => handleRemoveMember(email, member?.invitationId),
    });
  };

  // Task Operations
  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perm.canManageTasks) {
      denyWrite('create tasks');
      return;
    }
    if (!taskTitle.trim()) return;

    const defaultMember =
      project.members.find((m) => m.status === 'accepted' || !m.status)?.email ||
      project.members[0]?.email ||
      userEmail;
    const assignee = taskAssignedTo || defaultMember;
    const newTsk: Task = {
      id: `tsk_${Date.now()}`,
      title: taskTitle.trim(),
      description: taskDesc.trim() || "No details provided.",
      assignedTo: assignee,
      priority: taskPriority,
      deadline: taskDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1050).toISOString().split('T')[0],
      status: 'pending',
      subtasks: [],
      createdBy: userEmail,
      createdByName: user?.displayName || memberDisplayName(userEmail),
      notes: '',
      workedBy: assignee,
      workCategory: 'general',
      costLines: [],
      beforeImages: [],
      afterImages: [],
      progressImages: [],
      attachments: [],
    };

    const updated = {
      ...project,
      tasks: [...project.tasks, newTsk]
    };
    const ok = await syncProjectChanges(updated);
    if (ok) {
      await trackActivity('task_created', `Created task "${newTsk.title}" for ${memberDisplayName(newTsk.assignedTo)}.`, {
        targetType: 'task',
        targetId: newTsk.id,
        targetTitle: newTsk.title,
      });
    }

    // Reset
    setTaskTitle('');
    setTaskDesc('');
    setTaskDeadline('');
    setTaskPriority('medium');
    setShowAddTask(false);
  };

  const updateTaskStatus = async (taskId: string, status: Task['status']) => {
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task || !checkTaskEdit(task, 'edit')) return;
    const updatedTasks = project.tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status };
      }
      return t;
    });
    const ok = await syncProjectChanges({ ...project, tasks: updatedTasks });
    if (ok) {
      await trackActivity('task_updated', `Moved "${task.title}" to ${status}.`, {
        targetType: 'task',
        targetId: task.id,
        targetTitle: task.title,
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!checkTaskEdit(task, 'delete')) return;
    if (!perm.canManageTasks) {
      denyWrite('delete tasks');
      return;
    }
    const filtered = project.tasks.filter(t => t.id !== taskId);
    const ok = await syncProjectChanges({ ...project, tasks: filtered });
    if (ok) {
      await trackActivity('task_deleted', `Deleted task "${task.title}".`, {
        targetType: 'task',
        targetId: task.id,
        targetTitle: task.title,
      });
    }
    if (selectedTaskId === taskId) setSelectedTaskId(null);
  };

  const handleSaveTaskDetail = async (updatedTask: Task) => {
    const previous = project.tasks.find((t) => t.id === updatedTask.id);
    if (!previous || !checkTaskEdit(previous, 'edit')) return;
    if (!perm.canManageTasks) {
      denyWrite('edit tasks');
      return;
    }
    const updatedTasks = project.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
    const ok = await syncProjectChanges({ ...project, tasks: updatedTasks });
    if (!ok) return;

    const subChanges = describeSubtaskChanges(previous.subtasks || [], updatedTask.subtasks || [], language);
    if (subChanges.length > 0) {
      await trackActivity('subtask_changed', subChanges.join(' · '), {
        targetType: 'task',
        targetId: updatedTask.id,
        targetTitle: updatedTask.title,
      });
    } else if (
      previous.title !== updatedTask.title ||
      previous.notes !== updatedTask.notes ||
      previous.status !== updatedTask.status
    ) {
      await trackActivity('task_updated', `Updated task "${updatedTask.title}".`, {
        targetType: 'task',
        targetId: updatedTask.id,
        targetTitle: updatedTask.title,
      });
    }
  };

  const selectedTask = selectedTaskId
    ? project.tasks.find((t) => t.id === selectedTaskId)
    : null;

  // Edit Project Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perm.canModifySettings) {
      denyWrite('change project settings');
      return;
    }
    if (!editName.trim()) return;

    const newProjectType = editProjectType;
    const newBudget = newProjectType === 'construction' ? (Number(editBudget) || 10000) : 0;

    const updated = {
      ...project,
      name: editName,
      clientName: editClient,
      address: editAddress,
      description: editDesc,
      budget: newBudget,
      currency: editCurrency || 'DH',
      status: editStatus,
      projectType: newProjectType,
      ...(newProjectType === 'rental'
        ? {
            rentalProperty: {
              ownerName: editRentalOwnerName || editClient || project.rentalProperty?.ownerName || 'N/A',
              ownerPhone: editRentalOwnerPhone,
              ownerEmail: editRentalOwnerEmail.trim().toLowerCase(),
              buildingNumber: editRentalBuildingNumber || editAddress || editName,
              pricePerNight: Number(editRentalPricePerNight) || 0,
              commissionRate: Number(editRentalCommissionRate) || 0,
              notes: editRentalNotes,
            },
            rentalBookings: project.rentalBookings || [],
          }
        : {
            rentalProperty: null as any,
            rentalBookings: [],
          }),
    };

    const ok = await syncProjectChanges(updated);
    if (ok) {
      await trackActivity('status_changed', `Updated project parameters & settings.`);
      setShowSettings(false);
    }
  };

  // Filtering expenses
  const filteredExpenses = project.expenses.filter(exp => {
    const qMatches = !expenseQuery ? true : (
      exp.title.toLowerCase().includes(expenseQuery.toLowerCase()) ||
      exp.description.toLowerCase().includes(expenseQuery.toLowerCase()) ||
      exp.supplier.toLowerCase().includes(expenseQuery.toLowerCase())
    );
    const cMatches = expenseCategoryFilter === 'all' ? true : exp.category === expenseCategoryFilter;
    const pMatches = expensePaidByFilter === 'all' ? true : exp.paidBy === expensePaidByFilter;

    return qMatches && cMatches && pMatches;
  });
  const expensePageCount = Math.max(1, Math.ceil(filteredExpenses.length / EXPENSES_PER_PAGE));
  const activeExpensePage = Math.min(expensePage, expensePageCount);
  const visibleExpenses = filteredExpenses.slice(
    (activeExpensePage - 1) * EXPENSES_PER_PAGE,
    activeExpensePage * EXPENSES_PER_PAGE
  );

  return (
    <div
      className="flex min-h-full w-full flex-col font-sans"
      id="project-workspace"
    >
      <TopNavbar
        language={language}
        onLanguageChange={onLanguageChange}
        theme={theme}
        onThemeToggle={onThemeToggle}
        user={user}
        onToggleSidebar={onToggleSidebar}
        sidebarOpen={sidebarOpen}
        sidebarToggleLabel={sidebarToggleLabel}
        showSidebarToggle
        mode="project"
        onBack={onBack}
        backLabel={language === 'en' ? 'Back to Dashboard' : language === 'fr' ? 'Retour au Tableau' : 'العودة إلى اللوحة'}
        projectTitle={project.name}
        projectStatus={project.status}
        statusLabel={t.status[project.status]}
        onOpenActivityHistory={perm.canViewActivityLog ? () => setShowActivityHistory(true) : undefined}
        activityHistoryLabel={language === 'en' ? 'History' : language === 'fr' ? 'Historique' : 'السجل'}
        onOpenSettings={perm.canModifySettings ? () => setShowSettings(true) : undefined}
        settingsLabel={language === 'en' ? 'Setup' : language === 'fr' ? 'Réglages' : 'إعدادات'}
        unreadCount={unreadCount}
        onToggleNotifications={onToggleNotifications}
        langLabel={t.langLabel}
      />

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-8">

      {perm.isReadOnly && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {language === 'en'
            ? 'Read-only access — you can view this project but cannot make changes.'
            : language === 'fr'
              ? 'Accès lecture seule — consultation uniquement, pas de modifications.'
              : 'وصول للقراءة فقط — يمكنك العرض دون تعديل.'}
        </div>
      )}
      
      {/* Project Meta Head banner */}
      <div className="py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            {project.name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5 text-sky-505" /> {language === "en" ? "Client" : "Client"}: {project.clientName}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-sky-505" /> {project.address}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-sky-505" /> {project.startDate}</span>
          </div>
        </div>

        {/* Spend progress status right panel */}
        {hasBudget && (
          <div className="w-full md:w-56 text-right">
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span>{language === 'en' ? "Budget Used" : language === 'fr' ? "Budget Utilisé" : "الميزانية المستخدمة"}</span>
              <span className={`${percentSpent > 100 ? 'text-red-600 font-bold' : 'text-slate-900 dark:text-white font-mono'}`}>{percentSpent}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${percentSpent > 100 ? 'bg-red-500' : 'bg-slate-900 dark:bg-slate-50'}`}
                style={{ width: `${Math.min(100, percentSpent)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-1.5 block">
              {totalSpent.toLocaleString()} / {project.budget.toLocaleString()} {project.currency}
            </span>
          </div>
        )}
        {!hasBudget && (
          <div className="w-full md:w-56 text-right">
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span>{language === 'en' ? "Total Expenses" : language === 'fr' ? "Total Dépenses" : "إجمالي المصروفات"}</span>
              <span className="text-slate-900 dark:text-white font-mono">{totalSpent.toLocaleString()} {project.currency}</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="h-full bg-slate-900 dark:bg-slate-50 rounded-full" style={{ width: '100%' }} />
            </div>
            <span className="text-[10px] text-slate-400 font-mono mt-1.5 block">
              {language === 'en' ? 'No budget set for this project type' : language === 'fr' ? 'Aucun budget pour ce type de projet' : 'لا توجد ميزانية لهذا النوع من المشاريع'}
            </span>
          </div>
        )}
      </div>

      {/* Three Primary Stats Cards (Shadcn style dashboard indicators) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-1" id="project-kpis">
        {hasBudget ? (
          <>
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Project Budget" : language === 'fr' ? "Budget Alloué" : "الميزانية المخصصة"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{project.budget.toLocaleString()}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === "en" ? "Cumulative Spent" : language === "fr" ? "Dépenses Cumulées" : "إجمالي المصروفات"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{totalSpent.toLocaleString()}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Remaining Capital" : language === 'fr' ? "Capital Restant" : "رأس المال المتبقي"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className={`text-xl font-bold font-mono ${(project.budget - totalSpent) < 0 ? 'text-red-500 font-black' : 'text-slate-900 dark:text-white'}`}>
                  {(project.budget - totalSpent).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Equal Partner Share" : language === 'fr' ? "Quote-part par Membre" : "حصة العضو المتساوية"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-slate-904 dark:text-white">
                  {Math.round(expectedShares[project.members[0]?.email] || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Total Expenses" : language === 'fr' ? "Total Dépenses" : "إجمالي المصروفات"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{totalSpent.toLocaleString()}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{project.currency}</span>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Total Tasks" : language === 'fr' ? "Total Tâches" : "إجمالي المهام"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">{project.tasks.length}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{language === 'en' ? 'Tasks' : language === 'fr' ? 'Tâches' : 'مهام'}</span>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Completed Tasks" : language === 'fr' ? "Tâches Terminées" : "مهام مكتملة"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {project.tasks.filter(t => t.status === 'completed').length}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{language === 'en' ? 'Done' : language === 'fr' ? 'Finis' : 'منجز'}</span>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-450 dark:text-slate-400 tracking-wider block">{language === 'en' ? "Team Members" : language === 'fr' ? "Membres Équipe" : "أعضاء الفريق"}</span>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                  {project.members.filter(m => m.status === 'accepted' || !m.status).length}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">{language === 'en' ? 'Members' : language === 'fr' ? 'Membres' : 'أعضاء'}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tabs navigation list with Shadcn styles */}
      <div className="mb-6 mt-8 flex max-w-full gap-4 overflow-x-auto border-b border-slate-200 pb-px dark:border-slate-800">
        <button
          id="project-tab-overview"
          onClick={() => setActiveTab('overview')}
          className={`shrink-0 whitespace-nowrap pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'overview' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          } ${aiFocusId === 'project-tab-overview' ? 'project-tab-ai-focus' : ''}`}
        >
          {language === 'en' ? 'Overview & Cost Split' : language === 'fr' ? 'Résumé & Partage' : 'نظرة عامة'}
        </button>
        <button
          id="project-tab-expenses"
          onClick={() => setActiveTab('expenses')}
          className={`shrink-0 whitespace-nowrap pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'expenses' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200'
          } ${aiFocusId === 'project-tab-expenses' ? 'project-tab-ai-focus' : ''}`}
        >
          {language === 'en' ? 'Expenses Ledger' : language === 'fr' ? 'Dépenses' : 'المصروفات'}
        </button>
        <button
          id="project-tab-tasks"
          onClick={() => setActiveTab('tasks')}
          className={`shrink-0 whitespace-nowrap pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'tasks' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200'
          } ${aiFocusId === 'project-tab-tasks' ? 'project-tab-ai-focus' : ''}`}
        >
          {language === 'en' ? 'Roadmap' : language === 'fr' ? 'Tâches' : 'المسار الزمني'}
        </button>
        <button
          id="project-tab-docs"
          onClick={() => setActiveTab('docs')}
          className={`shrink-0 whitespace-nowrap pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'docs' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200'
          } ${aiFocusId === 'project-tab-docs' ? 'project-tab-ai-focus' : ''}`}
        >
          {language === 'en' ? 'Invoices & Vouchers' : language === 'fr' ? 'Factures & Bons' : 'فواتير وإيصالات'}
        </button>
        {project?.projectType === 'construction' && (
        <button
          id="project-tab-gallery"
          onClick={() => setActiveTab('gallery')}
          className={`shrink-0 whitespace-nowrap pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'gallery'
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
              : 'border-transparent text-slate-450 hover:text-slate-805 dark:text-slate-400 dark:hover:text-slate-200'
          } ${aiFocusId === 'project-tab-gallery' ? 'project-tab-ai-focus' : ''}`}
        >
          {language === 'en' ? 'Gallery' : language === 'fr' ? 'Galerie' : 'المعرض'}
        </button>
        )}
        {project?.projectType === 'rental' && (
        <button
          id="project-tab-rental"
          onClick={() => setActiveTab('rental')}
          className={`shrink-0 whitespace-nowrap pb-2 text-[0px] font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'rental' 
              ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' 
              : 'border-transparent text-slate-450 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          } ${aiFocusId === 'project-tab-rental' ? 'project-tab-ai-focus' : ''}`}
        >
          <span className="text-xs">{t.rental.bookings}</span>
          {language === 'en' ? 'Rentals' : language === 'fr' ? 'Locations' : 'الإيجارات'}
        </button>
        )}
      </div>

      <AnimatePresence mode="wait">
      {/* TAB CONTENT: OVERVIEW & COST SPLITTING */}
      {activeTab === 'overview' && (
        <FadeIn key="overview">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Members / Who Paid What Visual Progress Bars (2 cols wide on large) */}
          {project.projectType !== 'service' && (
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between mb-4">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-sky-505" />
                  {language === 'en' ? 'Accumulated Expenditure per Member' : language === 'fr' ? 'Total payé par membre' : 'إجمالي النفقات لكل عضو'}
                </span>
                <span className="font-mono text-[10.5px] text-slate-400 font-semibold">{project.members.length} {language === "en" ? "Partakers" : language === "fr" ? "Membres" : "أعضاء"}</span>
              </h3>

              {/* Each Member's contribution progress grid */}
              <div className="space-y-4">
                {project.members.filter(m => m.status === 'accepted' || !m.status).map((member) => {
                  const amtPaid = paidMap[member.email] || 0;
                  const targetShare = expectedShares[member.email] || 0;
                  const balance = amtPaid - targetShare;

                  // High contrast bar share representation
                  const progressWidth = totalSpent > 0 ? (amtPaid / totalSpent) * 100 : 0;

                  return (
                    <div key={member.email} className="text-xs">
                      <div className="flex justify-between items-center mb-1 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-850">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-black flex items-center justify-center font-bold text-[9px]">
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 dark:text-white">{member.name}</span>
                              <span className="text-[9px] font-semibold text-slate-400 font-mono leading-none">({member.role})</span>
                              {member.status === 'pending' && (
                                <span className="text-[8px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-1 py-0.5 rounded font-mono font-bold uppercase tracking-wider select-none">
                                  {language === 'en' ? 'Pending' : language === 'fr' ? 'En attente' : 'معلق'}
                                </span>
                              )}
                              {member.status === 'declined' && (
                                <span className="text-[8px] bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 px-1 py-0.5 rounded font-mono font-bold uppercase tracking-wider select-none">
                                  {language === 'en' ? 'Declined' : language === 'fr' ? 'Refusé' : 'مرفوض'}
                                </span>
                              )}
                            </div>
                            <span className="text-[9.5px] text-slate-400 block font-mono lowercase mt-0.5">{member.email}</span>
                          </div>
                        </div>

                        {/* Financial summary: Paid vs Balance owed */}
                        <div className="text-right">
                          <span className="font-semibold font-mono text-slate-900 dark:text-white">{amtPaid.toLocaleString()} {project.currency}</span>
                          {isSettlementWorkspace && (
                          <span className="text-[10px] text-slate-400 block font-sans">
                            {balance >= 0 ? (
                              <span className="text-emerald-600 font-bold flex items-center justify-end gap-0.5">
                                +{Math.round(balance).toLocaleString()} {language === 'en' ? 'surplus' : language === 'fr' ? 'de trop' : 'فائض'}
                              </span>
                            ) : (
                              <span className="text-red-500 font-bold flex items-center justify-end gap-0.5">
                                {Math.round(balance).toLocaleString()} {language === 'en' ? 'due' : language === 'fr' ? 'dû' : 'مستحق'}
                              </span>
                            )}
                          </span>
                          )}
                        </div>
                      </div>

                      {/* Bar tracker */}
                      <div className="w-full bg-slate-100 dark:bg-slate-850 h-2.5 rounded-full overflow-hidden mt-1 mb-2.5">
                        <div 
                          className="bg-slate-900 dark:bg-slate-100 h-full rounded-full transition-all duration-300"
                          style={{ width: `${progressWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Past recorded Settlement Reimbursements */}
            {(isSettlementWorkspace && project.reimbursements && project.reimbursements.length > 0) && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
                <h3 className="font-bold text-sm text-slate-905 dark:text-white flex items-center gap-1.5 mb-3">
                  <CreditCard className="w-4 h-4 text-emerald-500" />
                  {language === 'en' ? 'Recorded Reimbursements & Settlements' : language === 'fr' ? 'Remboursements Enregistrés' : 'الاستردادات والتسويات المسجلة'}
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-850 max-h-56 overflow-y-auto">
                  {project.reimbursements.map((r) => (
                    <div key={r.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          <span className="font-semibold">{r.fromName}</span> {language === 'en' ? 'reimbursed' : language === 'fr' ? 'a remboursé' : 'قام بسداد'} <span className="font-semibold">{r.toName}</span>
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono font-medium block">{r.date}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 rounded-md">
                          +{r.amount.toLocaleString()} {project.currency}
                        </span>
                        {perm.canManageReimbursements && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditReimbursementModal(r)}
                              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                              title={language === 'en' ? 'Edit settlement' : language === 'fr' ? 'Modifier' : 'تعديل'}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => promptDeleteReimbursement(r.id)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                              title={language === 'en' ? 'Delete settlement' : language === 'fr' ? 'Supprimer' : 'حذف'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Right Column: Smart Splitwise Settlement Advice */}
          <div className="space-y-6">
            {/* Settlements Solver Box */}
            {isSettlementWorkspace && (
            <div className="bg-white dark:bg-slate-900 text-slate-950 dark:text-white rounded-xl p-5 border border-slate-200 dark:border-slate-805 relative shadow-md">
              <h3 className="font-bold text-sm flex items-center gap-1.5 mb-4 text-slate-900 dark:text-white">
                <CreditCard className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                {language === 'en' ? 'Settle Balance Debt Advice' : language === 'fr' ? 'Calculateur d\'Équilibre' : 'نصيحة تسوية الديون'}
              </h3>

              {settlements.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 dark:text-emerald-400 mx-auto" />
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-1.5 font-sans font-medium">
                    {language === 'en' ? 'All balances are perfectly settled!' : language === 'fr' ? 'Tous les comptes sont équilibrés !' : 'جميع الأرصدة مسواة بشكل مثالي!'}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">No actions required.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed font-sans font-medium">
                    {language === 'en' 
                      ? 'The model automatically calculates the fewest cash payments to settle accounts:' 
                      : language === 'fr' 
                      ? 'La formule détermine la répartition la plus courte pour équilibrer les comptes:' 
                      : 'يحسب النموذج تلقائياً أقل عدد من الدفعات النقدية لتسوية الحسابات بين الشركاء:'}
                  </p>
                  
                  <div className="space-y-2.5 pt-2">
                    {settlements.map((s, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-lg flex flex-col justify-between gap-2.5 text-xs font-sans"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{s.fromName}</span>
                          <span className="text-[9.5px] font-mono text-slate-400 dark:text-slate-500">{language === 'en' ? 'owes' : language === 'fr' ? 'doit' : 'مدين لـ'}</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{s.toName}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 dark:border-slate-800/60">
                          <span className="font-mono font-bold text-xl text-sky-600 dark:text-sky-400">{s.amount.toLocaleString()} {project.currency}</span>
                          {perm.canManageReimbursements && (
                            <button
                              onClick={() => handleRecordReimbursement(s.from, s.to, s.amount)}
                              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-950 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-sm animate-none"
                            >
                              {language === 'en' ? "Record Settle" : language === 'fr' ? "Remit" : "تسجيل الدفع"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Inline Partner Manager Box */}
            <div ref={addMemberPanelRef} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl mt-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-sky-400" />
                  {language === 'en' ? 'Project Partners' : language === 'fr' ? 'Membres Partenaires' : 'شركاء المشروع'}
                </h3>
                {perm.canManageMembers && (
                  <button
                    onClick={() => {
                      setMemberSearchError(null);
                      setShowAddMember(!showAddMember);
                    }}
                    className="p-1 rounded-md text-sky-600 hover:bg-slate-50 dark:hover:bg-slate-805 transition-all text-xs cursor-pointer flex items-center gap-0.5 font-semibold animate-none"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>{language === 'en' ? 'Invite' : language === 'fr' ? 'Inviter' : 'دعوة'}</span>
                  </button>
                )}
              </div>

              {showAddMember && perm.canManageMembers && (
                <form onSubmit={handleAddMemberSubmit} className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-850 mb-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {language === 'en' ? 'Invite Collaborator' : language === 'fr' ? 'Inviter un collaborateur' : 'دعوة شريك للمشروع'}
                  </h4>
                  
                  <div>
                    <input
                      type="text"
                      required
                      disabled={memberSearchLoading}
                      placeholder={language === 'en' ? "Enter email or registered username" : language === 'fr' ? "Email ou pseudo..." : "أدخل البريد الإلكتروني أو اسم المستخدم..."}
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {language === 'en' ? "If the user is registered, their profile will be looked up instantly." : "سيتم فحص الملف الشخصي للمستخدم تلقائيًا."}
                    </p>
                  </div>

                  <div>
                    <select
                      value={newMemberRole}
                      disabled={memberSearchLoading}
                      onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                      className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-205 focus:outline-none font-semibold"
                    >
                      <option value="contributor">{language === 'en' ? 'Contributor (Tasks & Expenses)' : language === 'fr' ? 'Contributeur (tâches & frais)' : 'مساهم (مهام ومصاريف)'}</option>
                      <option value="editor">{language === 'en' ? 'Editor (Tasks & Expenses)' : language === 'fr' ? 'Éditeur (contenu)' : 'محرر (محتوى)'}</option>
                      <option value="manager">{language === 'en' ? 'Manager (admin — cannot edit your items)' : language === 'fr' ? 'Gestionnaire (admin)' : 'مدير (إدارة)'}</option>
                      {isProjectOwner(project, userEmail) && (
                        <option value="co_owner">{language === 'en' ? 'Co-owner (full access like you)' : language === 'fr' ? 'Co-propriétaire (accès complet)' : 'شريك مالك (صلاحيات كاملة)'}</option>
                      )}
                      <option value="read_only">{language === 'en' ? 'Viewer (Read-only)' : language === 'fr' ? 'Lecteur (Lecture seule)' : 'مشاهد (للقراءة فقط)'}</option>
                    </select>
                  </div>

                  {memberSearchError && (
                    <p className="text-[11px] text-red-500 font-semibold">{memberSearchError}</p>
                  )}

                  <div className="flex justify-end gap-1.5 items-center">
                    {memberSearchLoading && (
                      <span className="text-[10px] text-slate-400 font-medium animate-pulse">
                        {language === 'en' ? 'Searching directory...' : 'جاري البحث...'}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={memberSearchLoading}
                      onClick={() => setShowAddMember(false)}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-650 dark:text-slate-300 font-semibold rounded disabled:opacity-50"
                    >
                      {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                    </button>
                    <button
                      type="submit"
                      disabled={memberSearchLoading}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-550 text-white text-[10px] font-bold rounded disabled:opacity-50 shadow-xs"
                    >
                      {language === 'en' ? 'Send Invite' : language === 'fr' ? 'Inviter' : 'إرسال الدعوة'}
                    </button>
                  </div>
                </form>
              )}

              {/* Partners simple list */}
              <div className="divide-y divide-slate-100 dark:divide-slate-850">
                {project.members.map((m) => (
                  <div key={m.email} className="py-2.5 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold font-mono uppercase text-[9px]">
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-slate-900 dark:text-white leading-none">{m.name}</p>
                          {m.status === 'pending' && (
                            <span className="text-[8px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-1 py-0.5 rounded font-mono font-bold uppercase tracking-wider animate-pulse leading-none">
                              {language === 'en' ? 'Invited' : 'Invité'}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 font-medium capitalize mt-0.5 block">
                          {perm.canManageMembers && m.email.toLowerCase() !== project.creatorEmail.toLowerCase() && m.status !== 'pending' ? (
                            <select
                              value={m.role}
                              onChange={(e) => handleMemberRoleChange(m.email, e.target.value as UserRole)}
                              className="text-[10px] font-mono capitalize bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-slate-600 dark:text-slate-300 focus:outline-none"
                            >
                              <option value="contributor">{language === 'en' ? 'Contributor' : language === 'fr' ? 'Contributeur' : 'مساهم'}</option>
                              <option value="editor">{language === 'en' ? 'Editor' : language === 'fr' ? 'Éditeur' : 'محرر'}</option>
                              <option value="manager">{language === 'en' ? 'Manager' : language === 'fr' ? 'Gestionnaire' : 'مدير'}</option>
                              {isProjectOwner(project, userEmail) && (
                                <option value="co_owner">{language === 'en' ? 'Co-owner' : language === 'fr' ? 'Co-propriétaire' : 'شريك مالك'}</option>
                              )}
                              <option value="read_only">{language === 'en' ? 'Viewer' : language === 'fr' ? 'Lecteur' : 'مشاهد'}</option>
                            </select>
                          ) : (
                            m.role.replace('_', ' ')
                          )}
                        </span>
                      </div>
                    </div>
                    {perm.canManageMembers && m.email.toLowerCase() !== project.creatorEmail.toLowerCase() && (
                      <button
                        type="button"
                        onClick={() => promptRemoveMember(m.email, m.name, m.status === 'pending')}
                        className={`rounded transition-colors cursor-pointer ${
                          m.status === 'pending'
                            ? 'px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                            : 'p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                        title={m.status === 'pending' ? (language === 'en' ? 'Cancel invitation' : language === 'fr' ? 'Annuler l’invitation' : 'إلغاء الدعوة') : 'Remove member'}
                      >
                        {m.status === 'pending' ? (
                          language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {perm.canViewActivityLog && (
              <ProjectActivityFeed
                activities={projectActivities}
                language={language}
                onViewAll={() => setShowActivityHistory(true)}
              />
            )}

          </div>
        </div>
        </FadeIn>
      )}

      {/* TAB CONTENT: DETAILED EXPENSES LEDGER */}
      {activeTab === 'expenses' && (
        <FadeIn key="expenses">
        <div className="space-y-6 animate-none">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
            
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 dark:border-slate-850 mb-4 gap-3">
              <h3 className="font-bold text-sm text-slate-905 dark:text-white flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Project Expense Ledger' : language === 'fr' ? 'Ledger des Dépenses' : 'سجل نفقات المشروع'}
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold ml-1">
                  {filteredExpenses.length}
                </span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                {perm.canManageExpenses && (
                  <button
                    onClick={openAddExpenseModal}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{language === 'en' ? 'Add Expense' : language === 'fr' ? 'Ajouter dépense' : 'إضافة مصروف'}</span>
                  </button>
                )}
                <div className="relative" ref={exportPickerRef}>
                  <button
                    onClick={() => setShowExportPicker(!showExportPicker)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 transition-all cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{language === 'en' ? 'Export Excel' : language === 'fr' ? 'Exporter Excel' : 'تصدير إكسل'}</span>
                  </button>
                  {showExportPicker && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{language === 'en' ? 'Columns to export' : language === 'fr' ? 'Colonnes à exporter' : 'الأعمدة للتصدير'}</p>
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {EXPORT_COLUMNS.map(col => {
                          const checked = selectedExportCols.has(col.key);
                          return (
                            <label key={col.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = new Set(selectedExportCols);
                                  if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                                  setSelectedExportCols(next);
                                }}
                                className="rounded border-slate-300 dark:border-slate-700"
                              />
                              <span className="text-slate-700 dark:text-slate-300">{language === 'en' ? col.labelEn : language === 'fr' ? col.labelFr : col.labelAr}</span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        onClick={handleExportExpensesExcel}
                        disabled={selectedExportCols.size === 0}
                        className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white transition-all cursor-pointer disabled:cursor-not-allowed"
                      >
                        {language === 'en' ? 'Download Excel' : language === 'fr' ? 'Télécharger Excel' : 'تحميل إكسل'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Searching Filters widget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-100 dark:border-slate-850">
              {/* Query search */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder={language === 'en' ? "Search item name or supplier..." : language === 'fr' ? "Rechercher..." : "البحث عن..."}
                  value={expenseQuery}
                  onChange={(e) => { setExpenseQuery(e.target.value); setExpensePage(1); }}
                  className="w-full pl-8 pr-3 py-1 text-xs rounded border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Category filter */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 shrink-0 select-none"><Filter className="w-3.5 h-3.5 inline" /></span>
                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => { setExpenseCategoryFilter(e.target.value); setExpensePage(1); }}
                  className="w-full p-1 text-xs rounded border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="all">{language === 'en' ? 'All Categories' : language === 'fr' ? 'Toutes Catégories' : 'كل الفئات'}</option>
                  <option value="materials">{t.categories.materials}</option>
                  <option value="workers">{t.categories.workers}</option>
                  <option value="equipment">{t.categories.equipment}</option>
                  <option value="transportation">{t.categories.transportation}</option>
                  <option value="utilities">{t.categories.utilities}</option>
                  <option value="cleaning">{t.categories.cleaning}</option>
                  <option value="maintenance">{t.categories.maintenance}</option>
                  <option value="miscellaneous">{t.categories.miscellaneous}</option>
                </select>
              </div>

              {/* Paid by filters */}
              <div className="flex items-center gap-1 text-xs">
                <select
                  value={expensePaidByFilter}
                  onChange={(e) => { setExpensePaidByFilter(e.target.value); setExpensePage(1); }}
                  className="w-full p-1 text-xs rounded border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none animate-none"
                >
                  <option value="all">{language === 'en' ? 'All Payers' : language === 'fr' ? 'Tous Payeurs' : 'كل الدافعين'}</option>
                  {project.members.filter(m => m.status === 'accepted' || !m.status).map(m => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Expenses List Table */}
            {filteredExpenses.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                {language === 'en' ? 'No expense ledger items found.' : language === 'fr' ? 'Aucun frais trouvé.' : 'لا توجد عناصر في سجل النفقات.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-650 dark:text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-850 font-bold uppercase tracking-wider text-slate-450 text-[10px]">
                      <th className="py-2.5">{language === 'en' ? 'Date' : language === 'fr' ? 'Date' : 'التاريخ'}</th>
                      <th className="py-2.5">{language === 'en' ? 'Title / Sourced From' : language === 'fr' ? 'Titre / Fournisseur' : 'العنوان / المورد'}</th>
                      <th className="py-2.5 w-10">{language === 'en' ? 'Bon' : language === 'fr' ? 'Bon' : 'وصل'}</th>
                      <th className="py-2.5">{language === 'en' ? 'Category' : language === 'fr' ? 'Catégorie' : 'الفئة'}</th>
                      <th className="py-2.5">{language === 'en' ? 'Sender / Paid By' : language === 'fr' ? 'Payeur' : 'الدافع'}</th>
                      <th className="py-2.5 text-right">{language === 'en' ? 'Amount / Invoice' : language === 'fr' ? 'Montant / Facture' : 'المبلغ / الفاتورة'}</th>
                      <th className="py-2.5 text-right font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {visibleExpenses.map((exp, index) => {
                      const payer = project.members.find(m => m.email === exp.paidBy);
                      return (
                        <motion.tr
                          key={exp.id}
                          initial={{ opacity: 0, x: 24 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.24, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
                          id={`expense-row-${exp.id}`}
                          className={`hover:bg-slate-50/40 dark:hover:bg-slate-850/20 transition-colors ${
                            aiFocusId === `expense-row-${exp.id}` ? 'ai-focus-pulse bg-cyan-50/50 dark:bg-cyan-950/20' : ''
                          }`}
                        >
                          <td className="py-3 font-mono text-[10.5px] text-slate-400">{exp.date}</td>
                          <td className="py-3 pr-2">
                            <p className="font-semibold text-slate-900 dark:text-white text-xs">{exp.title}</p>
                            <span className="text-[10px] text-slate-400 font-medium block">{exp.supplier} · {exp.description}</span>
                          </td>
                          <td className="py-3">
                            {exp.receiptFiles?.[0] ? (
                              <ExpenseReceiptThumb
                                media={exp.receiptFiles[0]}
                                label={
                                  language === 'en'
                                    ? 'Supplier receipt'
                                    : language === 'fr'
                                      ? 'Bon fournisseur'
                                      : 'وصل المورد'
                                }
                              />
                            ) : (
                              <span className="text-[10px] text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-850 text-[9.5px] text-slate-600 dark:text-slate-350 tracking-wide font-medium">
                              {t.categories[exp.category]}
                            </span>
                          </td>
                          <td className="py-3">
                            <p className="font-medium text-slate-800 dark:text-slate-205">{payer ? payer.name : exp.paidBy}</p>
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {(() => {
                              const invoicePrice = exp.commissionPercent ? exp.amount + (exp.amount * exp.commissionPercent / 100) : exp.amount;
                              return (
                                <>
                                  {exp.commissionPercent ? (
                                    <span className="text-emerald-600 dark:text-emerald-400">{invoicePrice.toLocaleString()}</span>
                                  ) : (
                                    <span>{exp.amount.toLocaleString()}</span>
                                  )}
                                  {' '}<span className="text-[10px] text-slate-400">{project.currency}</span>
                                  {exp.commissionPercent && (
                                    <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                                      {exp.amount.toLocaleString()} +{exp.commissionPercent}%
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              {perm.canManageExpenses && canEditExpense(exp, project, userEmail, userRole) && (
                                <button
                                  type="button"
                                  onClick={() => openEditExpenseModal(exp)}
                                  className="p-1 text-slate-400 hover:text-sky-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition"
                                  title={language === 'en' ? 'Edit expense' : language === 'fr' ? 'Modifier' : 'تعديل المصروف'}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {perm.canManageExpenses && canDeleteExpense(exp, project, userEmail, userRole) && (
                                <button
                                  type="button"
                                  onClick={() => promptDeleteExpense(exp.id)}
                                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition"
                                  title={language === 'en' ? 'Delete expense' : language === 'fr' ? 'Supprimer' : 'حذف المصروف'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {expensePageCount > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-850 dark:text-slate-400">
                <span>
                  {language === 'en' ? 'Page' : language === 'fr' ? 'Page' : 'صفحة'} {activeExpensePage} / {expensePageCount}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setExpensePage((page) => Math.max(1, page - 1))}
                    disabled={activeExpensePage === 1}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                    aria-label={language === 'en' ? 'Previous expense page' : language === 'fr' ? 'Page précédente' : 'الصفحة السابقة'}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpensePage((page) => Math.min(expensePageCount, page + 1))}
                    disabled={activeExpensePage === expensePageCount}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                    aria-label={language === 'en' ? 'Next expense page' : language === 'fr' ? 'Page suivante' : 'الصفحة التالية'}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </FadeIn>
      )}

      {/* TAB CONTENT: ROADMAP & CHECKLIST PORTAL */}
      {activeTab === 'tasks' && (
        <FadeIn key="tasks">
        <div className="space-y-6 animate-none">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 p-5 rounded-xl">
            
            {/* Action view */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-850 mb-4">
              <h3 className="flex items-center gap-1.5 font-bold text-[0px] text-slate-900 dark:text-white">
                <CheckSquare className="w-4 h-4 text-sky-505" />
                <span className="text-sm">
                  {project.projectType === 'rental'
                    ? (language === 'fr' ? 'Taches de service appartement' : language === 'ar' ? 'Apartment service tasks' : 'Apartment Service Tasks')
                    : (language === 'fr' ? 'Suivi des jalons & Taches' : language === 'ar' ? 'Roadmap and tasks' : 'Construction Roadmap & Deliverables')}
                </span>
                {language === 'en' ? 'Construction Roadmap & Deliverables' : language === 'fr' ? 'Suivi des jalons & Tâches' : 'المسار الزمني والمهام'}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono font-bold">
                  {project.tasks.length}
                </span>
              </h3>

              {perm.canManageTasks && (
                <button
                  onClick={() => setShowAddTask(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-805 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>{language === 'en' ? 'Create Task' : language === 'fr' ? 'Créer Tâche' : 'إنشاء مهمة'}</span>
                </button>
              )}
            </div>

            {project.tasks.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                {language === 'en' ? 'No registered tasks in roadmap.' : language === 'fr' ? 'Aucune tâche de planifiée.' : 'لا توجد مهام مجدولة في المسار الزمني.'}
              </div>
            ) : (
              <TaskKanbanBoard
                tasks={project.tasks}
                project={project}
                language={language}
                canEdit={perm.canManageTasks}
                canEditTask={(t) => canEditTask(t, project, userEmail, userRole)}
                canDeleteTask={(t) => canDeleteTask(t, project, userEmail, userRole)}
                onStatusChange={updateTaskStatus}
                onOpenTask={setSelectedTaskId}
                onDeleteTask={promptDeleteTask}
                focusElementId={aiFocusId}
              />
            )}
          </div>
        </div>
        </FadeIn>
      )}

      {activeTab === 'gallery' && (
        <FadeIn key="gallery">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <ImageIcon className="h-5 w-5 text-sky-500" />
                  {language === 'en' ? 'Project Gallery' : language === 'fr' ? 'Galerie du projet' : 'معرض المشروع'}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {language === 'en'
                    ? 'Before, progress, and after photos from this construction project.'
                    : language === 'fr'
                      ? 'Photos avant, pendant et après de ce projet.'
                      : 'صور المشروع قبل وأثناء وبعد الأشغال.'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {galleryItems.length} {language === 'fr' ? 'photos' : language === 'ar' ? 'صور' : 'photos'}
                </span>
                {perm.canUploadTaskMedia && (
                  <>
                    <div className="grid grid-cols-3 overflow-hidden rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
                      {(['before', 'progress', 'after'] as PhotoType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setGalleryPhotoType(type)}
                          className={`min-h-8 px-2 text-[10px] font-bold capitalize transition-colors ${
                            galleryPhotoType === type
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleGalleryUpload}
                    />
                    <button
                      type="button"
                      disabled={galleryUploadBusy}
                      onClick={() => galleryInputRef.current?.click()}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-sky-600 px-3 text-xs font-bold text-white transition-colors hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      {galleryUploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {language === 'fr' ? 'Ajouter des photos' : language === 'ar' ? 'إضافة صور' : 'Add photos'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {(galleryUploadStatus || isUsingFirestoreMedia()) && (
              <div className="flex flex-col gap-1 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {galleryUploadStatus ||
                    (language === 'fr'
                      ? 'Les images sont compressées à environ 180 Ko et chargées uniquement lorsque vous les affichez.'
                      : language === 'ar'
                        ? 'تُضغط الصور إلى حوالي 180 كيلوبايت ولا يتم تحميلها إلا عند عرضها.'
                        : 'Images are compressed to about 180 KB and downloaded only when you view them.')}
                </span>
                <span className="shrink-0 font-mono font-semibold">
                  {language === 'fr' ? '10 max. par envoi' : language === 'ar' ? '10 كحد أقصى لكل رفع' : '10 max per upload'}
                </span>
              </div>
            )}

            {galleryItems.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center border border-dashed border-slate-300 bg-white px-5 text-center dark:border-slate-700 dark:bg-slate-900">
                <ImageIcon className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {language === 'en' ? 'No project photos yet' : language === 'fr' ? 'Aucune photo' : 'لا توجد صور بعد'}
                </p>
                <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  {language === 'en'
                    ? 'Photos added to task details will appear here automatically.'
                    : language === 'fr'
                      ? 'Les photos ajoutées aux tâches apparaîtront ici automatiquement.'
                      : 'الصور المضافة إلى تفاصيل المهام ستظهر هنا تلقائياً.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleGalleryItems.map((item) => {
                  const source = item.url || resolvedGalleryUrls[item.id] || '';
                  return (
                    <figure
                      key={item.id}
                      className="group min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-950">
                        {source ? (
                          <img
                            src={source}
                            alt={item.title}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-7 w-7 text-slate-300 dark:text-slate-700" />
                          </div>
                        )}
                        {item.isProjectPhoto && perm.canUploadTaskMedia && (
                          <button
                            type="button"
                            title={language === 'fr' ? 'Supprimer la photo' : language === 'ar' ? 'حذف الصورة' : 'Delete photo'}
                            aria-label={language === 'fr' ? 'Supprimer la photo' : language === 'ar' ? 'حذف الصورة' : 'Delete photo'}
                            onClick={() => promptDeleteGalleryPhoto(item.photoId)}
                            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-white/95 text-red-600 opacity-100 shadow-sm transition-colors hover:bg-red-50 dark:bg-slate-950/95 dark:text-red-400 dark:hover:bg-red-950/80 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <figcaption className="space-y-1 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {item.title}
                          </span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            {item.category}
                          </span>
                        </div>
                        {item.taskTitle && (
                          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                            {item.taskTitle}
                          </p>
                        )}
                        <p className="font-mono text-[9px] text-slate-400">
                          {item.date ? new Date(item.date).toLocaleDateString() : ''}
                        </p>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
            {galleryItems.length > 0 && galleryPageCount > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {language === 'fr' ? 'Page' : language === 'ar' ? 'الصفحة' : 'Page'} {galleryPage} / {galleryPageCount}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="Previous page"
                    aria-label="Previous page"
                    disabled={galleryPage <= 1}
                    onClick={() => setGalleryPage((page) => Math.max(1, page - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Next page"
                    aria-label="Next page"
                    disabled={galleryPage >= galleryPageCount}
                    onClick={() => setGalleryPage((page) => Math.min(galleryPageCount, page + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </FadeIn>
      )}

      {/* TAB CONTENT: INVOICES, BONS & RECEIPTS GENERATOR */}
      {activeTab === 'docs' && (
        <FadeIn key="docs">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between no-print">
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <FileText className="w-4 h-4" />
                </span>
                {language === 'en' ? 'Invoices & Vouchers' : language === 'fr' ? 'Factures & Bons' : 'الفواتير والإيصالات'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {language === 'en'
                  ? 'Configure your document, import expenses, then save as PDF.'
                  : language === 'fr'
                    ? 'Configurez le document, importez les frais, puis imprimez.'
                    : 'اضبط المستند، استورد المصاريف، ثم اطبع.'}
              </p>
            </div>
            <div className="grid w-full grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-md border border-slate-200 text-center dark:divide-slate-800 dark:border-slate-800 sm:w-auto">
              <div className="min-w-0 px-2 py-2 sm:min-w-[4.75rem] sm:px-3">
                <span className="block text-[9px] font-bold uppercase text-slate-400">{language === 'en' ? 'Type' : language === 'fr' ? 'Type' : 'النوع'}</span>
                <span className="mt-0.5 block text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  {docType === 'invoice' ? (language === 'en' ? 'Invoice' : language === 'fr' ? 'Facture' : 'فاتورة') : docType === 'voucher' ? (language === 'en' ? 'Voucher' : language === 'fr' ? 'Bon' : 'سند') : (language === 'en' ? 'Receipt' : language === 'fr' ? 'Reçu' : 'إيصال')}
                </span>
              </div>
              <div className="min-w-0 px-2 py-2 sm:min-w-[4.75rem] sm:px-3">
                <span className="block text-[9px] font-bold uppercase text-slate-400">{language === 'en' ? 'Lines' : language === 'fr' ? 'Lignes' : 'البنود'}</span>
                <span className="mt-0.5 block text-[11px] font-mono font-bold text-slate-800 dark:text-slate-100">{docItems.length}</span>
              </div>
              <div className="min-w-0 px-2 py-2 sm:min-w-[5.5rem] sm:px-3">
                <span className="block text-[9px] font-bold uppercase text-slate-400">{language === 'en' ? 'Total' : language === 'fr' ? 'Total' : 'الإجمالي'}</span>
                <span className="mt-0.5 block text-[11px] font-mono font-bold text-sky-600 dark:text-sky-400">{docTotal.toLocaleString()} {project.currency}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(34rem,0.9fr)_minmax(0,1.5fr)]">
            
            {/* Left Column: Creator controls */}
            <div className="flex min-w-0 flex-col gap-4 no-print">

              {/* Setup and expense selection use the full editor width. */}
              <div className="grid grid-cols-1 gap-4">
              
              {/* Document Presets */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm flex flex-col min-h-0 min-w-0">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-850 shrink-0 bg-slate-50/70 dark:bg-slate-950/30">
                  <h3 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <Sliders className="w-3.5 h-3.5" />
                    </span>
                    {language === 'en' ? 'Document Presets' : language === 'fr' ? 'Configuration du Document' : 'إعدادات المستند'}
                  </h3>
                </div>

                <div className="flex-1 space-y-3 p-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1.5">
                      {language === 'en' ? 'Document type' : language === 'fr' ? 'Type de pièce' : 'نوع المستند'}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => switchDocType('invoice')}
                        className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold text-center border cursor-pointer transition-all ${
                          docType === 'invoice'
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-950 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        {language === 'en' ? 'Invoice' : language === 'fr' ? 'Facture' : 'فاتورة'}
                      </button>
                      <button
                        type="button"
                        onClick={() => switchDocType('voucher')}
                        className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold text-center border cursor-pointer transition-all ${
                          docType === 'voucher'
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-950 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        {language === 'en' ? 'Voucher' : language === 'fr' ? 'Bon' : 'سند'}
                      </button>
                      <button
                        type="button"
                        onClick={() => switchDocType('receipt')}
                        className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold text-center border cursor-pointer transition-all ${
                          docType === 'receipt'
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-950 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        {language === 'en' ? 'Receipt' : language === 'fr' ? 'Reçu' : 'إيصال'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {language === 'en' ? 'Invoice columns' : language === 'fr' ? 'Colonnes de facture' : 'أعمدة الفاتورة'}
                      </label>
                      <span className="text-[9px] text-slate-400">
                        {language === 'en' ? 'Description is always shown' : language === 'fr' ? 'La description est toujours affichée' : 'الوصف ظاهر دائما'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ['quantity', language === 'en' ? 'Qty' : language === 'fr' ? 'Qté' : 'الكمية'],
                        ['unitPrice', language === 'en' ? 'Unit price' : language === 'fr' ? 'Prix unitaire' : 'سعر الوحدة'],
                        ['total', language === 'en' ? 'Total' : language === 'fr' ? 'Total' : 'المجموع'],
                      ] as [DocumentLineColumn, string][]).map(([column, label]) => (
                        <label
                          key={column}
                          className={`flex cursor-pointer items-center justify-center gap-1 rounded-md border px-1.5 py-1.5 text-[10px] font-semibold transition-colors ${
                            docVisibleColumns.includes(column)
                              ? 'border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                              : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={docVisibleColumns.includes(column)}
                            onChange={() => toggleDocumentColumn(column)}
                            className="h-3 w-3 accent-sky-500"
                          />
                          <span className="truncate">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Document #' : language === 'fr' ? 'N° Document' : 'رقم المستند'}
                      </label>
                      <input
                        type="text"
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Tax (%)' : language === 'fr' ? 'TVA (%)' : 'الضريبة (%)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={docTaxRate}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDocTaxRate(v);
                          persistCurrentDocPreset({ taxRate: v });
                        }}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Logo (PNG)
                      </label>
                      <input
                        type="file"
                        accept="image/png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                             const reader = new FileReader();
                             reader.onloadend = () => setDocLogo(reader.result as string);
                             reader.readAsDataURL(file);
                          }
                        }}
                        className="w-full text-[10px] file:text-[10px] file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Format
                      </label>
                      <div className="flex h-[30px] items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-mono font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        A4
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-850 space-y-3">
                    <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                      {language === 'en' ? 'Billing parties' : language === 'fr' ? 'Parties' : 'أطراف الفوترة'}
                    </h4>

                    <DocumentPartySelector
                      language={language}
                      role="issuer"
                      accentClass="text-sky-600 dark:text-sky-400"
                      title={
                        language === 'en'
                          ? 'Issuer'
                          : language === 'fr'
                            ? 'Émetteur'
                            : 'الجهة المصدرة'
                      }
                      fields={{
                        name: docSenderName,
                        email: docSenderEmail,
                        phone: docSenderPhone,
                        address: docSenderAddress,
                      }}
                      onChange={(patch) => {
                        if (patch.name !== undefined) setDocSenderName(patch.name);
                        if (patch.email !== undefined) setDocSenderEmail(patch.email);
                        if (patch.phone !== undefined) setDocSenderPhone(patch.phone);
                        if (patch.address !== undefined) setDocSenderAddress(patch.address);
                      }}
                      savedParties={documentParties}
                      onSelectParty={handleSelectDocumentParty}
                      onSaveParty={(label) => handleSaveDocumentParty('issuer', label)}
                      onDeleteParty={handleDeleteDocumentParty}
                    />

                    <DocumentPartySelector
                      language={language}
                      role="recipient"
                      accentClass="text-purple-600 dark:text-purple-400"
                      title={
                        language === 'en'
                          ? 'Recipient'
                          : language === 'fr'
                            ? 'Destinataire'
                            : 'المستلم'
                      }
                      fields={{
                        name: docClientName,
                        email: docClientEmail,
                        phone: docClientPhone,
                        address: docClientAddress,
                      }}
                      onChange={(patch) => {
                        if (patch.name !== undefined) setDocClientName(patch.name);
                        if (patch.email !== undefined) setDocClientEmail(patch.email);
                        if (patch.phone !== undefined) setDocClientPhone(patch.phone);
                        if (patch.address !== undefined) setDocClientAddress(patch.address);
                      }}
                      savedParties={documentParties}
                      onSelectParty={handleSelectDocumentParty}
                      onSaveParty={(label) => handleSaveDocumentParty('recipient', label)}
                      onDeleteParty={handleDeleteDocumentParty}
                      recipientKind={docRecipientKind}
                      onRecipientKindChange={setDocRecipientKind}
                      quickFillOptions={recipientQuickFill}
                    />

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {language === 'en' ? 'Footer notes' : language === 'fr' ? 'Notes de pied' : 'ملاحظات التذييل'}
                      </label>
                      <textarea
                        rows={2}
                        value={docNotes}
                        onChange={(e) => {
                          setDocNotes(e.target.value);
                          persistCurrentDocPreset({ defaultNotes: e.target.value });
                        }}
                        placeholder={
                          language === 'en'
                            ? 'Payment terms, bank details…'
                            : language === 'fr'
                              ? 'Conditions, coordonnées bancaires…'
                              : 'شروط الدفع، تفاصيل البنك…'
                        }
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Import Registered Expenses */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm flex flex-col min-h-0 min-w-0">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-850 shrink-0 bg-slate-50/70 dark:bg-slate-950/30">
                  <h3 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CreditCard className="w-3.5 h-3.5" />
                    </span>
                    {language === 'en' ? 'Import Expenses' : language === 'fr' ? 'Importer des Frais' : 'استيراد المصاريف'}
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
                    {language === 'en'
                      ? 'Tap expenses to add them as line items on the document.'
                      : language === 'fr'
                        ? 'Sélectionnez des frais pour les ajouter au document.'
                        : 'اضغط على المصاريف لإضافتها كبنود في المستند.'}
                  </p>
                </div>

                <div className="min-h-[10rem] max-h-[34rem] flex-1 overflow-y-auto p-3">
                {project.expenses.length === 0 ? (
                  <div className="h-full min-h-[8rem] flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center text-[11px] text-slate-400 px-3">
                    {language === 'en' ? 'No expenses in this project yet.' : language === 'fr' ? 'Aucun frais dans ce projet.' : 'لا توجد مصاريف في هذا المشروع.'}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {project.expenses.map((exp) => {
                      const importedItem = docItems.find(item => item.sourceExpenseId === exp.id || item.id === exp.id);
                      const isChecked = Boolean(importedItem);
                      const payerName = project.members.find(m => m.email === exp.paidBy)?.name || exp.paidBy;

                      return (
                        <div
                          key={exp.id}
                          role="checkbox"
                          aria-checked={isChecked}
                          tabIndex={0}
                          onClick={() => handleToggleExpenseIntoDoc(exp)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleToggleExpenseIntoDoc(exp);
                            }
                          }}
                          className={`w-full text-left p-2 rounded-lg border text-[11px] transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-emerald-500/5 border-emerald-500/60 text-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-750 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={`h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center transition-all ${
                              isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                            }`}>
                              {isChecked && <Check className="w-2 h-2 stroke-[3px]" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{exp.title}</p>
                              <span className="text-[9px] text-slate-400 font-mono truncate block">{payerName}</span>
                            </div>
                          </div>

                          <span className="font-bold font-mono text-slate-900 dark:text-white shrink-0 text-[10px] flex items-center gap-1">
                            {(() => {
                              const ip = exp.commissionPercent ? exp.amount + (exp.amount * exp.commissionPercent / 100) : exp.amount;
                              return (
                                <>
                                  <span className={exp.commissionPercent ? 'text-emerald-600 dark:text-emerald-400' : ''}>{ip.toLocaleString()}</span>
                                  {exp.commissionPercent && <span className="text-[8px] text-slate-400 font-normal">+{exp.commissionPercent}%</span>}
                                </>
                              );
                            })()}
                          </span>
                          </div>
                          {importedItem && (
                            <label
                              className="mt-2 flex items-center justify-between gap-2 border-t border-emerald-500/20 pt-2"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                {language === 'en' ? 'Invoice margin' : language === 'fr' ? 'Marge facture' : 'عمولة الفاتورة'}
                              </span>
                              <span className="relative w-20">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={importedItem.commissionPercent || ''}
                                  placeholder="0"
                                  aria-label={language === 'en' ? `Invoice margin for ${exp.title}` : language === 'fr' ? `Marge facture pour ${exp.title}` : `عمولة الفاتورة لـ ${exp.title}`}
                                  onChange={(event) => updateDocumentItemCommission(importedItem.id, Number(event.target.value))}
                                  className="w-full rounded-md border border-emerald-500/40 bg-white px-2 py-1 pr-4 text-right font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:bg-slate-900 dark:text-white"
                                />
                                <span className="pointer-events-none absolute right-1.5 top-1 text-[10px] text-slate-400">%</span>
                              </span>
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>

              </div>

              {docItems.some((item) => item.sourceExpenseId) && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm px-4 py-3">
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      {language === 'en' ? 'Invoice line settings' : language === 'fr' ? 'Réglages des lignes' : 'إعدادات بنود الفاتورة'}
                    </h3>
                    <span className="text-[10px] text-slate-400">
                      {language === 'en' ? 'Invoice only' : language === 'fr' ? 'Facture uniquement' : 'للفاتورة فقط'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {docItems.filter((item) => item.sourceExpenseId).map((item) => (
                      <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 dark:border-slate-850 dark:bg-slate-950/40 sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem]">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateDocItem(item.id, { description: e.target.value })}
                          aria-label={language === 'en' ? 'Invoice line description' : language === 'fr' ? 'Description de ligne' : 'وصف بند الفاتورة'}
                          className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white sm:col-span-1"
                        />
                        <label className="min-w-0">
                          <span className="mb-0.5 block text-[9px] font-bold uppercase text-slate-400">{language === 'en' ? 'Margin' : language === 'fr' ? 'Marge' : 'العمولة'}</span>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.commissionPercent || ''}
                              placeholder="0"
                              onChange={(e) => updateDocumentItemCommission(item.id, Number(e.target.value))}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 pr-4 text-right font-mono text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            />
                            <span className="pointer-events-none absolute right-1.5 top-1.5 text-[10px] text-slate-400">%</span>
                          </div>
                        </label>
                        <div className="col-span-2 flex items-center justify-between border-t border-slate-200 pt-1.5 text-[10px] dark:border-slate-800 sm:col-span-1 sm:block sm:border-t-0 sm:pt-0">
                          <span className="text-slate-400 sm:block">{language === 'en' ? 'Invoice price' : language === 'fr' ? 'Prix facturé' : 'سعر الفاتورة'}</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{item.unitPrice.toLocaleString()} {project.currency}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Row 2: Compact manual line item */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm px-4 py-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newItemDesc.trim() || newItemPrice <= 0) return;
                    const customId = `manual_item_${Date.now()}`;
                    setDocItems([...docItems, { id: customId, description: newItemDesc, quantity: newItemQty, unitPrice: newItemPrice }]);
                    setNewItemDesc('');
                    setNewItemQty(1);
                    setNewItemPrice(0);
                  }}
                  className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3"
                >
                  <div className="flex items-center gap-2 shrink-0 sm:pb-0.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                      <PlusCircle className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-xs text-slate-900 dark:text-white whitespace-nowrap">
                      {language === 'en' ? 'Custom row' : language === 'fr' ? 'Ligne manuelle' : 'بند يدوي'}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder={language === 'en' ? 'Item / labor description…' : language === 'fr' ? 'Description…' : 'وصف العنصر…'}
                      value={newItemDesc}
                      onChange={(e) => setNewItemDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                  
                  <div className="flex items-end gap-2 shrink-0">
                    <div className="w-14">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">{language === 'en' ? 'Qty' : language === 'fr' ? 'Qté' : 'كم'}</label>
                      <input
                        type="number"
                        min="1"
                        value={newItemQty}
                        onChange={(e) => setNewItemQty(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono text-center"
                      />
                    </div>
                    <div className="w-20 sm:w-24">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">{language === 'en' ? 'Price' : language === 'fr' ? 'Prix' : 'السعر'}</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={newItemPrice || ''}
                        onChange={(e) => setNewItemPrice(Number(e.target.value))}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-3 py-1.5 h-[30px] bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-950 text-xs font-semibold rounded-lg cursor-pointer transition-all whitespace-nowrap"
                    >
                      {language === 'en' ? '+ Add' : language === 'fr' ? '+ Ajouter' : '+ إضافة'}
                    </button>
                  </div>
                </form>
              </div>

            </div>

            {/* Right Column: Live document preview */}
            <div className="min-w-0 space-y-3 xl:sticky xl:top-4 xl:self-start">
              
              <div className="no-print flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    {language === 'en' ? 'Live preview' : language === 'fr' ? 'Aperçu en direct' : 'معاينة مباشرة'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {docNumber || (language === 'en' ? 'Draft document' : language === 'fr' ? 'Brouillon' : 'مسودة')} · {docPaperFormat}
                  </span>
                  </div>
                  <span className="ml-auto shrink-0 rounded-md bg-sky-500/10 px-2 py-1 font-mono text-[10px] font-bold text-sky-700 dark:text-sky-300 sm:ml-2">
                    {docTotal.toLocaleString()} {project.currency}
                  </span>
                </div>
                
                <button
                  type="button"
                  onClick={handleSaveDocumentAsPdf}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-sky-600 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{language === 'en' ? 'Save as PDF' : language === 'fr' ? 'Enregistrer en PDF' : 'حفظ كـ PDF'}</span>
                </button>
              </div>

              {/* LIVE PAGE CARD — only this block is exported */}
              <div 
                className={
                  'bg-white text-slate-900 rounded-xl border border-slate-200 p-4 shadow-md relative min-h-[48rem] flex flex-col justify-between font-sans sm:p-8 ' +
                  'print:min-h-0 print:m-0 print:border-none print:shadow-none print:rounded-none print:p-8 ' +
                  'print-page-a4'
                }
                id="printable-civil-bill"
              >
                
                {/* Letterhead Top Logo Details */}
                <div>
                  <div className="flex justify-between items-start pb-6 border-b border-slate-200 gap-4">
                    <div>
                      {/* Brand Logo & Name */}
                      <div className="flex items-center gap-2 mb-1.5">
                        {docLogo ? (
                          <img src={docLogo} alt="Logo" className="h-10 w-auto object-contain" />
                        ) : (
                          <div className="h-7 w-7 rounded bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm">
                            {(docSenderName || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-extrabold text-base tracking-tight font-sans text-slate-900">
                          {docSenderName || (language === 'en' ? 'Issuer name' : language === 'fr' ? 'Nom émetteur' : 'اسم الجهة المصدرة')}
                        </span>
                      </div>
                      
                      {/* Sender details */}
                      <p className="text-[10px] text-slate-500 font-sans leading-normal">
                        {docSenderAddress || '—'}
                      </p>
                      <p className="text-[10px] text-slate-500 font-sans font-medium">
                        {docSenderPhone && (
                          <>{language === 'en' ? 'Tel:' : language === 'fr' ? 'Tél:' : 'الهاتف:'} {docSenderPhone}</>
                        )}
                        {docSenderPhone && docSenderEmail && ' | '}
                        {docSenderEmail && <>Email: {docSenderEmail}</>}
                        {!docSenderPhone && !docSenderEmail && '—'}
                      </p>
                    </div>

                    {/* Document Meta (Type banner) */}
                    <div className="text-right">
                      <span className="text-[9.5px] font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md uppercase tracking-wider block mb-1">
                        {docType === 'invoice' ? (language === 'en' ? 'INVOICE' : language === 'fr' ? 'FACTURE' : 'فاتورة') :
                         docType === 'voucher' ? (language === 'en' ? 'VOUCHER' : language === 'fr' ? 'BON DE COMMANDE' : 'سند استلام') :
                         (language === 'en' ? 'RECEIPT' : language === 'fr' ? 'REÇU DE PAIEMENT' : 'إيصال دفع')}
                      </span>
                      
                      <p className="text-xs font-bold font-mono text-slate-900">{docNumber}</p>
                      <p className="text-[9.5px] text-slate-500 font-serif font-medium mt-1">
                        {language === 'en' ? 'Date:' : language === 'fr' ? 'Émis le:' : 'التاريخ:'} {docDate}
                      </p>
                    </div>
                  </div>

                  {/* Client Identification Segment */}
                  <div className="grid grid-cols-2 gap-6 mt-6 pb-6 border-b border-slate-100">
                    <div>
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        {billToLabel(docRecipientKind, language)}:
                      </span>
                      <p className="font-semibold text-xs text-slate-900 font-sans">{docClientName || '—'}</p>
                      <p className="text-[10px] text-slate-500 leading-normal mt-0.5">{docClientAddress || '—'}</p>
                      {(docClientEmail || docClientPhone) && (
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {[docClientEmail, docClientPhone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        {language === 'en' ? 'PROJECT LOCATION :' : language === 'fr' ? 'ADDRESSE DES TRAVAUX :' : 'موقع ورشة العمل / المشروع :'}
                      </span>
                      <p className="font-semibold text-xs text-slate-900">{project.name}</p>
                      <p className="text-[10px] text-slate-500 leading-normal mt-0.5">{project.address}</p>
                      <p className="text-[9.5px] text-slate-400 font-serif mt-1">
                        {docType === 'invoice' && `${language === 'en' ? 'Due Date:' : language === 'fr' ? 'Échéance:' : 'تاريخ الاستحقاق:'} ${docDueDate}`}
                      </p>
                    </div>
                  </div>

                  {/* Items list table */}
                  <div className="mt-6">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">{language === 'en' ? 'Description' : language === 'fr' ? 'Description de la prestation' : 'البيان / وصف الخدمة'}</th>
                          {docVisibleColumns.includes('quantity') && (
                            <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center w-16">{language === 'en' ? 'Qty' : language === 'fr' ? 'Qté' : 'الكمية'}</th>
                          )}
                          {docVisibleColumns.includes('unitPrice') && (
                            <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right w-24">{language === 'en' ? 'Unit Price' : language === 'fr' ? 'Prix Unitaire' : 'سعر الوحدة'}</th>
                          )}
                          {docVisibleColumns.includes('total') && (
                            <th className="pb-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right w-28 pr-1">{language === 'en' ? 'Total' : language === 'fr' ? 'Total' : 'المجموع'}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {docItems.length === 0 ? (
                          <tr>
                            <td colSpan={1 + docVisibleColumns.length} className="py-8 text-center text-xs text-slate-400 font-sans">
                              {language === 'en' ? 'Select project expenditures from side list or add custom line items.' : language === 'fr' ? 'Sélectionnez ou ajoutez des lignes d\'achats.' : 'اختر المصاريف من القائمة الجانبية أو أضف بنوداً يدوية مخصصة.'}
                            </td>
                          </tr>
                        ) : (
                          docItems.map((item, index) => {
                            const lineTotal = item.quantity * item.unitPrice;
                            return (
                              <tr key={item.id || index} className="text-xs">
                                <td className="py-3 font-sans font-medium text-slate-800 pr-3">
                                  <div className="flex justify-between items-start">
                                    <span>{item.description}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveDocItem(item.id)}
                                      className="text-red-400 hover:text-red-650 opacity-0 group-hover:opacity-100 hover:bg-red-50 p-0.5 rounded ml-1.5 transition-all text-[9px] print:hidden cursor-pointer"
                                      title="Remove item"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                                {docVisibleColumns.includes('quantity') && (
                                  <td className="py-3 text-center font-mono text-slate-600">{item.quantity}</td>
                                )}
                                {docVisibleColumns.includes('unitPrice') && (
                                  <td className="py-3 text-right font-mono text-slate-600">{item.unitPrice.toLocaleString()}</td>
                                )}
                                {docVisibleColumns.includes('total') && (
                                  <td className="py-3 text-right font-mono font-semibold text-slate-900 pr-1">
                                    {lineTotal.toLocaleString()} {project.currency}
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Calculations block */}
                  {docItems.length > 0 && (() => {
                    const subtotal = docItems.reduce((acc, current) => acc + (current.quantity * current.unitPrice), 0);
                    const taxes = subtotal * (docTaxRate / 100);
                    const grandTotal = subtotal + taxes;

                    return (
                      <div className="flex justify-end mt-6">
                        <div className="w-64 space-y-2 text-right text-xs">
                          <div className="flex justify-between text-slate-500">
                            <span>{language === 'en' ? 'Subtotal :' : language === 'fr' ? 'Sous-total :' : 'المجموع الفرعي :'}</span>
                            <span className="font-mono font-medium text-slate-800">{subtotal.toLocaleString()} {project.currency}</span>
                          </div>
                          {docTaxRate > 0 && (
                            <div className="flex justify-between text-slate-500">
                              <span>TVA ({docTaxRate}%) :</span>
                              <span className="font-mono font-medium text-slate-800">{taxes.toLocaleString()} {project.currency}</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                            <span>Total :</span>
                            <span className="font-mono text-sky-600 tracking-tight">{grandTotal.toLocaleString()} {project.currency}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* Footer and Terms signature */}
                <div className="pt-8 border-t border-slate-100 mt-12">
                  <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400 leading-relaxed font-sans">
                    <div>
                      <span className="font-bold text-slate-600 uppercase tracking-widest text-[8.5px] block mb-1">
                        {language === 'en' ? 'NOTES & BANK INSTRUCTIONS' : language === 'fr' ? 'CONDITIONS & RELEVÉ' : 'ملاحظات وتوجيهات مصرفية / شروط الدفع'}
                      </span>
                      <p className="whitespace-pre-line italic">{docNotes}</p>
                    </div>

                    <div className="text-right flex flex-col justify-end items-end h-full">
                      <div className="w-36 border-t border-slate-300 pt-1 mt-6 text-center text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-sans">
                        {language === 'en' ? 'Contractor Signature' : language === 'fr' ? 'Signature de l\'Entrepreneur' : 'توقيع المقاول / المشرف المعتمد'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
        </FadeIn>
      )}

      {/* TAB CONTENT: RENTAL MANAGEMENT */}
      {activeTab === 'rental' && project && (
        <FadeIn key="rental">
        <div className="space-y-6">
          {/* Property Summary Card */}
          {project.rentalProperty && (
            <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/30 p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    {project.rentalProperty.buildingNumber}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.rental.ownerName}: {project.rentalProperty.ownerName}
                  </p>
                  {(project.rentalProperty.ownerPhone || project.rentalProperty.ownerEmail) && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      {[project.rentalProperty.ownerPhone, project.rentalProperty.ownerEmail].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {project.rentalProperty.notes && (
                    <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {project.rentalProperty.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right">
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">{t.rental.pricePerNight}</p>
                    <p className="font-bold text-slate-900 dark:text-white">{project.rentalProperty.pricePerNight} {project.currency}<span className="font-normal text-slate-400">/{t.rental.nights}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">{t.rental.commissionRate}</p>
                    <p className="font-bold text-slate-900 dark:text-white">{project.rentalProperty.commissionRate}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Revenue Summary */}
          {project.rentalBookings && project.rentalBookings.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{t.rental.totalRevenue}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {rentalRevenue} {project.currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{t.rental.totalCommission}</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  +{rentalCommission} {project.currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{t.rental.totalPayout}</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {rentalOwnerPayout} {project.currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{language === 'en' ? 'Apartment Expenses' : language === 'fr' ? 'Dépenses appart' : 'مصاريف الشقة'}</p>
                <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-1">
                  -{totalSpent} {project.currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{language === 'en' ? 'Net Owner Balance' : language === 'fr' ? 'Solde net propriétaire' : 'صافي المالك'}</p>
                <p className={`text-lg font-bold mt-1 ${rentalNetOwner >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                  {rentalNetOwner} {project.currency}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{t.rental.balanceDue}</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {rentalBalanceDue} {project.currency}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">{t.rental.paidAmount}: {rentalPaid}</p>
              </div>
            </div>
          )}

          {/* Add Booking Form */}
          {perm.canModifySettings && (
            <RentalBookingForm
              project={project}
              language={language}
              t={t}
              onSave={async (updatedProject) => {
                setProject(updatedProject);
                if (user) await saveProjectToDB(user.uid, updatedProject);
              }}
            />
          )}

          <RentalOwnerStatement
            project={project}
            language={language}
            canManage={perm.canModifySettings}
            onSave={async (updatedProject) => {
              setProject(updatedProject);
              if (user) await saveProjectToDB(user.uid, updatedProject);
            }}
          />

          {/* Bookings List */}
          <RentalBookingList
            project={project}
            language={language}
            t={t}
            canManage={perm.canModifySettings}
            onPrepareReceipt={(booking, payment) => {
              applyDocumentDraftFromAI(buildRentalPaymentReceiptDraft(project, booking, payment));
            }}
            onRequestConfirm={requestConfirm}
            onUpdate={async (updatedProject) => {
              setProject(updatedProject);
              if (user) await saveProjectToDB(user.uid, updatedProject);
            }}
          />
        </div>
        </FadeIn>
      )}
      </AnimatePresence>

      </div>

      {/* MODAL DIALOG: ADD / EDIT EXPENSE */}
      {showAddExpense && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-4 backdrop-blur-xs sm:items-center sm:px-4"
          id="add-expense-modal"
          onClick={closeAddExpenseModal}
          role="presentation"
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-5 text-left font-sans"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 dark:border-slate-850">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-sky-505" />
                {editingExpenseId
                  ? language === 'en'
                    ? 'Edit Expenditure'
                    : language === 'fr'
                      ? 'Modifier le Frais'
                      : 'تعديل المصروف'
                  : language === 'en'
                    ? 'Add Workspace Expenditure'
                    : language === 'fr'
                      ? 'Enregistrer Un Frais'
                      : 'تسجيل مصروفات ورشة العمل / الموقع'}
              </h3>
              <button
                type="button"
                onClick={closeAddExpenseModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="space-y-3.5 mt-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Expense Title *' : language === 'fr' ? 'Titre *' : 'عنوان المصروف *'}</label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? "e.g. Carrara Tile Marble Slabs" : language === 'fr' ? "ex. Dalles de marbre de Carrare" : "مثل: ألواح رخام كارارا"}
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Sourced Cost Amount *' : language === 'fr' ? 'Montant *' : 'قيمة المبلغ المدفوع *'}</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="any"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Commission %' : language === 'fr' ? 'Commission %' : 'نسبة العمولة'}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={expenseCommission}
                      onChange={(e) => setExpenseCommission(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono font-semibold"
                    />
                    {expenseCommission > 0 && expenseAmount > 0 && (
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0">
                        +{(expenseAmount * expenseCommission / 100).toLocaleString()} {project.currency}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Date' : language === 'fr' ? 'Date' : 'التاريخ'}</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Category Tag' : language === 'fr' ? 'Catégorie' : 'فئة نوع المصروف'}</label>
                <select
                  value={expenseCat}
                  onChange={(e) => setExpenseCat(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                >
                  <option value="materials">{t.categories.materials}</option>
                  <option value="workers">{t.categories.workers}</option>
                  <option value="equipment">{t.categories.equipment}</option>
                  <option value="transportation">{t.categories.transportation}</option>
                  <option value="utilities">{t.categories.utilities}</option>
                  <option value="cleaning">{t.categories.cleaning}</option>
                  <option value="maintenance">{t.categories.maintenance}</option>
                  <option value="miscellaneous">{t.categories.miscellaneous}</option>
                </select>
              </div>

              {project.projectType === 'rental' && (
                <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900/60 dark:bg-teal-950/20">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                    {rentalText(language, 'Owner report treatment', 'Traitement dans le rapport propriétaire')}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                        {rentalText(language, 'Charged to', 'À la charge de')}
                      </span>
                      <select
                        value={expenseRentalChargeTo}
                        onChange={(event) => setExpenseRentalChargeTo(event.target.value as NonNullable<Expense['rentalChargeTo']>)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                      >
                        <option value="owner">{rentalText(language, 'Property owner', 'Propriétaire')}</option>
                        <option value="rent">{rentalText(language, 'Deduct from rent', 'Déduire du loyer')}</option>
                        <option value="management">{rentalText(language, 'Management company', 'Notre société')}</option>
                        <option value="guest">{rentalText(language, 'Guest', 'Client / voyageur')}</option>
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                        {rentalText(language, 'Related booking', 'Séjour lié')}
                      </span>
                      <select
                        value={expenseRentalBookingId}
                        onChange={(event) => setExpenseRentalBookingId(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                      >
                        <option value="">{rentalText(language, 'No specific booking', 'Aucun séjour précis')}</option>
                        {(project.rentalBookings || []).map((booking) => (
                          <option key={booking.id} value={booking.id}>
                            {booking.clientName} · {booking.checkIn}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Paid By Partner' : language === 'fr' ? 'Payé par' : 'الشخص الذي دفع المبلغ'}</label>
                  <select
                    value={expensePaidBy}
                    onChange={(e) => setExpensePaidBy(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    {project.members.filter(m => m.status === 'accepted' || !m.status).map((m) => (
                      <option key={m.email} value={m.email}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Supplier Name' : language === 'fr' ? 'Fournisseur' : 'اسم المورد / الشركة'}</label>
                  <input
                    type="text"
                    placeholder={language === 'en' ? "Vinci Marble Inc" : language === 'fr' ? "Société Vinci Marbre" : "شركة رخام فينشي"}
                    value={expenseSupplier}
                    onChange={(e) => setExpenseSupplier(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-805 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Short Description' : language === 'fr' ? 'Détails' : 'تفاصيل قصيرة'}</label>
                <textarea
                  rows={2}
                  placeholder={language === 'en' ? "Invoice 4B deposit to support bathroom remodeling..." : language === 'fr' ? "Dépôt Facture 4B pour le réaménagement..." : "دفعة الفاتورة 4B لدعم ترميم الحمام..."}
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Internal Notes' : language === 'fr' ? 'Notes internes' : 'ملاحظات داخلية'}</label>
                <textarea
                  rows={2}
                  placeholder={language === 'en' ? 'Optional notes for your team...' : language === 'fr' ? 'Notes optionnelles...' : 'ملاحظات اختيارية للفريق...'}
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {editingExpenseId && !expenseReceiptDraft && !removeExpenseReceipt && (() => {
                const existingReceipt = project.expenses.find((ex) => ex.id === editingExpenseId)?.receiptFiles?.[0];
                if (!existingReceipt) return null;
                return (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50 dark:bg-slate-950">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
                        {language === 'en' ? 'Current receipt' : language === 'fr' ? 'Bon actuel' : 'الوصل الحالي'}
                      </p>
                      <button
                        type="button"
                        disabled={expenseSaving}
                        onClick={() => requestConfirm({
                          title: language === 'en'
                            ? 'Remove receipt?'
                            : language === 'fr'
                              ? 'Supprimer le reçu ?'
                              : 'حذف الوصل؟',
                          message: language === 'en'
                            ? 'Remove this supplier receipt from the expense when the changes are saved?'
                            : language === 'fr'
                              ? 'Supprimer ce reçu fournisseur de la dépense lors de l’enregistrement ?'
                              : 'حذف وصل المورد من المصروف عند حفظ التغييرات؟',
                          confirmLabel: language === 'en'
                            ? 'Remove receipt'
                            : language === 'fr'
                              ? 'Supprimer le reçu'
                              : 'حذف الوصل',
                          onConfirm: () => setRemoveExpenseReceipt(true),
                        })}
                        className="text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        {language === 'en' ? 'Remove' : language === 'fr' ? 'Supprimer' : 'حذف'}
                      </button>
                    </div>
                    <ExpenseReceiptThumb
                      media={existingReceipt}
                      label={language === 'en' ? 'Supplier receipt' : language === 'fr' ? 'Bon fournisseur' : 'وصل المورد'}
                    />
                  </div>
                );
              })()}

              {removeExpenseReceipt && !expenseReceiptDraft && (
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  {language === 'en'
                    ? 'Receipt will be removed when you save.'
                    : language === 'fr'
                      ? 'Le bon sera supprimé à l’enregistrement.'
                      : 'سيُحذف الوصل عند الحفظ.'}
                  {' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => setRemoveExpenseReceipt(false)}
                  >
                    {language === 'en' ? 'Undo' : language === 'fr' ? 'Annuler' : 'تراجع'}
                  </button>
                </p>
              )}

              <ExpenseReceiptField
                language={language}
                value={expenseReceiptDraft}
                onChange={setExpenseReceiptDraft}
                onRequestConfirm={requestConfirm}
                disabled={expenseSaving}
              />

              <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={closeAddExpenseModal}
                  disabled={expenseSaving}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={expenseSaving}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-955 text-white dark:bg-slate-100 dark:text-slate-950 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {expenseSaving
                    ? language === 'en'
                      ? 'Saving…'
                      : language === 'fr'
                        ? 'Enregistrement…'
                        : 'جاري الحفظ…'
                    : editingExpenseId
                      ? language === 'en'
                        ? 'Save Changes'
                        : language === 'fr'
                          ? 'Enregistrer'
                          : 'حفظ التعديلات'
                      : language === 'en'
                        ? 'Save Expense'
                        : language === 'fr'
                          ? 'Créer'
                          : 'حفظ المصروف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT REIMBURSEMENT */}
      {showReimbursementModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-4 backdrop-blur-xs sm:items-center sm:px-4"
          onClick={closeReimbursementModal}
          role="presentation"
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left font-sans shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 dark:border-slate-850">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-emerald-500" />
                {language === 'en' ? 'Edit Settlement' : language === 'fr' ? 'Modifier le remboursement' : 'تعديل التسوية'}
              </h3>
              <button type="button" onClick={closeReimbursementModal} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleReimbursementSubmit} className="space-y-3 mt-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">
                  {language === 'en' ? 'From' : language === 'fr' ? 'De' : 'من'}
                </label>
                <select
                  value={reimbFrom}
                  onChange={(e) => setReimbFrom(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                  required
                >
                  {project.members.filter((m) => m.status === 'accepted' || !m.status).map((m) => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">
                  {language === 'en' ? 'To' : language === 'fr' ? 'À' : 'إلى'}
                </label>
                <select
                  value={reimbTo}
                  onChange={(e) => setReimbTo(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                  required
                >
                  {project.members.filter((m) => m.status === 'accepted' || !m.status).map((m) => (
                    <option key={m.email} value={m.email}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">
                    {language === 'en' ? 'Amount' : language === 'fr' ? 'Montant' : 'المبلغ'}
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    required
                    value={reimbAmount}
                    onChange={(e) => setReimbAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">
                    {language === 'en' ? 'Date' : language === 'fr' ? 'Date' : 'التاريخ'}
                  </label>
                  <input
                    type="date"
                    required
                    value={reimbDate}
                    onChange={(e) => setReimbDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button type="button" onClick={closeReimbursementModal} disabled={reimbSaving} className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-850">
                  {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button type="submit" disabled={reimbSaving} className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950">
                  {reimbSaving
                    ? language === 'en' ? 'Saving…' : language === 'fr' ? 'Enregistrement…' : 'جاري الحفظ…'
                    : language === 'en' ? 'Save Changes' : language === 'fr' ? 'Enregistrer' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DIALOG: SCHEDULE ROADMAP TASK */}
      {showAddTask && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-4 backdrop-blur-xs sm:items-center sm:px-4"
          id="add-task-modal"
          onClick={() => setShowAddTask(false)}
          role="presentation"
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left font-sans shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-105 dark:border-slate-850 font-sans">
              <h3 className="font-bold text-sm text-slate-909 dark:text-white flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Schedule Milestone Task' : language === 'fr' ? 'Créer un Jalon' : 'إنشاء جلون / مهمة رئيسية'}
              </h3>
              <button
                onClick={() => setShowAddTask(false)}
                className="text-slate-400 hover:text-slate-605 dark:hover:text-slate-202 transition p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTaskSubmit} className="space-y-3.5 mt-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Task Title *' : language === 'fr' ? 'Titre *' : 'اسم المهمة *'}</label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? "Verify wall framing dimensions" : language === 'fr' ? "Vérifier les dimensions des cadres muraux" : "التحقق من أبعاد هيكل الحائط"}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Scope Description' : language === 'fr' ? 'Description' : 'تفاصيل ومجال العمل'}</label>
                <textarea
                  rows={2}
                  placeholder={language === 'en' ? "Architect must sign form B3 for local council records..." : language === 'fr' ? "L'architecte doit signer le formulaire B3..." : "يجب على المهندس التوقيع على النموذج B3 لسجلات المجلس المحلي..."}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Assign Partner' : language === 'fr' ? 'Assigné à' : 'تعيين شريك'}</label>
                  <select
                    value={taskAssignedTo}
                    onChange={(e) => setTaskAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    {project.members.filter(m => m.status === 'accepted' || !m.status).map((m) => (
                      <option key={m.email} value={m.email}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Priority Goal' : language === 'fr' ? 'Priorité' : 'أولوية المهمة'}</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-955 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    <option value="low">{language === 'en' ? 'Low Priority' : language === 'fr' ? 'Basse Priorité' : 'أولوية منخفضة'}</option>
                    <option value="medium">{language === 'en' ? 'Medium Priority' : language === 'fr' ? 'Priorité Moyenne' : 'أولوية متوسطة'}</option>
                    <option value="high">{language === 'en' ? 'High Priority / Urgent' : language === 'fr' ? 'Haute Priorité / Urgent' : 'أولوية عالية / عاجل'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">{language === 'en' ? 'Target Deadline' : language === 'fr' ? 'Date d\'échéance' : 'الموعد النهائي'}</label>
                <input
                  type="date"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                />
              </div>

              <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-205 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-955 text-white dark:bg-slate-100 dark:text-slate-950 cursor-pointer shadow-sm"
                >
                  {language === 'en' ? 'Create Task' : language === 'fr' ? 'Créer' : 'إنشاء مهمة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETUP DIALOG / PROJECT OPTIONS EDIT DRAWER */}
      {showSettings && perm.canModifySettings && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-xs sm:items-center"
          id="project-settings-modal"
          onClick={() => setShowSettings(false)}
          role="presentation"
        >
          <div
            className="flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white p-4 text-left font-sans shadow-2xl dark:border-slate-805 dark:bg-slate-900 sm:p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-850">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-sky-505" />
                {language === 'en' ? 'Workspace Configurations' : language === 'fr' ? 'Options de configuration' : 'خيارات إعداد وتكوين الموقع'}
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Project Name' : language === 'fr' ? 'Nom du chantier' : 'اسم المشروع / الورشة'}</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Client Name' : language === 'fr' ? 'Nom du client' : 'اسم الزبون / صاحب الورشة'}</label>
                  <input
                    type="text"
                    required
                    value={editClient}
                    onChange={(e) => setEditClient(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Default Currency Tag' : language === 'fr' ? 'Devise par défaut' : 'العملة الافتراضية'}</label>
                  <select
                    value={editCurrency}
                    onChange={(e) => setEditCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-805 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    <option value="DH">DH</option>
                    <option value="USD">US Dollar ($)</option>
                    <option value="EUR">Euro (€)</option>
                    <option value="GBP">Pound Sterling (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Project Type' : language === 'fr' ? 'Type de Projet' : 'نوع المشروع'}</label>
                  <select
                    value={editProjectType}
                    onChange={(e) => setEditProjectType(e.target.value as ProjectType)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 font-semibold"
                  >
                    <option value="construction">{t.projectTypes.construction}</option>
                    <option value="rental">{t.projectTypes.rental}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Project Phase status' : language === 'fr' ? 'Statut de phase' : 'حالة مرحلة المشروع'}</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Project['status'])}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-705 dark:text-slate-300 focus:outline-none font-semibold"
                  >
                    <option value="planning">{t.status.planning}</option>
                    <option value="in_progress">{t.status.in_progress}</option>
                    <option value="paused">{t.status.paused}</option>
                    <option value="completed">{t.status.completed}</option>
                    <option value="cancelled">{t.status.cancelled}</option>
                  </select>
                </div>
              </div>

              {editProjectType === 'rental' && (
                <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 dark:border-purple-900/40 dark:bg-purple-950/20">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    {language === 'en' ? 'Rental controls' : language === 'fr' ? 'Contrôles location' : 'إعدادات الإيجار'}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.rental.ownerName}</label>
                      <input type="text" value={editRentalOwnerName} onChange={(e) => setEditRentalOwnerName(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.rental.buildingNumber}</label>
                      <input type="text" value={editRentalBuildingNumber} onChange={(e) => setEditRentalBuildingNumber(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{language === 'en' ? 'Owner Phone' : language === 'fr' ? 'Tél propriétaire' : 'هاتف المالك'}</label>
                      <input type="tel" value={editRentalOwnerPhone} onChange={(e) => setEditRentalOwnerPhone(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{language === 'en' ? 'Owner Email' : language === 'fr' ? 'Email propriétaire' : 'بريد المالك'}</label>
                      <input type="email" value={editRentalOwnerEmail} onChange={(e) => setEditRentalOwnerEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.rental.pricePerNight}</label>
                      <input type="number" min={0} value={editRentalPricePerNight} onChange={(e) => setEditRentalPricePerNight(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.rental.commissionRate}</label>
                      <input type="number" min={0} max={100} value={editRentalCommissionRate} onChange={(e) => setEditRentalCommissionRate(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                    </div>
                  </div>
                  <textarea rows={2} value={editRentalNotes} onChange={(e) => setEditRentalNotes(e.target.value)} placeholder={language === 'en' ? 'Owner instructions, check-in rules, keys, cleaning notes...' : language === 'fr' ? 'Instructions propriétaire, clés, ménage...' : 'تعليمات المالك، المفاتيح، التنظيف...'} className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {language === 'en' ? 'Total Sourcing Budget' : language === 'fr' ? 'Budget de financement' : 'ميزانية التمويل الإجمالية'}
                  {editProjectType !== 'construction' && (
                    <span className="text-[9px] text-slate-400 ml-1 font-normal">(optional)</span>
                  )}
                </label>
                <input
                  type="number"
                  value={editBudget}
                  onChange={(e) => setEditBudget(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-808 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none font-mono"
                  disabled={editProjectType !== 'construction'}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Site Address' : language === 'fr' ? 'Adresse physique' : 'العنوان الجغرافي للموقع'}</label>
                <input
                  type="text"
                  required
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Mission/Description' : language === 'fr' ? 'Description' : 'الرسالة / الوصف التفصيلي'}</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-955 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {isProjectOwner(project, userEmail) && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    {language === 'en' ? 'Danger zone' : language === 'fr' ? 'Zone dangereuse' : 'منطقة خطرة'}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-red-800/80 dark:text-red-300/80">
                    {language === 'en'
                      ? 'Deleting removes this workspace for everyone. Expenses, tasks, and history cannot be recovered.'
                      : language === 'fr'
                        ? 'La suppression retire cet espace pour tous. Dépenses, tâches et historique sont perdus.'
                        : 'الحذف يزيل مساحة العمل للجميع. لا يمكن استعادة المصاريف والمهام والسجل.'}
                  </p>
                  <button
                    type="button"
                    onClick={promptDeleteProject}
                    disabled={deletingProject}
                    className="mt-3 flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {language === 'en' ? 'Delete project' : language === 'fr' ? 'Supprimer le projet' : 'حذف المشروع'}
                  </button>
                </div>
              )}

              <div className="pt-3.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-205 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {language === 'en' ? 'Discard' : language === 'fr' ? 'Fermer' : 'تجاهل التغييرات'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-955 text-white dark:bg-slate-100 dark:text-slate-955 cursor-pointer shadow-sm"
                >
                  {language === 'en' ? 'Apply changes' : language === 'fr' ? 'Appliquer' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AnimatePresence>
      {selectedTask && (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          project={project}
          language={language}
          canEdit={perm.canManageTasks && canEditTask(selectedTask, project, userEmail, userRole)}
          onClose={() => setSelectedTaskId(null)}
          onSave={handleSaveTaskDetail}
          onRequestConfirm={requestConfirm}
        />
      )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        language={language}
        confirmLabel={confirmDialog?.confirmLabel}
        variant={confirmDialog?.variant ?? (confirmDialog?.mode === 'alert' ? 'info' : 'danger')}
        mode={confirmDialog?.mode ?? 'confirm'}
        loading={deletingProject}
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={closeConfirm}
      />

      <ProjectActivityHistoryPanel
        open={showActivityHistory}
        onClose={() => setShowActivityHistory(false)}
        activities={projectActivities}
        language={language}
        projectName={project.name}
      />

    </div>
  );
}

/* ─── Rental Booking Form ─── */
function RentalOwnerStatement({ project, language, canManage, onSave }: { project: Project; language: Language; canManage: boolean; onSave: (project: Project) => Promise<void>; }) {
  const property = project.rentalProperty;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [commissionRate, setCommissionRate] = useState(property?.monthlyCommissionRates?.[currentMonth] ?? property?.commissionRate ?? 0);
  const [saving, setSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<NonNullable<RentalOwnerPayment['method']>>('bank_transfer');
  const [paymentNotes, setPaymentNotes] = useState('');

  useEffect(() => {
    setCommissionRate(property?.monthlyCommissionRates?.[selectedMonth] ?? property?.commissionRate ?? 0);
  }, [property?.commissionRate, property?.monthlyCommissionRates, selectedMonth]);

  if (!property) return null;
  const [year, month] = selectedMonth.split('-').map(Number);
  const end = Date.UTC(year, month, 1);
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = new Date(end).toISOString().slice(0, 10);
  const stays = (project.rentalBookings || [])
    .filter((booking) => booking.status !== 'cancelled' && booking.checkIn < monthEnd && booking.checkOut > monthStart)
    .map((booking) => ({ booking, ...bookingMonthSlice(booking, project, monthStart, monthEnd) }))
    .filter((stay) => stay.nights > 0);
  const expenses = project.expenses.filter((expense) => expense.date.slice(0, 7) === selectedMonth);
  const ownerExpenses = expenses.filter(isOwnerExpense);
  const ownerPayments = (project.rentalOwnerPayments || []).filter((payment) => (payment.period || payment.date).slice(0, 7) === selectedMonth);
  const gross = stays.reduce((sum, stay) => sum + stay.amount, 0);
  const nights = stays.reduce((sum, stay) => sum + stay.nights, 0);
  const expenseTotal = ownerExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const commission = stays.reduce((sum, stay) => sum + stay.commission, 0);
  const cleaningTotal = stays.reduce((sum, stay) => sum + stay.cleaning, 0);
  const ownerPaid = ownerPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const ownerPayout = gross - commission - cleaningTotal - expenseTotal;
  const remainingPayout = ownerPayout - ownerPaid;
  const monthLabel = new Intl.DateTimeFormat(
    language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar-MA' : 'en-US',
    { month: 'long', year: 'numeric' }
  ).format(new Date(`${selectedMonth}-01T12:00:00`));

  const saveRate = async () => {
    if (!canManage) return;
    setSaving(true);
    const finalRate = Math.max(0, commissionRate);
    const affectedBookingIds = new Set(stays.map(({ booking }) => booking.id));
    await onSave({
      ...project,
      rentalProperty: {
        ...property,
        monthlyCommissionRates: { ...(property.monthlyCommissionRates || {}), [selectedMonth]: finalRate },
      },
      rentalBookings: (project.rentalBookings || []).map((booking) => {
        if (!affectedBookingIds.has(booking.id)) return booking;
        if (booking.commissionRate !== undefined) return booking;
        const bookingCommission = Math.round(booking.totalAmount * finalRate) / 100;
        const cleaning = booking.cleaningChargeTo === 'owner' ? booking.cleaningFee || 0 : 0;
        return { ...booking, commission: bookingCommission, ownerPayout: booking.totalAmount - bookingCommission - cleaning };
      }),
    });
    setSaving(false);
  };

  const addOwnerPayment = async () => {
    if (!canManage || paymentAmount <= 0 || !paymentDate) return;
    setSaving(true);
    await onSave({
      ...project,
      rentalOwnerPayments: [...(project.rentalOwnerPayments || []), {
        id: `owner_payment_${Date.now()}`,
        date: paymentDate,
        amount: Math.max(0, paymentAmount),
        method: paymentMethod,
        notes: paymentNotes.trim() || undefined,
        period: selectedMonth,
      }],
    });
    setPaymentAmount(0);
    setPaymentNotes('');
    setSaving(false);
  };

  return <section className="rounded-lg border border-purple-200 bg-white shadow-sm dark:border-purple-900/60 dark:bg-slate-900">
    <div className="flex max-w-full flex-col gap-3 overflow-x-auto border-b border-purple-100 bg-purple-50/60 px-4 py-3 dark:border-purple-900/50 dark:bg-purple-950/20 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><DollarSign className="h-4 w-4 text-purple-600" />{rentalText(language, 'Monthly owner statement', 'Relevé mensuel propriétaire')}</h3><p className="mt-0.5 text-[11px] text-slate-500">{property.ownerName} · {monthLabel}</p></div>
      <div className="flex items-end gap-2"><label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-400">{rentalText(language, 'Month', 'Mois')}</span><DatePickerInput type="month" value={selectedMonth} onChange={setSelectedMonth} ariaLabel={rentalText(language, 'Month', 'Mois')} className="w-40" /></label><label className="w-24"><span className="mb-1 block text-[9px] font-bold uppercase text-slate-400">{rentalText(language, 'Default rate', 'Commission défaut')}</span><div className="relative"><input type="number" min="0" step="0.01" disabled={!canManage} value={commissionRate} onChange={(event) => setCommissionRate(Math.max(0, Number(event.target.value) || 0))} className="h-9 w-full rounded-md border border-purple-300 bg-white px-2 pr-5 text-right font-mono text-xs font-bold disabled:opacity-60 dark:border-purple-800 dark:bg-slate-950" /><span className="pointer-events-none absolute right-2 top-2 text-xs text-slate-400">%</span></div></label>{canManage && <button type="button" onClick={saveRate} disabled={saving} className="h-9 rounded-md bg-purple-600 px-3 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-60">{saving ? '...' : (rentalText(language, 'Save rate', 'Enregistrer'))}</button>}</div>
    </div>
    <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-3 xl:grid-cols-6">
      <StatementMetric label={rentalText(language, 'Nights', 'Nuits')} value={String(nights)} />
      <StatementMetric label={rentalText(language, 'Gross revenue', 'Revenus bruts')} value={`${gross.toLocaleString()} ${project.currency}`} />
      <StatementMetric label={rentalText(language, 'Our commission', 'Notre commission')} value={`${commission.toLocaleString()} ${project.currency}`} accent="text-emerald-600 dark:text-emerald-400" />
      <StatementMetric label={rentalText(language, 'Owner cleaning', 'Ménage propriétaire')} value={`${cleaningTotal.toLocaleString()} ${project.currency}`} />
      <StatementMetric label={rentalText(language, 'Already paid', 'Déjà versé')} value={`${ownerPaid.toLocaleString()} ${project.currency}`} />
      <StatementMetric label={rentalText(language, 'Remaining payout', 'Reste à verser')} value={`${remainingPayout.toLocaleString()} ${project.currency}`} accent="text-purple-700 dark:text-purple-300" />
    </div>
    <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.8fr)]"><div className="min-w-0"><h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{rentalText(language, 'Client stays', 'Séjours clients')}</h4><div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[30rem] text-left text-xs"><thead className="bg-slate-50 text-[9px] font-bold uppercase text-slate-400 dark:bg-slate-950"><tr><th className="px-3 py-2">{rentalText(language, 'Client', 'Client')}</th><th className="px-3 py-2">{rentalText(language, 'Stay', 'Séjour')}</th><th className="px-3 py-2 text-right">{rentalText(language, 'Nights', 'Nuits')}</th><th className="px-3 py-2 text-right">{rentalText(language, 'Commission', 'Commission')}</th><th className="px-3 py-2 text-right">{rentalText(language, 'Amount', 'Montant')}</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{stays.length === 0 ? <tr><td colSpan={5} className="px-3 py-7 text-center text-slate-400">{rentalText(language, 'No stays for this month.', 'Aucun séjour pour ce mois.')}</td></tr> : stays.map(({ booking, nights: stayNights, amount, commission: stayCommission, commissionRate: stayRate, cleaning }) => <tr key={booking.id}><td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">{booking.clientName}<span className="mt-0.5 block text-[10px] font-normal text-slate-400">{booking.source || rentalText(language, 'Direct', 'Direct')}{cleaning > 0 ? ` · ${rentalText(language, 'cleaning', 'ménage')} ${cleaning}` : ''}</span></td><td className="px-3 py-2.5 font-mono text-[10px] text-slate-500">{booking.checkIn} - {booking.checkOut}</td><td className="px-3 py-2.5 text-right font-mono">{stayNights}</td><td className="px-3 py-2.5 text-right font-mono">{stayRate}% · {stayCommission.toLocaleString()}</td><td className="px-3 py-2.5 text-right font-mono font-bold">{amount.toLocaleString()} {project.currency}</td></tr>)}</tbody></table></div></div><div><h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{rentalText(language, 'Apartment expenses', 'Dépenses appartement')}</h4><div className="space-y-1.5">{expenses.length === 0 ? <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-800">{rentalText(language, 'No expenses this month.', 'Aucune dépense ce mois.')}</div> : expenses.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/50"><div className="min-w-0"><p className="truncate font-semibold">{expense.title}</p><p className="mt-0.5 text-[10px] text-slate-400">{expense.date} · {expense.rentalChargeTo || 'owner'}{expense.supplier ? ` · ${expense.supplier}` : ''}</p></div><span className={`shrink-0 font-mono font-bold ${isOwnerExpense(expense) ? 'text-rose-600' : 'text-slate-500'}`}>{isOwnerExpense(expense) ? '-' : ''}{expense.amount.toLocaleString()} {project.currency}</span></div>)}<div className="flex justify-between border-t border-slate-200 pt-2 text-xs font-bold dark:border-slate-800"><span>{rentalText(language, 'Owner deductions', 'Déduction propriétaire')}</span><span className="font-mono text-rose-600">-{expenseTotal.toLocaleString()} {project.currency}</span></div></div></div></div>
    <div className="border-t border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-2 flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{rentalText(language, 'Owner payments', 'Versements au propriétaire')}</h4><span className="font-mono text-xs font-bold text-purple-700 dark:text-purple-300">{ownerPaid.toLocaleString()} {project.currency}</span></div>
      {canManage && <div className="grid gap-2 sm:grid-cols-[8rem_8rem_10rem_minmax(0,1fr)_auto]">
        <DatePickerInput value={paymentDate} onChange={setPaymentDate} ariaLabel={rentalText(language, 'Payment date', 'Date du paiement')} />
        <input type="number" min={0} step="any" value={paymentAmount || ''} onChange={(event) => setPaymentAmount(Math.max(0, Number(event.target.value) || 0))} placeholder={rentalText(language, 'Amount', 'Montant')} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-xs dark:border-slate-800 dark:bg-slate-950" />
        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as NonNullable<RentalOwnerPayment['method']>)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-950"><option value="bank_transfer">{rentalText(language, 'Bank transfer', 'Virement')}</option><option value="cash">{rentalText(language, 'Cash', 'Espèces')}</option><option value="offset">{rentalText(language, 'Offset', 'Compensation')}</option><option value="other">{rentalText(language, 'Other', 'Autre')}</option></select>
        <input value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder={rentalText(language, 'Reference or note', 'Référence ou note')} className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-950" />
        <button type="button" onClick={addOwnerPayment} disabled={saving || paymentAmount <= 0} className="h-9 rounded-md bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950">{rentalText(language, 'Record payment', 'Enregistrer')}</button>
      </div>}
      {ownerPayments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{ownerPayments.map((payment) => <span key={payment.id} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{payment.date} · {payment.amount.toLocaleString()} · {payment.method}</span>)}</div>}
    </div>
  </section>;
}

function StatementMetric({ label, value, accent = 'text-slate-900 dark:text-white' }: { label: string; value: string; accent?: string }) {
  return <div className="bg-white px-3 py-2.5 dark:bg-slate-900"><span className="block text-[9px] font-bold uppercase text-slate-400">{label}</span><span className={`mt-1 block font-mono text-sm font-bold ${accent}`}>{value}</span></div>;
}

function RentalBookingForm({ project, language, t, onSave }: {
  project: Project;
  language: Language;
  t: any;
  onSave: (p: Project) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [numGuests, setNumGuests] = useState(1);
  const [paidAmount, setPaidAmount] = useState(0);
  const [bookingSource, setBookingSource] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [nightlyRate, setNightlyRate] = useState(project.rentalProperty?.pricePerNight || 0);
  const [commissionRate, setCommissionRate] = useState('');
  const [cleaningFee, setCleaningFee] = useState(0);
  const [cleaningChargeTo, setCleaningChargeTo] = useState<NonNullable<RentalBooking['cleaningChargeTo']>>('owner');
  const [bookingError, setBookingError] = useState('');

  if (!project.rentalProperty) return null;

  const ppn = project.rentalProperty.pricePerNight;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !checkIn || !checkOut) return;
    if (checkOut <= checkIn) {
      setBookingError(
        language === 'fr'
          ? 'La date de départ doit être après la date d’arrivée.'
          : language === 'ar'
            ? 'يجب أن يكون تاريخ الخروج بعد تاريخ الدخول.'
            : 'Check-out must be after check-in.'
      );
      return;
    }
    setBookingError('');
    const nights = rentalDaysBetween(checkIn, checkOut);
    const finalNightlyRate = Math.max(0, nightlyRate);
    const total = nights * finalNightlyRate;
    const bookingCommissionRate = commissionRate === '' ? undefined : Math.max(0, Number(commissionRate) || 0);
    const commission = bookingCommissionRate === undefined ? 0 : Math.round(total * bookingCommissionRate) / 100;
    const ownerCleaning = cleaningChargeTo === 'owner' ? Math.max(0, cleaningFee) : 0;
    const status = rentalBookingStatusForDates(checkIn, checkOut);
    const initialPaidAmount = Math.min(total, Math.max(0, paidAmount));
    const initialPayment: RentalBookingPayment | null = initialPaidAmount > 0
      ? {
          id: `payment_${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          amount: initialPaidAmount,
          method: 'other',
          notes: rentalText(language, 'Initial payment', 'Paiement initial'),
          receiptNumber: generateDocNumber(DEFAULT_DOC_PRESETS.receipt.prefix),
          recordedAt: new Date().toISOString(),
        }
      : null;
    const booking: RentalBooking = {
      id: `book_${Date.now()}`,
      clientName: guestName,
      clientPhone: guestPhone,
      numberOfGuests: numGuests,
      checkIn,
      checkOut,
      totalNights: nights,
      totalAmount: total,
      nightlyRate: finalNightlyRate,
      ...(bookingCommissionRate === undefined ? {} : { commissionRate: bookingCommissionRate }),
      commission,
      cleaningFee: Math.max(0, cleaningFee),
      cleaningChargeTo,
      ownerPayout: total - commission - ownerCleaning,
      status,
      source: bookingSource,
      notes: bookingNotes,
      paidAmount: initialPaidAmount,
      balanceDue: Math.max(0, total - initialPaidAmount),
      paymentOpeningBalance: 0,
      payments: initialPayment ? [initialPayment] : [],
      historicalEntry: status === 'completed',
      recordedAt: new Date().toISOString(),
    };

    const updated: Project = {
      ...project,
      rentalBookings: [...(project.rentalBookings || []), booking],
    };
    await onSave(updated);
    setGuestName('');
    setGuestPhone('');
    setCheckIn('');
    setCheckOut('');
    setNumGuests(1);
    setPaidAmount(0);
    setBookingSource('');
    setBookingNotes('');
    setNightlyRate(ppn);
    setCommissionRate('');
    setCleaningFee(0);
    setCleaningChargeTo('owner');
    setBookingError('');
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
      >
        <div className="flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" />
          {t.rental.addBooking}
        </div>
      </button>
    );
  }

  const dateRangeValid = Boolean(checkIn && checkOut && checkOut > checkIn);
  const nights = dateRangeValid ? rentalDaysBetween(checkIn, checkOut) : 0;
  const previewTotal = nights * Math.max(0, nightlyRate);
  const previewStatus = dateRangeValid ? rentalBookingStatusForDates(checkIn, checkOut) : null;

  return (
    <form onSubmit={handleAdd} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-slate-900 dark:text-white">{t.rental.addBooking}</h4>
        <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.clientName}</label>
          <input required type="text" value={guestName} onChange={e => setGuestName(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.clientPhone}</label>
          <input type="text" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.checkIn}</label>
          <DatePickerInput required value={checkIn} onChange={(value) => { setCheckIn(value); setBookingError(''); }} ariaLabel={t.rental.checkIn} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.checkOut}</label>
          <DatePickerInput required min={checkIn || undefined} value={checkOut} onChange={(value) => { setCheckOut(value); setBookingError(''); }} ariaLabel={t.rental.checkOut} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.numberOfGuests}</label>
          <input type="number" min={1} value={numGuests} onChange={e => setNumGuests(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{t.rental.paidAmount}</label>
          <input type="number" min={0} value={paidAmount || ''} onChange={e => setPaidAmount(Number(e.target.value))} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{rentalText(language, 'Nightly rate', 'Prix par nuit')}</label>
          <input type="number" min={0} step="any" value={nightlyRate || ''} onChange={e => setNightlyRate(Math.max(0, Number(e.target.value) || 0))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{rentalText(language, 'Booking commission', 'Commission du séjour')}</label>
          <div className="relative">
            <input type="number" min={0} max={100} step="any" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} placeholder={rentalText(language, 'Decide later', 'Décider plus tard')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-7 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
            <span className="pointer-events-none absolute right-3 top-2 text-xs text-slate-400">%</span>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{rentalText(language, 'Cleaning fee', 'Frais de ménage')}</label>
          <input type="number" min={0} step="any" value={cleaningFee || ''} onChange={e => setCleaningFee(Math.max(0, Number(e.target.value) || 0))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{rentalText(language, 'Cleaning charged to', 'Ménage à la charge de')}</label>
          <select value={cleaningChargeTo} onChange={e => setCleaningChargeTo(e.target.value as NonNullable<RentalBooking['cleaningChargeTo']>)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
            <option value="owner">{rentalText(language, 'Owner', 'Propriétaire')}</option>
            <option value="guest">{rentalText(language, 'Guest', 'Client')}</option>
            <option value="management">{rentalText(language, 'Management', 'Notre société')}</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{language === 'en' ? 'Booking Source' : language === 'fr' ? 'Source réservation' : 'مصدر الحجز'}</label>
          <input type="text" value={bookingSource} onChange={e => setBookingSource(e.target.value)} placeholder="Airbnb, Booking, Direct..." className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </div>
      </div>
      <textarea rows={2} value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} placeholder={language === 'en' ? 'Check-in, checkout, cleaning, or guest notes...' : language === 'fr' ? 'Notes arrivée, départ, ménage ou client...' : 'ملاحظات الدخول، الخروج، التنظيف أو العميل...'} className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
      {bookingError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
          {bookingError}
        </p>
      )}
      {nights > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1 dark:border-slate-800">
            <span>{rentalText(language, 'Stay status', 'Statut du séjour')}</span>
            <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700 shadow-sm dark:bg-slate-900 dark:text-purple-300">
              {previewStatus === 'completed'
                ? (rentalText(language, 'Historical', 'Historique'))
                : previewStatus === 'active'
                  ? (rentalText(language, 'Active', 'En cours'))
                  : (rentalText(language, 'Upcoming', 'À venir'))}
            </span>
          </div>
          <div className="flex justify-between"><span>{nights} {t.rental.nights} × {nightlyRate} {project.currency}</span><span>{previewTotal} {project.currency}</span></div>
          <div className="flex justify-between"><span>{t.rental.balanceDue}</span><span>{Math.max(0, previewTotal - Math.max(0, paidAmount))} {project.currency}</span></div>
          <div className="border-t border-slate-200 pt-1 text-[10px] text-slate-400 dark:border-slate-800">{commissionRate === '' ? (rentalText(language, 'Commission will be decided in the monthly statement.', 'La commission sera décidée dans le relevé mensuel.')) : `${commissionRate}% ${rentalText(language, 'for this booking', 'pour ce séjour')}`}</div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer">{language === 'en' ? 'Cancel' : language === 'fr' ? 'Annuler' : 'إلغاء'}</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white cursor-pointer shadow-sm">{t.rental.addBooking}</button>
      </div>
    </form>
  );
}

/* ─── Rental Booking List ─── */
function RentalBookingList({
  project,
  language,
  t,
  onUpdate,
  onPrepareReceipt,
  onRequestConfirm,
  canManage,
}: {
  project: Project;
  language: Language;
  t: any;
  onUpdate: (p: Project) => Promise<void>;
  onPrepareReceipt: (booking: RentalBooking, payment: RentalBookingPayment) => void;
  onRequestConfirm: (request: ConfirmRequest) => void;
  canManage: boolean;
}) {
  const bookings = project.rentalBookings || [];
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [paymentBookingId, setPaymentBookingId] = useState<string | null>(null);

  if (bookings.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-xs">
        <Building className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>{t.rental.noBookings}</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    upcoming: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };

  const statusLabels: Record<string, string> = {
    upcoming: t.rental.statuses.upcoming,
    active: t.rental.statuses.active,
    completed: t.rental.statuses.completed,
    cancelled: t.rental.statuses.cancelled,
  };

  const handleStatusChange = async (bookingId: string, newStatus: RentalBookingStatus) => {
    const updated: Project = {
      ...project,
      rentalBookings: (project.rentalBookings || []).map(b =>
        b.id === bookingId ? { ...b, status: newStatus } : b
      ),
    };
    await onUpdate(updated);
  };

  const requestDeleteBooking = (booking: RentalBooking) => {
    onRequestConfirm({
      title: rentalText(language, 'Delete booking?', 'Supprimer la réservation ?'),
      message: language === 'fr'
        ? `Supprimer définitivement la réservation de « ${booking.clientName} » du ${booking.checkIn} au ${booking.checkOut}, avec son historique de paiements ?`
        : language === 'ar'
          ? `حذف حجز « ${booking.clientName} » نهائياً من ${booking.checkIn} إلى ${booking.checkOut} مع سجل مدفوعاته؟`
          : `Permanently remove ${booking.clientName}'s booking from ${booking.checkIn} to ${booking.checkOut}, including its payment history?`,
      confirmLabel: rentalText(language, 'Delete booking', 'Supprimer la réservation'),
      onConfirm: async () => {
        const updated: Project = {
          ...project,
          rentalBookings: (project.rentalBookings || []).filter((item) => item.id !== booking.id),
        };
        await onUpdate(updated);
      },
    });
  };

  const sorted = [...bookings].sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
        <Calendar className="w-4 h-4" />
        {t.rental.bookings} ({bookings.length})
      </h4>
      {sorted.map(b => (
        <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{b.clientName}</p>
                {b.clientPhone && <span className="text-[10px] text-slate-400">{b.clientPhone}</span>}
                {b.source && <span className="text-[10px] text-slate-400">{b.source}</span>}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[b.status]}`}>
                  {statusLabels[b.status]}
                </span>
                {b.historicalEntry && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                    title={b.recordedAt ? new Date(b.recordedAt).toLocaleString() : undefined}
                  >
                    <Clock className="h-3 w-3" />
                    {rentalText(language, 'Historical', 'Historique')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{b.checkIn} → {b.checkOut}</span>
                <span>{b.totalNights} {t.rental.nights}</span>
                <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{b.numberOfGuests} {b.numberOfGuests > 1 ? (language === 'en' ? 'guests' : language === 'fr' ? 'invités' : 'ضيوف') : (language === 'en' ? 'guest' : language === 'fr' ? 'invité' : 'ضيف')}</span>
              </div>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold text-slate-900 dark:text-white">{b.totalAmount} {project.currency}</p>
              {rentalBookingCommission(b, project) > 0
                || b.commissionRate !== undefined
                || project.rentalProperty?.monthlyCommissionRates?.[b.checkIn.slice(0, 7)] !== undefined ? (
                <>
                  <p className="text-emerald-600 dark:text-emerald-400 text-[10px]">{t.rental.commission}: {rentalBookingCommissionRate(b, project)}% · {rentalBookingCommission(b, project)} {project.currency}</p>
                  <p className="text-slate-400 text-[10px]">{rentalText(language, 'Cleaning', 'Ménage')}: {b.cleaningFee || 0} {project.currency}</p>
                </>
              ) : (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{rentalText(language, 'Commission pending the monthly owner statement.', 'Commission à décider dans le relevé mensuel.')}</p>
              )}
              <p className="text-slate-400 text-[10px]">
                {t.rental.paidAmount}: {rentalBookingPaidAmount(b)} | {t.rental.balanceDue}: {rentalBookingBalanceDue(b)}
              </p>
              {rentalBookingOverpayment(b) > 0 && (
                <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                  {rentalText(language, 'Overpayment / refund', 'Trop-perçu / remboursement')}: {rentalBookingOverpayment(b)} {project.currency}
                </p>
              )}
            </div>
          </div>
          {b.notes && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
              {b.notes}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <select
              value={b.status}
              disabled={!canManage}
              onChange={e => handleStatusChange(b.id, e.target.value as RentalBookingStatus)}
              className="text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer disabled:cursor-default disabled:opacity-60"
            >
              <option value="upcoming">{t.rental.statuses.upcoming}</option>
              <option value="active">{t.rental.statuses.active}</option>
              <option value="completed">{t.rental.statuses.completed}</option>
              <option value="cancelled">{t.rental.statuses.cancelled}</option>
            </select>
            {canManage && <button
              type="button"
              onClick={() => setEditingBookingId(editingBookingId === b.id ? null : b.id)}
              className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/30 dark:hover:text-purple-300"
              title={rentalText(language, 'Edit booking', 'Modifier le séjour')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>}
            {canManage && <button
              type="button"
              onClick={() => setPaymentBookingId(paymentBookingId === b.id ? null : b.id)}
              className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-[10px] font-bold transition-colors ${
                paymentBookingId === b.id
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300'
              }`}
              title={rentalText(language, 'Payments and receipts', 'Paiements et reçus')}
            >
              <CreditCard className="h-3.5 w-3.5" />
              {rentalText(language, 'Payments', 'Paiements')}
            </button>}
            {canManage && <button
              type="button"
              onClick={() => requestDeleteBooking(b)}
              title={rentalText(language, 'Delete booking', 'Supprimer la réservation')}
              className="text-[10px] text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>}
          </div>
          {editingBookingId === b.id && (
            <RentalBookingEditor
              booking={b}
              project={project}
              language={language}
              onCancel={() => setEditingBookingId(null)}
              onSave={async (nextBooking) => {
                await onUpdate({
                  ...project,
                  rentalBookings: bookings.map((booking) => booking.id === nextBooking.id ? nextBooking : booking),
                });
                setEditingBookingId(null);
              }}
            />
          )}
          {paymentBookingId === b.id && (
            <RentalBookingPayments
              booking={b}
              project={project}
              language={language}
              onPrepareReceipt={onPrepareReceipt}
              onRequestConfirm={onRequestConfirm}
              onSave={async (nextBooking) => {
                await onUpdate({
                  ...project,
                  rentalBookings: bookings.map((booking) =>
                    booking.id === nextBooking.id ? nextBooking : booking
                  ),
                });
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function RentalBookingPayments({
  booking,
  project,
  language,
  onSave,
  onPrepareReceipt,
  onRequestConfirm,
}: {
  booking: RentalBooking;
  project: Project;
  language: Language;
  onSave: (booking: RentalBooking) => Promise<void>;
  onPrepareReceipt: (booking: RentalBooking, payment: RentalBookingPayment) => void;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<RentalPaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [prepareReceipt, setPrepareReceipt] = useState(true);
  const [saving, setSaving] = useState(false);

  const paid = rentalBookingPaidAmount(booking);
  const balance = rentalBookingBalanceDue(booking);
  const overpayment = rentalBookingOverpayment(booking);
  const validAmount = Math.max(0, Number(amount) || 0);
  const projectedPaid = paid + validAmount;
  const projectedBalance = Math.max(0, booking.totalAmount - projectedPaid);

  const savePayment = async () => {
    if (!date || validAmount <= 0 || validAmount > balance) return;
    setSaving(true);
    const payment: RentalBookingPayment = {
      id: `payment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date,
      amount: validAmount,
      method,
      notes: notes.trim(),
      receiptNumber: generateDocNumber(DEFAULT_DOC_PRESETS.receipt.prefix),
      recordedAt: new Date().toISOString(),
    };
    const nextBooking = addRentalBookingPayment(booking, payment);
    try {
      await onSave(nextBooking);
      if (prepareReceipt) onPrepareReceipt(nextBooking, payment);
      setAmount(0);
      setNotes('');
      setDate(today);
    } finally {
      setSaving(false);
    }
  };

  const removePayment = (payment: RentalBookingPayment) => {
    onRequestConfirm({
      title: rentalText(language, 'Remove this payment?', 'Supprimer ce paiement ?'),
      message:
        language === 'fr'
          ? `Supprimer ${payment.amount} ${project.currency} payé le ${payment.date}. Le solde du client sera recalculé.`
          : language === 'ar'
            ? `حذف دفعة ${payment.amount} ${project.currency} المسجلة بتاريخ ${payment.date}. سيُعاد حساب رصيد العميل.`
            : `Remove ${payment.amount} ${project.currency} paid on ${payment.date}. The guest balance will be recalculated.`,
      confirmLabel: rentalText(language, 'Remove payment', 'Supprimer'),
      variant: 'danger',
      onConfirm: async () => {
        await onSave(removeRentalBookingPayment(booking, payment.id));
      },
    });
  };

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/15">
      <div className="grid grid-cols-2 divide-x divide-y divide-emerald-100 sm:grid-cols-4 sm:divide-y-0 dark:divide-emerald-900/50">
        <PaymentMetric label={rentalText(language, 'Booking total', 'Total séjour')} value={`${booking.totalAmount} ${project.currency}`} />
        <PaymentMetric label={rentalText(language, 'Paid to date', 'Déjà payé')} value={`${paid} ${project.currency}`} accent="text-emerald-700 dark:text-emerald-300" />
        <PaymentMetric label={rentalText(language, 'Payment due', 'À encaisser')} value={`${balance} ${project.currency}`} accent={balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'} />
        <PaymentMetric label={rentalText(language, 'After this payment', 'Après ce paiement')} value={`${projectedBalance} ${project.currency}`} />
      </div>

      {overpayment > 0 && (
        <div className="border-t border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
          {rentalText(language, 'Overpayment to refund', 'Trop-perçu à rembourser')}: {overpayment} {project.currency}
        </div>
      )}

      <div className="grid gap-2 border-t border-emerald-100 p-3 dark:border-emerald-900/50 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-1">
          <span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Amount received', 'Montant reçu')}</span>
          <input type="number" min={0} max={balance} step="any" value={amount || ''} onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-xs dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <label>
          <span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Payment date', 'Date')}</span>
          <DatePickerInput value={date} onChange={setDate} ariaLabel={rentalText(language, 'Payment date', 'Date du paiement')} />
        </label>
        <label>
          <span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Method', 'Mode')}</span>
          <select value={method} onChange={(event) => setMethod(event.target.value as RentalPaymentMethod)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-950">
            <option value="cash">{rentalText(language, 'Cash', 'Espèces')}</option>
            <option value="bank_transfer">{rentalText(language, 'Bank transfer', 'Virement')}</option>
            <option value="card">{rentalText(language, 'Card', 'Carte')}</option>
            <option value="online">{rentalText(language, 'Online', 'En ligne')}</option>
            <option value="other">{rentalText(language, 'Other', 'Autre')}</option>
          </select>
        </label>
        <label className="sm:col-span-2 lg:col-span-2">
          <span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Reference / notes', 'Référence / notes')}</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={rentalText(language, 'Deposit, transfer reference...', 'Acompte, référence...')} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-950" />
        </label>
        <div className="flex flex-col justify-end gap-1">
          <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={prepareReceipt} onChange={(event) => setPrepareReceipt(event.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
            {rentalText(language, 'Prepare receipt', 'Préparer le reçu')}
          </label>
          <button type="button" onClick={savePayment} disabled={saving || balance <= 0 || validAmount <= 0 || validAmount > balance} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
            <CreditCard className="h-3.5 w-3.5" />
            {saving ? '...' : rentalText(language, 'Record payment', 'Enregistrer')}
          </button>
        </div>
      </div>

      {(booking.payments?.length || rentalBookingOpeningBalance(booking) > 0) && (
        <div className="border-t border-emerald-100 px-3 py-2 dark:border-emerald-900/50">
          <p className="mb-2 text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Payment history', 'Historique des paiements')}</p>
          <div className="space-y-1.5">
            {rentalBookingOpeningBalance(booking) > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/80 px-2.5 py-2 text-[10px] dark:bg-slate-950/60">
                <span className="font-semibold text-slate-600 dark:text-slate-300">{rentalText(language, 'Paid before detailed tracking', 'Solde payé avant le suivi détaillé')}</span>
                <span className="font-mono font-bold">{rentalBookingOpeningBalance(booking)} {project.currency}</span>
              </div>
            )}
            {(booking.payments || []).map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/80 px-2.5 py-2 dark:bg-slate-950/60">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-800 dark:text-slate-100">{payment.amount} {project.currency} · {payment.date}</p>
                  <p className="truncate text-[9px] text-slate-400">{payment.method.replace('_', ' ')}{payment.notes ? ` · ${payment.notes}` : ''} · {payment.receiptNumber}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => onPrepareReceipt(booking, payment)} className="inline-flex h-7 items-center gap-1 rounded px-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-950/50" title={rentalText(language, 'Open receipt', 'Ouvrir le reçu')}>
                    <ReceiptText className="h-3.5 w-3.5" />
                    {rentalText(language, 'Receipt', 'Reçu')}
                  </button>
                  <button type="button" onClick={() => removePayment(payment)} className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30" title={rentalText(language, 'Remove payment', 'Supprimer le paiement')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentMetric({ label, value, accent = 'text-slate-900 dark:text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white/75 px-3 py-2.5 dark:bg-slate-950/40">
      <span className="block text-[9px] font-bold uppercase text-slate-400">{label}</span>
      <span className={`mt-1 block font-mono text-sm font-bold ${accent}`}>{value}</span>
    </div>
  );
}

function RentalBookingEditor({
  booking,
  project,
  language,
  onCancel,
  onSave,
}: {
  booking: RentalBooking;
  project: Project;
  language: Language;
  onCancel: () => void;
  onSave: (booking: RentalBooking) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    clientName: booking.clientName,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nightlyRate: rentalBookingRate(booking, project.rentalProperty?.pricePerNight),
    commissionRate: rentalBookingCommissionRate(booking, project),
    cleaningFee: booking.cleaningFee || 0,
    cleaningChargeTo: booking.cleaningChargeTo || 'owner',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.clientName.trim() || !draft.checkIn || !draft.checkOut || draft.checkOut <= draft.checkIn) return;
    setSaving(true);
    const totalNights = Math.max(1, Math.round(
      (new Date(`${draft.checkOut}T12:00:00`).getTime() - new Date(`${draft.checkIn}T12:00:00`).getTime()) / 86_400_000
    ));
    const totalAmount = Math.round(totalNights * Math.max(0, draft.nightlyRate) * 100) / 100;
    const commissionRate = Math.max(0, draft.commissionRate);
    const commission = Math.round(totalAmount * commissionRate) / 100;
    const ownerCleaning = draft.cleaningChargeTo === 'owner' ? Math.max(0, draft.cleaningFee) : 0;
    await onSave(syncRentalBookingPaymentTotals({
      ...booking,
      clientName: draft.clientName.trim(),
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      totalNights,
      nightlyRate: Math.max(0, draft.nightlyRate),
      totalAmount,
      commissionRate,
      commission,
      cleaningFee: Math.max(0, draft.cleaningFee),
      cleaningChargeTo: draft.cleaningChargeTo as NonNullable<RentalBooking['cleaningChargeTo']>,
      ownerPayout: Math.round((totalAmount - commission - ownerCleaning) * 100) / 100,
      status: booking.status === 'cancelled'
        ? 'cancelled'
        : rentalBookingStatusForDates(draft.checkIn, draft.checkOut),
    }));
    setSaving(false);
  };

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-900/60 dark:bg-purple-950/20 sm:grid-cols-4">
      <label className="col-span-2"><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Guest', 'Client')}</span><input value={draft.clientName} onChange={(event) => setDraft({ ...draft, clientName: event.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-950" /></label>
      <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Check-in', 'Arrivée')}</span><DatePickerInput value={draft.checkIn} onChange={(value) => setDraft({ ...draft, checkIn: value })} ariaLabel={rentalText(language, 'Check-in', 'Arrivée')} inputClassName="h-8 text-[10px]" /></label>
      <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Check-out', 'Départ')}</span><DatePickerInput value={draft.checkOut} min={draft.checkIn || undefined} onChange={(value) => setDraft({ ...draft, checkOut: value })} ariaLabel={rentalText(language, 'Check-out', 'Départ')} inputClassName="h-8 text-[10px]" /></label>
      <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Rate / night', 'Prix / nuit')}</span><input type="number" min={0} step="any" value={draft.nightlyRate} onChange={(event) => setDraft({ ...draft, nightlyRate: Math.max(0, Number(event.target.value) || 0) })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-xs dark:border-slate-800 dark:bg-slate-950" /></label>
      <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">Commission %</span><input type="number" min={0} max={100} step="any" value={draft.commissionRate} onChange={(event) => setDraft({ ...draft, commissionRate: Math.max(0, Number(event.target.value) || 0) })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-xs dark:border-slate-800 dark:bg-slate-950" /></label>
      <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Cleaning', 'Ménage')}</span><input type="number" min={0} step="any" value={draft.cleaningFee} onChange={(event) => setDraft({ ...draft, cleaningFee: Math.max(0, Number(event.target.value) || 0) })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-xs dark:border-slate-800 dark:bg-slate-950" /></label>
      <label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Cleaning paid by', 'Ménage payé par')}</span><select value={draft.cleaningChargeTo} onChange={(event) => setDraft({ ...draft, cleaningChargeTo: event.target.value as typeof draft.cleaningChargeTo })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-950"><option value="owner">{rentalText(language, 'Owner', 'Propriétaire')}</option><option value="guest">{rentalText(language, 'Guest', 'Client')}</option><option value="management">{rentalText(language, 'Management', 'Société')}</option></select></label>
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-4"><button type="button" onClick={onCancel} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-slate-800 dark:bg-slate-950">{rentalText(language, 'Cancel', 'Annuler')}</button><button type="button" disabled={saving} onClick={save} className="h-8 rounded-md bg-purple-600 px-3 text-xs font-bold text-white disabled:opacity-60">{saving ? '...' : (rentalText(language, 'Save changes', 'Enregistrer'))}</button></div>
    </div>
  );
}
