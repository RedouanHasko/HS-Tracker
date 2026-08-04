export type Language = 'en' | 'fr' | 'ar';

export type ProjectStatus = 'planning' | 'in_progress' | 'paused' | 'completed' | 'cancelled';

export type ProjectType = 'construction' | 'service' | 'rental';

export type UserRole = 'read_only' | 'contributor' | 'editor' | 'manager' | 'co_owner' | 'owner';

export type ExpenseCategory = 'materials' | 'workers' | 'equipment' | 'transportation' | 'utilities' | 'cleaning' | 'maintenance' | 'miscellaneous';

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export type TaskPriority = 'low' | 'medium' | 'high';

export type PhotoType = 'before' | 'progress' | 'after';

export interface AppUser {
  email: string;
  name: string;
  avatar?: string;
}

export interface ProjectMember {
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  status?: 'pending' | 'accepted' | 'declined';
  /** Firestore invitation doc id — used to revoke pending invites */
  invitationId?: string;
}

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  sectionId?: string;
  title: string;
  description: string;
  assignedTo: string;
  priority: TaskPriority;
  deadline: string;
  status: TaskStatus;
  subtasks: Subtask[];
  /** Who created this task (email) — used for edit/delete protection */
  createdBy?: string;
  createdByName?: string;
  /** Extended detail fields */
  notes?: string;
  workedBy?: string;
  workCategory?: string;
  costLines?: TaskCostLine[];
  beforeImages?: TaskMedia[];
  afterImages?: TaskMedia[];
  progressImages?: TaskMedia[];
  attachments?: TaskAttachment[];
  /** Scheduling controls used by roadmap variance and dependency reporting. */
  dependencyIds?: string[];
  milestone?: boolean;
  blockedReason?: string;
  baselineDeadline?: string;
}

export type TaskCostType = 'labor' | 'materials' | 'equipment' | 'other';

export interface TaskCostLine {
  id: string;
  label: string;
  type: TaskCostType;
  amount: number;
  notes?: string;
}

/** Photo stored in Firebase Storage (compressed on upload) */
export interface TaskMedia {
  id: string;
  url: string;
  storagePath: string;
  caption?: string;
  uploadDate: string;
  sizeBytes: number;
  originalName: string;
}

/** Invoice, receipt, or other file attached to a task */
export interface TaskAttachment {
  id: string;
  title: string;
  url: string;
  storagePath: string;
  fileType: 'image' | 'pdf' | 'other';
  sizeBytes: number;
  uploadDate: string;
  kind: 'invoice' | 'receipt' | 'other';
}

export interface Expense {
  id: string;
  sectionId?: string; // Optional if global to project
  title: string;
  description: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  date: string;
  paidBy: string; // Member email
  supplier: string;
  /** Legacy URL strings; prefer receiptFiles for new uploads */
  receipts: string[];
  /** Supplier receipt / bon photos (Firestore or Storage) */
  receiptFiles?: TaskMedia[];
  notes?: string;
  /** Who logged this expense */
  createdBy?: string;
  createdByName?: string;
  /** Commission/markup percentage added for client invoicing */
  commissionPercent?: number;
  /** Rental accounting allocation. Existing rental expenses default to owner. */
  rentalChargeTo?: 'owner' | 'management' | 'guest' | 'rent';
  /** Optional stay associated with a rental expense. */
  rentalBookingId?: string;
  /** Stable source key used to make legacy imports idempotent. */
  legacySourceId?: string;
}

export interface Photo {
  id: string;
  sectionId?: string;
  title: string;
  url: string;
  /** Firestore media reference or Firebase Storage object path. */
  storagePath?: string;
  sizeBytes?: number;
  originalName?: string;
  type: PhotoType;
  comments: PhotoComment[];
  tags: string[];
  uploadDate: string;
}

export interface PhotoComment {
  id: string;
  user: string; // name or email
  avatar?: string;
  text: string;
  date: string;
}

export interface Document {
  id: string;
  title: string;
  folder: string; // e.g. "Contracts", "Plans", "Receipts"
  fileType: 'pdf' | 'doc' | 'image' | 'xlsx' | 'other';
  size: string;
  uploadDate: string;
  url?: string;
}

export interface ProjectSection {
  id: string;
  projectId: string;
  title: string;
  progress: number; // 0 - 100
  status: 'planning' | 'in_progress' | 'completed';
  notes?: string;
}

export interface Reimbursement {
  id: string;
  from: string; // member email
  fromName: string;
  to: string; // member email
  toName: string;
  amount: number;
  date: string;
}

export type RentalBookingStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';

export interface RentalProperty {
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  buildingNumber: string;
  pricePerNight: number;
  commissionRate: number;
  /** Commission decisions saved per owner statement month (YYYY-MM). */
  monthlyCommissionRates?: Record<string, number>;
  notes?: string;
}

