/**
 * Merchant categorizer based on keyword matching.
 * Port of backend/services/categorizer.py (34 lines)
 */

import { db } from '../lib/db.js';

/**
 * Categorize a merchant by name.
 * Checks custom categories first (is_prebuilt=0), then prebuilt.
 * @param {string} merchantName
 * @returns {Promise<string>} category slug, default 'other'
 */
export async function categorize(merchantName) {
  if (!merchantName) return 'other';
  const lower = merchantName.toLowerCase();

  // Custom categories first (is_prebuilt=0), then prebuilt (is_prebuilt=1)
  const allCats = await db.categoryDefinitions
    .orderBy('is_prebuilt')
    .toArray();

  for (const cat of allCats) {
    if (!cat.keywords) continue;
    const keywords = cat.keywords.toLowerCase().split(',');
    for (const keyword of keywords) {
      const kw = keyword.trim();
      if (kw && lower.includes(kw)) return cat.slug;
    }
  }

  return 'other';
}
