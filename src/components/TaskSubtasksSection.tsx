import React, { useState } from 'react';
import { Check, Plus, Trash2, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Language, Subtask } from '../types';
import { createSubtask } from '../utils/taskHelpers';
import type { TaskDetailLabels } from '../utils/taskHelpers';

interface TaskSubtasksSectionProps {
  subtasks: Subtask[];
  canEdit: boolean;
  labels: TaskDetailLabels;
  language?: Language;
  onChange: (subtasks: Subtask[]) => void;
  /** When set, removing a subtask opens a confirmation first */
  onRequestRemove?: (subtaskId: string, title: string) => void;
}

/**
 * Jira-style checklist: add steps, tick them off, see progress at a glance.
 */
export default function TaskSubtasksSection({
  subtasks,
  canEdit,
  labels,
  language = 'en',
  onChange,
  onRequestRemove,
}: TaskSubtasksSectionProps) {
  const [draft, setDraft] = useState('');
  const done = subtasks.filter((s) => s.isCompleted).length;
  const total = subtasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const addSubtask = () => {
    if (!draft.trim()) return;
    onChange([...subtasks, createSubtask(draft)]);
    setDraft('');
  };

  const toggle = (id: string) => {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, isCompleted: !s.isCompleted } : s)));
  };

  const remove = (id: string) => {
    const sub = subtasks.find((s) => s.id === id);
    if (!sub) return;
    if (onRequestRemove) {
      onRequestRemove(id, sub.title);
      return;
    }
    onChange(subtasks.filter((s) => s.id !== id));
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <ListChecks className="h-4 w-4 text-cyan-600" />
          {labels.subtasks}
        </h3>
        {total > 0 && (
          <span className="text-[10px] font-semibold text-slate-500">
            {done}/{total} {labels.subtasksDone}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </div>
      )}

      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {subtasks.map((sub) => (
            <motion.li
              key={sub.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-950/50"
            >
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => toggle(sub.id)}
                style={{ width: 22, height: 22 }}
                className={`flex shrink-0 grow-0 basis-auto items-center justify-center self-center rounded-[7px] border-2 transition-all ${
                  sub.isCompleted
                    ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
                    : 'border-slate-300 bg-white hover:border-cyan-400 hover:shadow-sm dark:border-slate-600 dark:bg-slate-900'
                } ${canEdit ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
                aria-label={sub.isCompleted ? 'Completed' : 'Mark complete'}
              >
                {sub.isCompleted && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
              </button>
              <span
                className={`min-w-0 flex-1 text-sm ${
                  sub.isCompleted ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {sub.title}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(sub.id)}
                  aria-label={language === 'fr' ? 'Supprimer' : 'Delete subtask'}
                  title={language === 'fr' ? 'Supprimer' : 'Delete subtask'}
                  className="rounded p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 active:bg-red-100 active:text-red-600 dark:hover:bg-red-950/30 sm:p-1 sm:text-slate-300 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {subtasks.length === 0 && (
        <p className="py-2 text-center text-xs text-slate-400">{labels.subtasksEmpty}</p>
      )}

      {canEdit && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addSubtask();
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={labels.subtaskPlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus className="h-3.5 w-3.5" />
            {labels.addSubtask}
          </button>
        </form>
      )}
    </div>
  );
}
