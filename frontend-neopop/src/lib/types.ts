export type Bank = 'hdfc' | 'icici' | 'axis' | 'sbi' | 'amex' | 'idfc_first' | 'indusind' | 'kotak' | 'sc' | 'yes' | 'au' | 'rbl' | 'federal' | 'indian_bank';

export type Source = 'CC' | 'BANK';

export type Category = string;

export interface Card {
  id: string;
  bank: Bank;
  last4: string;
  name?: string;
  manualNextDueDate?: string | null;
  manualNextDueAmount?: number | null;
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
  source: Source;
  /** ISO 4217 (e.g. INR, USD) */
  currency?: string;
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
  /** ISO 4217 */
  currency?: string;
  /** ISO date from statement PDF when parsed */
  paymentDueDate?: string | null;
  source: Source;
  status: 'success' | 'parse_error' | 'password_needed';
  importedAt: string;
  /** Stored path on the server (full path). */
  filePath?: string | null;
  fileName?: string | null;
  /** Path for UI (client/original path for manual uploads; watch path otherwise). */
  displayPath?: string | null;
  /** Client filesystem path from manual upload only; null for folder watcher imports. */
  originalUploadPath?: string | null;
  /** Persisted parse failure text when status is parse_error. */
  statusMessage?: string | null;
  /** 1 when the file could not be parsed (same as status parse_error); from API for filtering. */
  parseFailed?: number;
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
  cashback: '#06C270',
  other: '#9CA3AF',
};

// ---------------------------------------------------------------------------
// Offers & Milestones
// ---------------------------------------------------------------------------

export interface Offer {
  id: string;
  title: string;
  description?: string;
  merchant?: string;
  discountText?: string;
  offerType?: string;
  bank?: string;
  cardTemplateId?: string;
  network?: string;
  minTransaction?: number;
  maxDiscount?: number;
  validFrom?: string;
  validUntil?: string;
  isExpired: boolean;
  category?: string;
  source: string;
  sourceUrl?: string;
  isUserCreated: boolean;
  isHidden: boolean;
  applicableCards: string[];
  fetchedAt?: string;
  createdAt?: string;
}

export interface OfferSyncStatus {
  providers: {
    provider: string;
    lastSyncAt: string | null;
    lastStatus: string | null;
    offersFetched: number;
    errorMessage: string | null;
  }[];
}

export interface Milestone {
  id: string;
  cardId: string;
  definitionId?: string;
  title: string;
  milestoneType: string;
  targetAmount: number;
  periodKind: string;
  periodConfig?: string;
  rewardDescription?: string;
  categoryFilter?: string;
  excludeCategories?: string;
  isAutoCreated: boolean;
  isArchived: boolean;
  isCustom: boolean;
  bank?: string;
  cardLast4?: string;
  // Progress fields
  currentAmount: number;
  percent: number;
  remaining: number;
  periodStart?: string;
  periodEnd?: string;
  daysLeft: number;
}

export interface MilestoneDefinition {
  id: string;
  source: string;
  cardTemplateId?: string;
  bank?: string;
  title: string;
  description?: string;
  milestoneType: string;
  targetAmount: number;
  periodKind: string;
  rewardDescription?: string;
  rewardValue?: number;
}

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
  cashback: { label: 'Cashback', icon: 'Coins', color: CATEGORY_COLORS.cashback },
  other: { label: 'Other', icon: 'MoreHorizontal', color: CATEGORY_COLORS.other },
};
