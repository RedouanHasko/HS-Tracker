import { Project } from '../types';

export type ProjectTab = 'overview' | 'expenses' | 'tasks' | 'docs';

export type AIUIActionType =
  | 'open_tab'
  | 'open_task'
  | 'open_expense'
  | 'open_activity_history'
  | 'open_create_project'
  | 'open_dashboard'
  | 'open_project';

export interface AIUIAction {
  type: AIUIActionType;
  params: {
    tab?: ProjectTab;
    taskId?: string;
    taskTitle?: string;
    expenseId?: string;
    expenseTitle?: string;
    openTaskDetail?: boolean;
    projectId?: string;
    projectName?: string;
  };
}

const VALID_UI_TYPES = new Set<AIUIActionType>([
  'open_tab',
  'open_task',
  'open_expense',
  'open_activity_history',
  'open_create_project',
  'open_dashboard',
  'open_project',
]);

const VALID_TABS = new Set<ProjectTab>(['overview', 'expenses', 'tasks', 'docs']);

export function sanitizeUIActions(actions: unknown[]): AIUIAction[] {
  if (!Array.isArray(actions)) return [];

  const cleaned: AIUIAction[] = [];
  for (const raw of actions) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Partial<AIUIAction>;
    const type = String(a.type || '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_') as AIUIActionType;
    if (!VALID_UI_TYPES.has(type)) continue;
    const params = (a.params && typeof a.params === 'object' ? a.params : {}) as AIUIAction['params'];
    if (type === 'open_tab' && params.tab && !VALID_TABS.has(params.tab)) continue;
    cleaned.push({ type, params });
  }
  return cleaned;
}

/** User wants to navigate the UI (not mutate data) */
export function userWantsNavigation(userMessage: string): boolean {
  const m = userMessage.trim().toLowerCase();
  if (!m) return false;
  return (
    /\b(open|show|go to|take me|navigate|view|see|display|bring|scroll|jump)\b/i.test(m) ||
    /\b(let me see|show me)\b/i.test(m) ||
    /\b(new project|create project|launch workspace|new workspace|start a project)\b/i.test(m)
  );
}

export function resolveTaskId(project: Project, params: AIUIAction['params']): string | null {
  if (params.taskId) {
    const hit = project.tasks.find((t) => t.id === params.taskId);
    if (hit) return hit.id;
  }
  if (params.taskTitle) {
    const q = params.taskTitle.toLowerCase();
    const hit = project.tasks.find((t) => t.title.toLowerCase().includes(q));
    if (hit) return hit.id;
  }
  return null;
}

export function resolveExpenseId(project: Project, params: AIUIAction['params']): string | null {
  if (params.expenseId) {
    const hit = project.expenses.find((e) => e.id === params.expenseId);
    if (hit) return hit.id;
  }
  if (params.expenseTitle) {
    const q = params.expenseTitle.toLowerCase();
    const hit = project.expenses.find((e) => e.title.toLowerCase().includes(q));
    if (hit) return hit.id;
  }
  return null;
}

export function resolveProjectId(
  projects: Project[],
  params: AIUIAction['params']
): string | null {
  if (params.projectId) {
    const hit = projects.find((p) => p.id === params.projectId);
    if (hit) return hit.id;
  }
  if (params.projectName) {
    const q = params.projectName.toLowerCase();
    const hit = projects.find((p) => p.name.toLowerCase().includes(q));
    if (hit) return hit.id;
  }
  return null;
}

export interface PendingAiNav {
  projectId: string;
  tab?: ProjectTab;
  taskId?: string;
  expenseId?: string;
  openActivityHistory?: boolean;
  openTaskDetail?: boolean;
}

export interface CompiledAiNavigation {
  openDashboard?: boolean;
  openCreateProject?: boolean;
  projectId?: string;
  tab?: ProjectTab;
  taskId?: string;
  expenseId?: string;
  openActivityHistory?: boolean;
  openTaskDetail?: boolean;
}

/** Merge multiple uiActions into one navigation plan (dashboard + cross-project) */
export function compileUIActions(
  actions: AIUIAction[],
  projects: Project[],
  activeProject: Project | null
): CompiledAiNavigation | null {
  const batch: CompiledAiNavigation = {};
  let target = activeProject;

  for (const action of actions) {
    switch (action.type) {
      case 'open_dashboard':
        batch.openDashboard = true;
        target = null;
        break;
      case 'open_create_project':
        batch.openCreateProject = true;
        break;
      case 'open_project': {
        const id = resolveProjectId(projects, action.params);
        if (id) {
          batch.projectId = id;
          target = projects.find((p) => p.id === id) ?? target;
        }
        break;
      }
      case 'open_tab':
        if (action.params.tab) batch.tab = action.params.tab;
        break;
      case 'open_task': {
        batch.tab = 'tasks';
        if (action.params.openTaskDetail !== false) batch.openTaskDetail = true;
        if (target) {
          const tid = resolveTaskId(target, action.params);
          if (tid) batch.taskId = tid;
        }
        break;
      }
      case 'open_expense': {
        batch.tab = 'expenses';
        if (target) {
          const eid = resolveExpenseId(target, action.params);
          if (eid) batch.expenseId = eid;
        }
        break;
      }
      case 'open_activity_history':
        batch.openActivityHistory = true;
        break;
      default:
        break;
    }
  }

  if (!batch.projectId && target) batch.projectId = target.id;
  return Object.keys(batch).length > 0 ? batch : null;
}

