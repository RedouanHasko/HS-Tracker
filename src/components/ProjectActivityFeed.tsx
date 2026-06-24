import { motion, AnimatePresence } from 'motion/react';
import { History, Trash2, Plus, Edit3, ListChecks, DollarSign } from 'lucide-react';
import { TimelineActivity, Language, ActivityActionType } from '../types';
import { activityActionLabel, activityTone } from '../utils/activityHelpers';

interface ProjectActivityFeedProps {
  activities: TimelineActivity[];
  language: Language;
  maxItems?: number;
  onViewAll?: () => void;
}

function ActivityIcon({ type }: { type: ActivityActionType }) {
  if (type.includes('deleted')) return <Trash2 className="h-3.5 w-3.5" />;
  if (type === 'task_created' || type === 'expense_added') return <Plus className="h-3.5 w-3.5" />;
  if (type === 'subtask_changed') return <ListChecks className="h-3.5 w-3.5" />;
  if (type.startsWith('expense')) return <DollarSign className="h-3.5 w-3.5" />;
  return <Edit3 className="h-3.5 w-3.5" />;
}

/**
 * Live audit trail for owners/managers — who did what on this project.
 */
export default function ProjectActivityFeed({ activities, language, maxItems = 20, onViewAll }: ProjectActivityFeedProps) {
  const title =
    language === 'en'
      ? 'Team activity log'
      : language === 'fr'
        ? 'Journal d\'activité'
        : 'سجل نشاط الفريق';

  const viewAllLabel =
    language === 'en' ? 'View full history' : language === 'fr' ? 'Voir tout l\'historique' : 'عرض السجل الكامل';

  const empty =
    language === 'en'
      ? 'No activity recorded yet.'
      : language === 'fr'
        ? 'Aucune activité pour le moment.'
        : 'لا يوجد نشاط مسجّل بعد.';

  const items = activities.slice(0, maxItems);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <History className="h-4 w-4 text-cyan-600" />
          {title}
        </h3>
        {onViewAll && activities.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="shrink-0 text-[10px] font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-cyan-300"
          >
            {viewAllLabel} →
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {items.map((act) => (
              <motion.li
                key={act.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-2.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50"
              >
                <span className={`mt-0.5 shrink-0 ${activityTone(act.actionType)}`}>
                  <ActivityIcon type={act.actionType} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-snug text-slate-800 dark:text-slate-200">
                    <span className="font-semibold">{act.userName || act.userEmail}</span>{' '}
                    <span className={activityTone(act.actionType)}>
                      {activityActionLabel(act.actionType, language).toLowerCase()}
                    </span>
                    {act.targetTitle && (
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {' '}
                        — {act.targetTitle}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{act.actionDetails}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-400">{act.timestamp}</p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
