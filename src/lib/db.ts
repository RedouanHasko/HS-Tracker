import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  deleteField,
  runTransaction
} from 'firebase/firestore';
import {
  AppNotification,
  CivilDocumentRecord,
  ContactRecord,
  DocumentKind,
  DocumentParty,
  DocumentPresetsMap,
  Invitation,
  Project,
  TimelineActivity,
  UserDocumentSettings,
  UserProfile,
} from '../types';
import { buildProjectAccessFields, needsProjectAccessFieldSync } from '../utils/permissions';
import { stripUndefinedForFirestore } from './firestoreSanitize';
import {
  hydrateVersionedProject,
  collectProjectRecordStoragePaths,
  PROJECT_RECORDS_COLLECTION,
  PROJECT_TRASH_COLLECTION,
  projectRecordFingerprint,
  ProjectRecordDocument,
  ProjectTrashDocument,
  splitVersionedProject,
} from '../utils/projectStorage';
import { deleteStorageFileStrict } from './storage';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export const subscribeToContacts = (
  userId: string,
  callback: (contacts: ContactRecord[]) => void,
) => onSnapshot(
  query(collection(db, 'users', userId, 'contacts'), orderBy('updatedAt', 'desc'), limit(500)),
  (snapshot) => callback(snapshot.docs.map((item) => item.data() as ContactRecord)),
  (error) => logFirestoreError(error, OperationType.LIST, `users/${userId}/contacts`),
);

export const saveContactToDB = async (userId: string, contact: ContactRecord): Promise<void> => {
  if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error('Sign in before saving contacts.');
  if (!contact.id || !contact.name.trim()) throw new Error('A contact name is required.');
  await setDoc(doc(db, 'users', userId, 'contacts', contact.id), stripUndefinedForFirestore(contact));
};

export const deleteContactFromDB = async (userId: string, contactId: string): Promise<void> => {
  if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error('Sign in before deleting contacts.');
  await deleteDoc(doc(db, 'users', userId, 'contacts', contactId));
};

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/** Log Firestore read failures without throwing (e.g. optional dashboard feeds). */
export function logFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
}

