import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  Users,
  CalendarClock,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { AppNotification, Invitation, Language, NotificationAction } from '../types';
import { filterImportantNotifications } from '../utils/notificationHelpers';
import ClickOutsideScrim from './ui/ClickOutsideScrim';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  notifications: AppNotification[];
  invitations: Invitation[];
  highlightInvitationId?: string | null;
  onMarkRead: (notif: AppNotification) => void;
  onMarkAllRead: () => void;
  onAcceptInvitation: (invite: Invitation) => void;
  onDeclineInvitation: (invite: Invitation) => void;
  onNavigate: (action: NotificationAction) => void;
}

const LABELS = {
  en: {
    title: 'Notifications',
    markAll: 'Mark all read',
    empty: 'No important notifications.',
    invites: 'Project invitations',
    invite: 'Collaboration invite',
    accept: 'Accept',
    decline: 'Decline',
    dueSoon: 'Deadline',
    overdue: 'Overdue',
    budget: 'Budget',
    inviteType: 'Invitation',
    open: 'Alert',
  },
  fr: {
    title: 'Notifications',
    markAll: 'Tout marquer lu',
    empty: 'Aucune notification importante.',
    invites: 'Invitations projet',
    invite: 'Invitation',
    accept: 'Accepter',
    decline: 'Refuser',
    dueSoon: 'Échéance',
    overdue: 'En retard',
    budget: 'Budget',
    inviteType: 'Invitation',
    open: 'Alerte',
  },
  ar: {
    title: 'الإشعارات',
    markAll: 'تحديد الكل كمقروء',
    empty: 'لا إشعارات مهمة.',
    invites: 'دعوات المشاريع',
    invite: 'دعوة تعاون',
    accept: 'قبول',
    decline: 'رفض',
    dueSoon: 'موعد',
    overdue: 'متأخر',
    budget: 'ميزانية',
    inviteType: 'دعوة',
    open: 'تنبيه',
  },
};

function notifIcon(n: AppNotification) {
  switch (n.category) {
    case 'task_deadline':
      return <CalendarClock className="h-4 w-4 text-amber-500" />;
    case 'task_overdue':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'budget_exceeded':
      return <AlertTriangle className="h-4 w-4 text-rose-500" />;
    case 'project_invitation':
      return <Users className="h-4 w-4 text-indigo-500" />;
    default:
      return n.type === 'alert' ? (
        <AlertTriangle className="h-4 w-4 text-amber-500" />
      ) : (
        <Bell className="h-4 w-4 text-sky-500" />
      );
  }
}

function categoryLabel(n: AppNotification, t: (typeof LABELS)['en']) {
  switch (n.category) {
    case 'task_deadline':
      return t.dueSoon;
    case 'task_overdue':
      return t.overdue;
    case 'budget_exceeded':
      return t.budget;
    case 'project_invitation':
      return t.inviteType;
    default:
      return t.open;
  }
}

/**
 * Important-only notification drawer — click navigates to task, project, or invitation.
 */
export default function NotificationsPanel({
  open,
  onClose,
  language,
  notifications,
  invitations,
  highlightInvitationId,
  onMarkRead,
  onMarkAllRead,
  onAcceptInvitation,
  onDeclineInvitation,
  onNavigate,
}: NotificationsPanelProps) {
  const t = LABELS[language];
  const panelRef = useRef<HTMLDivElement>(null);
  const { dropdown, dropdownVariants } = useMotionConfig();
  const important = filterImportantNotifications(notifications);
  const pendingInvites = invitations.filter((i) => i.status === 'pending');
  const unreadCount =
    important.filter((n) => !n.read).length + pendingInvites.length;

  useEscapeToClose(open, onClose);

  const handleNotifClick = (notif: AppNotification) => {
    if (notif.action) onNavigate(notif.action);
    if (!notif.read) onMarkRead(notif);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <ClickOutsideScrim onClose={onClose} zClassName="z-[125]" className="bg-black/10" />
        <motion.div
          ref={panelRef}
          key="notifications-panel"
          variants={dropdownVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={dropdown}
          className="panel-motion-gpu fixed top-[calc(var(--navbar-height)+0.5rem)] right-4 left-4 z-[130] flex max-h-[min(80vh,520px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md max-sm:backdrop-blur-none dark:border-slate-800 dark:bg-slate-900/95 sm:left-auto sm:w-[min(100vw-2rem,22rem)]"
          id="notifications-panel"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
            <h4 className="flex items-center gap-1.5 font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Bell className="h-3.5 w-3.5 text-sky-500" />
              {t.title}
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </h4>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="cursor-pointer text-[10px] font-semibold text-sky-600 hover:underline"
                >
                  {t.markAll}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-sm p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {pendingInvites.length > 0 && (
              <div className="border-b border-indigo-100/60 dark:border-indigo-900/40">
                <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  {t.invites}
                </p>
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    id={`notification-invite-${invite.id}`}
                    className={`border-b border-indigo-50/80 p-3 text-xs dark:border-indigo-950/50 ${
                      highlightInvitationId === invite.id
                        ? 'ai-focus-pulse bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'bg-indigo-50/25 dark:bg-indigo-950/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300">
                        <Users className="h-3.5 w-3.5" />
                        {t.invite}
                      </p>
                      <span className="rounded bg-slate-100 px-1 text-[9px] font-mono font-bold uppercase text-slate-500 dark:bg-slate-800">
                        {invite.role}
                      </span>
                    </div>
                    <p className="mt-1.5 leading-relaxed text-slate-700 dark:text-slate-300">
                      <strong>{invite.ownerName || invite.ownerEmail}</strong> →{' '}
                      <strong>{invite.projectName}</strong>
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onAcceptInvitation(invite);
                          onClose();
                        }}
                        className="cursor-pointer rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-indigo-500"
                      >
                        {t.accept}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeclineInvitation(invite)}
                        className="cursor-pointer rounded-md bg-slate-200 px-2.5 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {t.decline}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {important.length === 0 && pendingInvites.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">{t.empty}</div>
            ) : (
              important.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleNotifClick(notif)}
                  className={`flex w-full gap-2.5 border-b border-slate-100 p-3 text-left text-xs transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    notif.read ? 'opacity-65' : 'bg-sky-50/40 dark:bg-sky-950/15'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{notifIcon(notif)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        {notif.projectName || categoryLabel(notif, t)}
                      </span>
                      <span className="shrink-0 text-[9px] font-mono text-slate-400">{notif.timestamp}</span>
                    </span>
                    <span className="mb-1 mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                      {categoryLabel(notif, t)}
                    </span>
                    <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-400">
                      {notif.text.replace(/\*\*/g, '')}
                    </p>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))
            )}
          </div>
        </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function countUnreadNotifications(
  notifications: AppNotification[],
  invitations: Invitation[]
): number {
  return (
    filterImportantNotifications(notifications).filter((n) => !n.read).length +
    invitations.filter((i) => i.status === 'pending').length
  );
}
