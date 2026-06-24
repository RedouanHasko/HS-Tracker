import { Project, Task, Expense, ExpenseCategory, UserRole } from '../types';
import { ProjectPermissions, canEditTask, canDeleteExpense } from './permissions';

export type AIActionType =
  | 'add_expense'
  | 'update_task_status'
  | 'create_task'
  | 'add_subtask'
  | 'toggle_subtask'
  | 'delete_expense'
  | 'prepare_document';

const VALID_ACTION_TYPES = new Set<AIActionType>([
  'add_expense',
  'update_task_status',
  'create_task',
  'add_subtask',
  'toggle_subtask',
  'delete_expense',
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
    /\b(add|create|delete|remove|mark|complete|finish|done|update|set|prepare|make|toggle|change|assign|record|log|insert|new)\b/i;
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
  'miscellaneous',
];

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
        id: `exp_ai_${Date.now()}`,
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
      const newTask: Task = {
        id: `tsk_ai_${Date.now()}`,
        title: String(p.title),
        description: String(p.description || ''),
        assignedTo: String(p.assignedTo || email),
        priority: (p.priority as Task['priority']) || 'medium',
        deadline:
          String(p.deadline) ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
        subtasks: [],
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
        id: `sub_ai_${Date.now()}`,
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

export const AI_SYSTEM_PROMPT = `You are HS Tracker AI for construction/renovation projects.

You receive PROJECT_CONTEXT, CONVERSATION_HISTORY (this chat session), SESSION_HINTS, tasks, expenses, and userRole.

MEMORY: Use CONVERSATION_HISTORY to remember what you and the user already discussed. Refer back naturally (e.g. "that task", "as I said"). Do not repeat full lists unless asked.

CRITICAL — questions vs changes vs navigation:
- QUESTIONS (what/which/how many/list): answer in "message" only — proposedActions: [], uiActions: [].
- DATA CHANGES (add, mark done, create task/expense, delete, prepare invoice): proposedActions only when user explicitly asks.
- NAVIGATION (open, show, go to, create new project, dashboard): uiActions only — proposedActions: [].
- Use SESSION_HINTS.lastTaskId for "that task" / "open it".
- Use currentActiveTask for "my current task" questions.

Examples:
- "what is my current task?" → message only
- "open Marbre task" → uiActions: [{ type: "open_task", params: { taskTitle: "Marbre" } }]
- "create a new project" / "open new project page" → uiActions: [{ type: "open_create_project", params: {} }]
- "go to dashboard" → uiActions: [{ type: "open_dashboard", params: {} }]
- "mark Sbagha done" → proposedActions: [update_task_status]

UI navigation types (uiActions):
- open_tab: { tab: overview|expenses|tasks|docs }
- open_task: { taskId? or taskTitle?, openTaskDetail?: true }
- open_expense: { expenseId? or expenseTitle? }
- open_activity_history: {}
- open_create_project: {} — opens dashboard new-workspace form (you CAN do this)
- open_dashboard: {} — back to project list
- open_project: { projectId? or projectName? } — open a workspace from dashboard

WORKSPACE_MODE (dashboard):
- Answer across all workspaces using WORKSPACE_CONTEXT.
- For changes in a specific project, include projectId or projectName in each proposedAction.params.
- For navigation to a project + tab/task/expense, chain uiActions: open_project then open_tab/open_task/open_expense.
- Example: "open painting task in Appart 4B" → uiActions: [{ type: "open_project", params: { projectName: "Appart 4B" } }, { type: "open_task", params: { taskTitle: "painting" } }]

RULES:
1. read_only: only prepare_document in proposedActions; navigation always allowed.
2. Never say you cannot open create-project — use open_create_project uiAction.
3. Keep messages very short when navigating.

STYLE: 1–2 sentences or max 5 bullets. Markdown: **bold**, *italic*, \`id\`.

Response JSON:
{ "message": "string", "proposedActions": [], "uiActions": [] }

Data action types ONLY: add_expense, update_task_status, create_task, add_subtask, toggle_subtask, delete_expense, prepare_document.
In WORKSPACE_MODE, every proposedAction.params MUST include projectId or projectName when the change targets one workspace.`;
