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
  saveActivityToDB,
  applyInviteeMembershipPatch,
  InviteRevokedError,
} from '../lib/db';
import {
  syncTaskDeadlineReminders,
  syncInvitationNotifications,
  filterImportantNotifications,
} from '../utils/notificationHelpers';
import { countUnreadNotifications } from '../components/NotificationsPanel';

export function useAppNotifications(user: User | null, projects: Project[]) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNotificationNav | null>(null);
  const [highlightInvitationId, setHighlightInvitationId] = useState<string | null>(null);
  /** Invitation currently being accepted/declined — disables its buttons against double taps. */
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
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
      if (!user?.uid || !user.email || busyInvitationId) return;
      setBusyInvitationId(invite.id);
      try {
        const email = user.email.toLowerCase();
        const displayName = user.displayName || invite.inviteeEmail.split('@')[0];
        // Membership FIRST: the invitee has no access to versioned records, so this
        // uses a root-only read + surgical write the rules expressly allow. Flipping
        // the invitation status only afterwards keeps a failed join retryable.
        const { outcome, memberEmailsAfter } = await applyInviteeMembershipPatch({
          projectId: invite.projectId,
          email,
          displayName,
          role: invite.role,
          decision: 'accept',
        });
        // Consume the invitation (best-effort: membership already landed, retry heals).
        try {
          await updateInvitationStatusInDB(invite.id, 'accepted');
        } catch (e) {
          console.warn('Invitation status sync skipped:', e);
        }
        if (outcome === 'joined') {
          // Join activity is informational — exact stored memberEmails keep rules happy.
          try {
            await saveActivityToDB(user.uid, {
              id: `act_${Date.now()}`,
              projectId: invite.projectId,
              userEmail: email,
              userName: displayName,
              actionType: 'member_joined',
              actionDetails: `${displayName} joined as ${invite.role}.`,
              timestamp: new Date().toISOString(),
              memberEmails: memberEmailsAfter,
            });
          } catch (e) {
            console.warn('Join activity skipped:', e);
          }
        }
        try {
          await upsertNotification(user.uid, {
            id: `invite_${invite.id}`,
            category: 'project_invitation',
            read: true,
            type: 'info',
            projectId: invite.projectId,
            projectName: invite.projectName,
            text: outcome === 'joined' ? `Joined ${invite.projectName}.` : `You're already a member of ${invite.projectName}.`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
          });
        } catch (e) {
          console.warn('Join notification skipped:', e);
        }
        setPendingNav({ projectId: invite.projectId, tab: 'overview' });
      } catch (e) {
        console.error('Accept invitation failed:', e);
        if (e instanceof InviteRevokedError) {
          try {
            await updateInvitationStatusInDB(invite.id, 'declined');
          } catch {
            // Already gone — nothing left to consume.
          }
          window.alert('This invitation is no longer valid. Ask the project owner to send you a new one.');
        } else {
          window.alert('Could not join the project. Check your connection and try again — or ask the project owner to re-send the invitation.');
        }
      } finally {
        setBusyInvitationId(null);
      }
    },
    [user, busyInvitationId]
  );

  const onDeclineInvitation = useCallback(
    async (invite: Invitation) => {
      if (!user?.uid || !user.email || busyInvitationId) return;
      setBusyInvitationId(invite.id);
      try {
        // Membership lists first (root-only, rules-allowed), invitation status after.
        try {
          await applyInviteeMembershipPatch({
            projectId: invite.projectId,
            email: user.email.toLowerCase(),
            displayName: user.displayName || invite.inviteeEmail.split('@')[0],
            role: invite.role,
            decision: 'decline',
          });
        } catch (e) {
          if (!(e instanceof InviteRevokedError)) throw e;
          // Already revoked owner-side — just consume the local invite below.
        }
        await updateInvitationStatusInDB(invite.id, 'declined');
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
      } finally {
        setBusyInvitationId(null);
      }
    },
    [user, busyInvitationId]
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
    busyInvitationId,
    handleMarkRead,
    handleMarkAllRead,
    handleNavigate,
    onAcceptInvitation,
    onDeclineInvitation,
  };
}