export interface RentalBooking {
  id: string;
  clientName: string;
  clientPhone: string;
  source?: string;
  numberOfGuests: number;
  checkIn: string;
  checkOut: string;
  totalNights: number;
  totalAmount: number;
  commission: number;
  ownerPayout: number;
  status: RentalBookingStatus;
  notes?: string;
  paidAmount: number;
  balanceDue: number;
  /** Actual rate used for this stay; falls back to totalAmount / totalNights. */
  nightlyRate?: number;
  /** Booking-specific decision. Undefined means use the monthly/property default. */
  commissionRate?: number;
  cleaningFee?: number;
  cleaningChargeTo?: 'owner' | 'management' | 'guest';
  originalCurrency?: string;
  originalAmount?: number;
  exchangeRate?: number;
  legacySourceId?: string;
  /** True when the stay was entered later from previous/manual records. */
  historicalEntry?: boolean;
  /** Audit timestamp for when the record was added to this system. */
  recordedAt?: string;
  /** Existing aggregate retained as an opening balance when payment history is introduced. */
  paymentOpeningBalance?: number;
  /** Individual guest installments. New payments are appended and never overwrite prior entries. */
  payments?: RentalBookingPayment[];
  securityDeposit?: number;
  channelFee?: number;
  taxAmount?: number;
  cancellationFee?: number;
  refunds?: RentalRefund[];
  operations?: RentalStayOperations;
}

export interface RentalRefund {
  id: string;
  date: string;
  amount: number;
  reason?: string;
  method?: RentalPaymentMethod;
  recordedAt: string;
  recordedBy?: string;
}

export interface RentalStayOperations {
  checkInStatus?: 'pending' | 'ready' | 'completed';
  checkOutStatus?: 'pending' | 'completed';
  cleaningStatus?: 'unassigned' | 'assigned' | 'in_progress' | 'completed';
  assignedTo?: string;
  keyHandoverNotes?: string;
  checklist?: Array<{ id: string; title: string; completed: boolean }>;
}

export interface RentalCalendarBlock {
  id: string;
  type: 'tentative_hold' | 'maintenance';
  startDate: string;
  endDate: string;
  title: string;
  notes?: string;
  status: 'active' | 'cancelled';
  createdAt: string;
  createdBy: string;
}

export interface RentalOwnerStatement {
  id: string;
  month: string;
  status: 'finalized' | 'cancelled';
  openingBalance: number;
  grossRevenue: number;
  commission: number;
  cleaning: number;
  channelFees?: number;
  expenses: number;
  ownerPayments: number;
  closingBalance: number;
  finalizedAt: string;
  finalizedBy: string;
}

export type RentalPaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'online' | 'other';

export interface RentalBookingPayment {
  id: string;
  date: string;
  amount: number;
  method: RentalPaymentMethod;
  notes?: string;
  receiptNumber: string;
  recordedAt: string;
  recordedBy?: string;
}

export interface RentalOwnerPayment {
  id: string;
  date: string;
  amount: number;
  method?: 'bank_transfer' | 'cash' | 'offset' | 'other';
  notes?: string;
  period?: string;
  legacySourceId?: string;
}

export type ContactKind = 'client' | 'owner' | 'guest' | 'supplier' | 'worker' | 'other';

