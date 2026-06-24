import React, { useEffect, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { TaskMedia } from '../types';
import { resolveTaskMediaUrl } from '../lib/storage';

/** Small receipt thumbnail / open link in expense ledger */
export default function ExpenseReceiptThumb({ media, label }: { media: TaskMedia; label: string }) {
  const [src, setSrc] = useState(media.url || '');
  const [loading, setLoading] = useState(!media.url);

  useEffect(() => {
    let cancelled = false;
    if (media.url) {
      setSrc(media.url);
      setLoading(false);
      return;
    }
    resolveTaskMediaUrl(media.storagePath, media.url).then((url) => {
      if (!cancelled) {
        setSrc(url);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [media.storagePath, media.url]);

  const open = () => {
    if (src) window.open(src, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />;
  }

  if (!src) return null;

  return (
    <button
      type="button"
      onClick={open}
      title={label}
      className="group relative h-8 w-8 shrink-0 overflow-hidden rounded border border-slate-200 dark:border-slate-700"
    >
      <img src={src} alt={label} className="h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
        <FileText className="h-3 w-3 text-white opacity-0 group-hover:opacity-100" />
      </span>
    </button>
  );
}
