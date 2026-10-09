import { Expense, Project, ProjectMember } from '../types';

/**
 * Single source of truth for construction money math.
 * Invoice price = raw amount + commission/markup — the same figure shown in
 * the expense ledger and imported onto invoices/vouchers.
 */
export function expenseInvoicePrice(expense: Expense): number {
  const rate = Math.max(0, Number(expense.commissionPercent) || 0);
  return expense.amount * (1 + rate / 100);
}

/** Total spent on a project, commission-inclusive. */
export function projectSpent(project: Pick<Project, 'expenses'>): number {
  return (project.expenses || []).reduce((sum, exp) => sum + expenseInvoicePrice(exp), 0);
}

/** Sum of approved change-order deltas (avenants). */
export function approvedChangeDelta(project: Pick<Project, 'constructionChangeOrders'>): number {
  return (project.constructionChangeOrders || [])
    .filter((item) => item.status === 'approved')
    .reduce((sum, item) => sum + (Number(item.amountDelta) || 0), 0);
}

/** Budget after approved change orders — what overview/KPIs must compare spend against. */
export function getAdjustedBudget(project: Pick<Project, 'budget' | 'constructionChangeOrders'>): number {
  return (Number(project.budget) || 0) + approvedChangeDelta(project);
}

/** Members that count toward shares and contribution bars (excludes pending/declined invites). */
export function acceptedMembers(project: Pick<Project, 'members'>): ProjectMember[] {
  return (project.members || []).filter((m) => !m.status || m.status === 'accepted');
}

/**
 * Guard against CSV formula injection when expense titles/suppliers are
 * opened in Excel (`=SUM(`, `+`, `-`, `@` prefixes). Prefix with a single
 * quote — Excel renders the value as-is without evaluating it.
 */
export function sanitizeCsvCell(value: string | number): string {
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
