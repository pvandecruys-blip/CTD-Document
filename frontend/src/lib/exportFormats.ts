/**
 * Export helpers for the generated CTD section in multiple formats.
 *
 * - HTML: download as .html (already supported elsewhere, included here
 *   for completeness and consistency).
 * - PDF: open a hidden iframe with the full HTML and trigger the browser's
 *   print dialog. The user can choose "Save as PDF" — works in every
 *   modern browser without server dependencies. The AI output already
 *   includes @page A4 CSS so the rendered PDF is print-ready.
 * - DOCX: write a Microsoft Word-compatible HTML file with .doc extension.
 *   Word opens these as full documents (this is the Word HTML format used
 *   by SharePoint, Confluence export, etc.). Tables, headings, styles all
 *   carry over. The user can edit and save as proper .docx from inside Word.
 */

const DOC_FONT_FALLBACK = "'Times New Roman', Times, serif";

interface SectionMeta {
  projectName: string;
  sectionNumber: string;
  sectionTitle: string;
}

/** Wrap body-only HTML in a full document with print-friendly styles. */
function wrapPrintableHtml(html: string, meta: SectionMeta): string {
  const trimmed = html.trim();
  if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
    // Already a full document — return as-is
    return trimmed;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeAttr(meta.sectionNumber)} – ${escapeAttr(meta.sectionTitle)}</title>
  <style>
    @page { size: A4; margin: 2.54cm; }
    body { font-family: ${DOC_FONT_FALLBACK}; max-width: 210mm; margin: 0 auto; padding: 40px 30px; color: #1a1a1a; line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11px; }
    th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    h1, h2, h3, h4 { color: #1a1a1a; }
    /* Strip any editor decoration that may have leaked through */
    [data-pid] { outline: none !important; background: transparent !important; box-shadow: none !important; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function safeFileName(meta: SectionMeta): string {
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
  return `${safe(meta.projectName)}_${safe(meta.sectionNumber)}_${safe(meta.sectionTitle)}`;
}

// ─── HTML download ──────────────────────────────────────────────────
export function downloadAsHtml(html: string, meta: SectionMeta): void {
  const full = wrapPrintableHtml(html, meta);
  const blob = new Blob([full], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, `${safeFileName(meta)}.html`);
}

// ─── Print → PDF ────────────────────────────────────────────────────
/**
 * Open the print dialog with the full document. Browser handles the rest
 * (user chooses destination: physical printer, "Save as PDF", etc.).
 */
export function printAsPdf(html: string, meta: SectionMeta): void {
  const full = wrapPrintableHtml(html, meta);
  // Use a temporary iframe so we don't pollute the host window's history
  // or styles.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      // Cleanup after the print dialog closes
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    }
  };

  const doc = iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(full);
    doc.close();
  }
}

// ─── DOCX (Word HTML format) ────────────────────────────────────────
/**
 * Write a Microsoft Word-compatible file using the Word HTML format.
 * Saving with the .doc extension and MIME `application/msword` causes Word
 * to open the file natively as a full document. Users can then "Save As .docx"
 * from inside Word for the modern Open XML format if they prefer.
 *
 * This avoids requiring a heavy DOCX library and keeps fidelity high for
 * the kind of content the AI produces (paragraphs + tables + headings).
 */
export function downloadAsDocx(html: string, meta: SectionMeta): void {
  const bodyOnly = extractBodyOnly(html);
  // Microsoft Office namespaces tell Word to treat this as a Word document
  const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeAttr(meta.sectionNumber)} ${escapeAttr(meta.sectionTitle)}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page WordSection1 { size: 21cm 29.7cm; margin: 2.54cm 2.54cm 2.54cm 2.54cm; }
div.WordSection1 { page: WordSection1; }
body { font-family: ${DOC_FONT_FALLBACK}; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; }
th, td { border: 1px solid #888888; padding: 5pt 7pt; vertical-align: top; }
th { background: #f0f0f0; font-weight: bold; }
h1 { font-size: 18pt; font-weight: bold; }
h2 { font-size: 14pt; font-weight: bold; }
h3 { font-size: 12pt; font-weight: bold; }
[data-pid] { background: transparent !important; outline: none !important; box-shadow: none !important; }
</style>
</head>
<body>
<div class="WordSection1">
${bodyOnly}
</div>
</body>
</html>`;

  const blob = new Blob(['﻿', wordHtml], { type: 'application/msword' });
  triggerDownload(blob, `${safeFileName(meta)}.doc`);
}

// ─── Internals ──────────────────────────────────────────────────────

function extractBodyOnly(html: string): string {
  const trimmed = html.trim();
  if (!trimmed.toLowerCase().startsWith('<!doctype') && !trimmed.toLowerCase().startsWith('<html')) {
    return trimmed;
  }
  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  return doc.body?.innerHTML || trimmed;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Firefox/Safari don't cancel the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
