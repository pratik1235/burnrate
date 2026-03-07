/**
 * Statement processing orchestrator.
 * Port of backend/services/statement_processor.py (375 lines)
 *
 * Flow: SHA-256 hash → dedup → detect bank → PDF unlock → parse → categorize → persist
 */

import { db, generateUUID, computeHash } from '../lib/db.js';
import { SUPPORTED_BANKS } from '../lib/config.js';
import { extractPagesDetailed } from '../parsers/pdfService.js';
import { detectBank } from '../parsers/detector.js';
import { parseHDFC } from '../parsers/hdfc.js';
import { parseICICI } from '../parsers/icici.js';
import { parseAxis } from '../parsers/axis.js';
import { parseFederal } from '../parsers/federal.js';
import { parseIndianBank } from '../parsers/indianBank.js';
import { parseGeneric } from '../parsers/generic.js';
import { generatePasswords, isEncrypted, findPassword } from './pdfUnlock.js';
import { categorize } from './categorizer.js';

const PARSERS = {
  hdfc: parseHDFC,
  icici: parseICICI,
  axis: parseAxis,
  federal: parseFederal,
  indian_bank: parseIndianBank,
};

/**
 * Process a statement PDF file.
 * @param {File} file
 * @param {string} [bank]
 * @param {string} [manualPassword]
 * @returns {Promise<{status: string, message?: string, count: number, period?: object, bank?: string}>}
 */
