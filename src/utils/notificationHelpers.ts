import { AppNotification, NotificationCategory, Project } from '../types';

/** Only these categories surface in the bell — no noise */
export const IMPORTANT_NOTIFICATION_CATEGORIES = new Set<NotificationCategory>([
  'task_deadline',
  'task_overdue',
  'project_invitation',
  'budget_exceeded',
]);

export function isImportantNotification(n: AppNotification): boolean {
  if (n.category) return IMPORTANT_NOTIFICATION_CATEGORIES.has(n.category);
  if (n.type === 'alert') return true;
  if (n.text?.toLowerCase().includes('invitation')) return true;
  return false;
}

export function filterImportantNotifications(notifications: AppNotification[]): AppNotification[] {
  return notifications.filter(isImportantNotification);
}

export function formatNotificationTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 16);
}

function parseDeadline(deadline: string): Date | null {
  const d = new Date(deadline.includes('T') ? deadline : `${deadline}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffCalendarDays(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export const TASK_REMINDER_DAYS = 2;

/**
 * Create/update deadline reminders for tasks assigned to the user (deduped by stable notification id).
 */
export async function syncTaskDeadlineReminders(
  userId: string,
  userEmail: string,
  projects: Project[],
  upsert: (userId: string, notif: AppNotification) => Promise<void>
): Promise<void> {
  const email = userEmail.toLowerCase();
  const today = startOfDay(new Date());

  for (const project of projects) {
    if (project.status === 'completed' || project.status === 'cancelled') continue;

    for (const task of project.tasks) {
      if (task.status === 'completed') continue;
      if ((task.assignedTo || '').toLowerCase() !== email) continue;

      const deadline = parseDeadline(task.deadline);
      if (!deadline) continue;

      const daysUntil = diffCalendarDays(today, deadline);
      const isOverdue = daysUntil < 0;
      const isDueSoon = daysUntil >= 0 && daysUntil <= TASK_REMINDER_DAYS;

      if (!isOverdue && !isDueSoon) continue;

      const category: NotificationCategory = isOverdue ? 'task_overdue' : 'task_deadline';
      const id = isOverdue ? `task_overdue_${task.id}` : `task_deadline_${task.id}`;

      const text = isOverdue
        ? `Task **${task.title}** is overdue (deadline ${task.deadline}).`
        : daysUntil === 0
          ? `Task **${task.title}** is due **today** (${task.deadline}).`
          : `Task **${task.title}** is due in **${daysUntil} day(s)** (${task.deadline}).`;

      await upsert(userId, {
        id,
        category,
        type: isOverdue ? 'alert' : 'info',
        projectId: project.id,
        projectName: project.name,
        text,
        read: false,
        timestamp: formatNotificationTimestamp(),
        action: {
          projectId: project.id,
          tab: 'tasks',
          taskId: task.id,
        },
      });
    }
  }
}

/** Ensure pending invitations also appear as notifications */
export async function syncInvitationNotifications(
  userId: string,
  invitations: { id: string; projectId: string; projectName: string; ownerName?: string; ownerEmail: string; role: string; status: string }[],
  upsert: (userId: string, notif: AppNotification) => Promise<void>
): Promise<void> {
  for (const inv of invitations) {
    if (inv.status !== 'pending') continue;
    await upsert(userId, {
      id: `invite_${inv.id}`,
      category: 'project_invitation',
      type: 'info',
      projectId: inv.projectId,
      projectName: inv.projectName,
      text: `**${inv.ownerName || inv.ownerEmail}** invited you to **${inv.projectName}** (${inv.role}).`,
      read: false,
      timestamp: formatNotificationTimestamp(),
      action: {
        projectId: inv.projectId,
        invitationId: inv.id,
        highlightInvitation: true,
      },
    });
  }
}
