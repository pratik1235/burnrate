export type Bank = 'hdfc' | 'icici' | 'axis' | 'sbi' | 'amex' | 'idfc_first' | 'indusind' | 'kotak' | 'sc' | 'yes' | 'au' | 'rbl' | 'federal' | 'indian_bank';

export type Category = string;

export interface Card {
  id: string;
  bank: Bank;
  last4: string;
  name?: string;
}

export interface Transaction {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  type: 'debit' | 'credit';
  category: Category;
  cardId: string;
  bank: Bank;
  cardLast4: string;
  tags?: string[];
}

export interface Statement {
  id: string;
  bank: Bank;
  cardLast4: string;
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
  totalSpend: number;
  status: 'success' | 'parse_error';
  importedAt: string;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface MonthlyTrend {
  month: string;
  spend: number;
}

export interface MerchantSpend {
  merchant: string;
  amount: number;
  count: number;
}

export const BANK_CONFIG: Record<Bank, { name: string; color: string; logo: string }> = {
  hdfc: { name: 'HDFC Bank', color: '#004B87', logo: 'H' },
  icici: { name: 'ICICI Bank', color: '#F58220', logo: 'I' },
  axis: { name: 'Axis Bank', color: '#97144D', logo: 'A' },
  sbi: { name: 'SBI Card', color: '#1A4C8B', logo: 'S' },
  amex: { name: 'American Express', color: '#006FCF', logo: 'A' },
  idfc_first: { name: 'IDFC FIRST Bank', color: '#9C1D26', logo: 'I' },
  indusind: { name: 'IndusInd Bank', color: '#8B1A2B', logo: 'I' },
  kotak: { name: 'Kotak Mahindra Bank', color: '#ED1C24', logo: 'K' },
  sc: { name: 'Standard Chartered', color: '#0072AA', logo: 'S' },
  yes: { name: 'YES Bank', color: '#0061A8', logo: 'Y' },
  au: { name: 'AU Small Finance Bank', color: '#EC6608', logo: 'A' },
  rbl: { name: 'RBL Bank', color: '#21409A', logo: 'R' },
  federal: { name: 'Federal Bank', color: '#0066B3', logo: 'F' },
  indian_bank: { name: 'Indian Bank', color: '#2B2D8E', logo: 'I' },
};

export const CATEGORY_COLORS: Record<Category, string> = {
  food: '#F97316',
  shopping: '#8B5CF6',
  travel: '#3B82F6',
  bills: '#6B7280',
  entertainment: '#EC4899',
  fuel: '#EAB308',
  health: '#10B981',
  groceries: '#14B8A6',
  cc_payment: '#6B7280',
  cashback: '#000000',  // TODO: Add a proper color for cashback
  other: '#9CA3AF',
};

export const CATEGORY_CONFIG: Record<Category, { label: string; icon: string; color: string }> = {
  food: { label: 'Food & Dining', icon: 'UtensilsCrossed', color: CATEGORY_COLORS.food },
  shopping: { label: 'Shopping', icon: 'ShoppingBag', color: CATEGORY_COLORS.shopping },
  travel: { label: 'Travel', icon: 'Car', color: CATEGORY_COLORS.travel },
  bills: { label: 'Bills & Utilities', icon: 'Receipt', color: CATEGORY_COLORS.bills },
  entertainment: { label: 'Entertainment', icon: 'Film', color: CATEGORY_COLORS.entertainment },
  fuel: { label: 'Fuel', icon: 'Fuel', color: CATEGORY_COLORS.fuel },
  health: { label: 'Health', icon: 'Heart', color: CATEGORY_COLORS.health },
  groceries: { label: 'Groceries', icon: 'ShoppingCart', color: CATEGORY_COLORS.groceries },
  cc_payment: { label: 'CC Bill Payment', icon: 'CreditCard', color: CATEGORY_COLORS.cc_payment },
  cashback: { label: 'Cashback', icon: 'DollarSign', color: CATEGORY_COLORS.cashback }, // TODO: Add a proper icon for cashback
  other: { label: 'Other', icon: 'MoreHorizontal', color: CATEGORY_COLORS.other },
};
