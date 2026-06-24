import React, { useState } from 'react';
import {
  Calendar,
  Eye,
  Pencil,
  Trash2,
  GripVertical,
  Circle,
  Loader2,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Task, Language, Project, ProjectMember } from '../types';
import { categoryLabel, normalizeTask, taskTotalCost, subtaskProgress } from '../utils/taskHelpers';

type TaskStatus = Task['status'];

interface KanbanColumnConfig {
  status: TaskStatus;
  title: { en: string; fr: string; ar: string };
  icon: React.ReactNode;
  /** Cool-tone column chrome */
  columnClass: string;
  headerClass: string;
  badgeClass: string;
  dropRingClass: string;
}

const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  {
    status: 'pending',
    title: { en: 'Pending', fr: 'À faire', ar: 'معلق' },
    icon: <Circle className="h-3.5 w-3.5" />,
    columnClass: 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-700/60',
    headerClass: 'text-slate-600 dark:text-slate-300',
    badgeClass: 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dropRingClass: 'ring-2 ring-slate-400/50 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950',
  },
  {
    status: 'in_progress',
    title: { en: 'Doing', fr: 'En cours', ar: 'قيد التنفيذ' },
    icon: <Loader2 className="h-3.5 w-3.5" />,
    columnClass: 'bg-cyan-50/60 dark:bg-cyan-950/25 border-cyan-200/70 dark:border-cyan-900/50',
    headerClass: 'text-cyan-800 dark:text-cyan-300',
    badgeClass: 'bg-cyan-100/90 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-200',
    dropRingClass: 'ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-cyan-50/50 dark:ring-offset-slate-950',
  },
  {
    status: 'completed',
    title: { en: 'Done', fr: 'Terminé', ar: 'منجز' },
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    columnClass: 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-200/60 dark:border-teal-900/40',
    headerClass: 'text-teal-800 dark:text-teal-300',
    badgeClass: 'bg-teal-100/90 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200',
    dropRingClass: 'ring-2 ring-teal-400/50 ring-offset-2 ring-offset-teal-50/50 dark:ring-offset-slate-950',
  },
];

interface TaskKanbanBoardProps {
  tasks: Task[];
  project: Project;
  language: Language;
  canEdit: boolean;
  canEditTask: (task: Task) => boolean;
  canDeleteTask: (task: Task) => boolean;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onOpenTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  /** Element id to pulse when AI navigates here (e.g. task-card-xxx) */
  focusElementId?: string | null;
}

function priorityDot(priority: Task['priority']) {
  if (priority === 'high') return 'bg-rose-400';
  if (priority === 'medium') return 'bg-cyan-400';
  return 'bg-slate-400';
}

