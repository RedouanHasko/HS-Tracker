import { Language, Project, QuoteLineItem, QuoteRecord, QuoteStatus } from '../types';
import { appDateKey } from './dateTime';
import { FormErrorCode } from './forms';

export const QUOTE_NUMBER_PREFIX = 'DEV';
export const QUOTE_DEFAULT_VALIDITY_DAYS = 30;

/** Stored quote statuses. `expired` is computed (a sent quote past its validity date). */
export type QuoteEffectiveStatus = QuoteStatus | 'expired' | 'converted';

export function quoteTotals(
  items: Pick<QuoteLineItem, 'quantity' | 'unitPrice'>[],
  taxRate: number
): { subtotal: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const total = subtotal * (1 + (Number(taxRate) || 0) / 100);
  return { subtotal, total };
}

/** Next human number for the year: DEV-2026-0007. Derived from existing numbers. */
export function nextQuoteNumber(existing: Pick<QuoteRecord, 'number'>[], year: string): string {
  let max = 0;
  for (const quote of existing) {
    const match = new RegExp(`^${QUOTE_NUMBER_PREFIX}-${year}-(\\d+)$`).exec(quote.number || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${QUOTE_NUMBER_PREFIX}-${year}-${String(max + 1).padStart(4, '0')}`;
}

/** A sent quote past its validity date reads as expired (no cron needed). */
export function quoteEffectiveStatus(quote: QuoteRecord, todayKey: string): QuoteEffectiveStatus {
  if (quote.convertedProjectId) return 'converted';
  if (quote.status === 'sent' && quote.validUntil && quote.validUntil < todayKey) return 'expired';
  return quote.status;
}

export function validateQuote(input: {
  clientName: string;
  clientEmail?: string;
  items: Pick<QuoteLineItem, 'description' | 'quantity' | 'unitPrice'>[];
  taxRate: number;
}): FormErrorCode | null {
  if (!input.clientName.trim()) return 'required_client';
  if (input.items.length === 0) return 'required_field';
  for (const item of input.items) {
    if (!item.description.trim()) return 'empty_line_description';
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return 'invalid_amount';
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) return 'negative_cost_amount';
  }
  if (!Number.isFinite(input.taxRate) || input.taxRate < 0 || input.taxRate > 100) {
    return 'invalid_commission';
  }
  return null;
}

export function emptyQuoteLine(): QuoteLineItem {
  return {
    id: `ql_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    description: '',
    quantity: 1,
    unitPrice: 0,
  };
}

/**
 * Project draft created by converting an approved quote. Mirrors the manual
 * project-creation defaults (owner member, starter sections, review task) so a
 * converted project is indistinguishable from a hand-created one.
 */
export function quoteToProjectDraft(
  quote: QuoteRecord,
  owner: { email: string; name: string }
): Project {
  const projectId = `proj_${Date.now()}`;
  const ownerEmail = owner.email.toLowerCase();
  const itemSummary = quote.items
    .map((item) => `• ${item.description} — ${item.quantity} × ${item.unitPrice.toLocaleString()} ${quote.currency}`)
    .join('\n');
  return {
    id: projectId,
    storageVersion: 2,
    name: `${quote.number} — ${quote.clientName}`.slice(0, 120),
    clientName: quote.clientName,
    address: quote.address || 'N/A',
    description: `Converted from quote ${quote.number} (${quote.total.toLocaleString()} ${quote.currency} TTC).\n${itemSummary}`.slice(0, 2000),
    startDate: appDateKey(),
    estimatedEndDate: '',
    budget: Math.round(quote.total * 100) / 100,
    currency: quote.currency || 'DH',
    status: 'planning',
    projectType: 'construction',
    creatorEmail: ownerEmail,
    members: [{ email: ownerEmail, name: owner.name || ownerEmail.split('@')[0], role: 'owner', status: 'accepted' }],
    sections: [],
    expenses: [],
    tasks: [],
    photos: [],
    documents: [],
    sourceQuoteId: quote.id,
    sourceQuoteNumber: quote.number,
  };
}

export function quoteStatusLabel(status: QuoteEffectiveStatus, language: Language): string {
  const map: Record<QuoteEffectiveStatus, Record<Language, string>> = {
    draft: { en: 'Draft', fr: 'Brouillon', ar: 'مسودة' },
    sent: { en: 'Sent', fr: 'Envoyé', ar: 'مرسل' },
    approved: { en: 'Approved', fr: 'Approuvé', ar: 'مقبول' },
    rejected: { en: 'Rejected', fr: 'Refusé', ar: 'مرفوض' },
    expired: { en: 'Expired', fr: 'Expiré', ar: 'منتهي' },
    converted: { en: 'Converted', fr: 'Converti', ar: 'محوَّل' },
  };
  return map[status][language];
}
