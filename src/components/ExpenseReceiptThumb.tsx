import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Eye, FileImage, ImageOff, Loader2, X } from 'lucide-react';
import { TaskMedia } from '../types';
import { resolveTaskMediaUrl } from '../lib/storage';

/**
 * Receipt thumbnail with an in-app viewer for Firestore and Storage-backed images.
 * Pass `gallery` to turn the viewer into a carousel across all of an expense's receipts.
 */
export default function ExpenseReceiptThumb({
  media,
  label,
  gallery,
}: {
  media: TaskMedia;
  label: string;
  gallery?: TaskMedia[];
}) {
  const items = gallery && gallery.length > 0 ? gallery : [media];
  const startIndex = Math.max(
    0,
    items.findIndex((item) => item.id === media.id)
  );
  const [src, setSrc] = useState(media.url || '');
  const [loading, setLoading] = useState(!media.url);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const active = items[Math.min(activeIndex, items.length - 1)] || media;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (active.url) {
      setSrc(active.url);
      setLoading(false);
      return;
    }

    setLoading(true);
    resolveTaskMediaUrl(active.storagePath, active.url)
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
  }, [active.storagePath, active.url]);

  const openViewer = () => {
    setActiveIndex(startIndex);
    setViewerOpen(true);
  };

  const step = (delta: number) => {
    setActiveIndex((index) => (index + delta + items.length) % items.length);
  };

  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerOpen(false);
      if (event.key === 'ArrowRight' && items.length > 1) step(1);
      if (event.key === 'ArrowLeft' && items.length > 1) step(-1);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [viewerOpen, items.length]);

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
        onClick={openViewer}
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
                    {items.length > 1 && (
                      <span className="ml-2 font-mono text-[11px] font-semibold text-slate-400">
                        {activeIndex + 1} / {items.length}
                      </span>
                    )}
                  </h3>
                  {active.originalName && (
                    <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {active.originalName}
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
              <div className="relative flex h-full min-h-48 items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950 sm:p-3">
                {items.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      aria-label="Previous receipt"
                      className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      aria-label="Next receipt"
                      className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
                <img
                  src={src}
                  alt={label}
                  className="max-h-[68vh] max-w-full rounded object-contain"
                />
              </div>
              {items.length > 1 && (
                <div className="mt-2 flex justify-center gap-1.5">
                  {items.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={`Receipt ${index + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        index === activeIndex ? 'w-5 bg-sky-500' : 'w-1.5 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
