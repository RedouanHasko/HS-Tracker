import React, { useRef, useState } from 'react';
import { Upload, Trash2, Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import { Language } from '../types';
import { compressImageForSparkPlan, compressImageFile, formatFileSize } from '../utils/imageCompression';
import { isUsingFirestoreMedia } from '../lib/storage';
import type { ConfirmRequest } from './ConfirmDialog';

const LABELS = {
  en: {
    title: 'Supplier receipt (Bon)',
    hint: 'Photo of the fournisseur bon / invoice — optional',
    upload: 'Add photo',
    remove: 'Remove',
    compressing: 'Compressing…',
    tooLarge: 'Image is too large after compression. Try a smaller photo.',
    imagesOnly: 'Only image files are supported on the free plan.',
  },
  fr: {
    title: 'Bon fournisseur',
    hint: 'Photo du bon ou facture du fournisseur — optionnel',
    upload: 'Ajouter une photo',
    remove: 'Supprimer',
    compressing: 'Compression…',
    tooLarge: 'Image trop lourde. Essayez une photo plus petite.',
    imagesOnly: 'Seules les images sont prises en charge sur le plan gratuit.',
  },
  ar: {
    title: 'وصل المورد (Bon)',
    hint: 'صورة وصل أو فاتورة المورد — اختياري',
    upload: 'إضافة صورة',
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

interface ExpenseReceiptFieldProps {
  language: Language;
  value: ExpenseReceiptDraft | null;
  onChange: (draft: ExpenseReceiptDraft | null) => void;
  onRequestConfirm?: (request: ConfirmRequest) => void;
  disabled?: boolean;
}

/**
 * Pick and preview a supplier bon/receipt image before the expense is saved.
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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t.imagesOnly);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const onFree = isUsingFirestoreMedia();
      const { blob, fileName } = onFree
        ? await compressImageForSparkPlan(file)
        : await compressImageFile(file);

      if (onFree && blob.size > 180 * 1024) {
        setError(t.tooLarge);
        return;
      }

      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      const previewFile = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
      onChange({ file: previewFile, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    const run = () => {
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      onChange(null);
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
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">{t.hint}</p>
        </div>
        {!value && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={disabled || busy}
              onChange={handleFile}
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
        )}
      </div>

      {error && <p className="mb-2 text-[10px] text-red-600 dark:text-red-400">{error}</p>}

      {value && (
        <div className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <img src={value.previewUrl} alt={t.title} className="max-h-36 w-full object-contain bg-slate-100 dark:bg-slate-900" />
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex items-center gap-1 truncate text-[10px] text-slate-500">
              <ImageIcon className="h-3 w-3 shrink-0" />
              {value.file.name} · {formatFileSize(value.file.size)}
            </span>
            <button
              type="button"
              onClick={remove}
              disabled={disabled || busy}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3 w-3" />
              {t.remove}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
