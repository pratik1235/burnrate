/**
 * Data export/import for backup and migration.
 */

import { db } from '../lib/db.js';

/**
 * Export all data from IndexedDB as a JSON object.
 * @returns {Promise<Object>}
 */
export async function exportAllData() {
  const [settings, cards, statements, transactions, transactionTags,
    categoryDefinitions, tagDefinitions] = await Promise.all([
    db.settings.toArray(),
    db.cards.toArray(),
    db.statements.toArray(),
    db.transactions.toArray(),
    db.transactionTags.toArray(),
    db.categoryDefinitions.toArray(),
    db.tagDefinitions.toArray(),
  ]);

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    data: {
      settings, cards, statements, transactions,
      transactionTags, categoryDefinitions, tagDefinitions,
    },
  };
}

/**
 * Download exported data as a JSON file.
 */
export async function downloadExport() {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `burnrate-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import data from a JSON file, replacing all existing data.
 * @param {File} file
 */
export async function importData(file) {
  const text = await file.text();
  const exported = JSON.parse(text);

  if (!exported?.data) throw new Error('Invalid backup file format');

  const d = exported.data;

  await db.transaction('rw',
    db.settings, db.cards, db.statements, db.transactions,
    db.transactionTags, db.categoryDefinitions, db.tagDefinitions,
    async () => {
      // Clear all tables
      await Promise.all([
        db.settings.clear(),
        db.cards.clear(),
        db.statements.clear(),
        db.transactions.clear(),
        db.transactionTags.clear(),
        db.categoryDefinitions.clear(),
        db.tagDefinitions.clear(),
      ]);

      // Bulk add
      if (d.settings?.length) await db.settings.bulkAdd(d.settings);
      if (d.cards?.length) await db.cards.bulkAdd(d.cards);
      if (d.statements?.length) await db.statements.bulkAdd(d.statements);
      if (d.transactions?.length) await db.transactions.bulkAdd(d.transactions);
      if (d.transactionTags?.length) await db.transactionTags.bulkAdd(d.transactionTags);
      if (d.categoryDefinitions?.length) await db.categoryDefinitions.bulkAdd(d.categoryDefinitions);
      if (d.tagDefinitions?.length) await db.tagDefinitions.bulkAdd(d.tagDefinitions);
    },
  );
}
