/**
 * IndexedDB database layer using Dexie.js.
 * Replaces backend/models/database.py + backend/models/models.py
 *
 * 8 object stores matching the existing SQLAlchemy models:
 *   settings, cards, statements, transactions,
 *   transactionTags, categoryDefinitions, tagDefinitions, processingLogs
 */

import Dexie from 'dexie';

/** @type {Dexie} */
export const db = new Dexie('burnrate');

db.version(1).stores({
  settings:
    '++id, name',
  cards:
    'id, bank, last4, [bank+last4]',
  statements:
    'id, bank, card_last4, period_start, period_end, file_hash, status, imported_at',
  transactions:
    'id, statement_id, date, merchant, amount, type, category, card_id, bank, card_last4, created_at',
  transactionTags:
    'id, transaction_id, tag',
  categoryDefinitions:
    'id, name, slug, is_prebuilt',
  tagDefinitions:
    'id, &name',
  processingLogs:
    'id, status, acknowledged, created_at',
});

// ── Helpers ──────────────────────────────────────────────────

export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Compute SHA-256 hex digest of a File or ArrayBuffer.
 * @param {File|ArrayBuffer} input
 * @returns {Promise<string>}
 */
export async function computeHash(input) {
  const buffer =
    input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Prebuilt categories seed ─────────────────────────────────

const PREBUILT_CATEGORIES = [
  { name: 'Food & Dining', slug: 'food', keywords: 'swiggy,zomato,mcdonald,starbucks,restaurant,cafe,dominos,kfc,subway,pizza hut,burger king,haldiram,barbeque nation', color: '#F97316', icon: 'UtensilsCrossed' },
  { name: 'Shopping', slug: 'shopping', keywords: 'amazon,flipkart,myntra,ajio,meesho,nykaa,tatacliq,croma,reliance digital,infiniti retail,aptronix,indivinity', color: '#8B5CF6', icon: 'ShoppingBag' },
  { name: 'Travel', slug: 'travel', keywords: 'uber,ola,makemytrip,irctc,cleartrip,goibibo,airline,railway,indigo,air india,vistara,yatra,agoda,ibibo,lounge', color: '#3B82F6', icon: 'Car' },
  { name: 'Bills & Utilities', slug: 'bills', keywords: 'jio,airtel,vodafone,bsnl,electricity,gas,insurance,broadband,tata power,adani,bharti,life insurance,lic', color: '#6B7280', icon: 'Receipt' },
  { name: 'Entertainment', slug: 'entertainment', keywords: 'netflix,spotify,hotstar,prime video,inox,pvr,youtube,apple,google play,bundl', color: '#EC4899', icon: 'Film' },
  { name: 'Fuel', slug: 'fuel', keywords: 'hp,bharat petroleum,iocl,shell,indian oil,bpcl,hindustan petroleum', color: '#EAB308', icon: 'Fuel' },
  { name: 'Health', slug: 'health', keywords: 'apollo,pharmeasy,1mg,hospital,medplus,netmeds,practo,lenskart', color: '#10B981', icon: 'Heart' },
  { name: 'Groceries', slug: 'groceries', keywords: 'bigbasket,blinkit,zepto,dmart,jiomart,swiggy instamart,instamart,nature basket,more', color: '#14B8A6', icon: 'ShoppingCart' },
  { name: 'CC Bill Payment', slug: 'cc_payment', keywords: 'cc payment,cc pymt,bppy cc payment,bbps payment,neft payment,imps payment,repayment,repayments,bbps,bill payment received', color: '#6B7280', icon: 'CreditCard' },
  { name: 'Other', slug: 'other', keywords: '', color: '#9CA3AF', icon: 'MoreHorizontal' },
];

/**
 * Seed prebuilt categories if not already present.
 * Called once on app startup.
 */
export async function seedCategories() {
  for (const cat of PREBUILT_CATEGORIES) {
    const existing = await db.categoryDefinitions
      .where('slug')
      .equals(cat.slug)
      .first();

    if (!existing) {
      await db.categoryDefinitions.add({
        id: generateUUID(),
        ...cat,
        is_prebuilt: 1,
        created_at: new Date().toISOString(),
      });
    } else if (existing.is_prebuilt && existing.keywords !== cat.keywords) {
      // Update keywords for prebuilt categories (matches Python seed logic)
      await db.categoryDefinitions.update(existing.id, {
        keywords: cat.keywords,
      });
    }
  }
}

/**
 * Initialize the database — seed categories.
 */
export async function initDb() {
  await seedCategories();
}
