/**
 * Opens the browser print dialog scoped to one A4 invoice, voucher, or receipt.
 * User can choose "Save as PDF" as the destination (Chrome, Edge, Safari).
 */
export function saveCivilDocumentAsPdf(
  suggestedFileName?: string,
  mode: 'single' | 'report' = 'single'
): void {
  const root = document.documentElement;

  root.classList.add(mode === 'report' ? 'print-doc-report' : 'print-doc-a4');
  document.body.classList.add('printing-document');

  const previousTitle = document.title;
  if (suggestedFileName?.trim()) {
    const safe = suggestedFileName.trim().replace(/[<>:"/\\|?*]+/g, '_').slice(0, 120);
    if (safe) document.title = safe;
  }

  const cleanup = () => {
    root.classList.remove('print-doc-a4');
    root.classList.remove('print-doc-report');
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
