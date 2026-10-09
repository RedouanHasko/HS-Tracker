import { ActivityActionType, Language, TimelineActivity } from '../types';

const ACTION_LABELS: Record<ActivityActionType, { en: string; fr: string; ar: string }> = {
  expense_added: { en: 'Added expense', fr: 'Dépense ajoutée', ar: 'أضاف مصروفاً' },
  expense_updated: { en: 'Updated expense', fr: 'Dépense modifiée', ar: 'عدّل مصروفاً' },
  expense_deleted: { en: 'Deleted expense', fr: 'Dépense supprimée', ar: 'حذف مصروفاً' },
  task_created: { en: 'Created task', fr: 'Tâche créée', ar: 'أنشأ مهمة' },
  task_updated: { en: 'Updated task', fr: 'Tâche modifiée', ar: 'عدّل مهمة' },
  task_deleted: { en: 'Deleted task', fr: 'Tâche supprimée', ar: 'حذف مهمة' },
  subtask_changed: { en: 'Changed subtasks', fr: 'Sous-tâches modifiées', ar: 'عدّل مهام فرعية' },
  status_changed: { en: 'Settings / system', fr: 'Paramètres / système', ar: 'إعدادات / نظام' },
  project_created: { en: 'Created project', fr: 'Projet créé', ar: 'أنشأ مشروعاً' },
  project_updated: { en: 'Updated project', fr: 'Projet modifié', ar: 'عدّل مشروعاً' },
  section_updated: { en: 'Updated sections', fr: 'Sections modifiées', ar: 'عدّل الأقسام' },
  change_order_approved: { en: 'Approved change order', fr: 'Avenant approuvé', ar: 'وافق على أمر تغيير' },
  change_order_rejected: { en: 'Rejected change order', fr: 'Avenant refusé', ar: 'رفض أمر تغيير' },
  member_joined: { en: 'Team / members', fr: 'Équipe / membres', ar: 'الفريق / الأعضاء' },
  document_added: { en: 'Document', fr: 'Document', ar: 'مستند' },
  photo_uploaded: { en: 'Photo', fr: 'Photo', ar: 'صورة' },
};

export type ActivityFilterCategory = 'all' | 'tasks' | 'expenses' | 'members' | 'settings';

export function activityActionLabel(type: ActivityActionType, language: Language): string {
  return ACTION_LABELS[type]?.[language] || ACTION_LABELS.task_updated[language];
}

export function activityCategory(type: ActivityActionType): ActivityFilterCategory {
  if (type.startsWith('task') || type === 'subtask_changed') return 'tasks';
  if (type.startsWith('expense')) return 'expenses';
  if (type === 'member_joined') return 'members';
  if (type === 'status_changed' || type === 'project_created' || type === 'project_updated') return 'settings';
  if (type === 'section_updated' || type === 'change_order_approved' || type === 'change_order_rejected') return 'settings';
  return 'settings';
}

export function activityTone(type: ActivityActionType): string {
  if (type.includes('deleted')) return 'text-red-600 dark:text-red-400';
  if (type === 'change_order_rejected') return 'text-red-600 dark:text-red-400';
  if (type === 'task_created' || type === 'expense_added' || type === 'expense_updated') return 'text-emerald-600 dark:text-emerald-400';
  if (type === 'change_order_approved' || type === 'section_updated') return 'text-emerald-600 dark:text-emerald-400';
  if (type === 'subtask_changed') return 'text-violet-600 dark:text-violet-400';
  if (type === 'member_joined') return 'text-amber-600 dark:text-amber-400';
  return 'text-cyan-700 dark:text-cyan-400';
}

export function activityBadgeClass(type: ActivityActionType): string {
  if (type.includes('deleted')) return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  if (type === 'task_created' || type === 'expense_added' || type === 'expense_updated')
    return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (type === 'subtask_changed') return 'bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300';
  if (type === 'member_joined') return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  return 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300';
}

