import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  History,
  Search,
  Trash2,
  Plus,
  Edit3,
  ListChecks,
  DollarSign,
  Users,
  Settings,
  Filter,
  Radio,
} from 'lucide-react';
import { TimelineActivity, Language, ActivityActionType } from '../types';
import {
  activityActionLabel,
  activityTone,
  activityBadgeClass,
  activityCategory,
  groupActivitiesByDay,
  filterActivities,
  uniqueActivityMembers,
  ActivityFilterCategory,
} from '../utils/activityHelpers';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';

interface ProjectActivityHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  activities: TimelineActivity[];
  language: Language;
  projectName: string;
}

function ActivityIcon({ type }: { type: ActivityActionType }) {
  const cat = activityCategory(type);
  if (type.includes('deleted')) return <Trash2 className="h-4 w-4" />;
  if (type === 'task_created') return <Plus className="h-4 w-4" />;
  if (type === 'subtask_changed') return <ListChecks className="h-4 w-4" />;
  if (cat === 'expenses') return <DollarSign className="h-4 w-4" />;
  if (cat === 'members') return <Users className="h-4 w-4" />;
  if (cat === 'settings') return <Settings className="h-4 w-4" />;
  return <Edit3 className="h-4 w-4" />;
}

const LABELS = {
  en: {
    title: 'Project history',
    subtitle: 'Every action by you and your team — live from the audit log.',
    search: 'Search actions, names, details…',
    all: 'All',
    tasks: 'Tasks',
    expenses: 'Expenses',
    members: 'Team',
    settings: 'Settings',
    everyone: 'Everyone',
    events: 'events',
    empty: 'No matching activity yet.',
    emptyHint: 'Actions appear here when anyone adds expenses, tasks, or changes the project.',
    live: 'Live',
  },
  fr: {
    title: 'Historique du projet',
    subtitle: 'Toutes les actions de l\'équipe — journal en direct.',
    search: 'Rechercher…',
    all: 'Tout',
    tasks: 'Tâches',
    expenses: 'Dépenses',
    members: 'Équipe',
    settings: 'Réglages',
    everyone: 'Tous',
    events: 'événements',
    empty: 'Aucune activité correspondante.',
    emptyHint: 'Les actions apparaissent ici automatiquement.',
    live: 'Direct',
  },
  ar: {
    title: 'سجل المشروع',
    subtitle: 'كل إجراء منك ومن الفريق — مباشر.',
    search: 'بحث…',
    all: 'الكل',
    tasks: 'المهام',
    expenses: 'المصاريف',
    members: 'الفريق',
    settings: 'الإعدادات',
    everyone: 'الجميع',
    events: 'حدث',
    empty: 'لا يوجد نشاط مطابق.',
    emptyHint: 'تظهر الإجراءات هنا تلقائياً.',
    live: 'مباشر',
  },
};

const CATEGORIES: ActivityFilterCategory[] = ['all', 'tasks', 'expenses', 'members', 'settings'];

/**
 * Full project audit history for owners / managers — filterable slide-over panel.
 */
export default function ProjectActivityHistoryPanel({
  open,
  onClose,
  activities,
  language,
  projectName,
}: ProjectActivityHistoryPanelProps) {
  const t = LABELS[language];
  const { drawer, overlay, overlayVariants, drawerRightVariants } = useMotionConfig();
  useEscapeToClose(open, onClose);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ActivityFilterCategory>('all');
  const [userFilter, setUserFilter] = useState('all');

  const members = useMemo(() => uniqueActivityMembers(activities), [activities]);

  const filtered = useMemo(
    () => filterActivities(activities, { query, category, userEmail: userFilter }),
    [activities, query, category, userFilter]
  );

  const grouped = useMemo(() => groupActivitiesByDay(filtered, language), [filtered, language]);

  const categoryLabel = (c: ActivityFilterCategory) => {
    const map: Record<ActivityFilterCategory, string> = {
      all: t.all,
      tasks: t.tasks,
      expenses: t.expenses,
      members: t.members,
      settings: t.settings,
    };
    return map[c];
  };

  return (
    <AnimatePresence>
      {open && (
    <div className="fixed inset-0 z-[135] flex justify-end">
      <motion.button
        type="button"
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={overlay}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] max-sm:backdrop-blur-none transform-gpu"
        onClick={onClose}
        aria-label="Close"
      />
      <motion.aside
        variants={drawerRightVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={drawer}
        className="panel-motion-gpu relative flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-cyan-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{t.title}</h2>
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Radio className="h-2.5 w-2.5 animate-pulse" />
                  {t.live}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{projectName}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{t.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <span className="text-2xl font-bold font-mono text-cyan-700 dark:text-cyan-400">
              {filtered.length}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {t.events}
            </span>
          </div>
        </div>

        <div className="shrink-0 space-y-2.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                  category === c
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
          {members.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-[11px] dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="all">{t.everyone}</option>
                {members.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {grouped.length === 0 ? (
            <div className="py-16 text-center">
              <History className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">{t.empty}</p>
              <p className="mt-1 text-xs text-slate-400">{t.emptyHint}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <section key={group.label}>
                  <h3 className="mb-2 sticky top-0 z-10 bg-white/95 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 backdrop-blur dark:bg-slate-950/95">
                    {group.label}
                  </h3>
                  <ul className="relative space-y-0 border-l-2 border-slate-100 pl-4 dark:border-slate-800">
                    <AnimatePresence initial={false}>
                      {group.items.map((act) => (
                        <motion.li
                          key={act.id}
                          layout
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="relative pb-4 last:pb-0"
                        >
                          <span className="absolute -left-[21px] top-1 flex h-3 w-3 rounded-full border-2 border-white bg-cyan-500 dark:border-slate-950" />
                          <div className="rounded-xl border border-slate-100 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/80">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${activityBadgeClass(act.actionType)}`}
                              >
                                <ActivityIcon type={act.actionType} />
                                {activityActionLabel(act.actionType, language)}
                              </span>
                              <span className="font-mono text-[9px] text-slate-400">{act.timestamp}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                {(act.userName || act.userEmail).charAt(0)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                                  {act.userName || act.userEmail}
                                </p>
                                <p className="truncate text-[10px] text-slate-400">{act.userEmail}</p>
                              </div>
                            </div>
                            {act.targetTitle && (
                              <p className={`mt-2 text-xs font-medium ${activityTone(act.actionType)}`}>
                                {act.targetTitle}
                              </p>
                            )}
                            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                              {act.actionDetails}
                            </p>
                            {act.targetId && (
                              <p className="mt-1 font-mono text-[9px] text-slate-400">ID: {act.targetId}</p>
                            )}
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </motion.aside>
    </div>
      )}
    </AnimatePresence>
  );
}
