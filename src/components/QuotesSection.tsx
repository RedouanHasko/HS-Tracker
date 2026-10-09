import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  FileText,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Language, QuoteLineItem, QuoteRecord, QuoteStatus } from '../types';
import { useAuth } from '../lib/AuthContext';
import {
  allocateQuoteNumber,
  deleteQuoteFromDB,
  saveQuoteToDB,
  subscribeToQuotes,
} from '../lib/db';
import { appDateKey, appDateKeyAfterDays } from '../utils/dateTime';
import { formErrorText, isValidEmail, type FormErrorCode } from '../utils/forms';
import {
  emptyQuoteLine,
  QUOTE_DEFAULT_VALIDITY_DAYS,
  QUOTE_NUMBER_PREFIX,
  quoteEffectiveStatus,
  quoteStatusLabel,
  quoteTotals,
  validateQuote,
  type QuoteEffectiveStatus,
} from '../utils/quotes';

interface QuotesSectionProps {
  language: Language;
  /** Convert an approved quote into a project; resolves when the project exists. */
  onConvertToProject: (quote: QuoteRecord) => Promise<void>;
}

const STATUS_FILTERS: ('all' | QuoteEffectiveStatus)[] = [
  'all',
  'draft',
  'sent',
  'approved',
  'expired',
  'rejected',
  'converted',
];

