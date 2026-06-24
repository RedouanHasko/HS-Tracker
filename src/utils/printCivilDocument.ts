/** Paper format for invoice / voucher / receipt export */
export type CivilDocPaperFormat = 'A4' | 'A5';

/**
 * Opens the browser print dialog scoped to #printable-civil-bill only.
 * User can choose "Save as PDF" as the destination (Chrome, Edge, Safari).
 */
export function saveCivilDocumentAsPdf(
  paperFormat: CivilDocPaperFormat,
  suggestedFileName?: string
): void {
  const root = document.documentElement;

  root.classList.remove('print-doc-a4', 'print-doc-a5');
  root.classList.add(paperFormat === 'A4' ? 'print-doc-a4' : 'print-doc-a5');
  document.body.classList.add('printing-document');

  const previousTitle = document.title;
  if (suggestedFileName?.trim()) {
    const safe = suggestedFileName.trim().replace(/[<>:"/\\|?*]+/g, '_').slice(0, 120);
    if (safe) document.title = safe;
  }

  const cleanup = () => {
    root.classList.remove('print-doc-a4', 'print-doc-a5');
    document.body.classList.remove('printing-document');
    document.title = previousTitle;
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);

  // Allow layout + class paint before opening the dialog
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
  });
}