// Ensure user profile is registered globally
export const registerUserProfileIfNeeded = async (uid: string, email: string, displayName: string | null) => {
  if (!uid || !email) return;
  try {
    const profileRef = doc(db, 'user_profiles', uid);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      const name = displayName || email.split('@')[0];
      const username = email.split('@')[0].toLowerCase();
      const generatedAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0284c7`;
      
      const newProfile: UserProfile & { email?: string; username?: string } = {
        fullName: name,
        role: '',
        company: '',
        phone: '',
        city: '',
        currency: 'DH',
        avatarUrl: generatedAvatar,
        email: email.toLowerCase(),
        username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(profileRef, stripUndefinedForFirestore(newProfile));
      
      // Also write private details for backward compatibility
      const oldPathRef = doc(db, `users/${uid}/profile`, 'details');
      await setDoc(oldPathRef, stripUndefinedForFirestore(newProfile));
    }
  } catch (err) {
    console.error("Error registering global user profile:", err);
  }
};

// Find user profile by email or username
export const findUserProfile = async (search: string): Promise<UserProfile & { email?: string; uid?: string } | null> => {
  const qClean = search.trim().toLowerCase();
  if (!qClean) return null;
  try {
    const profilesRef = collection(db, 'user_profiles');
    
    // Try search by email
    const q1 = query(profilesRef, where("email", "==", qClean));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      const docData = snap1.docs[0].data();
      return { ...docData, email: docData.email, uid: snap1.docs[0].id } as any;
    }
    
    // Try search by username
    const q2 = query(profilesRef, where("username", "==", qClean));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      const docData = snap2.docs[0].data();
      return { ...docData, email: docData.email, uid: snap2.docs[0].id } as any;
    }
    
    // Fallback: search profile collection to see if we can match by email in any public record
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'user_profiles');
    return null;
  }
};

/** Normalize members + optional arrays so merge writes never drop server fields or break rules diffs. */
function normalizeProjectForFirestore(project: Project): Project {
  const members = (project.members ?? []).map((m) => {
    const email = m.email.toLowerCase();
    const member: Project['members'][number] = {
      email,
      name: m.name,
      role: m.role,
      ...(m.status ? { status: m.status } : {}),
      ...(m.avatar ? { avatar: m.avatar } : {}),
      ...(m.status === 'pending' && m.invitationId ? { invitationId: m.invitationId } : {}),
    };
    return member;
  });

  return {
    ...project,
    creatorEmail: (project.creatorEmail || '').toLowerCase(),
    members,
    sections: project.sections ?? [],
    expenses: project.expenses ?? [],
    tasks: project.tasks ?? [],
    photos: project.photos ?? [],
    documents: project.documents ?? [],
    reimbursements: project.reimbursements ?? [],
    rentalBookings: project.rentalBookings ?? [],
    rentalOwnerPayments: project.rentalOwnerPayments ?? [],
    ...(project.rentalProperty
      ? {
          rentalProperty: {
            ...project.rentalProperty,
            commissionRate: Number(project.rentalProperty.commissionRate) || 0,
            pricePerNight: Number(project.rentalProperty.pricePerNight) || 0,
          },
        }
      : {}),
  };
}

const projectRecordCache = new Map<string, Map<string, ProjectRecordDocument>>();
const hydratedProjectCache = new Map<string, { revision?: string; project: Project }>();

async function loadProjectRecords(projectId: string): Promise<Map<string, ProjectRecordDocument>> {
  const snapshot = await getDocs(collection(db, 'projects', projectId, PROJECT_RECORDS_COLLECTION));
  const records = new Map(
    snapshot.docs.map((recordDoc) => [recordDoc.id, recordDoc.data() as ProjectRecordDocument])
  );
  projectRecordCache.set(projectId, records);
  return records;
}

async function hydrateProjectFromFirestore(project: Project): Promise<Project> {
  if (project.storageVersion !== 2) return project;
  const cached = hydratedProjectCache.get(project.id);
  if (cached && cached.revision === project.recordRevision) return cached.project;

  const records = await loadProjectRecords(project.id);
  const hydrated = hydrateVersionedProject(project, Array.from(records.values()));
  hydratedProjectCache.set(project.id, { revision: project.recordRevision, project: hydrated });
  return hydrated;
}

async function saveVersionedProject(project: Project, authEmail: string): Promise<void> {
  const normalized = normalizeProjectForFirestore(project);
  const access = buildProjectAccessFields(normalized);
  const { root, records } = splitVersionedProject(
    { ...normalized, ...access },
    authEmail
  );
  const previousRecords =
    projectRecordCache.get(project.id) ||
    (project.recordRevision ? await loadProjectRecords(project.id) : new Map<string, ProjectRecordDocument>());
  const changedRecords = Array.from(records.entries()).filter(([recordId, record]) => {
    const previous = previousRecords.get(recordId);
    return !previous || projectRecordFingerprint(previous) !== projectRecordFingerprint(record);
  });
  const deletedRecordIds = Array.from(previousRecords.keys()).filter(
    (recordId) => !records.has(recordId)
  );
  if (changedRecords.length === 0 && deletedRecordIds.length === 0 && project.recordRevision) {
    root.recordRevision = project.recordRevision;
  }
  const writeCount = 1 + changedRecords.length + (deletedRecordIds.length * 2);
  if (writeCount > 450) {
    throw new Error(
      `This update changes ${writeCount - 1} records at once. Split it into smaller updates before saving.`
    );
  }

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'projects', project.id),
    stripUndefinedForFirestore(root),
    { merge: true }
  );
  for (const [recordId, record] of changedRecords) {
    batch.set(
      doc(db, 'projects', project.id, PROJECT_RECORDS_COLLECTION, recordId),
      stripUndefinedForFirestore(record)
    );
  }
  for (const recordId of deletedRecordIds) {
    const previous = previousRecords.get(recordId);
    if (previous) {
      batch.set(
        doc(db, 'projects', project.id, PROJECT_TRASH_COLLECTION, recordId),
        stripUndefinedForFirestore({
          ...previous,
          deletedAt: root.recordRevision,
          deletedBy: authEmail,
        })
      );
    }
    batch.delete(doc(db, 'projects', project.id, PROJECT_RECORDS_COLLECTION, recordId));
  }
  await batch.commit();

  projectRecordCache.set(project.id, records);
  hydratedProjectCache.set(project.id, {
    revision: root.recordRevision,
    project: normalized,
  });
}

const LEGACY_PROJECT_ARRAY_FIELDS = [
  'sections',
  'expenses',
  'tasks',
  'photos',
  'documents',
  'reimbursements',
  'rentalBookings',
  'rentalOwnerPayments',
] as const;

export const migrateProjectToVersionedStorage = async (project: Project): Promise<void> => {
  const authEmail = auth.currentUser?.email?.toLowerCase();
  if (!authEmail) throw new Error('Sign in before migrating a workspace.');
  if (project.creatorEmail.toLowerCase() !== authEmail) {
    throw new Error('Only the workspace owner can migrate its storage.');
  }
  if (project.storageVersion === 2) return;

  const normalized = normalizeProjectForFirestore(project);
  const access = buildProjectAccessFields(normalized);
  const { root, records } = splitVersionedProject({ ...normalized, ...access }, authEmail);
  if (records.size + 1 > 450) {
    throw new Error(
      `This workspace has ${records.size} records. Export it, then migrate it in smaller groups.`
    );
  }

  const batch = writeBatch(db);
  const rootUpdate: Record<string, unknown> = {
    ...stripUndefinedForFirestore(root),
  };
  for (const field of LEGACY_PROJECT_ARRAY_FIELDS) rootUpdate[field] = deleteField();
  batch.set(doc(db, 'projects', project.id), rootUpdate, { merge: true });
  records.forEach((record, recordId) => {
    batch.set(
      doc(db, 'projects', project.id, PROJECT_RECORDS_COLLECTION, recordId),
      stripUndefinedForFirestore(record)
    );
  });
  await batch.commit();

  projectRecordCache.set(project.id, records);
  hydratedProjectCache.set(project.id, {
    revision: root.recordRevision,
    project: { ...normalized, storageVersion: 2, recordRevision: root.recordRevision, recordCounts: root.recordCounts },
  });
};

export const loadProjectTrash = async (projectId: string): Promise<ProjectTrashDocument[]> => {
  const snapshot = await getDocs(collection(db, 'projects', projectId, PROJECT_TRASH_COLLECTION));
  return snapshot.docs
    .map((trashDoc) => trashDoc.data() as ProjectTrashDocument)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
};

export const restoreProjectRecordFromTrash = async (
  projectId: string,
  recordId: string
): Promise<void> => {
  const authEmail = auth.currentUser?.email?.toLowerCase();
  if (!authEmail) throw new Error('Sign in before restoring a record.');

  const projectRef = doc(db, 'projects', projectId);
  const trashRef = doc(db, 'projects', projectId, PROJECT_TRASH_COLLECTION, recordId);
  const [projectSnapshot, trashSnapshot] = await Promise.all([
    getDoc(projectRef),
    getDoc(trashRef),
  ]);
  if (!projectSnapshot.exists() || projectSnapshot.data().storageVersion !== 2) {
    throw new Error('This workspace is not available for record recovery.');
  }
  if (!trashSnapshot.exists()) throw new Error('This deleted record is no longer available.');

  const trash = trashSnapshot.data() as ProjectTrashDocument;
  const revision = new Date().toISOString();
  const counts = {
    ...(projectSnapshot.data().recordCounts || {}),
    [trash.kind]: Number(projectSnapshot.data().recordCounts?.[trash.kind] || 0) + 1,
  };
  const restored: ProjectRecordDocument = {
    projectId,
    kind: trash.kind,
    entityId: trash.entityId,
    payload: trash.payload,
    updatedAt: revision,
    updatedBy: authEmail,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'projects', projectId, PROJECT_RECORDS_COLLECTION, recordId), restored);
  batch.delete(trashRef);
  batch.update(projectRef, { recordRevision: revision, recordCounts: counts });
  await batch.commit();
  projectRecordCache.delete(projectId);
  hydratedProjectCache.delete(projectId);
};

export const permanentlyDeleteProjectTrashRecord = async (
  projectId: string,
  recordId: string
): Promise<void> => {
  const trashRef = doc(db, 'projects', projectId, PROJECT_TRASH_COLLECTION, recordId);
  const trashSnapshot = await getDoc(trashRef);
  if (!trashSnapshot.exists()) return;
  const trash = trashSnapshot.data() as ProjectTrashDocument;
  const paths = collectProjectRecordStoragePaths(trash.payload);
  const firestoreMediaIds = paths
    .filter((path) => path.startsWith('firestore:project_task_media/'))
    .map((path) => path.replace('firestore:project_task_media/', ''));
  const externalPaths = paths.filter((path) => !path.startsWith('firestore:project_task_media/'));

  await Promise.all(externalPaths.map(deleteStorageFileStrict));
  if (firestoreMediaIds.length + 1 > 450) {
    throw new Error('This record references too many media files for one cleanup operation.');
  }

  const batch = writeBatch(db);
  firestoreMediaIds.forEach((mediaId) => {
    batch.delete(doc(db, 'project_task_media', mediaId));
  });
  batch.delete(trashRef);
  await batch.commit();
};

// Projects: Root dynamic collection
export const saveProjectToDB = async (userId: string, project: Project) => {
  if (!project.id) return;
  const authEmail = auth.currentUser?.email?.toLowerCase();
  if (!authEmail) {
    handleFirestoreError(new Error('Not signed in'), OperationType.WRITE, `projects/${project.id}`);
    return;
  }
  try {
    const normalized = normalizeProjectForFirestore({
      ...project,
      creatorEmail: project.creatorEmail || authEmail,
    });
    if (normalized.storageVersion === 2) {
      await saveVersionedProject(normalized, authEmail);
      return;
    }
    const access = buildProjectAccessFields(normalized);

    const updatedProject = stripUndefinedForFirestore({
      ...normalized,
      ...access,
    });

    const projectRef = doc(db, 'projects', project.id);
    // A merge creates missing documents too, avoiding one billed read before every write.
    await setDoc(projectRef, updatedProject, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `projects/${project.id}`);
  }
};

/**
 * Refresh memberEmails / memberRoleByEmail on Firestore before media uploads.
 * Rules read the stored project doc — stale lists cause permission-denied on receipt upload.
 */
export const syncProjectAccessFieldsIfNeeded = async (
  userId: string,
  project: Project
): Promise<void> => {
  if (!needsProjectAccessFieldSync(project)) return;
  await saveProjectToDB(userId, project);
};

export const getProjectsFromDB = async (email: string): Promise<Project[]> => {
  if (!email) return [];
  try {
    const cleanEmail = email.toLowerCase();
    const projectsRef = collection(db, 'projects');
    
    const q1 = query(projectsRef, where('creatorEmail', '==', cleanEmail));
    const snap1 = await getDocs(q1);
    const p1 = snap1.docs.map(doc => doc.data() as Project);
    
    const q2 = query(projectsRef, where('memberEmails', 'array-contains', cleanEmail));
    const snap2 = await getDocs(q2);
    const p2 = snap2.docs.map(doc => doc.data() as Project);

    const mergedMap = new Map<string, Project>();
    p1.forEach(p => mergedMap.set(p.id, p));
    p2.forEach(p => mergedMap.set(p.id, p));
    
    return await Promise.all(Array.from(mergedMap.values()).map(hydrateProjectFromFirestore));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'projects');
    return [];
  }
};

export const subscribeToProjects = (email: string, callback: (projects: Project[]) => void) => {
  if (!email) {
    callback([]);
    return () => {};
  }
  const cleanEmail = email.toLowerCase();
  const projectsRef = collection(db, 'projects');

  const q1 = query(projectsRef, where('creatorEmail', '==', cleanEmail));
  const q2 = query(projectsRef, where('memberEmails', 'array-contains', cleanEmail));

  let p1: Project[] = [];
  let p2: Project[] = [];

  let updateGeneration = 0;
  const handleUpdate = async () => {
    const generation = ++updateGeneration;
    const mergedMap = new Map<string, Project>();
    p1.forEach(p => mergedMap.set(p.id, p));
    p2.forEach(p => mergedMap.set(p.id, p));
    try {
      const hydrated = await Promise.all(
        Array.from(mergedMap.values()).map(hydrateProjectFromFirestore)
      );
      if (generation === updateGeneration) callback(hydrated);
    } catch (error) {
      logFirestoreError(error, OperationType.GET, 'projects/*/records');
    }
  };

  const unsub1 = onSnapshot(q1, (snap) => {
    p1 = snap.docs.map(d => d.data() as Project);
    void handleUpdate();
  }, (error) => {
    console.error("Projects subscriber error creatorEmail:", error);
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    p2 = snap.docs.map(d => d.data() as Project);
    void handleUpdate();
  }, (error) => {
    console.error("Projects subscriber error memberEmails:", error);
  });

  return () => {
    unsub1();
    unsub2();
  };
};

export const deleteProjectFromDB = async (userId: string, projectId: string) => {
  if (!projectId) return;
  try {
    const projectRef = doc(db, 'projects', projectId);
    const projectSnapshot = await getDoc(projectRef);
    if (projectSnapshot.exists() && projectSnapshot.data().storageVersion === 2) {
      const records = await loadProjectRecords(projectId);
      if (records.size > 449) {
        throw new Error('This project is too large for direct deletion. Archive it before cleanup.');
      }
      const batch = writeBatch(db);
      records.forEach((_record, recordId) => {
        batch.delete(doc(db, 'projects', projectId, PROJECT_RECORDS_COLLECTION, recordId));
      });
      batch.delete(projectRef);
      await batch.commit();
    } else {
      await deleteDoc(projectRef);
    }
    projectRecordCache.delete(projectId);
    hydratedProjectCache.delete(projectId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
  }
};

export const getProjectFromDB = async (userId: string, projectId: string): Promise<Project | null> => {
  if (!projectId) return null;
  try {
    const projectRef = doc(db, 'projects', projectId);
    const docSnap = await getDoc(projectRef);
    if (docSnap.exists()) {
      return await hydrateProjectFromFirestore(docSnap.data() as Project);
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `projects/${projectId}`);
    return null;
  }
};

export const subscribeToProject = (projectId: string, callback: (project: Project | null) => void) => {
  if (!projectId) {
    callback(null);
    return () => {};
  }
  const projectRef = doc(db, 'projects', projectId);
  return onSnapshot(projectRef, (snap) => {
    if (snap.exists()) {
      void hydrateProjectFromFirestore(snap.data() as Project)
        .then(callback)
        .catch((error) => logFirestoreError(error, OperationType.GET, `projects/${projectId}/records`));
    } else {
      callback(null);
    }
  }, (error) => {
    console.error(`Project subscriber error in projects/${projectId}:`, error);
  });
};

export type CivilDocumentDraft = Omit<
  CivilDocumentRecord,
  'id' | 'number' | 'version' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
> & { number?: string };

const documentCounterId = (kind: DocumentKind, year: number) => `${kind}_${year}`;

export const saveCivilDocumentToDB = async (
  projectId: string,
  draft: CivilDocumentDraft,
  existingId?: string,
): Promise<CivilDocumentRecord> => {
  const userEmail = auth.currentUser?.email?.toLowerCase();
  if (!userEmail) throw new Error('Sign in before saving a document.');
  if (!projectId || draft.projectId !== projectId) throw new Error('Invalid document workspace.');
  if (draft.items.length === 0) throw new Error('Add at least one document line before saving.');

  return runTransaction(db, async (transaction) => {
    const now = new Date().toISOString();
    if (existingId) {
      const recordRef = doc(db, 'projects', projectId, 'generated_documents', existingId);
      const snapshot = await transaction.get(recordRef);
      if (!snapshot.exists()) throw new Error('This saved document no longer exists.');
      const previous = snapshot.data() as CivilDocumentRecord;
      const updated: CivilDocumentRecord = {
        ...draft,
        id: previous.id,
        number: previous.number,
        version: previous.version + 1,
        createdAt: previous.createdAt,
        createdBy: previous.createdBy,
        updatedAt: now,
        updatedBy: userEmail,
      };
      transaction.set(recordRef, stripUndefinedForFirestore(updated));
      return updated;
    }

    const year = Number(draft.documentDate.slice(0, 4)) || new Date().getFullYear();
    const counterRef = doc(
      db,
      'projects',
      projectId,
      'document_counters',
      documentCounterId(draft.kind, year),
    );
    const counterSnapshot = await transaction.get(counterRef);
    const nextNumber = Number(counterSnapshot.data()?.nextNumber || 0) + 1;
    const prefix = (draft.number?.split('-')[0] || draft.kind.slice(0, 3)).toUpperCase();
    const number = `${prefix}-${year}-${String(nextNumber).padStart(4, '0')}`;
    const id = `${draft.kind}_${year}_${String(nextNumber).padStart(6, '0')}`;
    const record: CivilDocumentRecord = {
      ...draft,
      id,
      number,
      version: 1,
      createdAt: now,
      createdBy: userEmail,
      updatedAt: now,
      updatedBy: userEmail,
    };
    transaction.set(counterRef, {
      projectId,
      kind: draft.kind,
      year,
      nextNumber,
      updatedAt: now,
      updatedBy: userEmail,
    });
    transaction.set(
      doc(db, 'projects', projectId, 'generated_documents', id),
      stripUndefinedForFirestore(record),
    );
    return record;
  });
};

export const subscribeToCivilDocuments = (
  projectId: string,
  callback: (documents: CivilDocumentRecord[]) => void,
) => {
  const documentsQuery = query(
    collection(db, 'projects', projectId, 'generated_documents'),
    orderBy('updatedAt', 'desc'),
    limit(50),
  );
  return onSnapshot(
    documentsQuery,
    (snapshot) => callback(snapshot.docs.map((item) => item.data() as CivilDocumentRecord)),
    (error) => logFirestoreError(error, OperationType.LIST, `projects/${projectId}/generated_documents`),
  );
};

export const cancelCivilDocumentInDB = async (
  projectId: string,
  documentId: string,
): Promise<void> => {
  const userEmail = auth.currentUser?.email?.toLowerCase();
  if (!userEmail) throw new Error('Sign in before cancelling a document.');
  const recordRef = doc(db, 'projects', projectId, 'generated_documents', documentId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(recordRef);
    if (!snapshot.exists()) throw new Error('This saved document no longer exists.');
    const previous = snapshot.data() as CivilDocumentRecord;
    if (previous.status === 'cancelled') return;
    transaction.update(recordRef, {
      status: 'cancelled',
      version: previous.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail,
    });
  });
};

export const loadUserDocumentSettingsFromDB = async (
  userId: string,
  localParties: DocumentParty[],
  localPresets: DocumentPresetsMap,
): Promise<UserDocumentSettings> => {
  const settingsRef = doc(db, `users/${userId}/document_settings`, 'config');
  const snapshot = await getDoc(settingsRef);
  if (snapshot.exists()) return snapshot.data() as UserDocumentSettings;

  const settings: UserDocumentSettings = {
    parties: localParties,
    presets: localPresets,
    migratedFromLocalAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(settingsRef, stripUndefinedForFirestore(settings));
  return settings;
};

export const saveUserDocumentSettingsToDB = async (
  userId: string,
  parties: DocumentParty[],
  presets: DocumentPresetsMap,
): Promise<void> => {
  await setDoc(
    doc(db, `users/${userId}/document_settings`, 'config'),
    stripUndefinedForFirestore({ parties, presets, updatedAt: new Date().toISOString() }),
    { merge: true },
  );
};

// Invitations: Root collection
export const sendProjectInvitation = async (invitation: Invitation) => {
  try {
    const inviteRef = doc(db, 'invitations', invitation.id);
    await setDoc(inviteRef, stripUndefinedForFirestore({
      ...invitation,
      inviteeEmail: invitation.inviteeEmail.toLowerCase(),
      ownerEmail: invitation.ownerEmail.toLowerCase()
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `invitations/${invitation.id}`);
  }
};

export const subscribeToInvitations = (email: string, callback: (invitations: Invitation[]) => void) => {
  if (!email) {
    callback([]);
    return () => {};
  }
  const cleanEmail = email.toLowerCase();
  const inviteRef = collection(db, 'invitations');
  const q = query(inviteRef, where("inviteeEmail", "==", cleanEmail), where("status", "==", "pending"));
  
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(doc => doc.data() as Invitation));
  }, (error) => {
    console.error("Invitations subscriber error:", error);
  });
};

export const updateInvitationStatusInDB = async (invitationId: string, status: 'accepted' | 'declined') => {
  try {
    const inviteRef = doc(db, 'invitations', invitationId);
    await updateDoc(inviteRef, { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `invitations/${invitationId}`);
  }
};

/** Cancel a pending invitation (project owner only — see firestore.rules). */
export const revokeProjectInvitation = async (invitationId: string) => {
  if (!invitationId) return;
  try {
    await deleteDoc(doc(db, 'invitations', invitationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `invitations/${invitationId}`);
    throw error;
  }
};

// Global Activities: Root Collection
export const saveActivityToDB = async (userId: string, activity: TimelineActivity) => {
  try {
    const actRef = doc(db, 'activities', activity.id);
    const memberEmails = (activity.memberEmails || []).map((e) => e.toLowerCase());
    await setDoc(actRef, stripUndefinedForFirestore({
      ...activity,
      memberEmails,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `activities/${activity.id}`);
  }
};

const sortActivitiesByTime = (items: TimelineActivity[]) =>
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

/** Secure dashboard feed — query matches rules via denormalized memberEmails. */
export const getActivitiesForUserEmail = async (userEmail: string): Promise<TimelineActivity[]> => {
  const email = userEmail.toLowerCase().trim();
  if (!email) return [];

  try {
    const actRef = collection(db, 'activities');
    const q = query(
      actRef,
      where('memberEmails', 'array-contains', email),
      orderBy('timestamp', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    return sortActivitiesByTime(snap.docs.map((d) => d.data() as TimelineActivity));
  } catch (error) {
    logFirestoreError(error, OperationType.GET, 'activities');
    return [];
  }
};

/** Legacy activities (no memberEmails field) — one equality query per project (rules-friendly). */
export const getActivitiesForProject = async (
  projectId: string,
  userEmail: string,
): Promise<TimelineActivity[]> => {
  const email = userEmail.toLowerCase().trim();
  if (!projectId || !email) return [];
  try {
    const actRef = collection(db, 'activities');
    const q = query(
      actRef,
      where('projectId', '==', projectId),
      where('memberEmails', 'array-contains', email),
      orderBy('timestamp', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as TimelineActivity);
  } catch (error) {
    logFirestoreError(error, OperationType.GET, `activities?projectId=${projectId}`);
    return [];
  }
};

/** Dashboard feed: membership is part of the query so Firestore can authorize it. */
export const getDashboardActivities = async (
  userEmail: string,
  _projectIds: string[],
): Promise<TimelineActivity[]> => {
  return getActivitiesForUserEmail(userEmail);
};

/** @deprecated Use getDashboardActivities — kept for single-project callers */
export const getActivitiesFromDB = async (
  _userId: string,
  projectId?: string,
  projectIds?: string[],
  userEmail?: string,
): Promise<TimelineActivity[]> => {
  if (projectId && userEmail) {
    return getActivitiesForProject(projectId, userEmail);
  }
  if (userEmail && projectIds) {
    return getDashboardActivities(userEmail, projectIds);
  }
  if (userEmail) {
    return getActivitiesForUserEmail(userEmail);
  }
  return [];
};

export const subscribeToActivities = (
  projectId: string,
  userEmail: string,
  callback: (activities: TimelineActivity[]) => void,
) => {
  const email = userEmail.toLowerCase().trim();
  if (!projectId || !email) {
    callback([]);
    return () => {};
  }
  const actRef = collection(db, 'activities');
  const q = query(
    actRef,
    where("projectId", "==", projectId),
    where("memberEmails", "array-contains", email),
    orderBy("timestamp", "desc"),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    const results = snap.docs.map(doc => doc.data() as TimelineActivity);
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(results);
  }, (error) => {
    console.warn("Activities listener error:", error);
  });
};

export const deleteActivityFromDB = async (userId: string, activityId: string) => {
  try {
    const actRef = doc(db, 'activities', activityId);
    await deleteDoc(actRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `activities/${activityId}`);
  }
};

// Notifications: User private subcollection
export const saveNotificationToDB = async (userId: string, targetType: string, targetId: string, timestamp: number, info: any) => {
  if (!userId) return;
  const id = info?.id || `${targetId}_${timestamp}`;
  try {
    const docRef = doc(db, `users/${userId}/notifications`, id);
    await setDoc(docRef, stripUndefinedForFirestore({ ...info, targetType, targetId, timestamp, id }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/notifications/${id}`);
  }
};

