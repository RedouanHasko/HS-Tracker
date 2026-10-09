import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Truck,
  Users,
  Bell,
  Palmtree,
  StickyNote,
} from 'lucide-react';
import { CalendarEventKind, CalendarEventRecord, Language, Project } from '../types';
import { useAuth } from '../lib/AuthContext';
import {
  deleteCalendarEventFromDB,
  saveCalendarEventToDB,
  subscribeToCalendarEvents,
} from '../lib/db';
import { appDateKey } from '../utils/dateTime';
import { formErrorText } from '../utils/forms';
import {
  buildMonthGrid,
  groupTasksByDate,
  monthKeyOf,
  monthLabel,
  shiftMonthKey,
  weekdayLabels,
} from '../utils/calendar';

interface WorkCalendarProps {
  language: Language;
  projects: Project[];
  onOpenProject: (projectId: string) => void;
}

const EVENT_KINDS: { id: CalendarEventKind; icon: React.ReactNode; dot: string }[] = [
  { id: 'meeting', icon: <Users className="h-3 w-3" />, dot: 'bg-sky-500' },
  { id: 'delivery', icon: <Truck className="h-3 w-3" />, dot: 'bg-violet-500' },
  { id: 'day_off', icon: <Palmtree className="h-3 w-3" />, dot: 'bg-slate-400' },
  { id: 'reminder', icon: <Bell className="h-3 w-3" />, dot: 'bg-amber-500' },
  { id: 'other', icon: <StickyNote className="h-3 w-3" />, dot: 'bg-slate-300' },
];

function eventKindLabel(kind: CalendarEventKind, language: Language): string {
  if (language === 'fr') {
    return kind === 'meeting' ? 'Réunion' : kind === 'delivery' ? 'Livraison' : kind === 'day_off' ? 'Congé' : kind === 'reminder' ? 'Rappel' : 'Autre';
  }
  if (language === 'ar') {
    return kind === 'meeting' ? 'اجتماع' : kind === 'delivery' ? 'تسليم' : kind === 'day_off' ? 'عطلة' : kind === 'reminder' ? 'تذكير' : 'أخرى';
  }
  return kind === 'meeting' ? 'Meeting' : kind === 'delivery' ? 'Delivery' : kind === 'day_off' ? 'Day off' : kind === 'reminder' ? 'Reminder' : 'Other';
}

/**
 * Work calendar: one month view mixing task deadlines (from every visible
 * workspace) with lightweight personal events. Read-mostly by design.
 */
