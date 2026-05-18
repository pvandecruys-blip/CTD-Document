/**
 * Extract plain text from a user-uploaded file (PDF / DOCX / TXT / CSV / XML).
 *
 * PDF extraction preserves rough table structure by grouping items per Y-row
 * and inserting tabs at significant horizontal gaps — this matters for
 * stability tables that the AI generator needs to parse downstream.
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure PDF.js worker once. Importing this module ensures the worker is set.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  try {
    if (ext === '.pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textParts: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        const items = (content.items as Array<{ str?: string; transform?: number[] }>)
          .filter((item) => item.str && item.transform)
          .map((item) => ({
            text: item.str!,
            x: Math.round(item.transform![4]),
            y: Math.round(item.transform![5]),
          }))
          .filter((item) => item.text.trim());

        if (items.length === 0) {
          textParts.push('');
          continue;
        }

        // Group items by Y position (rows) — items within 3px belong to same row.
        const rows: Map<number, typeof items> = new Map();
        for (const item of items) {
          let foundRow = false;
          for (const [rowY] of rows) {
            if (Math.abs(item.y - rowY) < 3) {
              rows.get(rowY)!.push(item);
              foundRow = true;
              break;
            }
          }
          if (!foundRow) rows.set(item.y, [item]);
        }

        // Top-to-bottom = higher Y first in PDF coordinates.
        const sortedRows = Array.from(rows.entries()).sort((a, b) => b[0] - a[0]);

        const pageLines: string[] = [];
        for (const [, rowItems] of sortedRows) {
          rowItems.sort((a, b) => a.x - b.x);
          let lineText = '';
          let lastX = -1000;
          for (const item of rowItems) {
            const gap = item.x - lastX;
            if (lastX >= 0 && gap > 30) {
              lineText += '\t';
            } else if (lastX >= 0 && gap > 5) {
              lineText += ' ';
            }
            lineText += item.text;
            lastX = item.x + item.text.length * 5;
          }
          pageLines.push(lineText);
        }

        textParts.push(pageLines.join('\n'));
      }

      const fullText = textParts.join('\n\n--- PAGE BREAK ---\n\n');
      return fullText || `[PDF ${file.name} contains no extractable text — may be scanned/image-based]`;
    }

    if (ext === '.docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value || `[DOCX ${file.name} contains no text]`;
    }

    if (ext === '.txt' || ext === '.csv' || ext === '.xml') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || '');
        reader.onerror = () => resolve(`[Error reading ${file.name}]`);
        reader.readAsText(file);
      });
    }

    return `[File type ${ext} not supported. Upload PDF, DOCX, or TXT for best results.]`;
  } catch (error) {
    return `[Error extracting text from ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

/** Collect files from a HTML5 drag-drop event, walking into folders recursively. */
export async function collectDroppedFiles(event: React.DragEvent, allowedExt: string[]): Promise<File[]> {
  const items = event.dataTransfer.items;
  if (!items || items.length === 0) return [];

  const collected: File[] = [];
  const lowerExt = allowedExt.map((e) => e.toLowerCase());

  const readEntry = (entry: FileSystemEntry): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file(
          (f) => {
            const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
            if (lowerExt.includes(ext)) collected.push(f);
            resolve();
          },
          () => resolve(),
        );
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        reader.readEntries(
          async (entries) => {
            for (const child of entries) {
              await readEntry(child);
            }
            resolve();
          },
          () => resolve(),
        );
      } else {
        resolve();
      }
    });

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length > 0) {
    for (const entry of entries) {
      await readEntry(entry);
    }
    return collected;
  }

  // Fallback for browsers without webkitGetAsEntry
  return Array.from(event.dataTransfer.files).filter((f) => {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    return lowerExt.includes(ext);
  });
}
