/**
 * PDF text extraction service using pdf.js.
 * Replaces pdfplumber text / table extraction.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

/**
 * Extract text from all pages of a PDF file.
 * @param {File|ArrayBuffer} input
 * @param {string} [password]
 * @returns {Promise<string[]>} Array of page texts
 */
export async function extractPages(input, password) {
  const buffer =
    input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    password: password || undefined,
  });

  const pdf = await loadingTask.promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => {
        if ('str' in item) return item.str;
        return '';
      })
      .join(' ');
    pages.push(text);
  }

  return pages;
}

/**
 * Extract text from all pages, joining newlines per text item for line-by-line parsing.
 * This preserves newline structure better for parser regex patterns.
 * @param {File|ArrayBuffer} input
 * @param {string} [password]
 * @returns {Promise<{pages: string[], fullText: string, allLines: string[]}>}
 */
export async function extractPagesDetailed(input, password) {
  const buffer =
    input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    password: password || undefined,
  });

  const pdf = await loadingTask.promise;
  const pages = [];
  const allLines = [];
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group text items by their Y position to reconstruct lines
    const lineMap = new Map();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      // Round Y to group items on the same line
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str });
    }

    // Sort by Y descending (top to bottom), then X ascending (left to right)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    const pageLines = [];
    for (const y of sortedYs) {
      const items = lineMap.get(y).sort((a, b) => a.x - b.x);
      const lineText = items.map((it) => it.str).join(' ');
      pageLines.push(lineText);
    }

    const pageText = pageLines.join('\n');
    pages.push(pageText);
    fullText += pageText + '\n';
    allLines.push(...pageLines);
  }

  return { pages, fullText, allLines };
}

/**
 * Check if a PDF file is password-protected.
 * @param {File|ArrayBuffer} input
 * @returns {Promise<boolean>}
 */
export async function isEncrypted(input) {
  const buffer =
    input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  try {
    const loadingTask = pdfjsLib.getDocument({ data: uint8 });
    const pdf = await loadingTask.promise;
    // If we get here with no password, it's not encrypted
    // (or has an empty password)
    await pdf.getPage(1);
    return false;
  } catch (err) {
    if (err && err.name === 'PasswordException') {
      return true;
    }
    // Other errors — assume not encrypted but broken
    return false;
  }
}

/**
 * Try to open a PDF with each password in the list.
 * Returns the working password or null.
 * @param {File|ArrayBuffer} input
 * @param {string[]} passwords
 * @returns {Promise<string|null>}
 */
export async function tryPasswords(input, passwords) {
  const buffer =
    input instanceof ArrayBuffer ? input : await input.arrayBuffer();

  for (const pwd of passwords) {
    try {
      const uint8 = new Uint8Array(buffer.slice(0));
      const loadingTask = pdfjsLib.getDocument({ data: uint8, password: pwd });
      const pdf = await loadingTask.promise;
      await pdf.getPage(1);
      return pwd;
    } catch {
      continue;
    }
  }
  return null;
}
