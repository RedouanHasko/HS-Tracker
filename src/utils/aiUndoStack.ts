import { Project } from '../types';

const stackKey = (projectId: string) => `hs_ai_undo_${projectId}`;
const MAX = 12;

/** Session undo snapshots before AI-applied changes */
export function pushUndoSnapshot(project: Project): void {
  try {
    const list = loadUndoStack(project.id);
    list.unshift(JSON.parse(JSON.stringify(project)) as Project);
    localStorage.setItem(stackKey(project.id), JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota */
  }
}

export function loadUndoStack(projectId: string): Project[] {
  try {
    const raw = localStorage.getItem(stackKey(projectId));
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

export function popUndoSnapshot(projectId: string): Project | null {
  const list = loadUndoStack(projectId);
  if (list.length === 0) return null;
  const [head, ...rest] = list;
  localStorage.setItem(stackKey(projectId), JSON.stringify(rest));
  return head;
}

export function undoStackSize(projectId: string): number {
  return loadUndoStack(projectId).length;
}
