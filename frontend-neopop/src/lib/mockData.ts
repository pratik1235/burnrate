import type {
  Bank,
  Card,
  Category,
  CategoryBreakdown,
  MerchantSpend,
  MonthlyTrend,
  Transaction,
} from '@/lib/types';

export const MOCK_CARDS: Card[] = [
  { id: 'card-1', bank: 'hdfc', last4: '4521', name: 'Regalia' },
  { id: 'card-2', bank: 'icici', last4: '7890', name: 'Amazon Pay' },
  { id: 'card-3', bank: 'axis', last4: '3344', name: 'Vistara' },
];

const MERCHANTS: { name: string; category: Category }[] = [
  { name: 'Swiggy', category: 'food' },
  { name: 'Zomato', category: 'food' },
  { name: 'Amazon', category: 'shopping' },
  { name: 'Flipkart', category: 'shopping' },
  { name: 'Myntra', category: 'shopping' },
  { name: 'IRCTC', category: 'travel' },
  { name: 'Uber', category: 'travel' },
  { name: 'Ola', category: 'travel' },
  { name: 'Airtel', category: 'bills' },
  { name: 'Jio', category: 'bills' },
  { name: 'Electricity Board', category: 'bills' },
  { name: 'Netflix', category: 'entertainment' },
  { name: 'Spotify', category: 'entertainment' },
  { name: 'BookMyShow', category: 'entertainment' },
  { name: 'Indian Oil', category: 'fuel' },
  { name: 'HP Petrol', category: 'fuel' },
  { name: 'Apollo Pharmacy', category: 'health' },
  { name: '1mg', category: 'health' },
  { name: 'BigBasket', category: 'groceries' },
  { name: 'DMart', category: 'groceries' },
  { name: 'Blinkit', category: 'groceries' },
  { name: 'Dunzo', category: 'groceries' },
  { name: 'Starbucks', category: 'food' },
  { name: 'Chaayos', category: 'food' },
  { name: 'Domino\'s', category: 'food' },
  { name: 'McDonald\'s', category: 'food' },
  { name: 'Cafe Coffee Day', category: 'food' },
  { name: 'MakeMyTrip', category: 'travel' },
  { name: 'Goibibo', category: 'travel' },
  { name: 'Google Play', category: 'entertainment' },
  { name: 'Apple', category: 'shopping' },
  { name: 'LIC', category: 'bills' },
  { name: 'GPay Transfer', category: 'other' },
];

function randomDate(start: Date, end: Date): string {
  const d = new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
  return d.toISOString().split('T')[0]!;
}

function randomAmount(category: Category): number {
  const ranges: Record<Category, [number, number]> = {
    food: [80, 1200],
    shopping: [500, 15000],
    travel: [200, 8000],
    bills: [500, 5000],
    entertainment: [199, 1500],
    fuel: [1500, 5000],
    health: [200, 3000],
    groceries: [300, 5000],
    other: [50, 2000],
  };
  const [min, max] = ranges[category];
  return Math.round(min + Math.random() * (max - min));
}

export function generateMockTransactions(count: number): Transaction[] {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const transactions: Transaction[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < count; i++) {
    const merchant = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)]!;
    const card = MOCK_CARDS[Math.floor(Math.random() * MOCK_CARDS.length)]!;
    const date = randomDate(sixMonthsAgo, now);
    const amount = randomAmount(merchant.category);
    const id = `txn-${date}-${i}-${Math.random().toString(36).slice(2, 9)}`;

    if (usedIds.has(id)) continue;
    usedIds.add(id);

    transactions.push({
      id,
      date,
      merchant: merchant.name,
      amount,
      type: Math.random() > 0.95 ? 'credit' : 'debit',
      category: merchant.category,
      cardId: card.id,
      bank: card.bank,
      cardLast4: card.last4,
      source: 'CC',
    });
  }

  return transactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export const MOCK_TRANSACTIONS = generateMockTransactions(55);

