import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { stripUndefinedForFirestore } from '../lib/firestoreSanitize';
import { Project, ProjectRecordKind } from '../types';
import {
  hydrateVersionedProject,
  ProjectRecordDocument,
  splitVersionedProject,
} from './projectStorage';

const stackKey = (projectId: string, actor: string) =>
  `hs_ai_undo_${projectId}_${actor.toLowerCase()}`;
const MAX = 12;
const ROOT_METADATA = new Set(['storageVersion', 'recordRevision', 'recordCounts']);

export interface AIUndoRecordChange {
  recordId: string;
  kind: ProjectRecordKind;
  previous: ProjectRecordDocument | null;
}

export interface AIUndoEntry {
  id: string;
  projectId: string;
  createdAt: string;
  createdBy: string;
  previousRootValues: Record<string, unknown>;
  missingRootKeys: string[];
  recordChanges: AIUndoRecordChange[];
}

const fingerprint = (value: unknown) => JSON.stringify(value);

export function createAIUndoEntry(
  before: Project,
  after: Project,
  actor: string,
): AIUndoEntry | null {
  if (before.id !== after.id) throw new Error('Cannot create undo across different workspaces.');
  const createdAt = new Date().toISOString();
  const beforeSplit = splitVersionedProject(before, actor, createdAt);
  const afterSplit = splitVersionedProject(after, actor, createdAt);
  const previousRootValues: Record<string, unknown> = {};
  const missingRootKeys: string[] = [];
  const beforeRoot = beforeSplit.root as unknown as Record<string, unknown>;
  const afterRoot = afterSplit.root as unknown as Record<string, unknown>;

  for (const key of new Set([...Object.keys(beforeRoot), ...Object.keys(afterRoot)])) {
    if (ROOT_METADATA.has(key) || fingerprint(beforeRoot[key]) === fingerprint(afterRoot[key])) continue;
    if (key in beforeRoot) previousRootValues[key] = beforeRoot[key];
    else missingRootKeys.push(key);
  }

  const recordChanges: AIUndoRecordChange[] = [];
  for (const recordId of new Set([...beforeSplit.records.keys(), ...afterSplit.records.keys()])) {
    const previous = beforeSplit.records.get(recordId) ?? null;
    const next = afterSplit.records.get(recordId) ?? null;
    if (fingerprint(previous?.payload) === fingerprint(next?.payload)) continue;
    recordChanges.push({
      recordId,
      kind: (previous ?? next)!.kind,
      previous,
    });
  }

  if (Object.keys(previousRootValues).length === 0 && missingRootKeys.length === 0 && recordChanges.length === 0) {
    return null;
  }
  return {
    id: `undo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId: before.id,
    createdAt,
    createdBy: actor.toLowerCase(),
    previousRootValues,
    missingRootKeys,
    recordChanges,
  };
}

export function applyAIUndoEntry(current: Project, entry: AIUndoEntry): Project {
  if (current.id !== entry.projectId) throw new Error('Undo belongs to a different workspace.');
  const split = splitVersionedProject(current, entry.createdBy);
  const root = { ...split.root } as unknown as Record<string, unknown>;
  Object.assign(root, entry.previousRootValues);
  entry.missingRootKeys.forEach((key) => delete root[key]);
  for (const change of entry.recordChanges) {
    if (change.previous) split.records.set(change.recordId, change.previous);
    else split.records.delete(change.recordId);
  }
  return hydrateVersionedProject(
    root as unknown as Project,
    Array.from(split.records.values()),
  );
}

function loadLocal(projectId: string, actor: string): AIUndoEntry[] {
  try {
    const raw = localStorage.getItem(stackKey(projectId, actor));
    return raw ? (JSON.parse(raw) as AIUndoEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(entry: AIUndoEntry): void {
  try {
    const list = loadLocal(entry.projectId, entry.createdBy)
      .filter((item) => item.id !== entry.id);
    localStorage.setItem(
      stackKey(entry.projectId, entry.createdBy),
      JSON.stringify([entry, ...list].slice(0, MAX)),
    );
  } catch {
    // Firestore remains the primary store when browser storage is unavailable.
  }
}

export async function pushUndoSnapshot(
  before: Project,
  after: Project,
  actor: string,
): Promise<AIUndoEntry | null> {
  const entry = createAIUndoEntry(before, after, actor);
  if (!entry) return null;
  await setDoc(
    doc(db, 'projects', entry.projectId, 'ai_undo', entry.id),
    stripUndefinedForFirestore(entry),
  );
  saveLocal(entry);
  return entry;
}

export async function loadUndoStack(projectId: string, actor: string): Promise<AIUndoEntry[]> {
  try {
    const snapshot = await getDocs(query(
      collection(db, 'projects', projectId, 'ai_undo'),
      where('createdBy', '==', actor.toLowerCase()),
      limit(30),
    ));
    const sorted = snapshot.docs
      .map((item) => item.data() as AIUndoEntry)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const cloud = sorted.slice(0, MAX);
    await Promise.all(sorted.slice(MAX).map((entry) =>
      deleteDoc(doc(db, 'projects', projectId, 'ai_undo', entry.id))
    ));
    cloud.forEach(saveLocal);
    return cloud;
  } catch {
    return loadLocal(projectId, actor)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX);
  }
}

export async function removeUndoEntry(entry: AIUndoEntry): Promise<void> {
  await deleteDoc(doc(db, 'projects', entry.projectId, 'ai_undo', entry.id));
  const remaining = loadLocal(entry.projectId, entry.createdBy).filter((item) => item.id !== entry.id);
  try {
    localStorage.setItem(stackKey(entry.projectId, entry.createdBy), JSON.stringify(remaining));
  } catch {
    // Ignore local cache failures.
  }
}

export async function undoStackSize(projectId: string, actor: string): Promise<number> {
  return (await loadUndoStack(projectId, actor)).length;
}
