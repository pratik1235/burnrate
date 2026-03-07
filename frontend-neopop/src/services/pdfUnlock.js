/**
 * PDF unlock service — password generation and encryption detection.
 * Port of backend/services/pdf_unlock.py (179 lines)
 *
 * Uses pdf.js password support instead of pikepdf.
 */

import { isEncrypted as pdfIsEncrypted, tryPasswords } from '../parsers/pdfService.js';

/**
 * Generate password candidates based on bank format.
 * @param {Object} opts
 * @param {string} opts.bank
 * @param {string} opts.name
 * @param {string} opts.dobDay
 * @param {string} opts.dobMonth
 * @param {string[]} opts.cardLast4s
 * @param {string} [opts.dobYear]
 * @returns {string[]}
 */
export function generatePasswords({ bank, name, dobDay, dobMonth, cardLast4s, dobYear }) {
  const passwords = [];
  const seen = new Set();

  function add(pwd) {
    if (pwd && !seen.has(pwd)) {
      seen.add(pwd);
      passwords.push(pwd);
    }
  }

  const name4 = (name || '').slice(0, 4);
  const firstName = (name || '').split(/\s+/)[0] || '';
  const dd = (dobDay || '').padStart(2, '0');
  const mm = (dobMonth || '').padStart(2, '0');
  const ddmm = dd + mm;
  const yyyy = dobYear || '';
  const yy = yyyy.length >= 2 ? yyyy.slice(-2) : '';
  const ddmmyyyy = ddmm + yyyy;
  const ddmmyy = ddmm + yy;

  const bankLower = (bank || '').toLowerCase();

  if (bankLower === 'hdfc') {
    const n4u = name4.toUpperCase();
    const fnu = firstName.toUpperCase();
    add(n4u + ddmm);
    for (const last4 of cardLast4s || []) {
      if (last4 && String(last4).length >= 4) add(n4u + String(last4).slice(-4));
    }
    add(fnu + ddmm);
    add(n4u + ddmmyy);
    add(n4u + ddmmyyyy);
    add(fnu + ddmmyy);
    add(fnu + ddmmyyyy);
    add(ddmmyyyy);
    add(ddmmyy);
    add(name4.toLowerCase() + ddmm);
    add(firstName.toLowerCase() + ddmm);
  } else if (bankLower === 'icici') {
    const n4l = name4.toLowerCase();
    const fnl = firstName.toLowerCase();
    add(n4l + ddmm);
    add(fnl + ddmm);
    add(n4l + ddmmyy);
    add(fnl + ddmmyy);
    add(n4l + ddmmyyyy);
    add(ddmmyyyy);
    add(name4.toUpperCase() + ddmm);
  } else if (bankLower === 'axis') {
    const n4u = name4.toUpperCase();
    const fnu = firstName.toUpperCase();
    add(n4u + ddmm);
    add(fnu + ddmm);
    add(n4u + ddmmyy);
    add(n4u + ddmmyyyy);
    add(ddmmyyyy);
    add(name4.toLowerCase() + ddmm);
  } else if (bankLower === 'federal') {
    const n4u = name4.toUpperCase();
    const n4l = name4.toLowerCase();
    const fnu = firstName.toUpperCase();
    const fnl = firstName.toLowerCase();
    add(n4u + ddmm);
    add(fnu + ddmm);
    add(n4u + ddmmyyyy);
    add(fnu + ddmmyyyy);
    add(n4l + ddmm);
    add(fnl + ddmm);
    add(ddmmyyyy);
    add(ddmmyy);
    for (const last4 of cardLast4s || []) {
      if (last4 && String(last4).length >= 4) {
        add(n4u + String(last4).slice(-4));
        add(n4l + String(last4).slice(-4));
      }
    }
  } else if (bankLower === 'indian_bank') {
    const n4u = name4.toUpperCase();
    const fnu = firstName.toUpperCase();
    add(n4u + ddmm);
    add(fnu + ddmm);
    add(n4u + ddmmyyyy);
    add(fnu + ddmmyyyy);
    add(n4u + ddmmyy);
    add(fnu + ddmmyy);
    add(ddmmyyyy);
    add(name4.toLowerCase() + ddmm);
    add(firstName.toLowerCase() + ddmm);
    for (const last4 of cardLast4s || []) {
      if (last4 && String(last4).length >= 4) add(n4u + String(last4).slice(-4));
    }
  } else {
    // Generic password patterns
    const n4u = name4.toUpperCase();
    const n4l = name4.toLowerCase();
    const fnu = firstName.toUpperCase();
    const fnl = firstName.toLowerCase();
    add(n4u + ddmm);
    add(n4l + ddmm);
    add(fnu + ddmm);
    add(fnl + ddmm);
    add(n4u + ddmmyyyy);
    add(n4l + ddmmyyyy);
    add(ddmmyyyy);
    add(ddmmyy);
    for (const last4 of cardLast4s || []) {
      if (last4 && String(last4).length >= 4) {
        add(n4u + String(last4).slice(-4));
        add(n4l + String(last4).slice(-4));
      }
    }
  }

  return passwords;
}

/**
 * Check if a PDF is encrypted.
 * @param {File|ArrayBuffer} input
 * @returns {Promise<boolean>}
 */
export async function isEncrypted(input) {
  return pdfIsEncrypted(input);
}

/**
 * Try to unlock a PDF with a list of passwords.
 * Returns the working password or null.
 * @param {File|ArrayBuffer} input
 * @param {string[]} passwords
 * @returns {Promise<string|null>}
 */
export async function findPassword(input, passwords) {
  return tryPasswords(input, passwords);
}