/** Single draggable task card */
function KanbanCard({
  task,
  member,
  language,
  currency,
  canEdit,
  isDragging,
  onOpen,
  onDelete,
  taskEditable,
  taskDeletable,
  isFocused,
}: {
  task: Task;
  member?: ProjectMember;
  language: Language;
  currency: string;
  canEdit: boolean;
  isDragging: boolean;
  onOpen: () => void;
  onDelete: () => void;
  taskEditable: boolean;
  taskDeletable: boolean;
  isFocused?: boolean;
}) {
  const normalized = normalizeTask(task);
  const photoCount =
    (normalized.beforeImages?.length || 0) + (normalized.afterImages?.length || 0);
  const taskCost = taskTotalCost(normalized);
  const { done: subDone, total: subTotal } = subtaskProgress(normalized);

  return (
    <div
      id={`task-card-${task.id}`}
      className={`group rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm transition-all dark:border-slate-700/80 dark:bg-slate-900/90 ${
        isDragging ? 'scale-[0.98] opacity-40' : 'hover:border-cyan-300/60 hover:shadow-md dark:hover:border-cyan-800/50'
      } ${canEdit && taskEditable ? 'cursor-grab active:cursor-grabbing' : ''} ${
        isFocused ? 'ai-focus-pulse border-cyan-400 dark:border-cyan-500' : ''
      }`}
    >
      <div className="flex gap-2">
        {canEdit && taskEditable && (
          <div className="pt-0.5 text-slate-300 group-hover:text-slate-400 dark:text-slate-600">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${priorityDot(task.priority)}`} />
              {categoryLabel(task.workCategory, language)}
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-mono text-slate-400">
              {!taskEditable && (
                <Lock className="h-3 w-3 text-amber-500" title={language === 'en' ? 'Protected — view only' : 'Protégée'} />
              )}
              <Calendar className="h-3 w-3" />
              {task.deadline}
            </span>
          </div>

          <button type="button" onClick={onOpen} className="w-full text-left">
            <h4 className="text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">
              {task.title}
            </h4>
            {task.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {task.description}
              </p>
            )}
          </button>

          {(photoCount > 0 || taskCost > 0 || subTotal > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {subTotal > 0 && (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-medium text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                  {subDone}/{subTotal}{' '}
                  {language === 'en' ? 'steps' : language === 'fr' ? 'étapes' : 'خطوات'}
                </span>
              )}
              {photoCount > 0 && (
                <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[9px] font-medium text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
                  {photoCount} {language === 'en' ? 'photos' : language === 'fr' ? 'photos' : 'صور'}
                </span>
              )}
              {taskCost > 0 && (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 font-mono text-[9px] text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                  {taskCost.toLocaleString()} {currency}
                </span>
              )}
            </div>
          )}

          {subTotal > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 transition-all duration-300"
                style={{ width: `${Math.round((subDone / subTotal) * 100)}%` }}
              />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-700 text-[9px] font-bold uppercase text-white dark:bg-slate-600">
                {member?.name.charAt(0) || 'T'}
              </div>
              <span className="truncate text-[10px] font-medium text-slate-600 dark:text-slate-400">
                {member?.name || task.assignedTo}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              {taskEditable ? (
                <button
                  type="button"
                  onClick={onOpen}
                  className="rounded-md p-1 text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950/40"
                  title={language === 'en' ? 'Edit task' : language === 'fr' ? 'Modifier' : 'تعديل المهمة'}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpen}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  title={language === 'en' ? 'View task' : language === 'fr' ? 'Voir' : 'عرض'}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
              {canEdit && taskDeletable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Jira-style kanban: Pending · Doing · Done with drag-and-drop between columns.
 */
export default function TaskKanbanBoard({
  tasks,
  project,
  language,
  canEdit,
  canEditTask,
  canDeleteTask,
  onStatusChange,
  onOpenTask,
  onDeleteTask,
  focusElementId = null,
}: TaskKanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const getMember = (email: string) => project.members.find((m) => m.email === email);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (!canEdit) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !canEditTask(task)) return;
    setDraggedId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverStatus(null);
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    if (!canEdit || !draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedId;
    if (taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== status && canEditTask(task)) {
        onStatusChange(taskId, status);
      }
    }
    setDraggedId(null);
    setDragOverStatus(null);
  };

  const dragHint =
    language === 'en'
      ? 'Drag cards between columns to update status'
      : language === 'fr'
      ? 'Glissez les cartes entre les colonnes'
      : 'اسحب البطاقات بين الأعمدة';

  return (
    <div className="space-y-3">
      {canEdit && tasks.length > 0 && (
        <p className="text-center text-[10px] font-medium uppercase tracking-widest text-slate-400">
          {dragHint}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {KANBAN_COLUMNS.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.status);
          const isDropTarget = dragOverStatus === col.status && draggedId !== null;

          return (
            <div
              key={col.status}
              className={`flex min-h-[280px] flex-col rounded-2xl border p-3 transition-all ${col.columnClass} ${
                isDropTarget ? col.dropRingClass : ''
              }`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <div className={`mb-3 flex items-center justify-between px-1 ${col.headerClass}`}>
                <div className="flex items-center gap-2">
                  {col.icon}
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    {col.title[language]}
                  </h4>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono ${col.badgeClass}`}
                >
                  {columnTasks.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2.5">
                {columnTasks.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/60 py-8 text-[11px] text-slate-400 dark:border-slate-700/60">
                    {language === 'en' ? 'Drop tasks here' : language === 'fr' ? 'Déposer ici' : 'أفلت المهام هنا'}
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    const taskEditable = canEditTask(task);
                    const taskDeletable = canDeleteTask(task);
                    return (
                    <div
                      key={task.id}
                      draggable={canEdit && taskEditable}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <KanbanCard
                        task={task}
                        member={getMember(task.assignedTo)}
                        language={language}
                        currency={project.currency}
                        canEdit={canEdit}
                        isDragging={draggedId === task.id}
                        onOpen={() => onOpenTask(task.id)}
                        onDelete={() => onDeleteTask(task.id)}
                        taskEditable={taskEditable}
                        taskDeletable={taskDeletable}
                        isFocused={focusElementId === `task-card-${task.id}`}
                      />
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
