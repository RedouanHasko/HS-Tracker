import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, FileImage, ImageOff, Loader2, X } from 'lucide-react';
import { TaskMedia } from '../types';
import { resolveTaskMediaUrl } from '../lib/storage';

/** Receipt thumbnail with an in-app viewer for Firestore and Storage-backed images. */
export default function ExpenseReceiptThumb({ media, label }: { media: TaskMedia; label: string }) {
  const [src, setSrc] = useState(media.url || '');
  const [loading, setLoading] = useState(!media.url);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (media.url) {
      setSrc(media.url);
      setLoading(false);
      return;
    }

    setLoading(true);
    resolveTaskMediaUrl(media.storagePath, media.url)
      .then((url) => {
        if (cancelled) return;
        setSrc(url);
        setFailed(!url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [media.storagePath, media.url]);

  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [viewerOpen]);

  if (loading) {
    return (
      <span
        title={label}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 dark:border-slate-700"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
      </span>
    );
  }

  if (failed || !src) {
    return (
      <span
        title={`${label} unavailable`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 text-red-500 dark:border-red-900/60 dark:bg-red-950/30"
      >
        <ImageOff className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        title={`${label} - view`}
        aria-label={`${label} - view`}
        className="group relative h-8 w-8 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100 outline-none ring-sky-500 transition hover:ring-2 focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900"
      >
        <img src={src} alt="" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/45">
          <Eye className="h-3.5 w-3.5 text-white drop-shadow" />
        </span>
      </button>

      {viewerOpen && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-3 font-sans backdrop-blur-[2px] max-sm:backdrop-blur-none sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-receipt-viewer-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewerOpen(false);
          }}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 dark:border-slate-800 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                  <FileImage className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <h3
                    id="expense-receipt-viewer-title"
                    className="truncate text-sm font-bold text-slate-900 dark:text-white"
                  >
                    {label}
                  </h3>
                  {media.originalName && (
                    <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {media.originalName}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setViewerOpen(false)}
                title="Close"
                aria-label="Close receipt viewer"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-50 p-3 dark:bg-slate-950/60 sm:p-5">
              <div className="flex h-full min-h-48 items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950 sm:p-3">
                <img
                  src={src}
                  alt={label}
                  className="max-h-[68vh] max-w-full rounded object-contain"
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
