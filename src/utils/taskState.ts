import { Language, Task, TaskPriority, TaskStatus } from '../types';

export const TASK_STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'completed'];

export const TASK_STATUS_LABELS: Record<TaskStatus, Record<Language, string>> = {
  pending: { en: 'Pending', fr: 'À faire', ar: 'معلق' },
  in_progress: { en: 'In progress', fr: 'En cours', ar: 'قيد التنفيذ' },
  completed: { en: 'Completed', fr: 'Terminé', ar: 'منجز' },
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = ['low', 'medium', 'high'];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, Record<Language, string>> = {
  low: { en: 'Low', fr: 'Basse', ar: 'منخفض' },
  medium: { en: 'Medium', fr: 'Moyenne', ar: 'متوسط' },
  high: { en: 'High', fr: 'Haute', ar: 'مرتفع' },
};

export function taskStatusLabel(status: TaskStatus, language: Language): string {
  return TASK_STATUS_LABELS[status]?.[language] || status;
}

export function taskPriorityLabel(priority: TaskPriority, language: Language): string {
  return TASK_PRIORITY_LABELS[priority]?.[language] || priority;
}

/**
 * One canonical owner for a task. Older records only wrote `assignedTo`, newer ones write
 * `workedBy`; kanban cards, reminders and the detail panel must all read the same field.
 */
export function taskOwnerEmail(task: Task): string {
  return task.workedBy || task.assignedTo || '';
}

/**
 * Assign in one shot so `workedBy` and `assignedTo` never drift apart.
 * Clearing the worker falls back to the original assignee instead of writing an empty string.
 */
export function withTaskOwner(task: Task, email: string): Task {
  return {
    ...task,
    workedBy: email,
    assignedTo: email || task.assignedTo,
  };
}

/** Reconcile legacy records so both owner fields agree (used on load/save paths). */
export function syncTaskOwner(task: Task): Task {
  if (!task.workedBy && task.assignedTo) return { ...task, workedBy: task.assignedTo };
  if (task.workedBy && task.workedBy !== task.assignedTo) {
    return { ...task, assignedTo: task.workedBy };
  }
  return task;
}

export function isTaskOverdue(task: Task, todayKey: string): boolean {
  if (task.status === 'completed') return false;
  const due = task.baselineDeadline || task.deadline;
  return Boolean(due) && due < todayKey;
}

export function isTaskBlocked(task: Task): boolean {
  return Boolean((task.blockedReason || '').trim());
}

export function unmetDependencyIds(task: Task, tasks: Task[]): string[] {
  const dependencyIds = task.dependencyIds || [];
  if (dependencyIds.length === 0) return [];
  const byId = new Map(tasks.map((item) => [item.id, item]));
  return dependencyIds.filter((id) => byId.get(id)?.status !== 'completed');
}

/**
 * Why a task cannot move to `completed` yet. Returns null when completion is allowed.
 * Callers surface this text so a refused drop never looks like a silent failure.
 */
export function completionBlocker(
  task: Task,
  tasks: Task[],
  language: Language
): string | null {
  const unmet = unmetDependencyIds(task, tasks);
  if (unmet.length > 0) {
    const titles = unmet
      .map((id) => tasks.find((item) => item.id === id)?.title || id)
      .slice(0, 3)
      .join(', ');
    return language === 'fr'
      ? `Terminer « ${task.title} » nécessite d'abord : ${titles}`
      : language === 'ar'
        ? `إنهاء «${task.title}» يتطلب أولاً: ${titles}`
        : `Complete these first: ${titles}`;
  }
  const subDone = (task.subtasks || []).filter((s) => s.isCompleted).length;
  const subTotal = (task.subtasks || []).length;
  if (subTotal > 0 && subDone < subTotal) {
    return language === 'fr'
      ? `Terminer « ${task.title} » nécessite ${subTotal - subDone} sous-tâche(s) restante(s)`
      : language === 'ar'
        ? `إنهاء «${task.title}» يتطلب إكمال ${subTotal - subDone} من المهام الفرعية`
        : `Finish the remaining ${subTotal - subDone} subtask(s) before completing this task`;
  }
  return null;
}