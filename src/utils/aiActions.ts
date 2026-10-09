import {
  Project,
  Task,
  Expense,
  ExpenseCategory,
  RentalBooking,
  RentalBookingPayment,
  RentalOwnerPayment,
  UserRole,
} from '../types';
import {
  ProjectPermissions,
  canEditTask,
  canDeleteExpense,
  canEditExpense,
} from './permissions';
import {
  rentalBookingStatusForDates,
  rentalDaysBetween,
  addRentalBookingPayment,
  rentalBookingBalanceDue,
  syncRentalBookingPaymentTotals,
  findRentalBookingConflict,
} from './rentalAccounting';
import { appDateKey, appDateKeyAfterDays } from './dateTime';

export type AIActionType =
  | 'add_expense'
  | 'update_expense'
  | 'update_task_status'
  | 'update_task'
  | 'create_task'
  | 'delete_task'
  | 'add_subtask'
  | 'toggle_subtask'
  | 'delete_expense'
  | 'update_project'
  | 'add_funding'
  | 'add_site_log'
  | 'add_booking'
  | 'update_booking'
  | 'record_booking_payment'
  | 'delete_booking'
  | 'record_owner_payment'
  | 'update_rental_property'
  | 'prepare_document';

const VALID_ACTION_TYPES = new Set<AIActionType>([
  'add_expense',
  'update_expense',
  'update_task_status',
  'update_task',
  'create_task',
  'delete_task',
  'add_subtask',
  'toggle_subtask',
  'delete_expense',
  'update_project',
  'add_funding',
  'add_site_log',
  'add_booking',
  'update_booking',
  'record_booking_payment',
  'delete_booking',
  'record_owner_payment',
  'update_rental_property',
  'prepare_document',
]);

/** Required-field check — AI must ask for these instead of inventing values. */
export function getMissingFieldsForAction(action: AIProposedAction): string[] {
  const p = action.params;
  const missing: string[] = [];
  const need = (key: string, label: string) => {
    const v = p[key];
    if (v === undefined || v === null || String(v).trim() === '') missing.push(label);
  };
  switch (action.type) {
    case 'add_expense':
      need('title', 'expense title');
      if (Number(p.amount) <= 0) missing.push('amount (> 0)');
      break;
    case 'create_task':
      need('title', 'task title');
      break;
    case 'update_task':
    case 'update_task_status':
      if (!p.taskId && !p.taskTitle) missing.push('which task');
      if (action.type === 'update_task_status' && !p.status) missing.push('status (pending|in_progress|completed)');
      break;
    case 'delete_task':
    case 'add_subtask':
    case 'toggle_subtask':
      if (!p.taskId && !p.taskTitle) missing.push('which task');
      if (action.type === 'add_subtask') need('subtaskTitle', 'subtask title');
      break;
    case 'update_expense':
    case 'delete_expense':
      if (!p.expenseId && !p.expenseTitle) missing.push('which expense');
      break;
    case 'update_project':
      if (p.status === undefined && p.budget === undefined && p.name === undefined && p.estimatedEndDate === undefined) {
        missing.push('what to update (status, budget, name, or end date)');
      }
      break;
    case 'add_funding':
      if (Number(p.amount) <= 0) missing.push('amount (> 0)');
      break;
    case 'add_site_log':
      if (!validDate(p.date)) missing.push('date (YYYY-MM-DD)');
      if (!p.notes && (p.notes as string) !== '') {
        // notes required but allow short text via title fallback
        need('notes', 'site notes');
      }
      break;
    case 'prepare_document':
      if (!Array.isArray(p.items) || (p.items as unknown[]).length === 0) missing.push('at least one line item');
      need('recipientName', 'recipient name');
      break;
    default:
      break;
  }
  return missing;
}

/** Drop hallucinated / invalid action types before showing confirm UI */
export function sanitizeProposedActions(actions: unknown[]): AIProposedAction[] {
  if (!Array.isArray(actions)) return [];

  const cleaned: AIProposedAction[] = [];
  for (const raw of actions) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Partial<AIProposedAction>;
    const type = String(a.type || '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_') as AIActionType;
    if (!VALID_ACTION_TYPES.has(type)) continue;
    if (!a.summary || typeof a.summary !== 'string') continue;
    cleaned.push({
      id: String(a.id || `act_${Date.now()}_${cleaned.length}`),
      type,
      summary: a.summary.trim(),
      params: (a.params && typeof a.params === 'object' ? a.params : {}) as Record<string, unknown>,
    });
  }
  return cleaned;
}

/** Questions and reports should never trigger the confirm / apply flow */
export function userWantsDataChanges(userMessage: string): boolean {
  const m = userMessage.trim().toLowerCase();
  if (!m) return false;

  const changeVerbs =
    /\b(add|create|delete|remove|mark|complete|finish|done|update|set|prepare|make|toggle|change|assign|record|log|insert|new|pay|paid|paying|receive|received)\b/i;
  if (changeVerbs.test(m)) return true;

  // Short imperatives without a question mark
  if (!m.includes('?') && /^(mark|add|create|delete|set|prepare|complete|finish)\b/i.test(m)) {
    return true;
  }

  return false;
}

export function isInformationalQuery(userMessage: string): boolean {
  const m = userMessage.trim().toLowerCase();
  if (!m) return false;
  if (userWantsDataChanges(m)) return false;

  return (
    m.includes('?') ||
    /^(what|which|who|how many|how much|show|list|tell|current|my task|status|where|when|why|do i have|am i|are there|summarize|summary|overview|explain)\b/i.test(
      m
    ) ||
    /\b(current task|my tasks|assigned to me|what am i|what i have)\b/i.test(m)
  );
}