export function getMockCategoryBreakdown(
  transactions: Transaction[] = MOCK_TRANSACTIONS
): CategoryBreakdown[] {
  const byCategory = new Map<Category, { amount: number; count: number }>();
  const categories: Category[] = [
    'food',
    'shopping',
    'travel',
    'bills',
    'entertainment',
    'fuel',
    'health',
    'groceries',
    'other',
  ];

  for (const cat of categories) {
    byCategory.set(cat, { amount: 0, count: 0 });
  }

  for (const t of transactions) {
    if (t.type === 'debit') {
      const curr = byCategory.get(t.category)!;
      curr.amount += t.amount;
      curr.count += 1;
    }
  }

  const total = [...byCategory.values()].reduce((s, v) => s + v.amount, 0);
  return [...byCategory.entries()]
    .filter(([, v]) => v.amount > 0)
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      percentage: total > 0 ? (amount / total) * 100 : 0,
      count,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function getMockMonthlyTrends(
  transactions: Transaction[] = MOCK_TRANSACTIONS
): MonthlyTrend[] {
  const byMonth = new Map<string, number>();

  for (const t of transactions) {
    if (t.type === 'debit') {
      const month = t.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + t.amount);
    }
  }

  const months = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6);

  return months.map(([month, spend]) => ({
    month: new Date(month + '-01').toLocaleDateString('en-IN', {
      month: 'short',
      year: '2-digit',
    }),
    spend,
  }));
}

export function getMockTopMerchants(
  transactions: Transaction[] = MOCK_TRANSACTIONS,
  limit = 5
): MerchantSpend[] {
  const byMerchant = new Map<string, { amount: number; count: number }>();

  for (const t of transactions) {
    if (t.type === 'debit') {
      const curr = byMerchant.get(t.merchant) ?? { amount: 0, count: 0 };
      curr.amount += t.amount;
      curr.count += 1;
      byMerchant.set(t.merchant, curr);
    }
  }

  return [...byMerchant.entries()]
    .map(([merchant, { amount, count }]) => ({ merchant, amount, count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function getMockCardSpend(
  transactions: Transaction[] = MOCK_TRANSACTIONS
): { bank: Bank; last4: string; amount: number }[] {
  const byCard = new Map<string, { bank: Bank; last4: string; amount: number }>();

  for (const t of transactions) {
    if (t.type === 'debit') {
      const key = `${t.bank}-${t.cardLast4}`;
      const curr = byCard.get(key) ?? {
        bank: t.bank,
        last4: t.cardLast4,
        amount: 0,
      };
      curr.amount += t.amount;
      byCard.set(key, curr);
    }
  }

  return [...byCard.values()].sort((a, b) => b.amount - a.amount);
}

export function getMockSummary(
  transactions: Transaction[] = MOCK_TRANSACTIONS
): {
  totalSpend: number;
  deltaPercent: number;
  period: string;
  sparklineData: { value: number }[];
} {
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const thisMonthSpend = transactions
    .filter((t) => {
      const d = new Date(t.date);
      return t.type === 'debit' && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((s, t) => s + t.amount, 0);

  const lastMonthSpend = transactions
    .filter((t) => {
      const d = new Date(t.date);
      return t.type === 'debit' && d.getMonth() === lastMonth && d.getFullYear() === lastYear;
    })
    .reduce((s, t) => s + t.amount, 0);

  const deltaPercent =
    lastMonthSpend > 0
      ? Math.round(((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100)
      : 0;

  const trends = getMockMonthlyTrends(transactions);
  const sparklineData = trends.map((t) => ({ value: t.spend }));

  return {
    totalSpend: thisMonthSpend || 45000,
    deltaPercent: deltaPercent || 12,
    period: 'This month',
    sparklineData: sparklineData.length > 0 ? sparklineData : [{ value: 35000 }, { value: 42000 }, { value: 38000 }, { value: 45000 }],
  };
}