export interface ContactRecord {
  id: string;
  kind: ContactKind;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ConstructionFundingEntry {
  id: string;
  date: string;
  amount: number;
  source: string;
  method?: string;
  reference?: string;
  notes?: string;
}

export interface ConstructionChangeOrder {
  id: string;
  title: string;
  description: string;
  amountDelta: number;
  daysDelta: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'cancelled';
  requestedAt: string;
  decidedAt?: string;
  decisionNotes?: string;
}

export interface ConstructionPurchaseOrder {
  id: string;
  number: string;
  supplier: string;
  description: string;
  amount: number;
  issueDate: string;
  expectedDate?: string;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
}

export interface ConstructionSiteLog {
  id: string;
  date: string;
  weather?: string;
  workerCount: number;
  notes: string;
  photoIds?: string[];
  createdBy: string;
}

export interface ConstructionBudgetCommitment {
  id: string;
  category: ExpenseCategory;
  label: string;
  committedAmount: number;
  forecastAmount: number;
  supplier?: string;
  status: 'planned' | 'committed' | 'closed' | 'cancelled';
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  address: string;
  description: string;
  startDate: string;
  estimatedEndDate: string;
  budget: number;
  currency: string;
  status: ProjectStatus;
  projectType: ProjectType;
  creatorEmail: string;
  members: ProjectMember[];
  sections: ProjectSection[];
  expenses: Expense[];
  tasks: Task[];
  photos: Photo[];
  documents: Document[];
  reimbursements?: Reimbursement[];
  rentalProperty?: RentalProperty;
  rentalBookings?: RentalBooking[];
  rentalOwnerPayments?: RentalOwnerPayment[];
  rentalCalendarBlocks?: RentalCalendarBlock[];
  rentalOwnerStatements?: RentalOwnerStatement[];
  contacts?: ContactRecord[];
  constructionFunding?: ConstructionFundingEntry[];
  constructionChangeOrders?: ConstructionChangeOrder[];
  constructionPurchaseOrders?: ConstructionPurchaseOrder[];
  constructionSiteLogs?: ConstructionSiteLog[];
  constructionBudgetCommitments?: ConstructionBudgetCommitment[];
  /** Accepted members — used for Firestore queries and read access */
  memberEmails?: string[];
  /** Pending invitees — read + accept/decline only (not full member until accepted) */
  invitedEmails?: string[];
  /** Denormalized email → role map for Firestore security rules */
  memberRoleByEmail?: Record<string, UserRole>;
  /** Version 2 stores growing project arrays as individual Firestore record documents. */
  storageVersion?: 1 | 2;
  /** Changes whenever versioned records are committed, allowing other clients to rehydrate. */
  recordRevision?: string;
  /** Lightweight diagnostics for versioned record collections. */
  recordCounts?: Partial<Record<ProjectRecordKind, number>>;
}

export type ProjectRecordKind =
  | 'section'
  | 'expense'
  | 'task'
  | 'photo'
  | 'document'
  | 'reimbursement'
  | 'rental_booking'
  | 'rental_owner_payment'
  | 'rental_calendar_block'
  | 'rental_owner_statement'
  | 'contact'
  | 'construction_funding'
  | 'construction_change_order'
  | 'construction_purchase_order'
  | 'construction_site_log'
  | 'construction_budget_commitment';

export interface Invitation {
  id: string;
  projectId: string;
  projectName: string;
  ownerEmail: string;
  ownerName: string;
  inviteeEmail: string;
  role: UserRole;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: string;
}

export type ActivityActionType =
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'subtask_changed'
  | 'status_changed'
  | 'project_created'
  | 'member_joined'
  | 'document_added'
  | 'photo_uploaded';

export type ActivityTargetType = 'task' | 'expense' | 'member' | 'project' | 'subtask' | 'reimbursement';

export interface TimelineActivity {
  id: string;
  projectId: string;
  userEmail: string;
  userName: string;
  actionType: ActivityActionType;
  actionDetails: string;
  timestamp: string;
  /** Denormalized project members — enables secure Firestore queries without get() in rules */
  memberEmails?: string[];
  targetType?: ActivityTargetType;
  targetId?: string;
  targetTitle?: string;
}

export type NotificationCategory =
  | 'task_deadline'
  | 'task_overdue'
  | 'project_invitation'
  | 'budget_exceeded';

/** Where to navigate when the user clicks a notification */
export interface NotificationAction {
  projectId?: string;
  tab?: 'overview' | 'expenses' | 'tasks' | 'docs' | 'rental';
  taskId?: string;
  invitationId?: string;
  highlightInvitation?: boolean;
}

export interface PendingNotificationNav extends NotificationAction {
  projectId: string;
}

export interface AppNotification {
  id: string;
  projectId?: string;
  projectName?: string;
  text: string;
  read: boolean;
  timestamp: string;
  type: 'info' | 'alert' | 'success';
  category?: NotificationCategory;
  action?: NotificationAction;
  /** @deprecated legacy firestore fields */
  targetType?: string;
  targetId?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceTemplate {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  taxRate: number; // in percentage, e.g. 20
  items: InvoiceItem[];
  notes?: string;
}

export interface UserProfile {
  id?: string;
  fullName: string;
  role: string;
  company: string;
  phone: string;
  city: string;
  currency: string;
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Saved identity for invoices / receipts (issuer or recipient) */
export type DocumentPartyRole = 'issuer' | 'recipient';
export type DocumentRecipientKind = 'client' | 'worker' | 'member' | 'supplier' | 'other';

export interface DocumentParty {
  id: string;
  label: string;
  role: DocumentPartyRole;
  recipientKind?: DocumentRecipientKind;
  name: string;
  email: string;
  phone: string;
  address: string;
}

export type DocumentKind = 'invoice' | 'receipt' | 'voucher';
export type DocumentLineColumn = 'quantity' | 'unitPrice' | 'total';

export interface DocumentKindPreset {
  prefix: string;
  taxRate: number;
  defaultNotes: string;
  paperFormat: 'A4' | 'A5';
  visibleColumns: DocumentLineColumn[];
}

export type DocumentPresetsMap = Record<DocumentKind, DocumentKindPreset>;

export type CivilDocumentStatus = 'draft' | 'finalized' | 'paid' | 'cancelled';

export interface CivilDocumentLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  sourceExpenseId?: string;
  baseAmount?: number;
  commissionPercent?: number;
}

export interface CivilDocumentRecord {
  id: string;
  projectId: string;
  kind: DocumentKind;
  number: string;
  status: CivilDocumentStatus;
  version: number;
  documentDate: string;
  dueDate: string;
  currency: string;
  issuer: Pick<DocumentParty, 'name' | 'email' | 'phone' | 'address'>;
  recipient: Pick<DocumentParty, 'name' | 'email' | 'phone' | 'address'> & {
    kind: DocumentRecipientKind;
  };
  items: CivilDocumentLineItem[];
  visibleColumns: DocumentLineColumn[];
  taxRate: number;
  notes: string;
  subtotal: number;
  total: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  lastExportedAt?: string;
}

export interface UserDocumentSettings {
  parties: DocumentParty[];
  presets: DocumentPresetsMap;
  migratedFromLocalAt?: string;
  updatedAt: string;
}
