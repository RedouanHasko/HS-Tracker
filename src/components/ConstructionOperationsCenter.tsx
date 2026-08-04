import React, { useMemo, useState } from 'react';
import { ClipboardList, Download, Plus, Trash2 } from 'lucide-react';
import {
  ConstructionBudgetCommitment,
  ConstructionChangeOrder,
  ConstructionFundingEntry,
  ConstructionPurchaseOrder,
  ConstructionSiteLog,
  ExpenseCategory,
  Language,
  Project,
} from '../types';
import { ConfirmRequest } from './ConfirmDialog';
import { appDateKey } from '../utils/dateTime';
import { saveCivilDocumentAsPdf } from '../utils/printCivilDocument';

type Props = {
  project: Project;
  language: Language;
  canManage: boolean;
  onSave: (project: Project) => Promise<boolean>;
  onRequestConfirm: (request: ConfirmRequest) => void;
};

type Section = 'funding' | 'changes' | 'orders' | 'logs' | 'budget' | 'report';
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const n = (value: FormDataEntryValue | null) => Math.max(0, Number(value) || 0);
const taskProgress = (task: Project['tasks'][number]) => {
  if (task.status === 'completed') return 100;
  if (!task.subtasks.length) return task.status === 'in_progress' ? 50 : 0;
  return Math.round(task.subtasks.filter((item) => item.isCompleted).length / task.subtasks.length * 100);
};

const labels: Record<Section, [string, string, string]> = {
  funding: ['Funding', 'Financement', 'التمويل'],
  changes: ['Change orders', 'Avenants', 'أوامر التغيير'],
  orders: ['Purchase orders', 'Bons de commande', 'أوامر الشراء'],
  logs: ['Site log', 'Journal de chantier', 'سجل الورشة'],
  budget: ['Budget forecast', 'Prévision budgétaire', 'توقعات الميزانية'],
  report: ['Progress report', 'Rapport de progrès', 'تقرير التقدم'],
};