/** Stable-id upsert for reminders & invitations (no duplicates) */
export const upsertNotification = async (userId: string, notif: AppNotification): Promise<void> => {
  if (!userId || !notif.id) return;
  try {
    const docRef = doc(db, `users/${userId}/notifications`, notif.id);
    await setDoc(
      docRef,
      stripUndefinedForFirestore({
        ...notif,
        targetType: notif.category || notif.targetType || notif.type,
        targetId: notif.targetId || notif.projectId || notif.id,
        timestamp: notif.timestamp,
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/notifications/${notif.id}`);
  }
};

export const markNotificationRead = async (userId: string, notif: AppNotification): Promise<void> => {
  await upsertNotification(userId, { ...notif, read: true });
};

// Create a helper to push notification by Email!
export const pushNotificationByEmail = async (email: string, targetType: string, targetId: string, info: any) => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const profilesRef = collection(db, 'user_profiles');
    const q = query(profilesRef, where("email", "==", cleanEmail));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const targetUserId = snap.docs[0].id;
      const timestamp = Date.now();
      await saveNotificationToDB(targetUserId, targetType, targetId, timestamp, info);
    }
  } catch (error) {
    console.error("Error routing notification by email:", error);
  }
};

export const getNotificationsFromDB = async (userId: string): Promise<any[]> => {
  if (!userId) return [];
  try {
    const notifRef = collection(db, `users/${userId}/notifications`);
    const q = query(notifRef, orderBy("timestamp", "desc"), limit(100));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}/notifications`);
    return [];
  }
};

export const subscribeToNotifications = (userId: string, callback: (notifications: AppNotification[]) => void) => {
  if (!userId) {
    callback([]);
    return () => {};
  }
  const notifRef = collection(db, `users/${userId}/notifications`);
  const q = query(notifRef, orderBy("timestamp", "desc"), limit(100));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(doc => doc.data() as AppNotification));
  }, (error) => {
    console.error("Notifications subscriber error:", error);
  });
};