/** Parse activity timestamp for grouping (format: YYYY-MM-DD HH:mm) */
function parseActivityDate(ts: string): Date {
  const normalized = ts.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function groupActivitiesByDay(
  activities: TimelineActivity[],
  language: Language
): { label: string; items: TimelineActivity[] }[] {
  const groups = new Map<string, TimelineActivity[]>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const act of activities) {
    const d = parseActivityDate(act.timestamp);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime()) {
      label = language === 'en' ? 'Today' : language === 'fr' ? "Aujourd'hui" : 'اليوم';
    } else if (d.getTime() === yesterday.getTime()) {
      label = language === 'en' ? 'Yesterday' : language === 'fr' ? 'Hier' : 'أمس';
    } else {
      label = d.toLocaleDateString(language === 'ar' ? 'ar-MA' : language === 'fr' ? 'fr-FR' : 'en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(act);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export function filterActivities(
  activities: TimelineActivity[],
  opts: { query: string; category: ActivityFilterCategory; userEmail: string }
): TimelineActivity[] {
  const q = opts.query.trim().toLowerCase();
  return activities.filter((act) => {
    if (opts.category !== 'all' && activityCategory(act.actionType) !== opts.category) return false;
    if (opts.userEmail !== 'all' && act.userEmail.toLowerCase() !== opts.userEmail.toLowerCase()) return false;
    if (!q) return true;
    const hay = `${act.userName} ${act.userEmail} ${act.actionDetails} ${act.targetTitle || ''} ${act.actionType}`.toLowerCase();
    return hay.includes(q);
  });
}

export function uniqueActivityMembers(activities: TimelineActivity[]): { email: string; name: string }[] {
  const map = new Map<string, string>();
  for (const a of activities) {
    if (!map.has(a.userEmail)) map.set(a.userEmail, a.userName || a.userEmail);
  }
  return Array.from(map.entries()).map(([email, name]) => ({ email, name }));
}

export function describeSubtaskChanges(
  before: { id: string; title: string; isCompleted: boolean }[],
  after: { id: string; title: string; isCompleted: boolean }[],
  language: Language
): string[] {
  const lines: string[] = [];
  const beforeMap = new Map(before.map((s) => [s.id, s]));

  for (const sub of after) {
    const prev = beforeMap.get(sub.id);
    if (!prev) {
      lines.push(
        language === 'en'
          ? `Added subtask "${sub.title}"`
          : language === 'fr'
            ? `Sous-tâche ajoutée : « ${sub.title} »`
            : `أضاف مهمة فرعية: « ${sub.title} »`
      );
    } else if (prev.isCompleted !== sub.isCompleted) {
      lines.push(
        language === 'en'
          ? `${sub.isCompleted ? 'Completed' : 'Reopened'} subtask "${sub.title}"`
          : language === 'fr'
            ? `${sub.isCompleted ? 'Terminé' : 'Rouvert'} : « ${sub.title} »`
            : `${sub.isCompleted ? 'أنجز' : 'أعاد فتح'} « ${sub.title} »`
      );
    }
    beforeMap.delete(sub.id);
  }

  for (const removed of beforeMap.values()) {
    lines.push(
      language === 'en'
        ? `Removed subtask "${removed.title}"`
        : language === 'fr'
          ? `Sous-tâche supprimée : « ${removed.title} »`
          : `حذف مهمة فرعية: « ${removed.title} »`
    );
  }

  return lines;
}

/** Emails allowed to read an activity — synced from project on every write. */
export function buildActivityMemberEmails(project: {
  creatorEmail?: string;
  memberEmails?: string[];
  members?: { email: string; status?: string }[];
}): string[] {
  if (project.memberEmails?.length) {
    return [...new Set(project.memberEmails.map((e) => e.toLowerCase()))];
  }
  const emails = (project.members || [])
    .filter((m) => !m.status || m.status === 'accepted')
    .map((m) => m.email.toLowerCase());
  const creator = (project.creatorEmail || '').toLowerCase();
  if (creator && !emails.includes(creator)) emails.push(creator);
  return [...new Set(emails)];
}