function statusBadgeClass(status: QuoteEffectiveStatus): string {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'converted':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';
    case 'sent':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'expired':
    case 'rejected':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

interface QuoteDraft {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  currency: string;
  taxRate: number;
  validUntil: string;
  notes: string;
  items: QuoteLineItem[];
}

function draftFromQuote(quote: QuoteRecord): QuoteDraft {
  return {
    clientName: quote.clientName,
    clientEmail: quote.clientEmail || '',
    clientPhone: quote.clientPhone || '',
    address: quote.address || '',
    currency: quote.currency,
    taxRate: quote.taxRate,
    validUntil: quote.validUntil || '',
    notes: quote.notes || '',
    items: quote.items.map((item) => ({ ...item })),
  };
}

function blankDraft(currency: string): QuoteDraft {
  return {
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    address: '',
    currency,
    taxRate: 20,
    validUntil: appDateKeyAfterDays(QUOTE_DEFAULT_VALIDITY_DAYS),
    notes: '',
    items: [emptyQuoteLine()],
  };
}

/**
 * Standalone sales quotes (devis): draft → sent → approved/rejected, then one-click
 * conversion of an approved quote into a construction project + budget.
 */
export default function QuotesSection({ language, onConvertToProject }: QuotesSectionProps) {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuoteDraft>(() => blankDraft('DH'));
  const [formError, setFormError] = useState<FormErrorCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setQuotes([]);
      return;
    }
    return subscribeToQuotes(user.uid, (list) => {
      setQuotes([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
  }, [user?.uid]);

  const todayKey = appDateKey();
  const withStatus = useMemo(
    () => quotes.map((quote) => ({ quote, status: quoteEffectiveStatus(quote, todayKey) })),
    [quotes, todayKey]
  );
  const counts = useMemo(() => {
    const map = new Map<QuoteEffectiveStatus, number>();
    for (const { status } of withStatus) map.set(status, (map.get(status) || 0) + 1);
    return map;
  }, [withStatus]);
  const visible = withStatus.filter(({ status }) => statusFilter === 'all' || status === statusFilter);
  const openPipelineCount = (counts.get('draft') || 0) + (counts.get('sent') || 0);

  const openNew = () => {
    setEditingId(null);
    setDraft(blankDraft('DH'));
    setFormError(null);
    setConfirmDeleteId(null);
    setShowBuilder(true);
  };

  const openEdit = (quote: QuoteRecord) => {
    setEditingId(quote.id);
    setDraft(draftFromQuote(quote));
    setFormError(null);
    setConfirmDeleteId(null);
    setShowBuilder(true);
  };

  const patchDraft = (changes: Partial<QuoteDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setFormError(null);
  };

  const patchLine = (id: string, changes: Partial<QuoteLineItem>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
    setFormError(null);
  };

  const { subtotal, total } = quoteTotals(draft.items, draft.taxRate);

  const handleSave = async () => {
    if (!user?.uid || saving) return;
    const error = validateQuote({
      clientName: draft.clientName,
      items: draft.items,
      taxRate: draft.taxRate,
    });
    if (error) {
      setFormError(error);
      return;
    }
    if (draft.clientEmail.trim() && !isValidEmail(draft.clientEmail)) {
      setFormError('invalid_email');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingId) {
        const existing = quotes.find((q) => q.id === editingId);
        if (!existing) return;
        const { subtotal: sub, total: tot } = quoteTotals(draft.items, draft.taxRate);
        await saveQuoteToDB(user.uid, {
          ...existing,
          clientName: draft.clientName.trim(),
          clientEmail: draft.clientEmail.trim() || undefined,
          clientPhone: draft.clientPhone.trim() || undefined,
          address: draft.address.trim() || undefined,
          currency: draft.currency,
          taxRate: draft.taxRate,
          validUntil: draft.validUntil || undefined,
          notes: draft.notes.trim() || undefined,
          items: draft.items.map((item) => ({
            ...item,
            description: item.description.trim(),
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unitPrice) || 0,
          })),
          subtotal: sub,
          total: Math.round(tot * 100) / 100,
        });
      } else {
        const year = todayKey.slice(0, 4);
        const number = await allocateQuoteNumber(user.uid, year, QUOTE_NUMBER_PREFIX);
        const { subtotal: sub, total: tot } = quoteTotals(draft.items, draft.taxRate);
        await saveQuoteToDB(user.uid, {
          id: `quote_${Date.now()}`,
          number,
          clientName: draft.clientName.trim(),
          clientEmail: draft.clientEmail.trim() || undefined,
          clientPhone: draft.clientPhone.trim() || undefined,
          address: draft.address.trim() || undefined,
          currency: draft.currency,
          taxRate: draft.taxRate,
          validUntil: draft.validUntil || undefined,
          notes: draft.notes.trim() || undefined,
          items: draft.items.map((item) => ({
            ...item,
            description: item.description.trim(),
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unitPrice) || 0,
          })),
          subtotal: sub,
          total: Math.round(tot * 100) / 100,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          createdBy: (user.email || '').toLowerCase(),
        });
      }
      setShowBuilder(false);
    } catch (err) {
      console.error('Save quote failed:', err);
      setFormError('required_field');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (quote: QuoteRecord, status: QuoteStatus) => {
    if (!user?.uid) return;
    try {
      await saveQuoteToDB(user.uid, { ...quote, status });
    } catch (err) {
      console.error('Quote status change failed:', err);
    }
  };

  const handleDelete = async (quote: QuoteRecord) => {
    if (!user?.uid) return;
    try {
      await deleteQuoteFromDB(user.uid, quote.id);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Delete quote failed:', err);
    }
  };

  const handleDuplicate = async (quote: QuoteRecord) => {
    if (!user?.uid) return;
    try {
      const year = todayKey.slice(0, 4);
      const number = await allocateQuoteNumber(user.uid, year, QUOTE_NUMBER_PREFIX);
      const now = new Date().toISOString();
      await saveQuoteToDB(user.uid, {
        ...quote,
        id: `quote_${Date.now()}`,
        number,
        status: 'draft',
        convertedProjectId: undefined,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      console.error('Duplicate quote failed:', err);
    }
  };

  const handleConvert = async (quote: QuoteRecord) => {
    if (convertingId) return;
    setConvertingId(quote.id);
    try {
      await onConvertToProject(quote);
    } finally {
      setConvertingId(null);
    }
  };

  const t = (en: string, fr: string, ar: string) =>
    language === 'fr' ? fr : language === 'ar' ? ar : en;

  // No quotes yet: stay out of the way with a single slim row (no filter chips, no empty panel).
  if (quotes.length === 0 && !showBuilder) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <FileText className="h-4 w-4 text-violet-500" />
          {t('No quotes yet — create a devis when a prospect asks for a price.', 'Aucun devis — créez-en un quand un prospect demande un prix.', 'لا توجد عروض بعد — أنشئ عرضاً عندما يطلب عميل سعراً.')}
        </p>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <Plus className="h-4 w-4" />
          {t('New Quote', 'Nouveau devis', 'عرض جديد')}
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex items-center gap-2 text-left"
        >
          <FileText className="h-4 w-4 text-violet-500" />
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {t('Quotes & Estimates', 'Devis', 'عروض الأسعار')}
          </h3>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {openPipelineCount > 0 ? `${openPipelineCount} ${t('open', 'ouverts', 'مفتوحة')}` : quotes.length}
          </span>
        </button>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <Plus className="h-4 w-4" />
          {t('New Quote', 'Nouveau devis', 'عرض جديد')}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((filter) => {
              const count = filter === 'all' ? quotes.length : counts.get(filter) || 0;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    statusFilter === filter
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                  }`}
                >
                  {filter === 'all' ? t('All', 'Tous', 'الكل') : quoteStatusLabel(filter, language)}
                  {count > 0 && <span className="ml-1 font-mono opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              {quotes.length === 0
                ? t(
                    'No quotes yet. Create your first devis to start the sales pipeline.',
                    'Aucun devis. Créez votre premier devis pour démarrer.',
                    'لا توجد عروض بعد. أنشئ أول عرض لبدء مسار المبيعات.'
                  )
                : t('Nothing in this state.', 'Rien dans cet état.', 'لا شيء في هذه الحالة.')}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map(({ quote, status }) => (
                <li key={quote.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {quote.number}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusBadgeClass(status)}`}>
                        {quoteStatusLabel(status, language)}
                      </span>
                      {quote.validUntil && (status === 'sent' || status === 'expired') && (
                        <span className={`font-mono text-[10px] ${status === 'expired' ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                          {t('valid until', 'valable jusqu’au', 'صالح حتى')} {quote.validUntil}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {quote.clientName}
                      <span className="ml-1.5 font-normal text-slate-400">
                        {quote.items.length} {t('lines', 'lignes', 'بنود')}
                      </span>
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {quote.total.toLocaleString()} <span className="text-[10px] font-semibold text-slate-400">{quote.currency}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => setStatus(quote, 'sent')}
                        title={t('Mark as sent', 'Marquer envoyé', 'وضع كمرسل')}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Send className="h-3 w-3" /> {t('Sent', 'Envoyé', 'إرسال')}
                      </button>
                    )}
                    {status === 'sent' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setStatus(quote, 'approved')}
                          title={t('Approve', 'Approuver', 'قبول')}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                        >
                          <Check className="h-3 w-3" /> {t('Approve', 'Approuver', 'قبول')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(quote, 'rejected')}
                          title={t('Reject', 'Refuser', 'رفض')}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          {t('Reject', 'Refuser', 'رفض')}
                        </button>
                      </>
                    )}
                    {status === 'approved' && (
                      <button
                        type="button"
                        disabled={convertingId === quote.id}
                        onClick={() => handleConvert(quote)}
                        title={t('Create a project from this quote', 'Créer un chantier depuis ce devis', 'إنشاء مشروع من هذا العرض')}
                        className="flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        <ArrowRight className="h-3 w-3" />
                        {convertingId === quote.id ? '…' : t('To project', 'En chantier', 'إلى مشروع')}
                      </button>
                    )}
                    {(status === 'rejected' || status === 'expired' || status === 'draft') && (
                      <button
                        type="button"
                        onClick={() => handleDuplicate(quote)}
                        title={t('Duplicate as new draft', 'Dupliquer en brouillon', 'تكرار كمسودة')}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(quote)}
                      title={t('Edit', 'Modifier', 'تعديل')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {confirmDeleteId === quote.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(quote)}
                          className="rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-700"
                        >
                          {t('Delete?', 'Supprimer ?', 'حذف؟')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {t('Keep', 'Garder', 'إبقاء')}
                        </button>
                      </span>
                    ) : (
                      status !== 'converted' && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(quote.id)}
                          title={t('Delete', 'Supprimer', 'حذف')}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {showBuilder && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-4 sm:items-center sm:px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingId ? t('Edit quote', 'Modifier le devis', 'تعديل العرض') : t('New quote', 'Nouveau devis', 'عرض جديد')}
              </h3>
              <button
                type="button"
                onClick={() => setShowBuilder(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {formErrorText(formError, language)}
              </p>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Client name *', 'Client *', 'اسم العميل *')}
                </label>
                <input
                  type="text"
                  value={draft.clientName}
                  onChange={(e) => patchDraft({ clientName: e.target.value })}
                  placeholder={t('e.g. Villa Haddad — Karim', 'ex. Villa Haddad — Karim', 'مثال: فيلا حداد — كريم')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Client email', 'Email client', 'بريد العميل')}
                </label>
                <input
                  type="email"
                  value={draft.clientEmail}
                  onChange={(e) => patchDraft({ clientEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Client phone', 'Tél client', 'هاتف العميل')}
                </label>
                <input
                  type="tel"
                  value={draft.clientPhone}
                  onChange={(e) => patchDraft({ clientPhone: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Site address', 'Adresse du chantier', 'عنوان الورش')}
                </label>
                <input
                  type="text"
                  value={draft.address}
                  onChange={(e) => patchDraft({ address: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Lines', 'Lignes', 'البنود')}
                </p>
                <button
                  type="button"
                  onClick={() => patchDraft({ items: [...draft.items, emptyQuoteLine()] })}
                  className="flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('Add line', 'Ajouter', 'إضافة بند')}
                </button>
              </div>
              <div className="space-y-2">
                {draft.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 items-center gap-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => patchLine(item.id, { description: e.target.value })}
                      placeholder={t('Description', 'Description', 'الوصف')}
                      className="col-span-6 min-w-0 rounded-lg border border-slate-200 px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity || ''}
                      onChange={(e) => patchLine(item.id, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder={t('Qty', 'Qté', 'الكمية')}
                      className="col-span-2 min-w-0 rounded-lg border border-slate-200 px-2 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.unitPrice || ''}
                      onChange={(e) => patchLine(item.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                      placeholder={t('Price', 'Prix', 'السعر')}
                      className="col-span-3 min-w-0 rounded-lg border border-slate-200 px-2 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => patchDraft({ items: draft.items.filter((line) => line.id !== item.id) })}
                      disabled={draft.items.length <= 1}
                      aria-label={t('Remove line', 'Retirer', 'حذف البند')}
                      className="col-span-1 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Currency', 'Devise', 'العملة')}
                </label>
                <select
                  value={draft.currency}
                  onChange={(e) => patchDraft({ currency: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {['DH', 'USD', 'EUR', 'GBP'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Tax %', 'TVA %', 'الضريبة %')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={draft.taxRate}
                  onChange={(e) => patchDraft({ taxRate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t('Valid until', 'Valable jusqu’au', 'صالح حتى')}
                </label>
                <input
                  type="date"
                  value={draft.validUntil}
                  onChange={(e) => patchDraft({ validUntil: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('Notes', 'Notes', 'ملاحظات')}
              </label>
              <textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => patchDraft({ notes: e.target.value })}
                placeholder={t('Payment terms, exclusions…', 'Conditions, exclusions…', 'شروط الدفع، الاستثناءات…')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950/60">
              <div className="font-mono text-[11px] text-slate-500">
                {t('Subtotal', 'Sous-total', 'المجموع')} {subtotal.toLocaleString()} {draft.currency}
              </div>
              <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                {t('Total', 'Total', 'المجموع')} {total.toLocaleString()} {draft.currency}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowBuilder(false)}
                disabled={saving}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
              >
                {t('Cancel', 'Annuler', 'إلغاء')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950"
              >
                {saving ? '…' : editingId ? t('Save changes', 'Enregistrer', 'حفظ') : t('Create quote', 'Créer le devis', 'إنشاء العرض')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