export const deleteNotificationFromDB = async (userId: string, id: string) => {
  if (!userId) return;
  try {
    const notifRef = doc(db, `users/${userId}/notifications`, id);
    await deleteDoc(notifRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/notifications/${id}`);
  }
};

// Private profiles (with global duplication for real-time lookups)
export const getUserProfileFromDB = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) return null;
  try {
    const profileRef = doc(db, `users/${userId}/profile`, 'details');
    const docSnap = await getDoc(profileRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    // Try global directory
    const globalRef = doc(db, 'user_profiles', userId);
    const globalSnap = await getDoc(globalRef);
    if (globalSnap.exists()) {
      return globalSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}/profile/details`);
    return null;
  }
};

export const saveUserProfileToDB = async (userId: string, profile: UserProfile) => {
  if (!userId) return;
  try {
    const email = auth.currentUser?.email || '';
    const username = email.split('@')[0].toLowerCase();
    const updated = {
      ...profile,
      email: email.toLowerCase(),
      username,
      updatedAt: new Date().toISOString()
    };

    // Save to private path
    const profileRef = doc(db, `users/${userId}/profile`, 'details');
    await setDoc(profileRef, stripUndefinedForFirestore(updated), { merge: true });

    // Save to global lookup directory so collaborators can be invited by username/email
    const globalRef = doc(db, 'user_profiles', userId);
    await setDoc(globalRef, stripUndefinedForFirestore(updated), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/profile/details`);
  }
};
