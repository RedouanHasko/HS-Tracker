import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  AppNotification,
  Invitation,
  NotificationAction,
  PendingNotificationNav,
  Project,
} from '../types';
import {
  subscribeToNotifications,
  subscribeToInvitations,
  upsertNotification,
  markNotificationRead,
  updateInvitationStatusInDB,
  getProjectFromDB,
  saveProjectToDB,
  saveActivityToDB,
} from '../lib/db';
import {
  syncTaskDeadlineReminders,
  syncInvitationNotifications,
  filterImportantNotifications,
} from '../utils/notificationHelpers';
import { countUnreadNotifications } from '../components/NotificationsPanel';
import { buildActivityMemberEmails } from '../utils/activityHelpers';

export function useAppNotifications(user: User | null, projects: Project[]) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNotificationNav | null>(null);
  const [highlightInvitationId, setHighlightInvitationId] = useState<string | null>(null);
  const reminderSyncedRef = useRef<string>('');

  useEffect(() => {
    if (!user?.uid || !user.email) {
      setNotifications([]);
      setInvitations([]);
      return;
    }

    const unsubNotif = subscribeToNotifications(user.uid, setNotifications);
    const unsubInv = subscribeToInvitations(user.email, setInvitations);
    return () => {
      unsubNotif();
      unsubInv();
    };
  }, [user?.uid, user?.email]);

  useEffect(() => {
    if (!user?.uid || !user.email || projects.length === 0) return;
    const key = `${user.uid}_${projects.map((p) => p.id).join(',')}_${projects.reduce((n, p) => n + p.tasks.length, 0)}`;
    if (reminderSyncedRef.current === key) return;
    reminderSyncedRef.current = key;

    (async () => {
      try {
        await syncTaskDeadlineReminders(user.uid!, user.email!, projects, upsertNotification);
      } catch (e) {
        console.error('Deadline reminder sync failed:', e);
      }
    })();
  }, [user?.uid, user?.email, projects]);

  useEffect(() => {
    if (!user?.uid || invitations.length === 0) return;
    (async () => {
      try {
        await syncInvitationNotifications(user.uid!, invitations, upsertNotification);
      } catch (e) {
        console.error('Invitation notification sync failed:', e);
      }
    })();
  }, [user?.uid, invitations]);

  const handleMarkRead = useCallback(
    async (notif: AppNotification) => {
      setNotifications((list) => list.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
      if (user?.uid) await markNotificationRead(user.uid, { ...notif, read: true });
    },
    [user?.uid]
  );

  const handleMarkAllRead = useCallback(async () => {
    const important = filterImportantNotifications(notifications);
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    if (!user?.uid) return;
    for (const n of important) {
      if (!n.read) await markNotificationRead(user.uid, { ...n, read: true });
    }
  }, [notifications, user?.uid]);

  const handleNavigate = useCallback((action: NotificationAction) => {
    if (action.highlightInvitation) {
      setShowPanel(true);
      if (action.invitationId) setHighlightInvitationId(action.invitationId);
      return;
    }
    if (action.projectId) {
      setPendingNav({
        projectId: action.projectId,
        tab: action.tab,
        taskId: action.taskId,
        invitationId: action.invitationId,
      });
    }
  }, []);

  const consumePendingNav = useCallback(() => setPendingNav(null), []);

  const onAcceptInvitation = useCallback(
    async (invite: Invitation) => {
      if (!user?.uid) return;
      try {
        await updateInvitationStatusInDB(invite.id, 'accepted');
        const project = await getProjectFromDB(user.uid, invite.projectId);
        if (!project) return;

        const cleanInviteeEmail = invite.inviteeEmail.toLowerCase();
        let exists = false;
        const updatedMembers = project.members.map((m) => {
          if (m.email.toLowerCase() === cleanInviteeEmail) {
            exists = true;
            return {
              ...m,
              email: cleanInviteeEmail,
              status: 'accepted' as const,
              role: invite.role,
              name: user.displayName || m.name,
            };
          }
          return { ...m, email: m.email.toLowerCase() };
        });
        if (!exists) {
          updatedMembers.push({
            email: cleanInviteeEmail,
            name: user.displayName || invite.inviteeEmail.split('@')[0],
            role: invite.role,
            status: 'accepted',
          });
        }
        const updatedProject = { ...project, members: updatedMembers };
        await saveProjectToDB(user.uid, updatedProject);
        await saveActivityToDB(user.uid, {
          id: `act_${Date.now()}`,
          projectId: invite.projectId,
          userEmail: cleanInviteeEmail,
          userName: user.displayName || cleanInviteeEmail.split('@')[0],
          actionType: 'member_joined',
          actionDetails: `${user.displayName || invite.inviteeEmail} joined as ${invite.role}.`,
          timestamp: new Date().toISOString(),
          memberEmails: buildActivityMemberEmails(updatedProject),
        });
        await upsertNotification(user.uid, {
          id: `invite_${invite.id}`,
          category: 'project_invitation',
          read: true,
          type: 'info',
          projectId: invite.projectId,
          projectName: invite.projectName,
          text: `Joined ${invite.projectName}.`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        });
        setPendingNav({ projectId: invite.projectId, tab: 'overview' });
      } catch (e) {
        console.error('Accept invitation failed:', e);
        window.alert('Could not join the project. Please try again or ask the project owner to re-invite you.');
      }
    },
    [user]
  );

  const onDeclineInvitation = useCallback(
    async (invite: Invitation) => {
      if (!user?.uid) return;
      try {
        await updateInvitationStatusInDB(invite.id, 'declined');
        const project = await getProjectFromDB(user.uid, invite.projectId);
        if (project) {
          const cleanInvitee = invite.inviteeEmail.toLowerCase();
          const updatedMembers = project.members.map((m) =>
            m.email.toLowerCase() === cleanInvitee ? { ...m, status: 'declined' as const } : m
          );
          await saveProjectToDB(user.uid, { ...project, members: updatedMembers });
        }
        await upsertNotification(user.uid, {
          id: `invite_${invite.id}`,
          read: true,
          type: 'info',
          projectId: invite.projectId,
          projectName: invite.projectName,
          text: 'Invitation declined.',
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        });
      } catch (e) {
        console.error('Decline invitation failed:', e);
        window.alert('Could not update the invitation. Please try again.');
      }
    },
    [user]
  );

  const unreadCount = countUnreadNotifications(notifications, invitations);

  return {
    notifications,
    invitations,
    showPanel,
    setShowPanel,
    unreadCount,
    pendingNav,
    consumePendingNav,
    highlightInvitationId,
    setHighlightInvitationId,
    handleMarkRead,
    handleMarkAllRead,
    handleNavigate,
    onAcceptInvitation,
    onDeclineInvitation,
  };
}