export default function ConstructionOperationsCenter({ project, language, canManage, onSave, onRequestConfirm }: Props) {
  const [section, setSection] = useState<Section>('funding');
  const [busy, setBusy] = useState(false);
  const text = (en: string, fr: string, ar: string) => language === 'fr' ? fr : language === 'ar' ? ar : en;
  const currency = project.currency;
  const spent = project.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const approvedChanges = (project.constructionChangeOrders || []).filter((item) => item.status === 'approved');
  const adjustedBudget = project.budget + approvedChanges.reduce((sum, item) => sum + item.amountDelta, 0);
  const funding = (project.constructionFunding || []).reduce((sum, item) => sum + item.amount, 0);
  const committed = (project.constructionBudgetCommitments || [])
    .filter((item) => item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.committedAmount, 0);
  const forecast = (project.constructionBudgetCommitments || [])
    .filter((item) => item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.forecastAmount, 0);
  const progress = project.tasks.length
    ? Math.round(project.tasks.reduce((sum, task) => sum + taskProgress(task), 0) / project.tasks.length)
    : 0;
  const scheduleRisks = useMemo(() => project.tasks.filter((task) => task.blockedReason || (
    task.status !== 'completed' && task.deadline && task.deadline < appDateKey()
  )), [project.tasks]);

  const saveArray = async <K extends keyof Project>(key: K, value: Project[K]) => {
    setBusy(true);
    try { await onSave({ ...project, [key]: value }); } finally { setBusy(false); }
  };
  const remove = <K extends keyof Project>(key: K, records: Array<{ id: string }>, recordId: string, title: string) => {
    onRequestConfirm({
      title: text('Delete record?', 'Supprimer cet élément ?', 'حذف السجل؟'),
      message: text(`This will remove “${title}” from this project.`, `“${title}” sera supprimé de ce projet.`, `سيتم حذف “${title}” من هذا المشروع.`),
      confirmLabel: text('Delete', 'Supprimer', 'حذف'),
      variant: 'danger',
      onConfirm: () => saveArray(key, records.filter((item) => item.id !== recordId) as Project[K]),
    });
  };
  const updateRecordStatus = async (recordId: string, status: string) => {
    if (section === 'changes') {
      await saveArray('constructionChangeOrders', (project.constructionChangeOrders || []).map((item) => item.id === recordId ? { ...item, status: status as ConstructionChangeOrder['status'], ...(status === 'approved' || status === 'rejected' ? { decidedAt: appDateKey() } : {}) } : item));
    } else if (section === 'orders') {
      await saveArray('constructionPurchaseOrders', (project.constructionPurchaseOrders || []).map((item) => item.id === recordId ? { ...item, status: status as ConstructionPurchaseOrder['status'] } : item));
    } else if (section === 'budget') {
      await saveArray('constructionBudgetCommitments', (project.constructionBudgetCommitments || []).map((item) => item.id === recordId ? { ...item, status: status as ConstructionBudgetCommitment['status'] } : item));
    }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (section === 'funding') {
      const item: ConstructionFundingEntry = { id: id('fund'), date: String(data.get('date')), amount: n(data.get('amount')), source: String(data.get('source')), method: String(data.get('method')), reference: String(data.get('reference')), notes: String(data.get('notes')) };
      await saveArray('constructionFunding', [...(project.constructionFunding || []), item]);
    } else if (section === 'changes') {
      const item: ConstructionChangeOrder = { id: id('change'), title: String(data.get('title')), description: String(data.get('description')), amountDelta: Number(data.get('amountDelta')) || 0, daysDelta: Number(data.get('daysDelta')) || 0, status: 'draft', requestedAt: String(data.get('date')) };
      await saveArray('constructionChangeOrders', [...(project.constructionChangeOrders || []), item]);
    } else if (section === 'orders') {
      const item: ConstructionPurchaseOrder = { id: id('po'), number: String(data.get('number')), supplier: String(data.get('supplier')), description: String(data.get('description')), amount: n(data.get('amount')), issueDate: String(data.get('date')), expectedDate: String(data.get('expectedDate')), status: 'draft' };
      await saveArray('constructionPurchaseOrders', [...(project.constructionPurchaseOrders || []), item]);
    } else if (section === 'logs') {
      const item: ConstructionSiteLog = { id: id('log'), date: String(data.get('date')), weather: String(data.get('weather')), workerCount: n(data.get('workerCount')), notes: String(data.get('notes')), photoIds: data.getAll('photoIds').map(String), createdBy: project.creatorEmail };
      await saveArray('constructionSiteLogs', [...(project.constructionSiteLogs || []), item]);
    } else if (section === 'budget') {
      const item: ConstructionBudgetCommitment = { id: id('commit'), category: String(data.get('category')) as ExpenseCategory, label: String(data.get('label')), committedAmount: n(data.get('committedAmount')), forecastAmount: n(data.get('forecastAmount')), supplier: String(data.get('supplier')), status: 'planned' };
      await saveArray('constructionBudgetCommitments', [...(project.constructionBudgetCommitments || []), item]);
    }
    form.reset();
  };

  const input = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
  const records = section === 'funding' ? project.constructionFunding || []
    : section === 'changes' ? project.constructionChangeOrders || []
    : section === 'orders' ? project.constructionPurchaseOrders || []
    : section === 'logs' ? project.constructionSiteLogs || []
    : section === 'budget' ? project.constructionBudgetCommitments || [] : [];

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {[
        [text('Adjusted budget', 'Budget ajusté', 'الميزانية المعدلة'), adjustedBudget],
        [text('Client funding', 'Financement client', 'تمويل العميل'), funding],
        [text('Spent', 'Dépensé', 'المصروف'), spent],
        [text('Committed', 'Engagé', 'الملتزم به'), committed],
        [text('Forecast', 'Prévision', 'التوقعات'), forecast],
        [text('Remaining', 'Restant', 'المتبقي'), adjustedBudget - Math.max(spent + committed, forecast)],
      ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">{Number(value).toLocaleString()} {currency}</p>
      </div>)}
    </div>

    <div className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {(Object.keys(labels) as Section[]).map((item) => <button key={item} type="button" onClick={() => setSection(item)} className={`shrink-0 border-b-2 px-2 py-3 text-xs font-bold ${section === item ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-500'}`}>{labels[item][language === 'fr' ? 1 : language === 'ar' ? 2 : 0]}</button>)}
    </div>

    {section !== 'report' && canManage && <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
      {section === 'funding' && <><input name="date" type="date" defaultValue={appDateKey()} className={input} required /><input name="source" className={input} placeholder={text('Funding source', 'Source', 'مصدر التمويل')} required /><input name="amount" type="number" min="0" step="0.01" className={input} placeholder={text('Amount', 'Montant', 'المبلغ')} required /><input name="method" className={input} placeholder={text('Method', 'Méthode', 'الطريقة')} /><input name="reference" className={input} placeholder={text('Reference', 'Référence', 'المرجع')} /><input name="notes" className={`${input} sm:col-span-2`} placeholder={text('Notes', 'Notes', 'ملاحظات')} /></>}
      {section === 'changes' && <><input name="date" type="date" defaultValue={appDateKey()} className={input} required /><input name="title" className={input} placeholder={text('Change title', 'Titre', 'عنوان التغيير')} required /><input name="amountDelta" type="number" step="0.01" className={input} placeholder={text('Budget +/-', 'Budget +/-', 'تغيير الميزانية')} /><input name="daysDelta" type="number" className={input} placeholder={text('Schedule days +/-', 'Jours +/-', 'تغيير الأيام')} /><textarea name="description" className={`${input} h-20 py-2 sm:col-span-2 lg:col-span-4`} placeholder={text('Scope and reason', 'Portée et raison', 'النطاق والسبب')} required /></>}
      {section === 'orders' && <><input name="date" type="date" defaultValue={appDateKey()} className={input} required /><input name="number" className={input} placeholder="PO-001" required /><input name="supplier" className={input} placeholder={text('Supplier', 'Fournisseur', 'المورد')} required /><input name="amount" type="number" min="0" step="0.01" className={input} placeholder={text('Amount', 'Montant', 'المبلغ')} required /><input name="expectedDate" type="date" className={input} /><input name="description" className={`${input} sm:col-span-2`} placeholder={text('Materials / service', 'Matériaux / service', 'المواد أو الخدمة')} required /></>}
      {section === 'logs' && <><input name="date" type="date" defaultValue={appDateKey()} className={input} required /><input name="weather" className={input} placeholder={text('Weather', 'Météo', 'الطقس')} /><input name="workerCount" type="number" min="0" className={input} placeholder={text('Workers on site', 'Ouvriers', 'عدد العمال')} /><textarea name="notes" className={`${input} h-20 py-2 sm:col-span-2 lg:col-span-4`} placeholder={text('Work completed, delays, deliveries and incidents', 'Travaux, retards, livraisons et incidents', 'الأعمال والتأخير والتسليمات والحوادث')} required />{project.photos.length > 0 && <fieldset className="sm:col-span-2 lg:col-span-4"><legend className="mb-2 text-[10px] font-bold uppercase text-slate-400">{text('Attach project photos', 'Joindre des photos', 'إرفاق صور المشروع')}</legend><div className="flex flex-wrap gap-3">{project.photos.slice(-12).map((photo) => <label key={photo.id} className="flex items-center gap-1.5 text-xs"><input name="photoIds" type="checkbox" value={photo.id} />{photo.title}</label>)}</div></fieldset>}</>}
      {section === 'budget' && <><input name="label" className={input} placeholder={text('Budget item', 'Poste budgétaire', 'بند الميزانية')} required /><select name="category" className={input}><option value="materials">Materials</option><option value="labor">Labor</option><option value="equipment">Equipment</option><option value="services">Services</option><option value="other">Other</option></select><input name="committedAmount" type="number" min="0" step="0.01" className={input} placeholder={text('Committed', 'Engagé', 'الملتزم به')} /><input name="forecastAmount" type="number" min="0" step="0.01" className={input} placeholder={text('Forecast final', 'Prévision finale', 'التوقع النهائي')} /><input name="supplier" className={`${input} sm:col-span-2`} placeholder={text('Supplier / worker', 'Fournisseur / ouvrier', 'المورد أو العامل')} /></>}
      <button disabled={busy} className="flex h-10 items-center justify-center gap-2 rounded-md bg-sky-600 px-4 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-4"><Plus className="h-4 w-4" />{text('Add record', 'Ajouter', 'إضافة سجل')}</button>
    </form>}

    {section !== 'report' && <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      {records.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{text('No records yet.', 'Aucun élément.', 'لا توجد سجلات بعد.')}</p> : <table className="w-full min-w-[720px] text-left text-xs"><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{records.slice().reverse().map((record) => {
        const value = record as unknown as Record<string, unknown>;
        const title = String(value.title || value.label || value.number || value.source || value.date || 'Record');
        const statuses = section === 'changes' ? ['draft', 'sent', 'approved', 'rejected', 'cancelled'] : section === 'orders' ? ['draft', 'ordered', 'partially_received', 'received', 'cancelled'] : section === 'budget' ? ['planned', 'committed', 'closed', 'cancelled'] : [];
        return <tr key={record.id} className="bg-white dark:bg-slate-900"><td className="p-3 font-bold text-slate-900 dark:text-white">{title}</td><td className="p-3 text-slate-500">{String(value.date || value.requestedAt || value.issueDate || value.category || '')}</td><td className="p-3 text-slate-500">{String(value.description || value.notes || value.supplier || value.weather || '')}</td><td className="p-3 text-right font-mono">{Number(value.amount || value.amountDelta || value.committedAmount || 0).toLocaleString()} {currency}</td><td className="p-3 text-right">{statuses.length > 0 && <select disabled={!canManage || busy} value={String(value.status)} onChange={(event) => updateRecordStatus(record.id, event.target.value)} className="mr-2 h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] dark:border-slate-700 dark:bg-slate-950">{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>}{canManage && <button type="button" aria-label={text('Delete', 'Supprimer', 'حذف')} onClick={() => remove((section === 'funding' ? 'constructionFunding' : section === 'changes' ? 'constructionChangeOrders' : section === 'orders' ? 'constructionPurchaseOrders' : section === 'logs' ? 'constructionSiteLogs' : 'constructionBudgetCommitments') as keyof Project, records, record.id, title)} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>}</td></tr>;
      })}</tbody></table>}
    </div>}

    {section === 'report' && <div className="space-y-3">
      <div className="flex justify-end" data-print-hide><button type="button" onClick={() => saveCivilDocumentAsPdf(`${project.name}_progress_${appDateKey()}`, 'report')} className="flex h-10 items-center gap-2 rounded-md bg-sky-600 px-4 text-xs font-bold text-white"><Download className="h-4 w-4" />{text('Save report as PDF', 'Enregistrer en PDF', 'حفظ التقرير PDF')}</button></div>
      <div id="printable-civil-bill" className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-8 text-slate-900 shadow-sm print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-300 pb-6"><div><p className="text-xs font-bold uppercase text-sky-600">HS Tracker</p><h2 className="mt-2 text-2xl font-bold">{project.name}</h2><p className="mt-1 text-sm text-slate-500">{project.address}</p></div><div className="text-right"><ClipboardList className="ml-auto h-7 w-7 text-sky-600" /><p className="mt-2 text-sm font-bold">{text('Progress report', 'Rapport de progrès', 'تقرير التقدم')}</p><p className="text-xs text-slate-500">{appDateKey()}</p></div></div>
        <div className="my-6 grid grid-cols-4 gap-3"><ReportMetric label={text('Progress', 'Progrès', 'التقدم')} value={`${progress}%`} /><ReportMetric label={text('Budget', 'Budget', 'الميزانية')} value={`${adjustedBudget.toLocaleString()} ${currency}`} /><ReportMetric label={text('Spent', 'Dépensé', 'المصروف')} value={`${spent.toLocaleString()} ${currency}`} /><ReportMetric label={text('Open risks', 'Risques ouverts', 'المخاطر المفتوحة')} value={String(scheduleRisks.length)} /></div>
        <ReportTable title={text('Recent expenses', 'Dépenses récentes', 'آخر المصاريف')} rows={project.expenses.slice(-8).reverse().map((item) => [item.date, item.title, `${item.amount.toLocaleString()} ${currency}`])} />
        <ReportTable title={text('Roadmap and blockers', 'Planning et blocages', 'المهام والعوائق')} rows={project.tasks.slice(0, 12).map((item) => [item.title, `${taskProgress(item)}%`, item.blockedReason || item.status])} />
        <ReportTable title={text('Recent site logs', 'Journal récent', 'آخر سجلات الورشة')} rows={(project.constructionSiteLogs || []).slice(-8).reverse().map((item) => [item.date, `${item.workerCount} workers`, item.notes])} />
        <div className="mt-6 grid grid-cols-3 gap-2">{project.photos.slice(-6).map((photo) => photo.url ? <img key={photo.id} src={photo.url} alt={photo.title} className="aspect-video w-full object-cover" /> : null)}</div>
      </div>
    </div>}
  </div>;
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="border border-slate-200 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>;
}

function ReportTable({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="mt-6"><h3 className="mb-2 text-xs font-bold uppercase text-slate-600">{title}</h3>{rows.length ? <table className="w-full border-collapse text-xs"><tbody>{rows.map((row, index) => <tr key={`${row[0]}_${index}`} className="border-t border-slate-200">{row.map((cell, cellIndex) => <td key={cellIndex} className={`py-2 ${cellIndex === row.length - 1 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}</tbody></table> : <p className="text-xs text-slate-400">No records</p>}</section>;
}
