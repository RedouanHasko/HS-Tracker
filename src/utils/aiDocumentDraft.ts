import { DocumentKind, DocumentRecipientKind } from '../types';

/** Line item on a printable invoice / receipt / voucher */
export interface AIDocumentLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** Draft for the Invoices & Vouchers tab (local preview — not saved until user prints) */
export interface AIDocumentDraft {
  docType?: DocumentKind;
  docNumber?: string;
  docDate?: string;
  docDueDate?: string;
  taxRate?: number;
  notes?: string;
  paperFormat?: 'A4' | 'A5';
  issuerName?: string;
  issuerEmail?: string;
  issuerPhone?: string;
  issuerAddress?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  recipientKind?: DocumentRecipientKind;
  items?: AIDocumentLineItem[];
  /** Open the browser print/PDF dialog after the user confirms this draft. */
  autoExport?: boolean;
}

const RECIPIENT_KINDS: DocumentRecipientKind[] = ['client', 'worker', 'member', 'supplier', 'other'];

/** Parse AI action params into a document draft */
export function parseDocumentDraft(params: Record<string, unknown>): AIDocumentDraft {
  const itemsRaw = params.items;
  let items: AIDocumentLineItem[] | undefined;
  if (Array.isArray(itemsRaw)) {
    items = itemsRaw
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          description: String(r.description || ''),
          quantity: Math.max(1, Number(r.quantity) || 1),
          unitPrice: Number(r.unitPrice) || 0,
        };
      })
      .filter((i) => i.description && i.unitPrice > 0);
  }

  const kind = params.docType as string | undefined;
  const docType =
    kind === 'invoice' || kind === 'receipt' || kind === 'voucher' ? kind : undefined;

  const rk = params.recipientKind as string | undefined;
  const recipientKind = RECIPIENT_KINDS.includes(rk as DocumentRecipientKind)
    ? (rk as DocumentRecipientKind)
    : undefined;

  return {
    docType,
    docNumber: params.docNumber ? String(params.docNumber) : undefined,
    docDate: params.docDate ? String(params.docDate) : undefined,
    docDueDate: params.docDueDate ? String(params.docDueDate) : undefined,
    taxRate: params.taxRate != null ? Number(params.taxRate) : undefined,
    notes: params.notes ? String(params.notes) : undefined,
    paperFormat: params.paperFormat === 'A5' ? 'A5' : params.paperFormat === 'A4' ? 'A4' : undefined,
    issuerName: params.issuerName ? String(params.issuerName) : undefined,
    issuerEmail: params.issuerEmail ? String(params.issuerEmail) : undefined,
    issuerPhone: params.issuerPhone ? String(params.issuerPhone) : undefined,
    issuerAddress: params.issuerAddress ? String(params.issuerAddress) : undefined,
    recipientName: params.recipientName ? String(params.recipientName) : undefined,
    recipientEmail: params.recipientEmail ? String(params.recipientEmail) : undefined,
    recipientPhone: params.recipientPhone ? String(params.recipientPhone) : undefined,
    recipientAddress: params.recipientAddress ? String(params.recipientAddress) : undefined,
    recipientKind,
    items: items?.length ? items : undefined,
    autoExport: params.autoExport === true || params.exportPdf === true,
  };
}
