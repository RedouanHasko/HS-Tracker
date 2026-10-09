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
import { getAdjustedBudget, projectSpent } from '../utils/projectFinance';
import { formErrorText, parseStrictAmount, validateDateOrder, type FormErrorCode } from '../utils/forms';
import { saveCivilDocumentAsPdf } from '../utils/printCivilDocument';

type Props = {
  project: Project;
  language: Language;
  canManage: boolean;
  /** Why a read-only viewer cannot change these records (shown instead of hidden forms). */
  readOnlyReason: string;
  onSave: (project: Project) => Promise<boolean>;
  onRequestConfirm: (request: ConfirmRequest) => void;
  /** Records approvals/rejections in the project activity feed. */
  onRecordDecision: (details: {
    actionType: 'change_order_approved' | 'change_order_rejected';
    details: string;
    targetTitle: string;
  }) => Promise<void> | void;
};

type Section = 'funding' | 'changes' | 'orders' | 'logs' | 'budget' | 'report';
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

export default function ConstructionOperationsCenter({ project, language, canManage, readOnlyReason, onSave, onRequestConfirm, onRecordDecision }: Props) {
  const [section, setSection] = useState<Section>('funding');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<{ recordId: string; status: 'approved' | 'rejected' } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const text = (en: string, fr: string, ar: string) => language === 'fr' ? fr : language === 'ar' ? ar : en;
  const currency = project.currency;
  const spent = projectSpent(project);
  const adjustedBudget = getAdjustedBudget(project);
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
    try { return await onSave({ ...project, [key]: value }); } finally { setBusy(false); }
  };
  const remove = <K extends keyof Project>(key: K, records: Array<{ id: string }>, recordId: string, title: string) => {
    onRequestConfirm({
      title: text('Delete record?', 'Supprimer cet élément ?', 'حذف السجل؟'),
      message: text(`This will remove “${title}” from this project.`, `“${title}” sera supprimé de ce projet.`, `سيتم حذف “${title}” من هذا المشروع.`),
      confirmLabel: text('Delete', 'Supprimer', 'حذف'),
      variant: 'danger',
      onConfirm: () => { void saveArray(key, records.filter((item) => item.id !== recordId) as Project[K]); },
    });
  };
  const updateRecordStatus = async (recordId: string, status: string, decisionNotes = '') => {
    if (section === 'changes') {
      const order = (project.constructionChangeOrders || []).find((item) => item.id === recordId);
      const next = (project.constructionChangeOrders || []).map((item) =>
        item.id === recordId
          ? {
              ...item,
              status: status as ConstructionChangeOrder['status'],
              ...(status === 'approved' || status === 'rejected'
                ? { decidedAt: appDateKey(), decisionNotes }
                : {}),
            }
          : item
      );
      const saved = await saveArray('constructionChangeOrders', next);
      if (!saved) return;
      if (status === 'approved' || status === 'rejected') {
        const delta = Number(order?.amountDelta || 0);
        await Promise.resolve(onRecordDecision({
          actionType: status === 'approved' ? 'change_order_approved' : 'change_order_rejected',
          details:
            status === 'approved'
              ? text(
                  `Approved “${order?.title || 'change order'}” — budget ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} ${currency} → ${getAdjustedBudget({ ...project, constructionChangeOrders: next }).toLocaleString()} ${currency}.${decisionNotes ? ` Note: ${decisionNotes}` : ''}`,
                  `Avenant « ${order?.title || ''} » approuvé — budget ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} ${currency} → ${getAdjustedBudget({ ...project, constructionChangeOrders: next }).toLocaleString()} ${currency}.${decisionNotes ? ` Note : ${decisionNotes}` : ''}`,
                  `الموافقة على «${order?.title || ''}» — الميزانية ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} ${currency}.${decisionNotes ? ` ملاحظة: ${decisionNotes}` : ''}`
                )
              : text(
                  `Rejected “${order?.title || 'change order'}” — budget unchanged at ${getAdjustedBudget(project).toLocaleString()} ${currency}.${decisionNotes ? ` Note: ${decisionNotes}` : ''}`,
                  `Avenant « ${order?.title || ''} » refusé — budget inchangé à ${getAdjustedBudget(project).toLocaleString()} ${currency}.${decisionNotes ? ` Note : ${decisionNotes}` : ''}`,
                  `رفض «${order?.title || ''}» — لم تتغير الميزانية.${decisionNotes ? ` ملاحظة: ${decisionNotes}` : ''}`
                ),
          targetTitle: order?.title || 'Change order',
        }));
      }
    } else if (section === 'orders') {
      await saveArray('constructionPurchaseOrders', (project.constructionPurchaseOrders || []).map((item) => item.id === recordId ? { ...item, status: status as ConstructionPurchaseOrder['status'] } : item));
    } else if (section === 'budget') {
      await saveArray('constructionBudgetCommitments', (project.constructionBudgetCommitments || []).map((item) => item.id === recordId ? { ...item, status: status as ConstructionBudgetCommitment['status'] } : item));
    }
  };

  /** Approvals move the budget, so never apply them from a bare dropdown change. */
  const requestRecordStatusChange = (recordId: string, status: string, title: string) => {
    if (section !== 'changes' || (status !== 'approved' && status !== 'rejected')) {
      void updateRecordStatus(recordId, status);
      return;
    }
    const order = (project.constructionChangeOrders || []).find((item) => item.id === recordId);
    const delta = Number(order?.amountDelta || 0);
    const before = getAdjustedBudget(project);
    const after = status === 'approved' ? before + delta : before;
    setDecisionNotes('');
    onRequestConfirm({
      title:
        status === 'approved'
          ? text('Approve this change order?', 'Approuver cet avenant ?', 'الموافقة على أمر التغيير؟')
          : text('Reject this change order?', 'Refuser cet avenant ?', 'رفض أمر التغيير؟'),
      message:
        status === 'approved'
          ? text(
              `“${title}” changes the budget by ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} ${currency}: ${before.toLocaleString()} → ${after.toLocaleString()} ${currency}. This takes effect immediately and is logged in the activity feed.`,
              `« ${title} » modifie le budget de ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} ${currency} : ${before.toLocaleString()} → ${after.toLocaleString()} ${currency}. Effet immédiat et inscrit dans le journal.`,
              `يغيّر «${title}» الميزانية بمقدار ${delta >= 0 ? '+' : ''}${delta.toLocaleString()} ${currency}: ${before.toLocaleString()} → ${after.toLocaleString()} ${currency}. يسري فوراً ويُسجَّل في النشاط.`
            )
          : text(
              `“${title}” will be rejected. The budget stays at ${before.toLocaleString()} ${currency}.`,
              `« ${title} » sera refusé. Le budget reste à ${before.toLocaleString()} ${currency}.`,
              `سيتم رفض «${title}». تبقى الميزانية ${before.toLocaleString()} ${currency}.`
            ),
      confirmLabel: status === 'approved' ? text('Approve', 'Approuver', 'موافقة') : text('Reject', 'Refuser', 'رفض'),
      variant: status === 'approved' ? 'default' : 'danger',
      onConfirm: () => {
        setDecisionDraft({ recordId, status });
      },
    });
  };

  const confirmDecision = async () => {
    if (!decisionDraft) return;
    const { recordId, status } = decisionDraft;
    setDecisionDraft(null);
    await updateRecordStatus(recordId, status, decisionNotes.trim());
  };
  const fail = (code: FormErrorCode) => {
    setFormError(formErrorText(code, language));
    return false;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const raw = (name: string) => String(data.get(name) ?? '').trim();
    setFormError(null);
    let saved = false;

    if (section === 'funding') {
      const amount = parseStrictAmount(data.get('amount'));
      if (!Number.isFinite(amount) || amount <= 0) return void fail('invalid_amount');
      const item: ConstructionFundingEntry = { id: id('fund'), date: String(data.get('date')), amount, source: raw('source'), method: String(data.get('method')), reference: String(data.get('reference')), notes: String(data.get('notes')) };
      saved = await saveArray('constructionFunding', [...(project.constructionFunding || []), item]);
    } else if (section === 'changes') {
      // amountDelta / daysDelta may be negative (budget or schedule cuts); blank means
      // "no impact" (0), but garbage input is rejected instead of coerced.
      const amountText = raw('amountDelta');
      const daysText = raw('daysDelta');
      const amountDelta = amountText === '' ? 0 : parseStrictAmount(amountText);
      const daysDelta = daysText === '' ? 0 : parseStrictAmount(daysText);
      if (!Number.isFinite(amountDelta) || !Number.isFinite(daysDelta)) return void fail('invalid_amount');
      if (!raw('title') || !raw('description')) return void fail('required_field');
      const item: ConstructionChangeOrder = { id: id('change'), title: raw('title'), description: raw('description'), amountDelta, daysDelta, status: 'draft', requestedAt: String(data.get('date')) };
      saved = await saveArray('constructionChangeOrders', [...(project.constructionChangeOrders || []), item]);
    } else if (section === 'orders') {
      const amount = parseStrictAmount(data.get('amount'));
      if (!Number.isFinite(amount) || amount <= 0) return void fail('invalid_amount');
      if (!raw('number') || !raw('supplier') || !raw('description')) return void fail('required_field');
      const dateError = validateDateOrder(String(data.get('date')), String(data.get('expectedDate')));
      if (dateError) return void fail(dateError);
      const item: ConstructionPurchaseOrder = { id: id('po'), number: raw('number'), supplier: raw('supplier'), description: raw('description'), amount, issueDate: String(data.get('date')), expectedDate: String(data.get('expectedDate')), status: 'draft' };
      saved = await saveArray('constructionPurchaseOrders', [...(project.constructionPurchaseOrders || []), item]);
    } else if (section === 'logs') {
      // Worker counts below zero are rejected outright instead of being coerced to 0.
      // A blank field keeps the historical default of 0 (office / off-site day).
      const workerText = raw('workerCount');
      const workerCount = workerText === '' ? 0 : parseStrictAmount(workerText);
      if (!Number.isFinite(workerCount) || workerCount < 0) return void fail('invalid_amount');
      if (!raw('notes')) return void fail('required_field');
      const item: ConstructionSiteLog = { id: id('log'), date: String(data.get('date')), weather: String(data.get('weather')), workerCount: Math.floor(workerCount), notes: raw('notes'), photoIds: data.getAll('photoIds').map(String), createdBy: project.creatorEmail };
      saved = await saveArray('constructionSiteLogs', [...(project.constructionSiteLogs || []), item]);
    } else if (section === 'budget') {
      // Blank commitment/forecast fields default to 0; negatives and garbage are rejected.
      const committedText = raw('committedAmount');
      const forecastText = raw('forecastAmount');
      const committedAmount = committedText === '' ? 0 : parseStrictAmount(committedText);
      const forecastAmount = forecastText === '' ? 0 : parseStrictAmount(forecastText);
      if ((!Number.isFinite(committedAmount) || committedAmount < 0) || (!Number.isFinite(forecastAmount) || forecastAmount < 0)) {
        return void fail('negative_cost_amount');
      }
      if (!raw('label')) return void fail('required_field');
      const item: ConstructionBudgetCommitment = { id: id('commit'), category: String(data.get('category')) as ExpenseCategory, label: raw('label'), committedAmount, forecastAmount, supplier: String(data.get('supplier')), status: 'planned' };
      saved = await saveArray('constructionBudgetCommitments', [...(project.constructionBudgetCommitments || []), item]);
    }
    // Reset only after a confirmed save — a failed save keeps every typed value.
    if (saved) {
      form.reset();
    } else {
      setFormError(
        language === 'fr' ? 'Enregistrement impossible. Vos valeurs sont conservées — réessayez.'
          : language === 'ar' ? 'تعذر الحفظ. تم الاحتفاظ بالقيم — حاول مرة أخرى.'
          : 'Could not save. Your values are kept — try again.'
      );
    }
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
      {(Object.keys(labels) as Section[]).map((item) => <button key={item} type="button" onClick={() => { setSection(item); setFormError(null); }} className={`shrink-0 border-b-2 px-2 py-3 text-xs font-bold ${section === item ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-500'}`}>{labels[item][language === 'fr' ? 1 : language === 'ar' ? 2 : 0]}</button>)}
    </div>

    {!canManage && section !== 'report' && (
      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
        <span className="flex-1">{readOnlyReason}</span>
      </p>
    )}

    {section !== 'report' && canManage && <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
      {formError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 sm:col-span-2 lg:col-span-4">
          {formError}
        </p>
      )}
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
        return <tr key={record.id} className="bg-white dark:bg-slate-900"><td className="p-3 font-bold text-slate-900 dark:text-white">{title}{typeof value.decisionNotes === 'string' && value.decisionNotes && <span className="mt-1 block text-[10px] font-normal italic text-slate-500">{text('Decision:', 'Décision :', 'القرار:')} {value.decisionNotes}{value.decidedAt ? ` — ${String(value.decidedAt)}` : ''}</span>}</td><td className="p-3 text-slate-500">{String(value.date || value.requestedAt || value.issueDate || value.category || '')}</td><td className="p-3 text-slate-500">{String(value.description || value.notes || value.supplier || value.weather || '')}</td><td className="p-3 text-right font-mono">{Number(value.amount || value.amountDelta || value.committedAmount || 0).toLocaleString()} {currency}</td><td className="p-3 text-right">{statuses.length > 0 && <select disabled={!canManage || busy} value={String(value.status)} onChange={(event) => requestRecordStatusChange(record.id, event.target.value, title)} className="mr-2 h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950">{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>}{canManage && <button type="button" aria-label={text('Delete', 'Supprimer', 'حذف')} onClick={() => remove((section === 'funding' ? 'constructionFunding' : section === 'changes' ? 'constructionChangeOrders' : section === 'orders' ? 'constructionPurchaseOrders' : section === 'logs' ? 'constructionSiteLogs' : 'constructionBudgetCommitments') as keyof Project, records, record.id, title)} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>}</td></tr>;
      })}</tbody></table>}
    </div>}

    {section === 'report' && <div className="space-y-3">
      <div className="flex justify-end" data-print-hide><button type="button" onClick={() => saveCivilDocumentAsPdf(`${project.name}_progress_${appDateKey()}`, 'report')} className="flex h-10 items-center gap-2 rounded-md bg-sky-600 px-4 text-xs font-bold text-white"><Download className="h-4 w-4" />{text('Save report as PDF', 'Enregistrer en PDF', 'حفظ التقرير PDF')}</button></div>
        <div id="printable-civil-bill" className="mx-auto w-full max-w-[210mm] bg-white p-4 text-slate-900 shadow-sm sm:p-8 print:min-h-[297mm] print:p-8 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-300 pb-6"><div><p className="text-xs font-bold uppercase text-sky-600">HS Tracker</p><h2 className="mt-2 text-2xl font-bold">{project.name}</h2><p className="mt-1 text-sm text-slate-500">{project.address}</p></div><div className="text-right"><ClipboardList className="ml-auto h-7 w-7 text-sky-600" /><p className="mt-2 text-sm font-bold">{text('Progress report', 'Rapport de progrès', 'تقرير التقدم')}</p><p className="text-xs text-slate-500">{appDateKey()}</p></div></div>
        <div className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4"><ReportMetric label={text('Progress', 'Progrès', 'التقدم')} value={`${progress}%`} /><ReportMetric label={text('Budget', 'Budget', 'الميزانية')} value={`${adjustedBudget.toLocaleString()} ${currency}`} /><ReportMetric label={text('Spent', 'Dépensé', 'المصروف')} value={`${spent.toLocaleString()} ${currency}`} /><ReportMetric label={text('Open risks', 'Risques ouverts', 'المخاطر المفتوحة')} value={String(scheduleRisks.length)} /></div>
        <ReportTable title={text('Recent expenses', 'Dépenses récentes', 'آخر المصاريف')} rows={project.expenses.slice(-8).reverse().map((item) => [item.date, item.title, `${item.amount.toLocaleString()} ${currency}`])} />
        <ReportTable title={text('Roadmap and blockers', 'Planning et blocages', 'المهام والعوائق')} rows={project.tasks.slice(0, 12).map((item) => [item.title, `${taskProgress(item)}%`, item.blockedReason || item.status])} />
        <ReportTable title={text('Recent site logs', 'Journal récent', 'آخر سجلات الورشة')} rows={(project.constructionSiteLogs || []).slice(-8).reverse().map((item) => [item.date, `${item.workerCount} workers`, item.notes])} />
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3">{project.photos.slice(-6).map((photo) => photo.url ? <img key={photo.id} src={photo.url} alt={photo.title} className="aspect-video w-full object-cover" /> : null)}</div>
      </div>
    </div>}
{decisionDraft && (
      <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {decisionDraft.status === 'approved'
              ? text('Approval note (optional)', 'Note d\'approbation (facultative)', 'ملاحظة الموافقة (اختياري)')
              : text('Rejection note (optional)', 'Note de refus (facultative)', 'ملاحظة الرفض (اختياري)')}
          </h3>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {text(
              'Saved with the change order and shown to the team so nobody sees the status change without an explanation.',
              'Enregistrée avec l\'avenant et visible par l\'équipe.',
              'تُحفظ مع أمر التغيير وتظهر للفريق.'
            )}
          </p>
          <textarea
            autoFocus
            rows={3}
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            placeholder={text('e.g. Client approved by email on 12 May', 'ex. Approuvé par le client le 12 mai', 'مثال: موافقة العميل بتاريخ 12 مايو')}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDecisionDraft(null)}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              {text('Cancel', 'Annuler', 'إلغاء')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmDecision()}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
                decisionDraft.status === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {decisionDraft.status === 'approved'
                ? text('Confirm approval', 'Confirmer l\'approbation', 'تأكيد الموافقة')
                : text('Confirm rejection', 'Confirmer le refus', 'تأكيد الرفض')}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="border border-slate-200 p-3"><p className="text-[9px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>;
}

function ReportTable({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="mt-6"><h3 className="mb-2 text-xs font-bold uppercase text-slate-600">{title}</h3>{rows.length ? <table className="w-full border-collapse text-xs"><tbody>{rows.map((row, index) => <tr key={`${row[0]}_${index}`} className="border-t border-slate-200">{row.map((cell, cellIndex) => <td key={cellIndex} className={`py-2 ${cellIndex === row.length - 1 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}</tbody></table> : <p className="text-xs text-slate-400">No records</p>}</section>;
}
