import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Building,
  CalendarDays,
  FileText,
  ListChecks,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { Language, Project } from '../types';
import { ProjectTab } from '../utils/aiNavigation';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  language: Language;
  /** Restrict results to one workspace — construction never sees rental data and vice versa. */
  projectType?: Project['projectType'] | null;
  onNavigate: (projectId: string, tab: ProjectTab, itemId?: string, itemKind?: 'task' | 'expense') => void;
}

type Hit = {
  id: string;
  group: ProjectTab;
  groupLabel: string;
  title: string;
  subtitle: string;
  projectId: string;
  itemId?: string;
  itemKind?: 'task' | 'expense';
};

const GROUP_META: { key: ProjectTab; labelEn: string; labelFr: string; labelAr: string }[] = [
  { key: 'overview', labelEn: 'Projects', labelFr: 'Projets', labelAr: 'المشاريع' },
  { key: 'expenses', labelEn: 'Expenses', labelFr: 'Dépenses', labelAr: 'المصاريف' },
  { key: 'tasks', labelEn: 'Tasks', labelFr: 'Tâches', labelAr: 'المهام' },
  { key: 'docs', labelEn: 'Documents', labelFr: 'Documents', labelAr: 'المستندات' },
  { key: 'rental', labelEn: 'Bookings', labelFr: 'Réservations', labelAr: 'الحجوزات' },
];

function groupIcon(tab: ProjectTab) {
  switch (tab) {
    case 'expenses': return <Wallet className="h-3.5 w-3.5 text-amber-500" />;
    case 'tasks': return <ListChecks className="h-3.5 w-3.5 text-sky-500" />;
    case 'docs': return <FileText className="h-3.5 w-3.5 text-slate-400" />;
    case 'rental': return <CalendarDays className="h-3.5 w-3.5 text-purple-500" />;
    default: return <Building className="h-3.5 w-3.5 text-slate-400" />;
  }
}

/**
 * Spotlight-style universal search: type in the header, pick a result,
 * jump straight to that project + tab + highlighted item.
 */
export default function GlobalSearch({ open, onClose, projects, language, projectType, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { overlayVariants, overlay } = useMotionConfig();

  useEscapeToClose(open, onClose);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open ]);

  const hits = useMemo<Hit[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const out: Hit[] = [];
    const label = (key: ProjectTab) => {
      const meta = GROUP_META.find((g) => g.key === key)!;
      return language === 'fr' ? meta.labelFr : language === 'ar' ? meta.labelAr : meta.labelEn;
    };
    const matches = (values: unknown[]) =>
      values.filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    for (const project of projects) {
      if (projectType && (project.projectType || 'construction') !== projectType) continue;      if (matches([project.name, project.clientName, project.address, project.description, project.rentalProperty?.ownerName, project.rentalProperty?.buildingNumber])) {
        out.push({
          id: `project_${project.id}`, group: 'overview', groupLabel: label('overview'),
          title: project.name, subtitle: [project.clientName, project.address].filter(Boolean).join(' · '),
          projectId: project.id,
        });
      }
      for (const expense of project.expenses || []) {
        if (matches([expense.title, expense.description, expense.supplier, expense.notes, expense.category])) {
          out.push({
            id: `expense_${project.id}_${expense.id}`, group: 'expenses', groupLabel: label('expenses'),
            title: expense.title, subtitle: `${project.name} · ${expense.amount} ${project.currency}`,
            projectId: project.id, itemId: expense.id, itemKind: 'expense',
          });
        }
      }
      for (const task of project.tasks || []) {
        if (matches([task.title, task.description, task.notes, task.workedBy, task.status])) {
          out.push({
            id: `task_${project.id}_${task.id}`, group: 'tasks', groupLabel: label('tasks'),
            title: task.title, subtitle: `${project.name} · ${task.status}`,
            projectId: project.id, itemId: task.id, itemKind: 'task',
          });
        }
      }
      for (const document of project.documents || []) {
        if (matches([document.title, document.folder, document.fileType])) {
          out.push({
            id: `document_${project.id}_${document.id}`, group: 'docs', groupLabel: label('docs'),
            title: document.title, subtitle: project.name, projectId: project.id,
          });
        }
      }
      for (const booking of project.rentalBookings || []) {
        if (matches([booking.clientName, booking.clientPhone, booking.source, booking.notes])) {
          out.push({
            id: `booking_${project.id}_${booking.id}`, group: 'rental', groupLabel: label('rental'),
            title: booking.clientName, subtitle: `${project.name} · ${booking.checkIn} - ${booking.checkOut}`,
            projectId: project.id,
          });
        }
      }
      if (out.length >= 60) break;
    }
    return out.slice(0, 60);
  }, [projects, query, language, projectType]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-hit-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (hit: Hit) => onNavigate(hit.projectId, hit.group, hit.itemId, hit.itemKind);

  const hint =
    language === 'fr' ? 'Tapez pour chercher projets, dépenses, tâches, documents, réservations…'
    : language === 'ar' ? 'اكتب للبحث في المشاريع والمصاريف والمهام والمستندات والحجوزات…'
    : 'Type to search projects, expenses, tasks, documents, bookings…';
  const empty =
    language === 'fr' ? 'Aucun résultat.' : language === 'ar' ? 'لا نتائج.' : 'No results.';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center p-4 pt-[10vh]">
          <motion.button
            type="button"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={overlay}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px] transform-gpu"
            onClick={onClose}
            aria-label="Close search"
            tabIndex={-1}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            className="panel-motion-gpu relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-modal="true"
            aria-label="Universal search"
          >
            <div className="global-search-bar flex items-center gap-2 border-b border-slate-100 px-4 dark:border-slate-800">
              <Search className="global-search-icon h-5 w-5 shrink-0 text-slate-400 transition-colors" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && hits.length > 0) { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
                  else if (e.key === 'ArrowUp' && hits.length > 0) { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
                  else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active]); }
                }}
                placeholder={hint}
                className="global-search-input h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
              {query.trim() === '' ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">{hint}</p>
              ) : hits.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">{empty}</p>
              ) : (
                hits.map((hit, i) => (
                  <button
                    key={hit.id}
                    type="button"
                    data-hit-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === active ? 'bg-sky-50 dark:bg-sky-950/40' : ''}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                      {groupIcon(hit.group)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{hit.title}</span>
                      <span className="block truncate text-xs text-slate-400">{hit.subtitle || hit.groupLabel}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {hit.groupLabel}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="hidden items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 sm:flex dark:border-slate-800">
              <span><kbd className="rounded border border-slate-200 px-1 font-mono dark:border-slate-700">↑↓</kbd> navigate</span>
              <span><kbd className="rounded border border-slate-200 px-1 font-mono dark:border-slate-700">↵</kbd> open</span>
              <span><kbd className="rounded border border-slate-200 px-1 font-mono dark:border-slate-700">esc</kbd> close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
