import { Language } from '../types';

/**
 * Shared form validation so invalid input is reported where it happens instead of
 * failing silently (or worse, being coerced into wrong data). Validators return an
 * error code; formErrorText renders it in the active language.
 */

export type FormErrorCode =
  | 'required_title'
  | 'invalid_amount'
  | 'invalid_commission'
  | 'empty_cost_label'
  | 'negative_cost_amount'
  | 'invalid_email'
  | 'self_settlement'
  | 'missing_settlement_party'
  | 'invalid_settlement_amount'
  | 'end_before_start'
  | 'required_field'
  | 'required_client'
  | 'empty_line_description'
  | 'required_event_title';

const FORM_ERROR_TEXT: Record<FormErrorCode, Record<Language, string>> = {
  required_title: {
    en: 'Give this expense a title.',
    fr: 'Donnez un titre à cette dépense.',
    ar: 'أدخل عنواناً لهذا المصروف.',
  },
  invalid_amount: {
    en: 'Enter an amount greater than zero.',
    fr: 'Saisissez un montant supérieur à zéro.',
    ar: 'أدخل مبلغاً أكبر من الصفر.',
  },
  invalid_commission: {
    en: 'Commission must be between 0 and 100%.',
    fr: 'La commission doit être entre 0 et 100 %.',
    ar: 'يجب أن تكون العمولة بين 0 و 100٪.',
  },
  empty_cost_label: {
    en: 'Every cost line needs a label.',
    fr: 'Chaque ligne de coût nécessite un libellé.',
    ar: 'كل بند تكلفة يحتاج إلى وصف.',
  },
  negative_cost_amount: {
    en: 'Cost amounts cannot be negative.',
    fr: 'Les montants ne peuvent pas être négatifs.',
    ar: 'لا يمكن أن تكون المبالغ سالبة.',
  },
  invalid_email: {
    en: 'Enter a valid email address (e.g. name@company.com).',
    fr: 'Saisissez une adresse e-mail valide (ex. nom@société.com).',
    ar: 'أدخل بريداً إلكترونياً صالحاً (مثال: name@company.com).',
  },
  self_settlement: {
    en: 'A settlement needs two different people — payer and receiver cannot match.',
    fr: 'Un règlement nécessite deux personnes différentes.',
    ar: 'التسوية تحتاج شخصين مختلفين — لا يمكن أن يكون الدافع والمستلم نفس الشخص.',
  },
  missing_settlement_party: {
    en: 'Choose who pays and who receives.',
    fr: 'Choisissez qui paie et qui reçoit.',
    ar: 'اختر من يدفع ومن يستلم.',
  },
  invalid_settlement_amount: {
    en: 'Enter a settlement amount greater than zero.',
    fr: 'Saisissez un montant supérieur à zéro.',
    ar: 'أدخل مبلغ تسوية أكبر من الصفر.',
  },
  end_before_start: {
    en: 'The end date cannot be before the start date.',
    fr: 'La date de fin ne peut pas précéder la date de début.',
    ar: 'لا يمكن أن يكون تاريخ النهاية قبل تاريخ البداية.',
  },
  required_field: {
    en: 'Please fill in the required fields.',
    fr: 'Veuillez remplir les champs requis.',
    ar: 'يرجى ملء الحقول المطلوبة.',
  },
  required_client: {
    en: 'Enter the client name for this quote.',
    fr: 'Saisissez le nom du client pour ce devis.',
    ar: 'أدخل اسم العميل لهذا العرض.',
  },
  empty_line_description: {
    en: 'Every quote line needs a description.',
    fr: 'Chaque ligne du devis nécessite une description.',
    ar: 'كل بند في العرض يحتاج إلى وصف.',
  },
  required_event_title: {
    en: 'Give this event a title.',
    fr: 'Donnez un titre à cet événement.',
    ar: 'أدخل عنواناً لهذا الحدث.',
  },
};

export function formErrorText(code: FormErrorCode, language: Language): string {
  return FORM_ERROR_TEXT[code][language];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Clamp a commission percentage to the sane 0–100 range (HTML min/max is advisory only). */
export function clampCommission(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function validateExpense(input: {
  title: string;
  amount: number;
  commission: number;
}): FormErrorCode | null {
  if (!input.title.trim()) return 'required_title';
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'invalid_amount';
  if (!Number.isFinite(input.commission) || input.commission < 0 || input.commission > 100) {
    return 'invalid_commission';
  }
  return null;
}

export function validateCostLines(
  lines: { label: string; amount: number }[]
): { index: number; code: FormErrorCode } | null {
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].label.trim()) return { index: i, code: 'empty_cost_label' };
    if (!Number.isFinite(lines[i].amount) || lines[i].amount < 0) {
      return { index: i, code: 'negative_cost_amount' };
    }
  }
  return null;
}

export function validateReimbursement(input: {
  from: string;
  to: string;
  amount: number;
}): FormErrorCode | null {
  if (!input.from || !input.to) return 'missing_settlement_party';
  if (input.from.toLowerCase() === input.to.toLowerCase()) return 'self_settlement';
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'invalid_settlement_amount';
  return null;
}

/** PO schedule sanity: an expected (delivery) date cannot precede the issue date. */
export function validateDateOrder(start: string, end: string): FormErrorCode | null {
  if (!start || !end) return null;
  return end < start ? 'end_before_start' : null;
}

/**
 * Parse a raw number input without silent coercion: negatives and garbage return NaN
 * so the caller can report them instead of storing a quietly-clamped 0.
 */
export function parseStrictAmount(raw: FormDataEntryValue | null | string | number): number {
  if (typeof raw === 'number') return raw;
  if (raw === null || raw === undefined) return NaN;
  const text = String(raw).trim();
  if (text === '') return NaN;
  return Number(text);
}