const normalizeApprovalMessage = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!?,;:()[\]{}'"`*_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const AI_APPROVAL_PHRASES = [
  'ah confirme',
  'ah confirm',
  'iwa confirme',
  'iwa confirm',
  'apply changes',
  'yes confirm',
  'confirmed',
  'confirm',
  'proceed',
  'approved',
  'approve',
  'apply',
  'do it',
  'doit',
  'do that',
  'create it',
  'add it',
  'go ahead',
  'vas y',
  'vas y fais',
  'yallah',
  'yallah dir',
  'zid',
  'okay',
  'ok',
  'yes',
  'yeah',
  'yep',
  'confirmer',
  'confirme',
  'valider',
  'valide',
  'd accord',
  'oui',
  'تأكيد',
  'موافق',
  'واخا',
  'أكد',
  'طبق',
  'نعم',
  'ديرها',
  'زيد',
  'wakha',
  'dirha',
  'safi',
  'mzyan',
  'iwa',
  'ah',
] as const;

const AI_APPROVAL_CONNECTORS = ['and then', 'and', 'then', 'et puis', 'et', 'puis', 'ثم'] as const;

/** Words that turn a "yes..." reply into an objection, not an approval. */
const AI_OBJECTION_WORDS = ['but', 'however', 'instead', 'change', 'modify', 'not ', "don't", 'do not', 'no ', 'mais', 'sauf', 'change', 'modifie', 'ne pas'] as const;

export interface AIConfirmationIntent {
  followUp: string;
}

/**
 * Parse approval of an already-visible proposal. A navigation instruction may
 * follow through a connector, e.g. "confirm and open the booking".
 * Lenient: "yes add that task", "do it", "yallah" all confirm unless the
 * remainder contains an objection ("but change...").
 */
export function parseAIConfirmationMessage(value: string): AIConfirmationIntent | null {
  const message = normalizeApprovalMessage(value);
  if (!message) return null;
  // Longest phrases first so "apply changes" wins over "apply".
  const sorted = [...AI_APPROVAL_PHRASES].sort((a, b) => b.length - a.length);
  for (const approval of sorted) {
    if (message === approval) return { followUp: '' };
    if (message.startsWith(`${approval} `)) {
      const remainder = message.slice(approval.length + 1).trim();
      if (!remainder) return { followUp: '' };
      if (AI_OBJECTION_WORDS.some((w) => remainder.includes(w))) continue;
      // "yes, but change the dates" -> not a confirmation (objection above covers it,
      // but keep the explicit guard for comma-led corrections).
      if (/^(but|however|mais)\b/.test(remainder)) continue;
      // Connector-led follow-up: "confirm and open tasks"
      for (const connector of AI_APPROVAL_CONNECTORS) {
        if (remainder.startsWith(`${connector} `)) {
          return { followUp: remainder.slice(connector.length + 1).trim() };
        }
      }
      // Bare continuation is still a confirmation ("yes add that task", "do it now").
      // Keep remainder as follow-up only if it looks like navigation.
      const looksLikeNav = /\b(open|show|go to|tasks|expenses|dashboard|project|booking)\b/.test(remainder);
      return { followUp: looksLikeNav ? remainder : '' };
    }
    for (const connector of AI_APPROVAL_CONNECTORS) {
      const prefix = `${approval} ${connector} `;
      if (message.startsWith(prefix)) {
        const followUp = message.slice(prefix.length).trim();
        return { followUp };
      }
    }
  }
  return null;
}

export function isAIConfirmationMessage(value: string): boolean {
  return parseAIConfirmationMessage(value) !== null;
}

/** Exact short replies that reject an already-visible pending AI proposal. */
export function isAICancellationMessage(value: string): boolean {
  const message = normalizeApprovalMessage(value);
  return new Set([
    'cancel',
    'dismiss',
    'reject',
    'no',
    'stop',
    'annuler',
    'non',
    'ignorer',
    'إلغاء',
    'لا',
    'رفض',
    'بلاش',
    'bla',
  ]).has(message);
}

export interface AIProposedAction {
  id: string;
  type: AIActionType;
  summary: string;
  params: Record<string, unknown>;
}

export interface AIAgentResponse {
  message: string;
  proposedActions: AIProposedAction[];
  uiActions?: import('./aiNavigation').AIUIAction[];
}

/** Task id touched by a data action — for "open that task" follow-ups */
export function extractTaskIdFromAction(
  project: Project,
  action: AIProposedAction
): string | null {
  const p = action.params;
  if (p.taskId && project.tasks.some((t) => t.id === p.taskId)) return String(p.taskId);
  const task = findTask(project, p);
  return task?.id ?? null;
}

export function extractExpenseIdFromAction(
  project: Project,
  action: AIProposedAction
): string | null {
  const p = action.params;
  if (p.expenseId && project.expenses.some((e) => e.id === p.expenseId)) return String(p.expenseId);
  const exp = findExpense(project, p);
  return exp?.id ?? null;
}

export interface AIApplyContext {
  userEmail: string;
  userName: string;
  userRole: UserRole;
  perm: ProjectPermissions;
}

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Forgiving status parsing: the model (or voice transcripts) may say "done",
 * "doing", "in progress", or "next (phase)". Relative values resolve against
 * the task's current status so "move to the next phase" just works.
 */
export function normalizeTaskStatus(
  raw: unknown,
  current?: Task['status']
): Task['status'] | null {
  const s = normalizeText(raw).replace(/[_\-]+/g, ' ');
  const direct: Record<string, Task['status']> = {
    pending: 'pending',
    todo: 'pending',
    'to do': 'pending',
    'not started': 'pending',
    'in progress': 'in_progress',
    doing: 'in_progress',
    started: 'in_progress',
    ongoing: 'in_progress',
    completed: 'completed',
    done: 'completed',
    finished: 'completed',
    complete: 'completed',
  };
  if (direct[s]) return direct[s];
  if (['next', 'advance', 'forward', 'next phase', 'next step', 'move forward', 'promote'].includes(s)) {
    if (current === 'pending') return 'in_progress';
    if (current === 'in_progress') return 'completed';
    return current ?? null;
  }
  return null;
}

