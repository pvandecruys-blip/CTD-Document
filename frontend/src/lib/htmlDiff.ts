/**
 * Paragraph-level diff between two generated documents.
 *
 * Two independent generation runs assign their own data-pid sequence, so we
 * cannot align paragraphs by pid. Instead we extract the ordered list of
 * block-level elements from each document and run a longest-common-subsequence
 * (LCS) diff over their normalized text. The result is a unified list of
 * blocks tagged unchanged / added / removed — a classic redline view.
 */

export interface DiffBlock {
  type: 'unchanged' | 'added' | 'removed';
  /** Rendered HTML of the block (for display). */
  html: string;
  /** Normalized text used for matching. */
  text: string;
}

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, table, ul, ol, blockquote, pre';

interface Block {
  html: string;
  text: string;
}

function extractBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body || doc.documentElement;
  const blocks: Block[] = [];

  // Only take top-level blocks (don't descend into a table's inner paragraphs).
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.matches(BLOCK_SELECTOR)) {
        const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) blocks.push({ html: child.outerHTML, text });
      } else {
        // Container (e.g. <div>) — descend to find blocks inside
        walk(child);
      }
    }
  };
  walk(root);
  return blocks;
}

/** Normalize text for matching: strip the [N] traceability superscripts and
 * collapse whitespace so cosmetic ref changes don't register as content diffs. */
function normalize(text: string): string {
  return text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function diffDocuments(beforeHtml: string, afterHtml: string): DiffBlock[] {
  const a = extractBlocks(beforeHtml);
  const b = extractBlocks(afterHtml);
  const an = a.map((x) => normalize(x.text));
  const bn = b.map((x) => normalize(x.text));

  // LCS dynamic programming table
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = an[i] === bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Backtrack to build the unified diff
  const result: DiffBlock[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (an[i] === bn[j]) {
      result.push({ type: 'unchanged', html: b[j].html, text: b[j].text });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', html: a[i].html, text: a[i].text });
      i++;
    } else {
      result.push({ type: 'added', html: b[j].html, text: b[j].text });
      j++;
    }
  }
  while (i < m) { result.push({ type: 'removed', html: a[i].html, text: a[i].text }); i++; }
  while (j < n) { result.push({ type: 'added', html: b[j].html, text: b[j].text }); j++; }

  return result;
}

/** Summary counts for a quick "12 added, 3 removed" headline. */
export function summarizeDiff(blocks: DiffBlock[]): { added: number; removed: number; unchanged: number } {
  return blocks.reduce(
    (acc, b) => {
      acc[b.type]++;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}
