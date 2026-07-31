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
} from './rentalAccounting';

export type AIActionType =
  | 'add_expense'
  | 'update_expense'
  | 'update_task_status'
  | 'create_task'
  | 'delete_task'
  | 'add_subtask'
  | 'toggle_subtask'
  | 'delete_expense'
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
  'create_task',
  'delete_task',
  'add_subtask',
  'toggle_subtask',
  'delete_expense',
  'add_booking',
  'update_booking',
  'record_booking_payment',
  'delete_booking',
  'record_owner_payment',
  'update_rental_property',
  'prepare_document',
]);

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
  'okay',
  'ok',
  'yes',
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
  'wakha',
  'dirha',
  'safi',
  'mzyan',
  'iwa',
  'ah',
] as const;

const AI_APPROVAL_CONNECTORS = ['and then', 'and', 'then', 'et puis', 'et', 'puis', 'ثم'] as const;

export interface AIConfirmationIntent {
  followUp: string;
}

/**
 * Parse approval of an already-visible proposal. A navigation instruction may
 * follow through a connector, e.g. "confirm and open the booking".
 */
export function parseAIConfirmationMessage(value: string): AIConfirmationIntent | null {
  const message = normalizeApprovalMessage(value);
  for (const approval of AI_APPROVAL_PHRASES) {
    if (message === approval) return { followUp: '' };
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

function findTask(project: Project, params: Record<string, unknown>): Task | undefined {
  const id = params.taskId as string | undefined;
  if (id) return project.tasks.find((t) => t.id === id);
  const title = (params.taskTitle as string | undefined)?.toLowerCase();
  if (!title) return undefined;
  return project.tasks.find((t) => t.title.toLowerCase().includes(title));
}

function findExpense(project: Project, params: Record<string, unknown>): Expense | undefined {
  const id = params.expenseId as string | undefined;
  if (id) return project.expenses.find((e) => e.id === id);
  const title = (params.expenseTitle as string | undefined)?.toLowerCase();
  if (!title) return undefined;
  return project.expenses.find((e) => e.title.toLowerCase().includes(title));
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
        date: String(p.date || new Date().toISOString().split('T')[0]),
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
      if (!task) return { project, error: 'Task not found' };
      if (!canEditTask(task, project, email, ctx.userRole)) {
        return { project, error: 'This task is protected and cannot be modified' };
      }
      const status = action.params.status as Task['status'];
      if (!['pending', 'in_progress', 'completed'].includes(status)) {
        return { project, error: 'Invalid task status' };
      }
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
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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
            date: String(p.paymentDate || new Date().toISOString().split('T')[0]),
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
      const date = String(p.date || new Date().toISOString().split('T')[0]);
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
      const date = String(p.date || new Date().toISOString().split('T')[0]);
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

CRITICAL — questions vs changes vs navigation:
- QUESTIONS (what/which/how many/list): answer in "message" only — proposedActions: [], uiActions: [].
- DATA CHANGES (add, mark done, create task/expense, delete, prepare invoice): proposedActions only when user explicitly asks.
- NAVIGATION (open, show, go to, create new project, dashboard): use uiActions.
- MIXED REQUESTS may contain both proposedActions and uiActions. Data changes still require confirmation.
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
- add_subtask, toggle_subtask, delete_task
- add_booking: { clientName, clientPhone?, source?, numberOfGuests?, checkIn, checkOut, nightlyRate?, totalAmount?, paidAmount?, commissionRate?, cleaningFee?, cleaningChargeTo?: owner|management|guest, notes?, projectId? }
- update_booking: { bookingId? or clientName and checkIn?, newCheckIn?, newCheckOut?, clientName?, clientPhone?, nightlyRate?, totalAmount?, commissionRate?, cleaningFee?, cleaningChargeTo?, notes?, projectId? }
- record_booking_payment: { bookingId? or clientName and checkIn?, amount, date?: YYYY-MM-DD, method?: cash|bank_transfer|card|online|other, reference?, notes?, prepareReceipt?: true, projectId? }
- delete_booking: { bookingId? or clientName and checkIn?, projectId? }
- record_owner_payment: { amount, date, period?: YYYY-MM, method?: bank_transfer|cash|offset|other, notes?, projectId? }
- update_rental_property: { ownerName?, ownerEmail?, ownerPhone?, buildingNumber?, pricePerNight?, commissionRate?, managementNotes?, projectId? }
- prepare_document: { docType: invoice|receipt|voucher, recipientKind?, recipientName, recipientEmail?, recipientPhone?, recipientAddress?, issuerName?, docDate?, docDueDate?, taxRate?, notes?, paperFormat?: A4|A5, items: [{description, quantity, unitPrice}], autoExport?: boolean, projectId? }
In WORKSPACE_MODE, every proposedAction.params MUST include projectId or projectName when the change targets one workspace.`;
