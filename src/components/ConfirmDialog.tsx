import React, { useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Language } from '../types';
import { useMotionConfig } from '../utils/motionPresets';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  language?: Language;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling for destructive actions (delete, remove) */
  variant?: 'danger' | 'default' | 'info';
  /** Alert = single OK button (no cancel / confirm pair) */
  mode?: 'confirm' | 'alert';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const LABELS = {
  en: { confirm: 'Delete', cancel: 'Cancel', confirmDefault: 'Confirm', ok: 'OK' },
  fr: { confirm: 'Supprimer', cancel: 'Annuler', confirmDefault: 'Confirmer', ok: 'OK' },
  ar: { confirm: 'حذف', cancel: 'إلغاء', confirmDefault: 'تأكيد', ok: 'حسناً' },
};

/**
 * Reusable confirmation modal for destructive or important actions.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  language = 'en',
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  mode = 'confirm',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = LABELS[language];
  const [busy, setBusy] = useState(false);
  const { modal, modalVariants, overlayVariants, overlay } = useMotionConfig();
  const isAlert = mode === 'alert';

  const handleConfirm = async () => {
    if (isAlert) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  const isDanger = variant === 'danger';
  const isInfo = variant === 'info' || isAlert;
  const confirmText = isAlert ? (confirmLabel ?? t.ok) : (confirmLabel ?? (isDanger ? t.confirm : t.confirmDefault));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto px-3 py-4 sm:items-center sm:px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={overlayVariants}
          transition={overlay}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px] max-sm:backdrop-blur-none transform-gpu"
            onClick={onCancel}
            aria-label={cancelLabel ?? t.cancel}
            tabIndex={-1}
          />
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={modal}
            className="panel-motion-gpu relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {isDanger && (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </span>
                )}
                {isInfo && !isDanger && (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-950/40">
                    <Info className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  </span>
                )}
                <div>
                  <h3
                    id="confirm-dialog-title"
                    className="text-sm font-bold text-slate-900 dark:text-white"
                  >
                    {title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy || loading}
                className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-200"
                aria-label={cancelLabel ?? t.cancel}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`mt-5 grid gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex sm:justify-end ${isAlert ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!isAlert && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={busy || loading}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
                >
                  {cancelLabel ?? t.cancel}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy || loading}
                className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors disabled:opacity-50 ${
                  isDanger
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200'
                }`}
              >
                {busy || loading ? '…' : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default' | 'info';
  mode?: 'confirm' | 'alert';
  onConfirm?: () => void | Promise<void>;
};