export interface AINavigationHandlers {
  project?: Project | null;
  setActiveTab?: (tab: ProjectTab) => void;
  setSelectedTaskId?: (id: string | null) => void;
  setShowActivityHistory?: (open: boolean) => void;
  flashFocus?: (elementId: string) => void;
  /** Leave current project and open the new-workspace dialog */
  openCreateProject?: () => void;
  /** Return to dashboard home (project list) */
  openDashboard?: () => void;
  /** Select a project workspace */
  onSelectProject?: (projectId: string) => void;
  /** Deferred navigation after project loads */
  setPendingAiNav?: (nav: PendingAiNav) => void;
  projects?: Project[];
}

/** Run UI navigation — supports dashboard, cross-project, and in-project flows */
export function executeAIUINavigationPlan(
  actions: AIUIAction[],
  handlers: AINavigationHandlers & { activeProject?: Project | null }
): boolean {
  const projects = handlers.projects ?? [];
  const activeProject = handlers.activeProject ?? handlers.project ?? null;
  const compiled = compileUIActions(actions, projects, activeProject);
  if (!compiled) return false;

  if (compiled.openDashboard) {
    handlers.openDashboard?.();
  }
  if (compiled.openCreateProject) {
    handlers.openCreateProject?.();
    window.setTimeout(() => pulseElementById('sidebar-pj-creator-modal'), 320);
  }

  const targetProjectId = compiled.projectId ?? activeProject?.id;
  const switchingProject = targetProjectId && targetProjectId !== activeProject?.id;

  if (switchingProject && targetProjectId) {
    handlers.onSelectProject?.(targetProjectId);
  }

  const needsDeferred =
    compiled.tab ||
    compiled.taskId ||
    compiled.expenseId ||
    compiled.openActivityHistory;

  if (needsDeferred && targetProjectId) {
    handlers.setPendingAiNav?.({
      projectId: targetProjectId,
      tab: compiled.tab,
      taskId: compiled.taskId,
      expenseId: compiled.expenseId,
      openActivityHistory: compiled.openActivityHistory,
      openTaskDetail: compiled.openTaskDetail,
    });
    return true;
  }

  if (activeProject && !switchingProject) {
    for (const action of actions) {
      executeAIUIAction(action, { ...handlers, project: activeProject });
    }
    return true;
  }

  if (compiled.openCreateProject || compiled.openDashboard) return true;
  return !!targetProjectId;
}

/** Run a single UI navigation action (no Firestore writes) */
export function executeAIUIAction(action: AIUIAction, handlers: AINavigationHandlers): boolean {
  switch (action.type) {
    case 'open_project': {
      const id = resolveProjectId(handlers.projects ?? [], action.params);
      if (!id) return false;
      handlers.onSelectProject?.(id);
      return true;
    }
    case 'open_create_project': {
      handlers.openCreateProject?.();
      window.setTimeout(() => pulseElementById('sidebar-pj-creator-modal'), 320);
      return true;
    }
    case 'open_dashboard': {
      handlers.openDashboard?.();
      window.setTimeout(() => pulseElementById('sidebar-new-workspace-btn'), 220);
      return true;
    }
    case 'open_tab': {
      const tab = action.params.tab;
      if (!tab || !VALID_TABS.has(tab) || !handlers.setActiveTab) return false;
      handlers.setActiveTab(tab);
      handlers.flashFocus?.(`project-tab-${tab}`);
      return true;
    }
    case 'open_task': {
      const project = handlers.project;
      if (!project || !handlers.setActiveTab) return false;
      const taskId = resolveTaskId(project, action.params);
      if (!taskId) return false;
      handlers.setActiveTab('tasks');
      if (action.params.openTaskDetail !== false) {
        handlers.setSelectedTaskId?.(taskId);
      }
      handlers.flashFocus?.(`task-card-${taskId}`);
      return true;
    }
    case 'open_expense': {
      const project = handlers.project;
      if (!project || !handlers.setActiveTab) return false;
      const expenseId = resolveExpenseId(project, action.params);
      if (!expenseId) return false;
      handlers.setActiveTab('expenses');
      handlers.flashFocus?.(`expense-row-${expenseId}`);
      return true;
    }
    case 'open_activity_history':
      handlers.setShowActivityHistory?.(true);
      return true;
    default:
      return false;
  }
}

/** @deprecated use executeAIUIAction */
export function executeAIUINavigation(
  project: Project,
  action: AIUIAction,
  handlers: Omit<AINavigationHandlers, 'project' | 'openCreateProject' | 'openDashboard'> & {
    setActiveTab: (tab: ProjectTab) => void;
    setSelectedTaskId: (id: string | null) => void;
    setShowActivityHistory: (open: boolean) => void;
    flashFocus: (elementId: string) => void;
  }
): boolean {
  return executeAIUIAction(action, { ...handlers, project });
}

/** Scroll to element and trigger CSS focus pulse (works for global App elements too) */
export function pulseElementById(elementId: string, durationMs = 3500): void {
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ai-focus-pulse');
      window.setTimeout(() => el.classList.remove('ai-focus-pulse'), durationMs);
    }, 120);
  });
}

export function scrollAndPulseFocus(elementId: string): void {
  pulseElementById(elementId);
}
