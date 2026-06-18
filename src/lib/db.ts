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
      
      const newProfile: UserProfile = {
        fullName: name,
        role: "Member",
        company: "Reda & Sister Group",
        phone: "",
        city: "Tanger",
        currency: "DH",
        avatarUrl: generatedAvatar,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(profileRef, newProfile);
      
      // Also write private details for backward compatibility
      const oldPathRef = doc(db, `users/${uid}/profile`, 'details');
      await setDoc(oldPathRef, newProfile);
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

// Projects: Root dynamic collection
export const saveProjectToDB = async (userId: string, project: Project) => {
  if (!project.id) return;
  try {
    const cleanCreatorEmail = (project.creatorEmail || auth.currentUser?.email || 'relhaskouri2@gmail.com').toLowerCase();
    const emails = (project.members || []).map(m => m.email.toLowerCase());
    
    if (!emails.includes(cleanCreatorEmail)) {
      emails.push(cleanCreatorEmail);
    }

    const updatedProject = {
      ...project,
      creatorEmail: cleanCreatorEmail,
      memberEmails: emails
    };

    const projectRef = doc(db, 'projects', project.id);
    await setDoc(projectRef, updatedProject);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `projects/${project.id}`);
  }
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
    await setDoc(inviteRef, {
      ...invitation,
      inviteeEmail: invitation.inviteeEmail.toLowerCase(),
      ownerEmail: invitation.ownerEmail.toLowerCase()
    });
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

// Global Activities: Root Collection
export const saveActivityToDB = async (userId: string, activity: TimelineActivity) => {
  try {
    const actRef = doc(db, 'activities', activity.id);
    await setDoc(actRef, activity);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `activities/${activity.id}`);
  }
};

export const getActivitiesFromDB = async (userId: string, projectId?: string): Promise<TimelineActivity[]> => {
  try {
    const actRef = collection(db, 'activities');
    let q;
    if (projectId) {
      q = query(actRef, where("projectId", "==", projectId));
    } else {
      q = query(actRef, orderBy("timestamp", "desc"));
    }
    const querySnapshot = await getDocs(q);
    const results = querySnapshot.docs.map(doc => doc.data() as TimelineActivity);
    
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'activities');
    return [];
  }
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
  const id = `${targetId}_${timestamp}`;
  try {
    const docRef = doc(db, `users/${userId}/notifications`, id);
    await setDoc(docRef, { ...info, targetType, targetId, timestamp, id });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/notifications/${id}`);
  }
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
    await setDoc(profileRef, updated, { merge: true });

    // Save to global lookup directory so sisters and partners can invite by username/email
    const globalRef = doc(db, 'user_profiles', userId);
    await setDoc(globalRef, updated, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/profile/details`);
  }
};

