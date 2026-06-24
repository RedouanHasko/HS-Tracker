import React, { useState } from 'react';
import { BookmarkPlus, ChevronDown, User, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentParty, DocumentPartyRole, DocumentRecipientKind, Language } from '../types';
import { recipientKindLabel } from '../utils/documentProfiles';

export interface PartyFields {
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface DocumentPartySelectorProps {
  language: Language;
  role: DocumentPartyRole;
  accentClass: string;
  title: string;
  fields: PartyFields;
  onChange: (fields: Partial<PartyFields>) => void;
  savedParties: DocumentParty[];
  onSelectParty: (party: DocumentParty) => void;
  onSaveParty: (label: string) => void;
  onDeleteParty?: (partyId: string) => void;
  recipientKind?: DocumentRecipientKind;
  onRecipientKindChange?: (kind: DocumentRecipientKind) => void;
  quickFillOptions?: { label: string; fields: PartyFields; kind?: DocumentRecipientKind }[];
}

const RECIPIENT_KINDS: DocumentRecipientKind[] = ['client', 'worker', 'member', 'supplier', 'other'];

const LABELS = {
  en: {
    pickSaved: 'Pick saved profile',
    saveAs: 'Save current as…',
    savePlaceholder: 'Profile name (e.g. Engineer / Client)',
    save: 'Save profile',
    quickFill: 'Quick fill',
    newProfile: 'New profile',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    name: 'Name',
    recipientType: 'Recipient type',
  },
  fr: {
    pickSaved: 'Choisir un profil',
    saveAs: 'Enregistrer sous…',
    savePlaceholder: 'Nom du profil',
    save: 'Enregistrer',
    quickFill: 'Remplissage rapide',
    newProfile: 'Nouveau profil',
    email: 'E-mail',
    phone: 'Téléphone',
    address: 'Adresse',
    name: 'Nom',
    recipientType: 'Type de destinataire',
  },
  ar: {
    pickSaved: 'اختر ملفاً محفوظاً',
    saveAs: 'حفظ الحالي باسم…',
    savePlaceholder: 'اسم الملف',
    save: 'حفظ',
    quickFill: 'تعبئة سريعة',
    newProfile: 'ملف جديد',
    email: 'البريد',
    phone: 'الهاتف',
    address: 'العنوان',
    name: 'الاسم',
    recipientType: 'نوع المستلم',
  },
};

/**
 * Issuer or recipient block with saved profiles, quick-fill, and custom fields.
 */
export default function DocumentPartySelector({
  language,
  role,
  accentClass,
  title,
  fields,
  onChange,
  savedParties,
  onSelectParty,
  onSaveParty,
  onDeleteParty,
  recipientKind = 'client',
  onRecipientKindChange,
  quickFillOptions = [],
}: DocumentPartySelectorProps) {
  const t = LABELS[language];
  const [saveLabel, setSaveLabel] = useState('');
  const [showSave, setShowSave] = useState(false);
  const roleParties = savedParties.filter((p) => p.role === role);

  const handleSave = () => {
    if (!saveLabel.trim() || !fields.name.trim()) return;
    onSaveParty(saveLabel.trim());
    setSaveLabel('');
    setShowSave(false);
  };

  return (
    <motion.div
      layout
      className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/50"
    >
      <span className={`block text-[9.5px] font-bold uppercase tracking-widest ${accentClass}`}>{title}</span>

      {role === 'recipient' && onRecipientKindChange && (
        <div>
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {t.recipientType}
          </label>
          <div className="flex flex-wrap gap-1">
            {RECIPIENT_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => onRecipientKindChange(kind)}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-all ${
                  recipientKind === kind
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-cyan-50 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {recipientKindLabel(kind, language)}
              </button>
            ))}
          </div>
        </div>
      )}

      {roleParties.length > 0 && (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <select
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-xs dark:border-slate-700 dark:bg-slate-900"
              defaultValue=""
              onChange={(e) => {
                const party = roleParties.find((p) => p.id === e.target.value);
                if (party) onSelectParty(party);
                e.target.value = '';
              }}
            >
              <option value="" disabled>
                {t.pickSaved}
              </option>
              {roleParties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
      )}

      {quickFillOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="w-full text-[9px] font-bold uppercase text-slate-400">{t.quickFill}</span>
          {quickFillOptions.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                onChange(opt.fields);
                if (opt.kind && onRecipientKindChange) onRecipientKindChange(opt.kind);
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-800"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder={t.name}
        value={fields.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
      />
      <input
        type="email"
        placeholder={t.email}
        value={fields.email}
        onChange={(e) => onChange({ email: e.target.value })}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
      />
      <input
        type="text"
        placeholder={t.phone}
        value={fields.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
      />
      <input
        type="text"
        placeholder={t.address}
        value={fields.address}
        onChange={(e) => onChange({ address: e.target.value })}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setShowSave(!showSave)}
          className="flex items-center gap-1 text-[10px] font-semibold text-cyan-700 hover:text-cyan-600 dark:text-cyan-400"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          {t.saveAs}
        </button>
      </div>

      <AnimatePresence>
        {showSave && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-2 overflow-hidden"
          >
            <input
              type="text"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              placeholder={t.savePlaceholder}
              className="min-w-0 flex-1 rounded-lg border border-cyan-200 bg-white px-2 py-1 text-xs dark:border-cyan-900 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={handleSave}
              className="shrink-0 rounded-lg bg-cyan-600 px-2.5 py-1 text-[10px] font-bold text-white"
            >
              {t.save}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function PartyIcon({ role }: { role: DocumentPartyRole }) {
  return role === 'issuer' ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />;
}
