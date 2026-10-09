import React, { useRef, useState } from 'react';
import { Upload, Trash2, Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import { Language } from '../types';
import { compressImageForSparkPlan, compressImageFile } from '../utils/imageCompression';
import { isUsingFirestoreMedia } from '../lib/storage';
import type { ConfirmRequest } from './ConfirmDialog';

const LABELS = {
  en: {
    title: 'Supplier receipts (Bons)',
    hint: 'Photos of fournisseur bons / invoices — optional, several allowed',
    upload: 'Add photos',
    remove: 'Remove',
    compressing: 'Compressing…',
    tooLarge: 'Image is too large after compression. Try a smaller photo.',
    imagesOnly: 'Only image files are supported on the free plan.',
  },
  fr: {
    title: 'Bons fournisseur',
    hint: 'Photos des bons ou factures — optionnel, plusieurs possibles',
    upload: 'Ajouter des photos',
    remove: 'Supprimer',
    compressing: 'Compression…',
    tooLarge: 'Image trop lourde. Essayez une photo plus petite.',
    imagesOnly: 'Seules les images sont prises en charge sur le plan gratuit.',
  },
  ar: {
    title: 'وصولات المورد (Bon)',
    hint: 'صور الوصولات أو الفواتير — اختياري، يمكن عدة صور',
    upload: 'إضافة صور',
    remove: 'حذف',
    compressing: 'جاري الضغط…',
    tooLarge: 'الصورة كبيرة جداً. جرّب صورة أصغر.',
    imagesOnly: 'الصور فقط مدعومة على الخطة المجانية.',
  },
};

export interface ExpenseReceiptDraft {
  file: File;
  previewUrl: string;
}

export interface ExpenseReceiptDraft {
  id: string;
  file: File;
  previewUrl: string;
}

interface ExpenseReceiptFieldProps {
  language: Language;
  value: ExpenseReceiptDraft[];
  onChange: (drafts: ExpenseReceiptDraft[]) => void;
  onRequestConfirm?: (request: ConfirmRequest) => void;
  disabled?: boolean;
}

/**
 * Pick and preview supplier bon/receipt images before the expense is saved.
 * Multiple drafts accumulate — saving appends them to the expense receipts.
 */
export default function ExpenseReceiptField({
  language,
  value,
  onChange,
  onRequestConfirm,
  disabled = false,
}: ExpenseReceiptFieldProps) {
  const t = LABELS[language];
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const nonImage = files.find((file) => !file.type.startsWith('image/'));
    if (nonImage) {
      setError(t.imagesOnly);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const onFree = isUsingFirestoreMedia();
      const drafts: ExpenseReceiptDraft[] = [];
      for (const file of files) {
        const { blob, fileName } = onFree
          ? await compressImageForSparkPlan(file)
          : await compressImageFile(file);

        if (onFree && blob.size > 180 * 1024) {
          setError(t.tooLarge);
          continue;
        }
        const previewFile = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        drafts.push({
          id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file: previewFile,
          previewUrl: URL.createObjectURL(blob),
        });
      }
      if (drafts.length > 0) onChange([...value, ...drafts]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    const run = () => {
      const target = value.find((draft) => draft.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      onChange(value.filter((draft) => draft.id !== id));
      setError('');
    };
    if (!onRequestConfirm) {
      run();
      return;
    }
    onRequestConfirm({
      title: language === 'en'
        ? 'Remove selected receipt?'
        : language === 'fr'
          ? 'Supprimer le reçu sélectionné ?'
          : 'حذف الوصل المحدد؟',
      message: language === 'en'
        ? 'Remove this selected receipt image before saving the expense?'
        : language === 'fr'
          ? 'Supprimer cette image de reçu avant d’enregistrer la dépense ?'
          : 'حذف صورة الوصل المحددة قبل حفظ المصروف؟',
      confirmLabel: t.remove,
      onConfirm: run,
    });
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <FileText className="h-3.5 w-3.5 text-amber-600" />
            {t.title}
            {value.length > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {value.length}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">{t.hint}</p>
        </div>
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={disabled || busy}
            onChange={handleFiles}
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-sky-700 transition-colors hover:bg-sky-50 disabled:opacity-50 dark:border-sky-900/50 dark:bg-slate-900 dark:text-sky-400"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {busy ? t.compressing : t.upload}
          </button>
        </>
      </div>

      {error && <p className="mb-2 text-[10px] text-red-600 dark:text-red-400">{error}</p>}

      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {value.map((draft) => (
            <div key={draft.id} className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <img src={draft.previewUrl} alt={t.title} className="h-24 w-full bg-slate-100 object-cover dark:bg-slate-900" />
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                <span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-slate-500">
                  <ImageIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{draft.file.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(draft.id)}
                  disabled={disabled || busy}
                  aria-label={t.remove}
                  className="shrink-0 rounded p-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
