import { Project } from '../types';
import type { AIProposedAction } from './aiActions';

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function resolveConstructionProject(
  message: string,
  projects: Project[],
  activeProject: Project | null
): Project | null {
  const msg = normalize(message);
  const sorted = [...projects].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const candidates = [p.name, p.address, p.clientName].filter(Boolean).map((v) => normalize(String(v)));
    // match on any significant token (>=4 chars) to handle "msallah" vs "Dar Msallah"
    for (const c of candidates) {
      const tokens = c.split(' ').filter((t) => t.length >= 4);
      if (tokens.some((t) => msg.includes(t))) return p;
      if (c.length >= 4 && msg.includes(c)) return p;
    }
  }
  return activeProject;
}

function extractQuotedOrAfterAs(message: string): string {
  // "as :Title", 'as "Title"', "called X", ": Title" at end
  const quoted = /["“”'']([^"“”'']{2,80})["“”'']/.exec(message);
  if (quoted) return quoted[1].trim();
  const asMatch = /\bas\s*[:\-–—]?\s*(.+?)\s*$/i.exec(message.trim());
  if (asMatch && asMatch[1].length >= 2 && asMatch[1].length <= 100) {
    // avoid capturing whole sentence when no clear title
    const tail = asMatch[1].trim().replace(/^(to|to add|to create)\s+/i, '');
    if (tail.split(' ').length <= 12) return tail;
  }
  const called = /\b(?:called|named|nomm[ée]e?|smito|smiyto|smitou)\s+(.+?)\s*$/i.exec(message.trim());
  if (called && called[1].length >= 2 && called[1].length <= 100) return called[1].trim();
  return '';
}

/**
 * Deterministic fallback when the model answers conversationally
 * ("Shall I proceed...") but omits the structured action.
 * Covers the most common team-private commands: add task / mark done / add expense.
 */
export function inferConstructionAction(
  userMessage: string,
  projects: Project[],
  activeProject: Project | null
): AIProposedAction | null {
  const msg = normalize(userMessage);

  const wantsTaskAdd =
    /\btask\b/i.test(userMessage) &&
    /\b(add|create|new|ajout|ajouter|cr[eé]e|zid|dir)\b/i.test(msg);
  const wantsDone =
    /\btask\b/i.test(userMessage) &&
    /\b(done|completed|complete|finish|termin[eé]e?|fini|mark|close)\b/i.test(msg);
  const wantsExpense =
    /\bexpense\b|\bd[eé]pense\b|\bcharge\b|\bmasrouf\b|\bmصروف\b/i.test(msg) &&
    /\b(add|create|log|record|ajout|zid|dir)\b/i.test(msg);

  const target = resolveConstructionProject(userMessage, projects, activeProject);
  if (!target) return null;

  if (wantsTaskAdd && !wantsDone) {
    const title = extractQuotedOrAfterAs(userMessage);
    if (!title) return null;
    return {
      id: `act_local_task_${Date.now()}`,
      type: 'create_task',
      summary: `Create task "${title}" in ${target.name}`,
      params: { projectId: target.id, title },
    };
  }

  if (wantsDone) {
    const title = extractQuotedOrAfterAs(userMessage);
    if (!title && !/\b(that task|this task|cette t[aâ]che)\b/i.test(msg)) return null;
    return {
      id: `act_local_done_${Date.now()}`,
      type: 'update_task_status',
      summary: `Mark task "${title || 'that task'}" done in ${target.name}`,
      params: { projectId: target.id, ...(title ? { taskTitle: title } : {}), status: 'completed' },
    };
  }

  if (wantsExpense) {
    const amountMatch = /(\d+(?:[.,]\d+)?)\s*(dh|mad|eur|usd|€|\$)?/i.exec(userMessage);
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 0;
    if (!amount) return null;
    const title = extractQuotedOrAfterAs(userMessage) || 'Expense';
    return {
      id: `act_local_exp_${Date.now()}`,
      type: 'add_expense',
      summary: `Add expense "${title}" ${amount} in ${target.name}`,
      params: { projectId: target.id, title, amount },
    };
  }

  return null;
}
