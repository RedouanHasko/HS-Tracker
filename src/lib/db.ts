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
  deleteDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { Project, TimelineActivity, UserProfile, AppNotification, Invitation } from '../types';
import { buildProjectAccessFields, needsProjectAccessFieldSync } from '../utils/permissions';
import { stripUndefinedForFirestore } from './firestoreSanitize';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

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
  };
}

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
    const access = buildProjectAccessFields(normalized);

    const updatedProject = stripUndefinedForFirestore({
      ...normalized,
      ...access,
    });

    const projectRef = doc(db, 'projects', project.id);
    const existing = await getDoc(projectRef);
    if (existing.exists()) {
      // Merge avoids wiping fields missing from the client snapshot (fixes permission diffs for members).
      await setDoc(projectRef, updatedProject, { merge: true });
    } else {
      await setDoc(projectRef, updatedProject);
    }
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
    
    return Array.from(mergedMap.values());
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

  const handleUpdate = () => {
    const mergedMap = new Map<string, Project>();
    p1.forEach(p => mergedMap.set(p.id, p));
    p2.forEach(p => mergedMap.set(p.id, p));
    callback(Array.from(mergedMap.values()));
  };

  const unsub1 = onSnapshot(q1, (snap) => {
    p1 = snap.docs.map(d => d.data() as Project);
    handleUpdate();
  }, (error) => {
    console.error("Projects subscriber error creatorEmail:", error);
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    p2 = snap.docs.map(d => d.data() as Project);
    handleUpdate();
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
    await deleteDoc(projectRef);
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
      return docSnap.data() as Project;
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
      callback(snap.data() as Project);
    } else {
      callback(null);
    }
  }, (error) => {
    console.error(`Project subscriber error in projects/${projectId}:`, error);
  });
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

const mergeActivities = (sets: TimelineActivity[][]): TimelineActivity[] => {
  const seen = new Set<string>();
  const merged: TimelineActivity[] = [];
  for (const list of sets) {
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return sortActivitiesByTime(merged);
};

/** Secure dashboard feed — query matches rules via denormalized memberEmails. */
export const getActivitiesForUserEmail = async (userEmail: string): Promise<TimelineActivity[]> => {
  const email = userEmail.toLowerCase().trim();
  if (!email) return [];

  try {
    const actRef = collection(db, 'activities');
    const q = query(actRef, where('memberEmails', 'array-contains', email));
    const snap = await getDocs(q);
    return sortActivitiesByTime(snap.docs.map((d) => d.data() as TimelineActivity));
  } catch (error) {
    logFirestoreError(error, OperationType.GET, 'activities');
    return [];
  }
};

/** Legacy activities (no memberEmails field) — one equality query per project (rules-friendly). */
export const getActivitiesForProject = async (projectId: string): Promise<TimelineActivity[]> => {
  if (!projectId) return [];
  try {
    const actRef = collection(db, 'activities');
    const q = query(actRef, where('projectId', '==', projectId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as TimelineActivity);
  } catch (error) {
    logFirestoreError(error, OperationType.GET, `activities?projectId=${projectId}`);
    return [];
  }
};

/** Dashboard: denormalized query + per-project fallback for older activity docs. */
export const getDashboardActivities = async (
  userEmail: string,
  projectIds: string[],
): Promise<TimelineActivity[]> => {
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  const [byMember, ...byProject] = await Promise.all([
    getActivitiesForUserEmail(userEmail),
    ...uniqueIds.map((id) => getActivitiesForProject(id)),
  ]);
  return mergeActivities([byMember, ...byProject]);
};

/** @deprecated Use getDashboardActivities — kept for single-project callers */
export const getActivitiesFromDB = async (
  _userId: string,
  projectId?: string,
  projectIds?: string[],
  userEmail?: string,
): Promise<TimelineActivity[]> => {
  if (projectId) {
    return getActivitiesForProject(projectId);
  }
  if (userEmail && projectIds) {
    return getDashboardActivities(userEmail, projectIds);
  }
  if (userEmail) {
    return getActivitiesForUserEmail(userEmail);
  }
  return [];
};

export const subscribeToActivities = (projectId: string, callback: (activities: TimelineActivity[]) => void) => {
  if (!projectId) {
    callback([]);
    return () => {};
  }
  const actRef = collection(db, 'activities');
  const q = query(actRef, where("projectId", "==", projectId));
  return onSnapshot(q, (snap) => {
    const results = snap.docs.map(doc => doc.data() as TimelineActivity);
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(results);
  }, (error) => {
    console.warn("Activities listener error or index not ready yet:", error);
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
    const q = query(notifRef, orderBy("timestamp", "desc"));
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
  const q = query(notifRef, orderBy("timestamp", "desc"));
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