export default function WorkCalendar({ language, projects, onOpenProject }: WorkCalendarProps) {
  const { user } = useAuth();
  const todayKey = appDateKey();
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(todayKey));
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventKind, setEventKind] = useState<CalendarEventKind>('meeting');
  const [eventProjectId, setEventProjectId] = useState('');
  const [formError, setFormError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setEvents([]);
      return;
    }
    return subscribeToCalendarEvents(user.uid, setEvents);
  }, [user?.uid]);

  const tasksByDate = useMemo(() => {
    const refs = projects.flatMap((project) =>
      (project.tasks || []).map((task) => ({
        task,
        projectId: project.id,
        projectName: project.name,
      }))
    );
    return groupTasksByDate(refs, todayKey);
  }, [projects, todayKey]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventRecord[]>();
    for (const event of events) {
      const list = map.get(event.date) || [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const days = useMemo(() => buildMonthGrid(monthKey, todayKey), [monthKey, todayKey]);
  const selectedTasks = tasksByDate.get(selectedDay) || [];
  const selectedEvents = eventsByDate.get(selectedDay) || [];

  const openAddForm = () => {
    setEventTitle('');
    setEventKind('meeting');
    setEventProjectId('');
    setFormError(false);
    setShowAddForm(true);
  };

  const handleSaveEvent = async () => {
    if (!user?.uid || saving) return;
    if (!eventTitle.trim()) {
      setFormError(true);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await saveCalendarEventToDB(user.uid, {
        id: `cal_${Date.now()}`,
        date: selectedDay,
        title: eventTitle.trim(),
        kind: eventKind,
        projectId: eventProjectId || undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: (user.email || '').toLowerCase(),
      });
      setShowAddForm(false);
    } catch (err) {
      console.error('Save calendar event failed:', err);
      setFormError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!user?.uid) return;
    try {
      await deleteCalendarEventFromDB(user.uid, eventId);
    } catch (err) {
      console.error('Delete calendar event failed:', err);
    }
  };

  const t = (en: string, fr: string, ar: string) =>
    language === 'fr' ? fr : language === 'ar' ? ar : en;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex items-center gap-2 text-left">
          <CalendarDays className="h-4 w-4 text-sky-500" />
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {t('Work calendar', 'Calendrier chantier', 'تقويم العمل')}
          </h3>
        </button>
        {!collapsed && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthKey((key) => shiftMonthKey(key, -1))}
              aria-label={t('Previous month', 'Mois précédent', 'الشهر السابق')}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMonthKey(monthKeyOf(todayKey));
                setSelectedDay(todayKey);
              }}
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('Today', "Aujourd'hui", 'اليوم')}
            </button>
            <button
              type="button"
              onClick={() => setMonthKey((key) => shiftMonthKey(key, 1))}
              aria-label={t('Next month', 'Mois suivant', 'الشهر التالي')}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-1 min-w-28 text-center text-sm font-bold capitalize text-slate-900 dark:text-white">
              {monthLabel(monthKey, language)}
            </span>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="grid grid-cols-7 gap-1 text-center">
              {weekdayLabels(language).map((label) => (
                <span key={label} className="py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const tasks = tasksByDate.get(day.dateKey) || [];
                const dayEvents = eventsByDate.get(day.dateKey) || [];
                const hasOverdue = tasks.some((item) => item.overdue);
                const isSelected = day.dateKey === selectedDay;
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => {
                      setSelectedDay(day.dateKey);
                      if (day.dateKey.slice(0, 7) !== monthKey) setMonthKey(monthKeyOf(day.dateKey));
                    }}
                    className={`flex min-h-11 flex-col items-center justify-start rounded-lg border px-1 py-1 transition-colors sm:min-h-12 ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-950/50'
                    } ${day.inMonth ? '' : 'opacity-40'}`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${
                        day.isToday
                          ? 'bg-slate-900 font-bold text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {day.dayNumber}
                    </span>
                    {(tasks.length > 0 || dayEvents.length > 0) && (
                      <span className="mt-0.5 flex max-w-full items-center justify-center gap-0.5">
                        {tasks.length > 0 && (
                          <span
                            title={`${tasks.length} ${t('tasks due', 'tâches dues', 'مهام مستحقة')}`}
                            className={`h-1.5 w-1.5 rounded-full ${hasOverdue ? 'bg-rose-500' : 'bg-amber-500'}`}
                          />
                        )}
                        {dayEvents.slice(0, 3).map((event) => (
                          <span
                            key={event.id}
                            title={event.title}
                            className={`h-1.5 w-1.5 rounded-full ${EVENT_KINDS.find((kind) => kind.id === event.kind)?.dot || 'bg-slate-300'}`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{t('Due', 'Échéance', 'مستحق')}</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />{t('Overdue', 'En retard', 'متأخر')}</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{t('Meeting', 'Réunion', 'اجتماع')}</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" />{t('Delivery', 'Livraison', 'تسليم')}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/50 lg:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{selectedDay}</p>
              <button
                type="button"
                onClick={openAddForm}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <Plus className="h-3 w-3" /> {t('Event', 'Événement', 'حدث')}
              </button>
            </div>

            {showAddForm && (
              <div className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                {formError && (
                  <p role="alert" className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                    {formErrorText('required_event_title', language)}
                  </p>
                )}
                <input
                  type="text"
                  autoFocus
                  value={eventTitle}
                  onChange={(e) => { setEventTitle(e.target.value); setFormError(false); }}
                  placeholder={t('e.g. Client meeting, cement delivery…', 'ex. Réunion client, livraison ciment…', 'مثال: اجتماع عميل، تسليم إسمنت…')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={eventKind}
                    onChange={(e) => setEventKind(e.target.value as CalendarEventKind)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {EVENT_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>{eventKindLabel(kind.id, language)}</option>
                    ))}
                  </select>
                  <select
                    value={eventProjectId}
                    onChange={(e) => setEventProjectId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="">{t('No project', 'Sans chantier', 'بدون مشروع')}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {t('Cancel', 'Annuler', 'إلغاء')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEvent}
                    disabled={saving}
                    className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                  >
                    {saving ? '…' : t('Add', 'Ajouter', 'إضافة')}
                  </button>
                </div>
              </div>
            )}

            {selectedTasks.length === 0 && selectedEvents.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-slate-400">
                {t('Nothing scheduled this day.', 'Rien de prévu ce jour.', 'لا شيء مجدول في هذا اليوم.')}
              </p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {selectedTasks.map((item) => (
                  <li key={`task-${item.taskId}`}>
                    <button
                      type="button"
                      onClick={() => onOpenProject(item.projectId)}
                      className="flex w-full items-center gap-2 rounded-lg border border-amber-200/60 bg-white px-2.5 py-1.5 text-left hover:border-amber-300 dark:border-amber-900/40 dark:bg-slate-900"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${item.overdue ? 'bg-rose-500' : 'bg-amber-500'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {item.title}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {item.projectName}
                          {item.overdue && <span className="ml-1 font-bold text-rose-500">· {t('overdue', 'en retard', 'متأخر')}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {selectedEvents.map((event) => {
                  const kind = EVENT_KINDS.find((entry) => entry.id === event.kind);
                  const linkedProject = event.projectId ? projects.find((p) => p.id === event.projectId) : undefined;
                  return (
                    <li
                      key={`event-${event.id}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        {kind?.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {event.title}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {eventKindLabel(event.kind, language)}
                          {linkedProject && ` · ${linkedProject.name}`}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(event.id)}
                        aria-label={t('Delete event', 'Supprimer', 'حذف الحدث')}
                        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
