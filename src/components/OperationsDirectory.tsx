import { useEffect, useMemo, useState } from 'react';
import { Building, Plus, Search, Trash2, Upload, UserRound, X } from 'lucide-react';
import { ContactKind, ContactRecord, Language, Project } from '../types';
import { useAuth } from '../lib/AuthContext';
import { deleteContactFromDB, saveContactToDB, subscribeToContacts } from '../lib/db';
import { rentalText } from '../utils/rentalTranslations';
import ConfirmDialog from './ConfirmDialog';
import TopNavbar from './TopNavbar';

interface OperationsDirectoryProps {
  projects: Project[];
  language: Language;
  onLanguageChange: (language: Language) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  sidebarToggleLabel?: string;
  unreadCount?: number;
  onToggleNotifications?: () => void;
}

type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  projectId?: string;
};

const emptyDraft = (): Omit<ContactRecord, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> => ({
  kind: 'client',
  name: '',
  email: '',
  phone: '',
  address: '',
  company: '',
  notes: '',
});

const contactKey = (kind: ContactKind, name: string, email = '', phone = '') =>
  `${kind}|${email.trim().toLowerCase()}|${phone.replace(/\s+/g, '')}|${name.trim().toLowerCase()}`;

export default function OperationsDirectory({
  projects,
  language,
  onLanguageChange,
  theme,
  onThemeToggle,
  onBack,
  onOpenProject,
  sidebarOpen,
  onToggleSidebar,
  sidebarToggleLabel,
  unreadCount,
  onToggleNotifications,
}: OperationsDirectoryProps) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | ContactKind>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ContactRecord | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeToContacts(user.uid, setContacts);
  }, [user?.uid]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const values: SearchResult[] = [];
    contacts
      .filter((contact) => kind === 'all' || contact.kind === kind)
      .filter((contact) => !needle || [contact.name, contact.email, contact.phone, contact.company, contact.address, contact.notes]
        .filter(Boolean).some((value) => value!.toLowerCase().includes(needle)))
      .forEach((contact) => values.push({
        id: `contact_${contact.id}`,
        type: contact.kind,
        title: contact.name,
        subtitle: [contact.company, contact.phone, contact.email].filter(Boolean).join(' · '),
      }));
    if (needle) {
      projects.forEach((project) => {
        const add = (id: string, type: string, title: string, subtitle: string, searchable: unknown[]) => {
          if (searchable.filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))) {
            values.push({ id, type, title, subtitle, projectId: project.id });
          }
        };
        add(`project_${project.id}`, project.projectType === 'rental' ? 'property' : 'project', project.name, project.address, [project.name, project.clientName, project.address, project.description, project.rentalProperty?.ownerName, project.rentalProperty?.buildingNumber]);
        (project.rentalBookings || []).forEach((booking) => add(`booking_${project.id}_${booking.id}`, 'booking', booking.clientName, `${project.name} · ${booking.checkIn} - ${booking.checkOut}`, [booking.clientName, booking.clientPhone, booking.source, booking.notes]));
        (project.expenses || []).forEach((expense) => add(`expense_${project.id}_${expense.id}`, 'expense', expense.title, `${project.name} · ${expense.amount} ${project.currency}`, [expense.title, expense.description, expense.supplier, expense.notes]));
        (project.tasks || []).forEach((task) => add(`task_${project.id}_${task.id}`, 'task', task.title, `${project.name} · ${task.status}`, [task.title, task.description, task.notes, task.workedBy]));
        (project.documents || []).forEach((document) => add(`document_${project.id}_${document.id}`, 'document', document.title, project.name, [document.title, document.folder, document.fileType]));
      });
    }
    return values.slice(0, 250);
  }, [contacts, projects, query, kind]);

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setError('');
    setShowForm(true);
  };

  const openEdit = (contact: ContactRecord) => {
    setEditingId(contact.id);
    setDraft({
      kind: contact.kind,
      name: contact.name,
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
      company: contact.company || '',
      notes: contact.notes || '',
    });
    setError('');
    setShowForm(true);
  };

  const saveContact = async () => {
    if (!user?.uid || !user.email || !draft.name.trim()) {
      setError(rentalText(language, 'A contact name is required.', 'Le nom du contact est obligatoire.'));
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = contacts.find((contact) => contact.id === editingId);
      await saveContactToDB(user.uid, {
        ...draft,
        id: editingId || `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: draft.name.trim(),
        createdAt: existing?.createdAt || now,
        createdBy: existing?.createdBy || user.email.toLowerCase(),
        updatedAt: now,
        updatedBy: user.email.toLowerCase(),
      });
      setShowForm(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this contact.');
    } finally {
      setSaving(false);
    }
  };

  const syncFromWorkspaces = async () => {
    if (!user?.uid || !user.email) return;
    setSaving(true);
    setError('');
    try {
      const candidates = new Map<string, { kind: ContactKind; name: string; email?: string; phone?: string; address?: string; company?: string; notes?: string }>();
      const add = (candidate: { kind: ContactKind; name?: string; email?: string; phone?: string; address?: string; company?: string; notes?: string }) => {
        if (!candidate.name?.trim()) return;
        candidates.set(contactKey(candidate.kind, candidate.name, candidate.email, candidate.phone), { ...candidate, name: candidate.name.trim() });
      };
      projects.forEach((project) => {
        add({ kind: 'client', name: project.clientName, address: project.address, notes: project.name });
        if (project.rentalProperty) add({ kind: 'owner', name: project.rentalProperty.ownerName, email: project.rentalProperty.ownerEmail, phone: project.rentalProperty.ownerPhone, address: project.address, notes: project.rentalProperty.buildingNumber });
        (project.rentalBookings || []).forEach((booking) => add({ kind: 'guest', name: booking.clientName, phone: booking.clientPhone, notes: booking.source }));
        (project.expenses || []).forEach((expense) => add({ kind: 'supplier', name: expense.supplier }));
        (project.tasks || []).forEach((task) => add({ kind: 'worker', name: task.workedBy }));
      });
      const existingKeys = new Set(contacts.map((contact) => contactKey(contact.kind, contact.name, contact.email, contact.phone)));
      const now = new Date().toISOString();
      for (const [key, candidate] of candidates) {
        if (existingKeys.has(key)) continue;
        await saveContactToDB(user.uid, {
          ...candidate,
          id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: now,
          createdBy: user.email.toLowerCase(),
          updatedAt: now,
          updatedBy: user.email.toLowerCase(),
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not synchronize contacts.');
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async () => {
    if (!user?.uid || !deleteTarget) return;
    setSaving(true);
    try {
      await deleteContactFromDB(user.uid, deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TopNavbar user={user} sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} sidebarToggleLabel={sidebarToggleLabel} language={language} onLanguageChange={onLanguageChange} theme={theme} onThemeToggle={onThemeToggle} onBack={onBack} backLabel={rentalText(language, 'All workspaces', 'Tous les espaces')} createLabel={rentalText(language, 'New contact', 'Nouveau contact')} onCreateProject={openNew} unreadCount={unreadCount} onToggleNotifications={onToggleNotifications} langLabel={rentalText(language, 'Language', 'Langue')} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase text-sky-600">{rentalText(language, 'Shared operations', 'Operations partagees')}</p><h1 className="mt-1 text-2xl font-bold">{rentalText(language, 'Contacts and universal search', 'Contacts et recherche universelle')}</h1><p className="mt-1 text-xs text-slate-500">{contacts.length} {rentalText(language, 'saved contacts', 'contacts enregistres')}</p></div><div className="flex gap-2"><button type="button" disabled={saving} onClick={syncFromWorkspaces} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-900"><Upload className="h-4 w-4" />{rentalText(language, 'Sync workspaces', 'Synchroniser')}</button><button type="button" onClick={openNew} className="flex h-9 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-bold text-white"><Plus className="h-4 w-4" />{rentalText(language, 'Add contact', 'Ajouter')}</button></div></div>
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={rentalText(language, 'Search contacts, projects, properties, guests, expenses, tasks, and documents...', 'Rechercher contacts, projets, clients, depenses, taches...')} className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950" /></label><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"><option value="all">{rentalText(language, 'All contacts', 'Tous contacts')}</option>{(['client', 'owner', 'guest', 'supplier', 'worker', 'other'] as ContactKind[]).map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-bold uppercase text-slate-400 dark:border-slate-800 dark:bg-slate-950"><span>{rentalText(language, 'Record', 'Enregistrement')}</span><span>{rentalText(language, 'Type', 'Type')}</span><span /></div>{results.length === 0 ? <p className="px-4 py-14 text-center text-xs text-slate-400">{rentalText(language, 'No matching records.', 'Aucun resultat.')}</p> : results.map((result) => { const contact = result.id.startsWith('contact_') ? contacts.find((item) => `contact_${item.id}` === result.id) : undefined; return <div key={result.id} className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800"><button type="button" onClick={() => result.projectId ? onOpenProject(result.projectId) : contact ? openEdit(contact) : undefined} className="min-w-0 text-left"><span className="block truncate text-xs font-bold">{result.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{result.subtitle || '-'}</span></button><span className="text-[9px] font-bold uppercase text-slate-500">{result.type}</span>{contact ? <button type="button" title={rentalText(language, 'Delete contact', 'Supprimer')} onClick={() => setDeleteTarget(contact)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button> : <Building className="h-3.5 w-3.5 text-slate-300" />}</div>; })}</div>
      </main>

      {showForm && <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="flex items-center gap-2 text-sm font-bold"><UserRound className="h-4 w-4 text-sky-600" />{editingId ? rentalText(language, 'Edit contact', 'Modifier contact') : rentalText(language, 'New contact', 'Nouveau contact')}</h2><button type="button" onClick={() => setShowForm(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button></div><div className="grid gap-3 p-4 sm:grid-cols-2"><label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">Type</span><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ContactKind })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950">{(['client', 'owner', 'guest', 'supplier', 'worker', 'other'] as ContactKind[]).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Name', 'Nom')}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950" /></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">Email</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950" /></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Phone', 'Telephone')}</span><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950" /></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Company', 'Societe')}</span><input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950" /></label><label><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{rentalText(language, 'Address', 'Adresse')}</span><input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950" /></label><label className="sm:col-span-2"><span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">Notes</span><textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950" /></label>{error && <p className="sm:col-span-2 text-xs font-semibold text-rose-600">{error}</p>}</div><div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800"><button type="button" onClick={() => setShowForm(false)} className="h-9 rounded-md border border-slate-200 px-3 text-xs font-bold dark:border-slate-700">{rentalText(language, 'Cancel', 'Annuler')}</button><button type="button" disabled={saving} onClick={saveContact} className="h-9 rounded-md bg-sky-600 px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? '...' : rentalText(language, 'Save contact', 'Enregistrer')}</button></div></div></div>}
      <ConfirmDialog open={Boolean(deleteTarget)} title={rentalText(language, 'Delete this contact?', 'Supprimer ce contact ?')} message={deleteTarget?.name || ''} confirmLabel={rentalText(language, 'Delete contact', 'Supprimer')} language={language} loading={saving} onConfirm={deleteContact} onCancel={() => !saving && setDeleteTarget(null)} />
    </div>
  );
}
