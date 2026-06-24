import {
  DocumentParty,
  DocumentPresetsMap,
  DocumentKind,
  DocumentPartyRole,
} from '../types';

const partiesKey = (userId: string) => `hs_tracker_doc_parties_${userId}`;
const presetsKey = (userId: string) => `hs_tracker_doc_presets_${userId}`;

export const DEFAULT_DOC_PRESETS: DocumentPresetsMap = {
  invoice: { prefix: 'FAC', taxRate: 20, defaultNotes: '', paperFormat: 'A4' },
  voucher: { prefix: 'BON', taxRate: 0, defaultNotes: '', paperFormat: 'A4' },
  receipt: { prefix: 'REC', taxRate: 0, defaultNotes: '', paperFormat: 'A5' },
};

export function loadDocumentParties(userId: string): DocumentParty[] {
  try {
    const raw = localStorage.getItem(partiesKey(userId));
    return raw ? (JSON.parse(raw) as DocumentParty[]) : [];
  } catch {
    return [];
  }
}

export function saveDocumentParties(userId: string, parties: DocumentParty[]): void {
  localStorage.setItem(partiesKey(userId), JSON.stringify(parties));
}

export function upsertDocumentParty(userId: string, party: DocumentParty): DocumentParty[] {
  const list = loadDocumentParties(userId);
  const idx = list.findIndex((p) => p.id === party.id);
  const next = idx >= 0 ? list.map((p) => (p.id === party.id ? party : p)) : [...list, party];
  saveDocumentParties(userId, next);
  return next;
}

export function deleteDocumentParty(userId: string, partyId: string): DocumentParty[] {
  const next = loadDocumentParties(userId).filter((p) => p.id !== partyId);
  saveDocumentParties(userId, next);
  return next;
}

export function loadDocumentPresets(userId: string): DocumentPresetsMap {
  try {
    const raw = localStorage.getItem(presetsKey(userId));
    if (!raw) return { ...DEFAULT_DOC_PRESETS };
    return { ...DEFAULT_DOC_PRESETS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DOC_PRESETS };
  }
}

export function saveDocumentPresets(userId: string, presets: DocumentPresetsMap): void {
  localStorage.setItem(presetsKey(userId), JSON.stringify(presets));
}

export function generateDocNumber(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
}

export function createPartyFromFields(
  role: DocumentPartyRole,
  label: string,
  fields: { name: string; email: string; phone: string; address: string },
  recipientKind?: DocumentParty['recipientKind']
): DocumentParty {
  return {
    id: `party_${Date.now()}`,
    label,
    role,
    recipientKind,
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    address: fields.address,
  };
}

export function recipientKindLabel(
  kind: DocumentParty['recipientKind'],
  language: 'en' | 'fr' | 'ar'
): string {
  const map = {
    client: { en: 'Client', fr: 'Client', ar: 'عميل' },
    worker: { en: 'Worker', fr: 'Ouvrier', ar: 'عامل' },
    member: { en: 'Team member', fr: 'Membre', ar: 'عضو الفريق' },
    supplier: { en: 'Supplier', fr: 'Fournisseur', ar: 'مورد' },
    other: { en: 'Recipient', fr: 'Destinataire', ar: 'المستلم' },
  };
  const k = kind || 'other';
  return map[k][language];
}

export function billToLabel(
  kind: DocumentParty['recipientKind'],
  language: 'en' | 'fr' | 'ar'
): string {
  const en: Record<string, string> = {
    client: 'BILL TO (CLIENT)',
    worker: 'PAY TO (WORKER)',
    member: 'ISSUED TO (TEAM MEMBER)',
    supplier: 'BILL TO (SUPPLIER)',
    other: 'RECIPIENT',
  };
  const fr: Record<string, string> = {
    client: 'FACTURÉ À (CLIENT)',
    worker: 'PAYÉ À (OUVRIER)',
    member: 'DESTINATAIRE (MEMBRE)',
    supplier: 'FOURNISSEUR',
    other: 'DESTINATAIRE',
  };
  const ar: Record<string, string> = {
    client: 'العميل',
    worker: 'العامل',
    member: 'عضو الفريق',
    supplier: 'المورد',
    other: 'المستلم',
  };
  const k = kind || 'client';
  if (language === 'fr') return fr[k] || fr.other;
  if (language === 'ar') return ar[k] || ar.other;
  return en[k] || en.other;
}

export function updatePresetForKind(
  presets: DocumentPresetsMap,
  kind: DocumentKind,
  patch: Partial<DocumentPresetsMap[DocumentKind]>
): DocumentPresetsMap {
  return { ...presets, [kind]: { ...presets[kind], ...patch } };
}
