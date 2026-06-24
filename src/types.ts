export type Language = 'en' | 'fr' | 'ar';

export type ProjectStatus = 'planning' | 'in_progress' | 'paused' | 'completed' | 'cancelled';

export type ProjectType = 'construction' | 'service' | 'rental';

export type UserRole = 'read_only' | 'contributor' | 'editor' | 'manager' | 'co_owner' | 'owner';

export type ExpenseCategory = 'materials' | 'workers' | 'equipment' | 'transportation' | 'miscellaneous';

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
}

export interface Photo {
  id: string;
  sectionId?: string;
  title: string;
  url: string;
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
  /** Accepted members — used for Firestore queries and read access */
  memberEmails?: string[];
  /** Pending invitees — read + accept/decline only (not full member until accepted) */
  invitedEmails?: string[];
  /** Denormalized email → role map for Firestore security rules */
  memberRoleByEmail?: Record<string, UserRole>;
}

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
  tab?: 'overview' | 'expenses' | 'tasks' | 'docs';
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

export interface DocumentKindPreset {
  prefix: string;
  taxRate: number;
  defaultNotes: string;
  paperFormat: 'A4' | 'A5';
}

export type DocumentPresetsMap = Record<DocumentKind, DocumentKindPreset>;
