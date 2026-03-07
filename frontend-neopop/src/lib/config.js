/**
 * Bank configurations and merchant category keyword mappings.
 * Port of backend/config.py
 */

/** Merchant category keyword mappings (~50 Indian merchants across 9 categories) */
export const MERCHANT_CATEGORIES = {
  food: [
    'swiggy', 'zomato', 'mcdonald', 'starbucks', 'restaurant', 'cafe',
    'dominos', 'kfc', 'subway', 'pizza hut', 'burger king', 'haldiram',
    'barbeque nation',
  ],
  shopping: [
    'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'tatacliq',
    'croma', 'reliance digital', 'infiniti retail', 'aptronix', 'indivinity',
  ],
  travel: [
    'uber', 'ola', 'makemytrip', 'irctc', 'cleartrip', 'goibibo',
    'airline', 'railway', 'indigo', 'air india', 'vistara',
    'yatra', 'agoda', 'ibibo', 'lounge',
  ],
  bills: [
    'jio', 'airtel', 'vi', 'bsnl', 'electricity', 'gas', 'insurance',
    'broadband', 'tata power', 'adani', 'bharti',
    'life insurance', 'lic',
  ],
  entertainment: [
    'netflix', 'spotify', 'hotstar', 'prime video', 'inox', 'pvr',
    'youtube', 'apple', 'google play', 'bundl',
  ],
  fuel: [
    'hp', 'bharat petroleum', 'iocl', 'shell', 'indian oil', 'bpcl',
    'hindustan petroleum',
  ],
  health: [
    'apollo', 'pharmeasy', '1mg', 'hospital', 'medplus', 'netmeds',
    'practo', 'lenskart',
  ],
  groceries: [
    'bigbasket', 'blinkit', 'zepto', 'dmart', 'jiomart',
    'swiggy instamart', 'instamart', 'nature basket', 'more',
  ],
  cc_payment: [
    'cc payment', 'cc pymt', 'bppy cc payment',
    'bbps payment', 'neft payment', 'imps payment',
  ],
};

/** All supported banks */
export const SUPPORTED_BANKS = [
  'hdfc', 'icici', 'axis', 'sbi', 'amex', 'idfc_first',
  'indusind', 'kotak', 'sc', 'yes', 'au', 'rbl',
  'federal', 'indian_bank',
];

/** Banks that have dedicated parsers */
export const PARSER_BANKS = ['hdfc', 'icici', 'axis', 'federal', 'indian_bank'];

/**
 * Google OAuth Client ID for Gmail API integration.
 * Set this to your own Client ID from Google Cloud Console.
 * Leave empty to hide the Gmail Import feature.
 */
export const GOOGLE_CLIENT_ID = '431071030375-14vh6g64oqufsa1jacr8usg4209ncltu.apps.googleusercontent.com';

/**
 * Bank email domain configurations for Gmail search.
 * Matches the Apps Script BANK_CONFIGS.
 */
export const BANK_EMAIL_CONFIGS = [
  { name: 'HDFC', domains: ['@hdfcbank.net'] },
  { name: 'ICICI', domains: ['@icicibank.com'] },
  { name: 'Axis', domains: ['@axisbank.com'] },
  { name: 'SBI', domains: ['@sbicard.com'] },
  { name: 'Amex', domains: ['@americanexpress.co.in', '@aexp.com'] },
  { name: 'IDFC_FIRST', domains: ['@idfcfirstbank.com'] },
  { name: 'IndusInd', domains: ['@indusind.com'] },
  { name: 'Kotak', domains: ['@kotak.com', '@kotakbank.com'] },
  { name: 'SC', domains: ['@sc.com'] },
  { name: 'YES', domains: ['@yesbank.in'] },
  { name: 'AU', domains: ['@aubank.in'] },
  { name: 'RBL', domains: ['@rblbank.com'] },
  { name: 'Federal', domains: ['@federalbank.co.in'] },
  { name: 'Indian_Bank', domains: ['@indianbank.co.in', '@indianbank.net.in'] },
];
