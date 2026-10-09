import React, { useState } from 'react';
import { Layers, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { Language, Project, ProjectSection } from '../types';

const SECTION_STATUSES: ProjectSection['status'][] = ['planning', 'in_progress', 'completed'];

interface ProjectSectionsManagerProps {
  project: Project;
  language: Language;
  canEdit: boolean;
  /** Reason shown when a read-only viewer opens the manager. */
  readOnlyReason?: string;
  onSave: (sections: ProjectSection[]) => Promise<boolean> | boolean;
  onNotify: (message: string) => void;
}

function label(status: ProjectSection['status'], language: Language): string {
  if (language === 'fr') {
    return status === 'planning' ? 'Planifié' : status === 'in_progress' ? 'En cours' : 'Terminé';
  }
  if (language === 'ar') {
    return status === 'planning' ? 'مخطط' : status === 'in_progress' ? 'قيد التنفيذ' : 'منجز';
  }
  return status === 'planning' ? 'Planned' : status === 'in_progress' ? 'In progress' : 'Done';
}

function newSection(projectId: string): ProjectSection {
  return {
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    title: '',
    progress: 0,
    status: 'planning',
  };
}

/**
 * Minimal manager for project sections (lots/lots of work). Sections are referenced by
 * expenses and tasks, so renaming or deleting one warns about the records attached to it.
 */
export default function ProjectSectionsManager({
  project,
  language,
  canEdit,
  readOnlyReason,
  onSave,
  onNotify,
}: ProjectSectionsManagerProps) {
  const [drafts, setDrafts] = useState<ProjectSection[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sections = drafts ?? project.sections;
  const isDirty = drafts !== null;

  const commit = async (next: ProjectSection[]) => {
    const cleaned = next
      .map((s) => ({ ...s, title: s.title.trim() }))
      .filter((s) => s.title.length > 0);
    const ok = await onSave(cleaned);
    if (ok) {
      setDrafts(null);
      setEditingId(null);
      setConfirmDeleteId(null);
    } else {
      onNotify(
        language === 'fr'
          ? 'Enregistrement des sections impossible.'
          : language === 'ar'
            ? 'تعذر حفظ الأقسام.'
            : 'Could not save sections.'
      );
    }
  };

  const patch = (id: string, changes: Partial<ProjectSection>) => {
    setDrafts(
      sections.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...changes };
        // Keep progress and status coherent so the two never contradict each other.
        if (changes.status === 'completed') merged.progress = 100;
        if (changes.status === 'planning') merged.progress = 0;
        if (changes.progress !== undefined && changes.status === undefined) {
          merged.status =
            changes.progress >= 100 ? 'completed' : changes.progress > 0 ? 'in_progress' : 'planning';
        }
        return merged;
      })
    );
  };

  const usageCount = (sectionId: string) => ({
    expenses: project.expenses.filter((e) => e.sectionId === sectionId).length,
    tasks: project.tasks.filter((t) => t.sectionId === sectionId).length,
  });

  const t = (en: string, fr: string, ar: string) => (language === 'fr' ? fr : language === 'ar' ? ar : en);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <Layers className="w-4 h-4 text-sky-500" />
          {t('Sections', 'Sections', 'الأقسام')}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800">
            {sections.length}
          </span>
        </h3>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              const blank = newSection(project.id);
              setDrafts([...sections, blank]);
              setEditingId(blank.id);
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Add', 'Ajouter', 'إضافة')}
          </button>
        ) : (
          readOnlyReason && (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {readOnlyReason}
            </span>
          )
        )}
      </div>

      {sections.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-slate-400">
          {t(
            'No sections yet. Sections group expenses and tasks by lot.',
            'Aucune section. Les sections regroupent dépenses et tâches par lot.',
            'لا توجد أقسام بعد. تجمع الأقسام المصاريف والمهام حسب الدفعات.'
          )}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-850">
          {sections.map((section) => {
            const usage = usageCount(section.id);
            const isEditing = editingId === section.id;
            const isConfirmingDelete = confirmDeleteId === section.id;
            return (
              <li key={section.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={section.title}
                      onChange={(e) => patch(section.id, { title: e.target.value })}
                      placeholder={t('Section name', 'Nom de la section', 'اسم القسم')}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {section.title}
                    </span>
                  )}

                  <select
                    value={section.status}
                    disabled={!canEdit}
                    onChange={(e) => patch(section.id, { status: e.target.value as ProjectSection['status'] })}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {SECTION_STATUSES.map((s) => (
                      <option key={s} value={s}>{label(s, language)}</option>
                    ))}
                  </select>

                  <div className="flex w-28 items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={section.progress}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patch(section.id, {
                          progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-mono disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                    <span className="text-[10px] font-mono text-slate-400">%</span>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) void commit(sections);
                          else setEditingId(section.id);
                        }}
                        title={isEditing ? t('Save', 'Enregistrer', 'حفظ') : t('Edit', 'Modifier', 'تعديل')}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-50 hover:text-sky-600 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {isEditing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                      </button>
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDrafts(null);
                            setEditingId(null);
                          }}
                          title={t('Cancel', 'Annuler', 'إلغاء')}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(section.id)}
                          title={t('Delete', 'Supprimer', 'حذف')}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {usage.expenses + usage.tasks > 0 && (
                  <p className="mt-1 pl-0.5 text-[10px] text-slate-400">
                    {usage.expenses > 0 &&
                      t(
                        `${usage.expenses} expense${usage.expenses > 1 ? 's' : ''}`,
                        `${usage.expenses} dépense${usage.expenses > 1 ? 's' : ''}`,
                        `${usage.expenses} مصروف`
                      )}
                    {usage.expenses > 0 && usage.tasks > 0 && ' · '}
                    {usage.tasks > 0 &&
                      t(
                        `${usage.tasks} task${usage.tasks > 1 ? 's' : ''}`,
                        `${usage.tasks} tâche${usage.tasks > 1 ? 's' : ''}`,
                        `${usage.tasks} مهمة`
                      )}
                  </p>
                )}

                {isConfirmingDelete && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                    <span className="flex-1">
                      {usage.expenses + usage.tasks > 0
                        ? t(
                            `This section is used by ${usage.expenses + usage.tasks} record(s). Deleting it leaves those records uncategorized.`,
                            `Cette section est utilisée par ${usage.expenses + usage.tasks} enregistrement(s). La suppression les laisse sans catégorie.`,
                            `يُستخدم هذا القسم في ${usage.expenses + usage.tasks} سجل. سيؤدي الحذف إلى إلغاء تصنيفها.`
                          )
                        : t('Delete this section?', 'Supprimer cette section ?', 'حذف هذا القسم؟')}
                    </span>
                    <button
                      type="button"
                      onClick={() => void commit(sections.filter((s) => s.id !== section.id))}
                      className="rounded-md bg-rose-600 px-2 py-1 font-bold text-white hover:bg-rose-700 cursor-pointer"
                    >
                      {t('Delete', 'Supprimer', 'حذف')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md bg-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 cursor-pointer"
                    >
                      {t('Cancel', 'Annuler', 'إلغاء')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isDirty && (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-850">
          <button
            type="button"
            onClick={() => {
              setDrafts(null);
              setEditingId(null);
              setConfirmDeleteId(null);
            }}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
          >
            {t('Cancel', 'Annuler', 'إلغاء')}
          </button>
          <button
            type="button"
            onClick={() => void commit(sections)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 cursor-pointer"
          >
            {t('Save sections', 'Enregistrer', 'حفظ الأقسام')}
          </button>
        </div>
      )}
    </div>
  );
}