/** Advance one kanban phase: pending → doing → done. */
export function nextTaskPhase(current: Task['status']): Task['status'] {
  return current === 'pending' ? 'in_progress' : 'completed';
}

function findTask(project: Project, params: Record<string, unknown>): Task | undefined {
  const id = params.taskId as string | undefined;
  if (id) return project.tasks.find((t) => t.id === id);
  const query = normalizeText(params.taskTitle).replace(/^["'«»“”]+|["'«»“”]+$/g, '');
  if (!query) return undefined;
  const scored = project.tasks
    .map((task) => {
      const title = normalizeText(task.title);
      if (!title) return { task, score: 0 };
      // Either side containing the other (guarded against 1–2 char queries).
      if (title === query) return { task, score: 100 };
      if (query.length >= 4 && title.includes(query)) return { task, score: 60 + query.length };
      if (title.length >= 4 && query.length >= 6 && query.includes(title)) return { task, score: 50 };
      // Word overlap fallback for "put the painting walls in next phase".
      const queryWords = new Set(query.split(' ').filter((w) => w.length >= 4));
      if (queryWords.size === 0) return { task, score: 0 };
      const titleWords = new Set(title.split(' '));
      let overlap = 0;
      for (const word of queryWords) if (titleWords.has(word)) overlap++;
      if (overlap > 0 && overlap / queryWords.size >= 0.5) return { task, score: 10 + overlap };
      return { task, score: 0 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.task;
}

function findExpense(project: Project, params: Record<string, unknown>): Expense | undefined {
  const id = params.expenseId as string | undefined;
  if (id) return project.expenses.find((e) => e.id === id);
  const query = normalizeText(params.expenseTitle).replace(/^["'«»“”]+|["'«»“”]+$/g, '');
  if (!query) return undefined;
  const scored = project.expenses
    .map((expense) => {
      const title = normalizeText(expense.title);
      if (!title) return { expense, score: 0 };
      if (title === query) return { expense, score: 100 };
      if (query.length >= 4 && title.includes(query)) return { expense, score: 60 + query.length };
      if (title.length >= 4 && query.length >= 6 && query.includes(title)) return { expense, score: 50 };
      return { expense, score: 0 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.expense;
}

const EXPENSE_CATS: ExpenseCategory[] = [
  'materials',
  'workers',
  'equipment',
  'transportation',
  'utilities',
  'cleaning',
  'maintenance',
  'miscellaneous',
];

const aiId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

export function findRentalBooking(project: Project, params: Record<string, unknown>): RentalBooking | undefined {
  const id = params.bookingId as string | undefined;
  if (id) return (project.rentalBookings || []).find((booking) => booking.id === id);
  const clientName = String(params.clientName || '').trim().toLowerCase();
  const checkIn = String(params.checkIn || '');
  if (!clientName && !checkIn) return undefined;
  const matches = (project.rentalBookings || []).filter((booking) =>
    (!clientName || booking.clientName.toLowerCase().includes(clientName))
    && (!checkIn || booking.checkIn === checkIn)
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeCategory(raw: unknown): ExpenseCategory {
  const s = String(raw || 'miscellaneous').toLowerCase();
  return EXPENSE_CATS.find((c) => c === s) || 'miscellaneous';
}

/** Apply a single confirmed AI action; returns updated project or error */
export function applyAIAction(
  project: Project,
  action: AIProposedAction,
  ctx: AIApplyContext
): { project: Project; error?: string } {
  const email = ctx.userEmail.toLowerCase();

  switch (action.type) {
    case 'add_expense': {
      if (!ctx.perm.canManageExpenses) {
        return { project, error: 'No permission to add expenses' };
      }
      const p = action.params;
      const amount = Number(p.amount);
      if (!p.title || !amount || amount <= 0) {
        return { project, error: 'Invalid expense: need title and amount' };
      }
      const newExp: Expense = {
        id: aiId('exp_ai'),
        title: String(p.title),
        description: String(p.description || 'Added via AI assistant'),
        amount,
        currency: project.currency,
        category: normalizeCategory(p.category),
        date: String(p.date || appDateKey()),
        paidBy: String(p.paidBy || email),
        supplier: String(p.supplier || ''),
        receipts: [],
        createdBy: email,
        createdByName: ctx.userName,
      };
      return { project: { ...project, expenses: [...project.expenses, newExp] } };
    }

    case 'update_expense': {
      if (!ctx.perm.canManageExpenses) {
        return { project, error: 'No permission to update expenses' };
      }
      const expense = findExpense(project, action.params);
      if (!expense) return { project, error: 'Expense not found' };
      if (!canEditExpense(expense, project, email, ctx.userRole)) {
        return { project, error: 'This expense is protected' };
      }
      const p = action.params;
      const amount = p.amount === undefined ? expense.amount : Number(p.amount);
      const date = p.date === undefined ? expense.date : String(p.date);
      if (amount <= 0 || !validDate(date)) {
        return { project, error: 'Expense amount and date are invalid' };
      }
      const expenses = project.expenses.map((item) =>
        item.id === expense.id
          ? {
              ...item,
              ...(p.title !== undefined ? { title: String(p.title).trim() } : {}),
              ...(p.description !== undefined ? { description: String(p.description) } : {}),
              ...(p.amount !== undefined ? { amount } : {}),
              ...(p.category !== undefined ? { category: normalizeCategory(p.category) } : {}),
              ...(p.date !== undefined ? { date } : {}),
              ...(p.paidBy !== undefined ? { paidBy: String(p.paidBy) } : {}),
              ...(p.supplier !== undefined ? { supplier: String(p.supplier) } : {}),
            }
          : item
      );
      return { project: { ...project, expenses } };
    }

    case 'update_task_status': {
      if (!ctx.perm.canManageTasks) {
        return { project, error: 'No permission to update tasks' };
      }
      const task = findTask(project, action.params);
      if (!task) return { project, error: `Task not found: "${String(action.params.taskTitle || action.params.taskId || '').slice(0, 60)}"` };
      if (!canEditTask(task, project, email, ctx.userRole)) {
        return { project, error: 'This task is protected and cannot be modified' };
      }
      const status = normalizeTaskStatus(action.params.status, task.status);
      if (!status) {
        return { project, error: `Invalid task status: "${String(action.params.status || '').slice(0, 40)}"` };
      }
      // Already there counts as success — the user's intent holds, nothing to write.
      if (status === task.status) return { project };
      const tasks = project.tasks.map((t) => (t.id === task.id ? { ...t, status } : t));
      return { project: { ...project, tasks } };
    }

    case 'create_task': {
      if (!ctx.perm.canManageTasks) {
        return { project, error: 'No permission to create tasks' };
      }
      const p = action.params;
      if (!p.title) return { project, error: 'Task title required' };
      const rawSubtasks = Array.isArray(p.subtasks)
        ? p.subtasks
        : Array.isArray(p.subtaskTitles)
          ? p.subtaskTitles
          : [];
      const subtasks = rawSubtasks
        .map((raw) => typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object'
            ? String((raw as Record<string, unknown>).title || '')
            : '')
        .map((title) => title.trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((title) => ({ id: aiId('sub_ai'), title, isCompleted: false }));
      const priority = ['low', 'medium', 'high'].includes(String(p.priority))
        ? p.priority as Task['priority']
        : 'medium';
      const deadline = validDate(p.deadline)
        ? String(p.deadline)
        : appDateKeyAfterDays(7);
      const newTask: Task = {
        id: aiId('tsk_ai'),
        title: String(p.title),
        description: String(p.description || ''),
        assignedTo: String(p.assignedTo || email),
        priority,
        deadline,
        status: 'pending',
        subtasks,
        createdBy: email,
        createdByName: ctx.userName,
        notes: '',
        workedBy: String(p.assignedTo || email),
        workCategory: 'general',
        costLines: [],
        beforeImages: [],
        afterImages: [],
        progressImages: [],
        attachments: [],
      };
      return { project: { ...project, tasks: [...project.tasks, newTask] } };
    }

    case 'delete_task': {
      if (!ctx.perm.canManageTasks) {
        return { project, error: 'No permission to delete tasks' };
      }
      const task = findTask(project, action.params);
      if (!task) return { project, error: 'Task not found' };
      if (!canEditTask(task, project, email, ctx.userRole)) {
        return { project, error: 'This task is protected and cannot be deleted' };
      }
      return { project: { ...project, tasks: project.tasks.filter((item) => item.id !== task.id) } };
    }

    case 'add_subtask': {
      if (!ctx.perm.canManageTasks) {
        return { project, error: 'No permission to edit tasks' };
      }
      const task = findTask(project, action.params);
      if (!task) return { project, error: 'Task not found' };
      if (!canEditTask(task, project, email, ctx.userRole)) {
        return { project, error: 'This task is protected' };
      }
      const subTitle = String(action.params.subtaskTitle || '');
      if (!subTitle) return { project, error: 'Subtask title required' };
      const sub = {
        id: aiId('sub_ai'),
        title: subTitle,
        isCompleted: false,
      };
      const tasks = project.tasks.map((t) =>
        t.id === task.id ? { ...t, subtasks: [...(t.subtasks || []), sub] } : t
      );
      return { project: { ...project, tasks } };
    }

    case 'toggle_subtask': {
      if (!ctx.perm.canManageTasks) {
        return { project, error: 'No permission to edit tasks' };
      }
      const task = findTask(project, action.params);
      if (!task) return { project, error: 'Task not found' };
      if (!canEditTask(task, project, email, ctx.userRole)) {
        return { project, error: 'This task is protected' };
      }
      const subId = action.params.subtaskId as string | undefined;
      const subTitle = (action.params.subtaskTitle as string | undefined)?.toLowerCase();
      const tasks = project.tasks.map((t) => {
        if (t.id !== task.id) return t;
        const subtasks = (t.subtasks || []).map((s) => {
          const match = subId ? s.id === subId : subTitle && s.title.toLowerCase().includes(subTitle);
          return match ? { ...s, isCompleted: !s.isCompleted } : s;
        });
        return { ...t, subtasks };
      });
      return { project: { ...project, tasks } };
    }

    case 'delete_expense': {
      if (!ctx.perm.canManageExpenses) {
        return { project, error: 'No permission to delete expenses' };
      }
      const exp = findExpense(project, action.params);
      if (!exp) return { project, error: 'Expense not found' };
      if (!canDeleteExpense(exp, project, email, ctx.userRole)) {
        return { project, error: 'This expense is protected' };
      }
      return {
        project: { ...project, expenses: project.expenses.filter((e) => e.id !== exp.id) },
      };
    }

    case 'add_booking': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to add rental bookings' };
      }
      if (project.projectType !== 'rental' || !project.rentalProperty) {
        return { project, error: 'Bookings can only be added to a rental property' };
      }
      const p = action.params;
      const clientName = String(p.clientName || p.guestName || '').trim();
      const checkIn = String(p.checkIn || '');
      const checkOut = String(p.checkOut || '');
      if (!clientName || !validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) {
        return { project, error: 'Invalid booking: client, check-in, and later check-out are required' };
      }
      const conflictingBooking = findRentalBookingConflict(
        project.rentalBookings || [],
        checkIn,
        checkOut
      );
      if (conflictingBooking) {
        return {
          project,
          error: `Booking dates overlap ${conflictingBooking.clientName} (${conflictingBooking.checkIn} - ${conflictingBooking.checkOut})`,
        };
      }
      const totalNights = rentalDaysBetween(checkIn, checkOut);
      const nightlyRate = Math.max(0, Number(p.nightlyRate) || project.rentalProperty.pricePerNight || 0);
      const suppliedTotal = Number(p.totalAmount);
      const totalAmount = suppliedTotal > 0 ? suppliedTotal : totalNights * nightlyRate;
      if (totalAmount <= 0) return { project, error: 'Booking amount or nightly rate is required' };
      const hasCommissionRate = p.commissionRate !== undefined && p.commissionRate !== null && p.commissionRate !== '';
      const commissionRate = hasCommissionRate ? Math.max(0, Number(p.commissionRate) || 0) : undefined;
      const commission = commissionRate === undefined ? 0 : Math.round(totalAmount * commissionRate) / 100;
      const cleaningFee = Math.max(0, Number(p.cleaningFee) || 0);
      const cleaningChargeTo = ['owner', 'management', 'guest'].includes(String(p.cleaningChargeTo))
        ? String(p.cleaningChargeTo) as NonNullable<RentalBooking['cleaningChargeTo']>
        : 'owner';
      const paidAmount = Math.min(totalAmount, Math.max(0, Number(p.paidAmount) || 0));
      const status = rentalBookingStatusForDates(checkIn, checkOut);
      const initialPayment: RentalBookingPayment | null = paidAmount > 0
        ? {
            id: aiId('payment_ai'),
            date: String(p.paymentDate || appDateKey()),
            amount: paidAmount,
            method: ['cash', 'bank_transfer', 'card', 'online', 'other'].includes(String(p.paymentMethod))
              ? p.paymentMethod as RentalBookingPayment['method']
              : 'other',
            notes: String(p.paymentNotes || 'Initial payment'),
            receiptNumber: `REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
            recordedAt: new Date().toISOString(),
            recordedBy: email,
          }
        : null;
      const booking: RentalBooking = {
        id: aiId('book_ai'),
        clientName,
        clientPhone: String(p.clientPhone || p.guestPhone || ''),
        source: String(p.source || ''),
        numberOfGuests: Math.max(1, Math.round(Number(p.numberOfGuests) || 1)),
        checkIn,
        checkOut,
        totalNights,
        totalAmount,
        nightlyRate,
        ...(commissionRate === undefined ? {} : { commissionRate }),
        commission,
        cleaningFee,
        cleaningChargeTo,
        ownerPayout: totalAmount - commission - (cleaningChargeTo === 'owner' ? cleaningFee : 0),
        status,
        notes: String(p.notes || ''),
        paidAmount,
        balanceDue: totalAmount - paidAmount,
        paymentOpeningBalance: 0,
        payments: initialPayment ? [initialPayment] : [],
        historicalEntry: status === 'completed',
        recordedAt: new Date().toISOString(),
      };
      return {
        project: {
          ...project,
          rentalBookings: [...(project.rentalBookings || []), booking],
        },
      };
    }

    case 'delete_booking': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to delete rental bookings' };
      }
      const booking = findRentalBooking(project, action.params);
      if (!booking) return { project, error: 'Booking not found' };
      return {
        project: {
          ...project,
          rentalBookings: (project.rentalBookings || []).filter((item) => item.id !== booking.id),
        },
      };
    }

    case 'update_booking': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to update rental bookings' };
      }
      const booking = findRentalBooking(project, action.params);
      if (!booking) return { project, error: 'Booking not found' };
      const p = action.params;
      const checkIn = p.newCheckIn === undefined ? booking.checkIn : String(p.newCheckIn);
      const checkOut = p.newCheckOut === undefined ? booking.checkOut : String(p.newCheckOut);
      if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) {
        return { project, error: 'Booking dates are invalid' };
      }
      const conflictingBooking = findRentalBookingConflict(
        project.rentalBookings || [],
        checkIn,
        checkOut,
        booking.id
      );
      if (conflictingBooking) {
        return {
          project,
          error: `Booking dates overlap ${conflictingBooking.clientName} (${conflictingBooking.checkIn} - ${conflictingBooking.checkOut})`,
        };
      }
      const totalNights = rentalDaysBetween(checkIn, checkOut);
      const nightlyRate =
        p.nightlyRate === undefined
          ? Math.max(0, booking.nightlyRate || booking.totalAmount / Math.max(1, booking.totalNights))
          : Math.max(0, Number(p.nightlyRate) || 0);
      const totalAmount =
        p.totalAmount === undefined
          ? p.nightlyRate !== undefined || p.newCheckIn !== undefined || p.newCheckOut !== undefined
            ? totalNights * nightlyRate
            : booking.totalAmount
          : Math.max(0, Number(p.totalAmount) || 0);
      if (totalAmount <= 0) return { project, error: 'Booking amount must be positive' };
      const commissionRate =
        p.commissionRate === undefined
          ? booking.commissionRate ?? project.rentalProperty?.commissionRate ?? 0
          : Math.max(0, Number(p.commissionRate) || 0);
      const commission = Math.round(totalAmount * commissionRate) / 100;
      const cleaningFee =
        p.cleaningFee === undefined ? Math.max(0, booking.cleaningFee || 0) : Math.max(0, Number(p.cleaningFee) || 0);
      const cleaningChargeTo = ['owner', 'management', 'guest'].includes(String(p.cleaningChargeTo))
        ? String(p.cleaningChargeTo) as NonNullable<RentalBooking['cleaningChargeTo']>
        : booking.cleaningChargeTo || 'owner';
      const bookings = (project.rentalBookings || []).map((item): RentalBooking =>
        item.id === booking.id
          ? syncRentalBookingPaymentTotals({
              ...item,
              ...(p.clientName !== undefined ? { clientName: String(p.clientName).trim() } : {}),
              ...(p.clientPhone !== undefined ? { clientPhone: String(p.clientPhone) } : {}),
              ...(p.source !== undefined ? { source: String(p.source) } : {}),
              ...(p.numberOfGuests !== undefined
                ? { numberOfGuests: Math.max(1, Math.round(Number(p.numberOfGuests) || 1)) }
                : {}),
              ...(p.notes !== undefined ? { notes: String(p.notes) } : {}),
              checkIn,
              checkOut,
              totalNights,
              nightlyRate,
              totalAmount,
              commissionRate,
              commission,
              cleaningFee,
              cleaningChargeTo,
              ownerPayout: totalAmount - commission - (cleaningChargeTo === 'owner' ? cleaningFee : 0),
              status: rentalBookingStatusForDates(checkIn, checkOut),
            })
          : item
      );
      return { project: { ...project, rentalBookings: bookings } };
    }

    case 'record_booking_payment': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to record booking payments' };
      }
      const booking = findRentalBooking(project, action.params);
      if (!booking) return { project, error: 'Booking not found' };
      const p = action.params;
      const amount = Math.max(0, Number(p.amount) || 0);
      const date = String(p.date || appDateKey());
      const balance = rentalBookingBalanceDue(booking);
      if (!amount || amount > balance || !validDate(date)) {
        return { project, error: `Payment must be positive and no more than the ${balance} balance` };
      }
      const method = ['cash', 'bank_transfer', 'card', 'online', 'other'].includes(String(p.method))
        ? p.method as RentalBookingPayment['method']
        : 'other';
      const payment: RentalBookingPayment = {
        id: aiId('payment_ai'),
        date,
        amount,
        method,
        notes: String(p.notes || p.reference || ''),
        receiptNumber: String(
          p.receiptNumber ||
            `REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
        ),
        recordedAt: new Date().toISOString(),
        recordedBy: email,
      };
      return {
        project: {
          ...project,
          rentalBookings: (project.rentalBookings || []).map((item) =>
            item.id === booking.id ? addRentalBookingPayment(item, payment) : item
          ),
        },
      };
    }

    case 'record_owner_payment': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to record owner payments' };
      }
      if (project.projectType !== 'rental') {
        return { project, error: 'Owner payments can only be recorded for rental properties' };
      }
      const p = action.params;
      const amount = Math.max(0, Number(p.amount) || 0);
      const date = String(p.date || appDateKey());
      if (!amount || !validDate(date)) {
        return { project, error: 'Owner payment requires a positive amount and valid date' };
      }
      const method = ['bank_transfer', 'cash', 'offset', 'other'].includes(String(p.method))
        ? p.method as NonNullable<RentalOwnerPayment['method']>
        : 'other';
      const payment: RentalOwnerPayment = {
        id: aiId('owner_payment_ai'),
        date,
        amount,
        method,
        notes: String(p.notes || p.reference || ''),
        period: validDate(`${String(p.period || '')}-01`) ? String(p.period) : date.slice(0, 7),
      };
      return {
        project: {
          ...project,
          rentalOwnerPayments: [...(project.rentalOwnerPayments || []), payment],
        },
      };
    }

    case 'update_rental_property': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to update rental settings' };
      }
      if (project.projectType !== 'rental' || !project.rentalProperty) {
        return { project, error: 'Rental property not found' };
      }
      const p = action.params;
      const current = project.rentalProperty;
      const next = {
        ...current,
        ...(p.ownerName !== undefined ? { ownerName: String(p.ownerName).trim() } : {}),
        ...(p.ownerEmail !== undefined ? { ownerEmail: String(p.ownerEmail).trim().toLowerCase() } : {}),
        ...(p.ownerPhone !== undefined ? { ownerPhone: String(p.ownerPhone).trim() } : {}),
        ...(p.buildingNumber !== undefined ? { buildingNumber: String(p.buildingNumber).trim() } : {}),
        ...(p.pricePerNight !== undefined ? { pricePerNight: Math.max(0, Number(p.pricePerNight) || 0) } : {}),
        ...(p.commissionRate !== undefined ? { commissionRate: Math.max(0, Number(p.commissionRate) || 0) } : {}),
        ...(p.notes !== undefined || p.managementNotes !== undefined
          ? { notes: String(p.managementNotes ?? p.notes) }
          : {}),
      };
      if (!next.ownerName || !next.buildingNumber) {
        return { project, error: 'Owner name and building number cannot be empty' };
      }
      return { project: { ...project, rentalProperty: next } };
    }

    case 'update_task': {
      if (!ctx.perm.canManageTasks) {
        return { project, error: 'No permission to update tasks' };
      }
      const task = findTask(project, action.params);
      if (!task) return { project, error: 'Task not found — tell me which task by name' };
      if (!canEditTask(task, project, email, ctx.userRole)) {
        return { project, error: 'This task is protected' };
      }
      const p = action.params;
      const patch: Partial<Task> = {};
      if (p.title !== undefined) patch.title = String(p.title).trim() || task.title;
      if (p.description !== undefined) patch.description = String(p.description);
      if (p.assignedTo !== undefined) {
        const owner = String(p.assignedTo);
        patch.workedBy = owner;
        patch.assignedTo = owner;
      }
      if (p.priority !== undefined && ['low', 'medium', 'high'].includes(String(p.priority))) {
        patch.priority = String(p.priority) as Task['priority'];
      }
      if (p.deadline !== undefined) {
        if (!validDate(p.deadline)) return { project, error: 'Deadline must be YYYY-MM-DD' };
        patch.deadline = String(p.deadline);
      }
      if (p.status !== undefined) {
        if (!['pending', 'in_progress', 'completed'].includes(String(p.status))) {
          return { project, error: 'Invalid task status' };
        }
        patch.status = String(p.status) as Task['status'];
      }
      if (p.blockedReason !== undefined) patch.blockedReason = String(p.blockedReason);
      const tasks = project.tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t));
      return { project: { ...project, tasks } };
    }

    case 'update_project': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to update project settings' };
      }
      const p = action.params;
      const patch: Partial<Project> = {};
      if (p.name !== undefined && String(p.name).trim()) patch.name = String(p.name).trim();
      if (p.status !== undefined) {
        if (!['planning', 'in_progress', 'paused', 'completed', 'cancelled'].includes(String(p.status))) {
          return { project, error: 'Invalid project status' };
        }
        patch.status = String(p.status) as Project['status'];
      }
      if (p.budget !== undefined) {
        const b = Number(p.budget);
        if (Number.isNaN(b) || b < 0) return { project, error: 'Budget must be >= 0' };
        patch.budget = b;
      }
      if (p.estimatedEndDate !== undefined) {
        if (!validDate(p.estimatedEndDate)) return { project, error: 'End date must be YYYY-MM-DD' };
        patch.estimatedEndDate = String(p.estimatedEndDate);
      }
      if (p.description !== undefined) patch.description = String(p.description);
      if (Object.keys(patch).length === 0) return { project, error: 'Nothing to update' };
      return { project: { ...project, ...patch } };
    }

    case 'add_funding': {
      if (!ctx.perm.canModifySettings) {
        return { project, error: 'No permission to record funding' };
      }
      const p = action.params;
      const amount = Number(p.amount);
      if (!amount || amount <= 0) return { project, error: 'Funding amount must be > 0' };
      const entry = {
        id: aiId('fund_ai'),
        date: validDate(p.date) ? String(p.date) : appDateKey(),
        amount,
        source: String(p.source || 'Client'),
        method: String(p.method || ''),
        reference: String(p.reference || ''),
        notes: String(p.notes || 'Added via AI assistant'),
      };
      return { project: { ...project, constructionFunding: [...(project.constructionFunding || []), entry] } };
    }

    case 'add_site_log': {
      if (!ctx.perm.canManageTasks) {
        return { project, error: 'No permission to add site logs' };
      }
      const p = action.params;
      const date = String(p.date || '');
      if (!validDate(date)) return { project, error: 'Site log needs a valid date YYYY-MM-DD' };
      const notes = String(p.notes || p.title || '').trim();
      if (!notes) return { project, error: 'Site log needs notes' };
      const log = {
        id: aiId('log_ai'),
        date,
        weather: String(p.weather || ''),
        workerCount: Math.max(0, Math.round(Number(p.workerCount) || 0)),
        notes,
        photoIds: [] as string[],
        createdBy: email,
      };
      return { project: { ...project, constructionSiteLogs: [...(project.constructionSiteLogs || []), log] } };
    }

    default:
      return { project, error: 'Unknown action type' };
  }
}

export function applyAIActions(
  project: Project,
  actions: AIProposedAction[],
  ctx: AIApplyContext
): { project: Project; errors: string[] } {
  let current = project;
  const errors: string[] = [];
  for (const action of actions) {
    const result = applyAIAction(current, action, ctx);
    if (result.error) errors.push(`${action.summary}: ${result.error}`);
    else current = result.project;
  }
  return { project: current, errors };
}

export const AI_SYSTEM_PROMPT = `You are HS Tracker AI for construction, renovation, and rental-management workspaces.

You receive CURRENT_TIME_CONTEXT, PROJECT_CONTEXT, CONVERSATION_HISTORY (this chat session), SESSION_HINTS, tasks, expenses, and userRole.

MEMORY: Use CONVERSATION_HISTORY to remember what you and the user already discussed. Refer back naturally (e.g. "that task", "as I said"). Do not repeat full lists unless asked.

SPOKEN MODE (SESSION_HINTS.spoken is true): the user HEARS your message on a live call. Talk like a human: 1–3 short sentences, plain everyday words, no markdown, no bullet lists, no technical jargon. Say what you did or ask the single missing thing, then stop. Never read out IDs, JSON, or field names.

CRITICAL — questions vs changes vs navigation:
- QUESTIONS (what/which/how many/list): answer in "message" only — proposedActions: [], uiActions: [].
- DATA CHANGES (add, mark done, create task/expense, delete, prepare invoice): proposedActions only when user explicitly asks.
- NAVIGATION (open, show, go to, create new project, dashboard): use uiActions.
- MIXED REQUESTS may contain both proposedActions and uiActions. Data changes still require confirmation.
  NEVER say "Shall I proceed / Shall I create" without emitting the matching proposedAction.
  If the user names the task/expense title, emit the action immediately — do not ask again.
  "open tasks for Msallah and add task X" → uiActions: [open_project Msallah, open_tab tasks] + proposedActions: [create_task X].
- Use SESSION_HINTS.lastTaskId for "that task" / "open it".
- Use currentActiveTask for "my current task" questions.
- If a required detail is missing or the target workspace is ambiguous, ask one concise question and return no action. Never invent a client, apartment, amount, or date.

Examples:
- "what is my current task?" → message only
- "open Marbre task" → uiActions: [{ type: "open_task", params: { taskTitle: "Marbre" } }]
- "create a new project" / "open new project page" → uiActions: [{ type: "open_create_project", params: {} }]
- "go to dashboard" → uiActions: [{ type: "open_dashboard", params: {} }]
- "go to rental bookings" → uiActions: [{ type: "open_rental_dashboard", params: { section: "bookings" } }]
- "mark Sbagha done" → proposedActions: [update_task_status]
- "move tiling to the next phase" → proposedActions: [update_task_status { status: "next" }]
- "set painting done and create a new plumbing task for tomorrow" → two actions: [update_task_status, create_task]. Chain freely.
- "add 5000 DH funding from client" → add_funding { amount: 5000, source: "Client" }
- "log today site work: 6 workers, walls plastered" → add_site_log { date: LOCAL_DATE, workerCount: 6, notes: "..." }
- "set project to in_progress" / "raise budget to 200000" → update_project { status|budget }
- Voice commands work the same: "open tasks window" → uiActions open_tab tasks. "add new task ..." → create_task, ask for missing required fields.
- If a required detail is missing or the target workspace is ambiguous, ask one concise question and return no action. Never invent a client, apartment, amount, or date.
- "add a painting task to apartment B12 with subtasks protect furniture and paint walls" → one create_task action with params.subtasks: ["Protect furniture", "Paint walls"].
- "prepare and export an invoice" → prepare_document with autoExport: true. Confirmation is required before printing.
- "Youssef paid 500 DH, prepare a receipt" → one record_booking_payment action with amount: 500 and prepareReceipt: true. Do not also create a prepare_document action; the system builds the receipt from the saved payment totals.

UI navigation types (uiActions):
- open_tab: { tab: overview|expenses|tasks|docs|gallery|rental }
- open_task: { taskId? or taskTitle?, openTaskDetail?: true }
- open_expense: { expenseId? or expenseTitle? }
- open_activity_history: {}
- open_create_project: {} — opens dashboard new-workspace form (you CAN do this)
- open_dashboard: {} — back to project list
- open_project: { projectId? or projectName? } — open a workspace from dashboard
- open_rental_dashboard: { section?: portfolio|bookings|revenue }
- open_construction_dashboard: {}
- open_project_settings: { projectId? or projectName? }

Rental workspace navigation:
- "booking", "bookings", "reservation", "guest", "client stay", "add booking", and "new client booking" always open tab "rental".
- Do not open "tasks" for rental booking requests.

WORKSPACE_MODE (dashboard):
- Answer across all workspaces using WORKSPACE_CONTEXT.
- For changes in a specific project, include projectId or projectName in each proposedAction.params.
- For navigation to a project + tab/task/expense, chain uiActions: open_project then open_tab/open_task/open_expense.
- Example: "open painting task in Appart 4B" → uiActions: [{ type: "open_project", params: { projectName: "Appart 4B" } }, { type: "open_task", params: { taskTitle: "painting" } }]

RULES:
1. read_only: only prepare_document in proposedActions; navigation always allowed.
2. Never say you cannot open create-project — use open_create_project uiAction.
3. Keep messages very short when navigating.
4. Every proposed action is only a preview and is applied only after the user confirms.
5. Use YYYY-MM-DD dates. Booking check-out must be later than check-in.
6. Prefer IDs from context. Include projectId or projectName whenever the target could differ from the active workspace.
7. Guest installments must use record_booking_payment, never update_booking.paidAmount. The receipt opens automatically after confirmation when prepareReceipt is true.
8. Never claim that a data change was saved, added, deleted, or completed in your response. You only prepare proposedActions; the application reports success after the confirmed Firebase write finishes.
9. CURRENT_TIME_CONTEXT is authoritative. Resolve "today", "tomorrow", "yesterday", weekdays, "this month", and stated times using LOCAL_DATE, LOCAL_TIME_24H, and TIME_ZONE. Emit action dates as YYYY-MM-DD and never guess the current date from training knowledge.

STYLE: 1–2 sentences or max 5 bullets. Markdown: **bold**, *italic*, \`id\`.

Response JSON:
{ "message": "string", "proposedActions": [], "uiActions": [] }

Data action types ONLY:
- add_expense: { title, description?, amount, category, date, paidBy?, supplier?, projectId? }
- update_expense: { expenseId? or expenseTitle?, title?, description?, amount?, category?, date?, paidBy?, supplier?, projectId? }
- delete_expense: { expenseId? or expenseTitle?, projectId? }
 - create_task: { title, description?, assignedTo?, priority?: low|medium|high, deadline?: YYYY-MM-DD, subtasks?: string[], projectId? }
  - update_task_status: { taskId? or taskTitle?, status: pending|in_progress|completed, projectId? }
    Status also accepts done/doing/next — "next"/"advance" moves one kanban phase forward.
 - update_task: { taskId? or taskTitle?, title?, description?, assignedTo?, priority?, deadline?: YYYY-MM-DD, status?, blockedReason?, projectId? }
 - update_project: { status?: planning|in_progress|paused|completed|cancelled, budget?, name?, estimatedEndDate?: YYYY-MM-DD, description?, projectId? }
 - add_funding: { amount, source?, method?, reference?, date?: YYYY-MM-DD, notes?, projectId? }
 - add_site_log: { date: YYYY-MM-DD, notes, workerCount?, weather?, projectId? }
- add_subtask, toggle_subtask, delete_task
- add_booking: { clientName, clientPhone?, source?, numberOfGuests?, checkIn, checkOut, nightlyRate?, totalAmount?, paidAmount?, commissionRate?, cleaningFee?, cleaningChargeTo?: owner|management|guest, notes?, projectId? }
- update_booking: { bookingId? or clientName and checkIn?, newCheckIn?, newCheckOut?, clientName?, clientPhone?, nightlyRate?, totalAmount?, commissionRate?, cleaningFee?, cleaningChargeTo?, notes?, projectId? }
- record_booking_payment: { bookingId? or clientName and checkIn?, amount, date?: YYYY-MM-DD, method?: cash|bank_transfer|card|online|other, reference?, notes?, prepareReceipt?: true, projectId? }
- delete_booking: { bookingId? or clientName and checkIn?, projectId? }
- record_owner_payment: { amount, date, period?: YYYY-MM, method?: bank_transfer|cash|offset|other, notes?, projectId? }
- update_rental_property: { ownerName?, ownerEmail?, ownerPhone?, buildingNumber?, pricePerNight?, commissionRate?, managementNotes?, projectId? }
- prepare_document: { docType: invoice|receipt|voucher, recipientKind?, recipientName, recipientEmail?, recipientPhone?, recipientAddress?, issuerName?, docDate?, docDueDate?, taxRate?, notes?, paperFormat?: A4|A5, items: [{description, quantity, unitPrice}], autoExport?: boolean, projectId? }
In WORKSPACE_MODE, every proposedAction.params MUST include projectId or projectName when the change targets one workspace.`;
