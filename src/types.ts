export type Language = 'en' | 'fr' | 'ar';

export type ProjectStatus = 'planning' | 'in_progress' | 'paused' | 'completed' | 'cancelled';

export type UserRole = 'read_only' | 'contributor' | 'editor' | 'manager' | 'owner';

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
}

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  sectionId?: string; // Optional if global/unassigned to section
  title: string;
  description: string;
  assignedTo: string; // Member email
  priority: TaskPriority;
  deadline: string;
  status: TaskStatus;
  subtasks: Subtask[];
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
  receipts: string[]; // Mock URLs/Base64
  notes?: string;
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
  creatorEmail: string;
  members: ProjectMember[];
  sections: ProjectSection[];
  expenses: Expense[];
  tasks: Task[];
  photos: Photo[];
  documents: Document[];
  reimbursements?: Reimbursement[];
  memberEmails?: string[]; // Array-contains query helper
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

export interface TimelineActivity {
  id: string;
  projectId: string;
  userEmail: string;
  userName: string;
  actionType: 'expense_added' | 'task_updated' | 'photo_uploaded' | 'status_changed' | 'project_created' | 'member_joined' | 'document_added';
  actionDetails: string;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  projectId?: string;
  projectName?: string;
  text: string;
  read: boolean;
  timestamp: string;
  type: 'info' | 'alert' | 'success';
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