export async function processStatement(file, bank, manualPassword) {
  try {
    // Compute file hash for dedup
    const fileBuffer = await file.arrayBuffer();
    const fileHash = await computeHash(fileBuffer);

    // Check for duplicate
    const existing = await db.statements
      .where('file_hash')
      .equals(fileHash)
      .first();
    if (existing) {
      return {
        status: 'duplicate',
        message: 'Statement already imported',
        count: 0,
        period: null,
        bank: null,
      };
    }

    // Try to detect bank from filename
    if (!bank) {
      bank = detectBank(file.name);
    }

    // Get user profile for password generation
    const settings = await db.settings.toCollection().first();
    const cards = await db.cards.toArray();
    const bankCards = bank ? cards.filter((c) => c.bank.toLowerCase() === bank.toLowerCase()) : cards;
    const cardLast4s = bankCards.map((c) => c.last4);

    // Handle encryption
    let workingPassword = null;
    const encrypted = await isEncrypted(fileBuffer);

    if (encrypted && manualPassword) {
      workingPassword = await findPassword(fileBuffer, [manualPassword]);
      if (!workingPassword) {
        return { status: 'error', message: 'Could not unlock PDF with provided password', count: 0 };
      }
    } else if (encrypted && settings) {
      if (bank) {
        const passwords = generatePasswords({
          bank,
          name: settings.name || '',
          dobDay: settings.dob_day || '',
          dobMonth: settings.dob_month || '',
          cardLast4s,
          dobYear: settings.dob_year || '',
        });
        workingPassword = await findPassword(fileBuffer, passwords);
        if (!workingPassword) {
          return { status: 'error', message: 'Could not unlock PDF - wrong password', count: 0 };
        }
      } else {
        // Try every bank's passwords
        for (const tryBank of SUPPORTED_BANKS) {
          const tryCards = cards.filter((c) => c.bank.toLowerCase() === tryBank);
          const tryLast4s = tryCards.map((c) => c.last4);
          const passwords = generatePasswords({
            bank: tryBank,
            name: settings.name || '',
            dobDay: settings.dob_day || '',
            dobMonth: settings.dob_month || '',
            cardLast4s: tryLast4s,
            dobYear: settings.dob_year || '',
          });
          workingPassword = await findPassword(fileBuffer, passwords);
          if (workingPassword) {
            bank = tryBank;
            break;
          }
        }
        if (!workingPassword) {
          return { status: 'error', message: 'Could not unlock PDF - tried all bank password formats', count: 0 };
        }
      }
    }

    // Extract PDF text
    let extracted;
    try {
      extracted = await extractPagesDetailed(fileBuffer, workingPassword);
    } catch (err) {
      if (err?.name === 'PasswordException') {
        return { status: 'error', message: 'PDF is encrypted and could not be opened', count: 0 };
      }
      throw err;
    }

    // Detect bank from PDF text if not yet known
    if (!bank && extracted.pages.length > 0) {
      bank = detectBank(file.name, extracted.pages[0]);
    }

    if (!bank) {
      return { status: 'error', message: 'Could not detect bank', count: 0 };
    }

    // Check registered cards
    const registeredCards = await db.cards.where('bank').equals(bank).toArray();
    if (!registeredCards.length) {
      return {
        status: 'card_not_found',
        message: `No ${bank.toUpperCase()} cards have been added yet. Add your card in Settings to process these statements.`,
        count: 0, period: null, bank, card_last4: null,
      };
    }

    // Parse using appropriate parser
    let parsed;
    const parserFn = PARSERS[bank];
    if (parserFn) {
      if (bank === 'hdfc') {
        parsed = parserFn(extracted.allLines, extracted.pages[0] || '', extracted.fullText);
      } else {
        parsed = parserFn(extracted.allLines, extracted.fullText);
      }
    } else {
      parsed = parseGeneric(bank, extracted.allLines, extracted.fullText);
    }

    // Resolve card
    let cardLast4 = parsed.card_last4;
    let cardId = null;

    if (cardLast4) {
      const card = registeredCards.find((c) => c.last4 === cardLast4);
      if (card) {
        cardId = card.id;
      } else {
        return {
          status: 'card_not_found',
          message: `Statement belongs to ${bank.toUpperCase()} card ending ...${cardLast4} which has not been added yet. Add this card in Settings.`,
          count: 0, period: null, bank, card_last4: cardLast4,
        };
      }
    } else if (registeredCards.length === 1) {
      cardLast4 = registeredCards[0].last4;
      cardId = registeredCards[0].id;
    } else {
      return {
        status: 'card_not_found',
        message: `Could not determine which ${bank.toUpperCase()} card this statement belongs to. Multiple cards are registered for this bank.`,
        count: 0, period: null, bank, card_last4: null,
      };
    }

    // Detect parse error
    const isParseError = parsed.transactions.length === 0 && !parsed.period_start && !parsed.period_end;

    if (isParseError) {
      const stmtId = generateUUID();
      await db.statements.add({
        id: stmtId, bank, card_last4: cardLast4,
        period_start: null, period_end: null,
        file_hash: fileHash, file_path: null,
        transaction_count: 0, total_spend: 0,
        total_amount_due: parsed.total_amount_due,
        credit_limit: parsed.credit_limit,
        status: 'parse_error',
        imported_at: new Date().toISOString(),
      });
      return {
        status: 'parse_error',
        message: `Could not extract transactions from this ${bank.toUpperCase()} statement. The PDF format may not be supported yet.`,
        count: 0, period: null, bank,
      };
    }

    // Compute total spend (sum of debits)
    const totalSpend = parsed.transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    // Create Statement record
    const stmtId = generateUUID();
    await db.statements.add({
      id: stmtId, bank, card_last4: cardLast4,
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      file_hash: fileHash, file_path: null,
      transaction_count: parsed.transactions.length,
      total_spend: Math.round(totalSpend * 100) / 100,
      total_amount_due: parsed.total_amount_due,
      credit_limit: parsed.credit_limit,
      status: 'success',
      imported_at: new Date().toISOString(),
    });

    // Categorize and insert transactions
    const txRecords = [];
    for (const pt of parsed.transactions) {
      const category = await categorize(pt.merchant);
      txRecords.push({
        id: generateUUID(),
        statement_id: stmtId,
        date: pt.date,
        merchant: pt.merchant,
        amount: pt.amount,
        type: pt.type,
        category,
        description: pt.description,
        bank,
        card_last4: cardLast4,
        card_id: cardId,
        created_at: new Date().toISOString(),
      });
    }
    await db.transactions.bulkAdd(txRecords);

    return {
      status: 'success',
      count: parsed.transactions.length,
      period: {
        start: parsed.period_start,
        end: parsed.period_end,
      },
      bank,
    };
  } catch (err) {
    console.error('Statement processing failed:', err);
    return {
      status: 'error',
      message: 'An internal error occurred while processing the statement',
      count: 0, period: null, bank,
    };
  }
}
