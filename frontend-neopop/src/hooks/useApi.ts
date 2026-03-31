import { useEffect, useState, useCallback, useRef } from 'react';
import type { Category } from '@/lib/types';
import {
  getSettings,
  setupProfile,
  getTransactions as apiGetTransactions,
  getCards as apiGetCards,
  getSummary,
  getCategories,
  getTrends,
  getMerchants,
  getProcessingLogs,
  acknowledgeProcessingLog,
  type Settings,
  type SetupProfilePayload,
  type GetTransactionsParams,
  type GetSummaryResponse,
  type CategoryBlockByCurrency,
  type TrendsBlockByCurrency,
  type MerchantsBlockByCurrency,
} from '@/lib/api';

export function useSettings(): {
  settings: Settings | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSettings();
      setSettings(result);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getSettings();
        if (!cancelled) setSettings(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setSettings(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { settings, loading, error, refetch };
}

export async function submitSetup(data: SetupProfilePayload): Promise<Settings> {
  return await setupProfile(data);
}

export interface TransactionFilters {
  card?: string;
  cards?: string;
  bankAccounts?: string;
  from?: string;
  to?: string;
  category?: Category;
  search?: string;
  tags?: string;
  direction?: string;
  source?: string;
  amountMin?: number;
  amountMax?: number;
  limit?: number;
  offset?: number;
}

const EMPTY_SUMMARY: GetSummaryResponse = {
  totalSpend: 0,
  deltaPercent: 0,
  period: 'This month',
  sparklineData: [{ value: 0 }],
  mixedCurrency: false,
};

function isUsableSummary(res: GetSummaryResponse | null | undefined): boolean {
  if (!res) return false;
  if (res.mixedCurrency) return true;
  return typeof res.totalSpend === 'number';
}

export function useTransactions(filters: TransactionFilters = {}) {
  const [transactions, setTransactions] = useState<import('@/lib/types').Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState<number | null>(0);
  const [totalsByCurrency, setTotalsByCurrency] = useState<{ currency: string; amount: number }[]>([]);
  const [mixedCurrency, setMixedCurrency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: GetTransactionsParams = {
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      };
      if (filters.cards) params.cards = filters.cards;
      else if (filters.card) params.card = filters.card;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.category) params.category = filters.category;
      if (filters.search) params.search = filters.search;
      if (filters.tags) params.tags = filters.tags;
      if (filters.direction) params.direction = filters.direction;
      if (filters.source) params.source = filters.source;
      if (filters.bankAccounts) params.bank_accounts = filters.bankAccounts;
      if (filters.amountMin !== undefined) params.amount_min = filters.amountMin;
      if (filters.amountMax !== undefined) params.amount_max = filters.amountMax;

      const result = await apiGetTransactions(params);
      setTransactions(Array.isArray(result?.transactions) ? result.transactions : []);
      setTotal(typeof result?.total === 'number' ? result.total : 0);
      const ta = result?.totalAmount;
      setTotalAmount(typeof ta === 'number' ? ta : ta === null ? null : 0);
      setTotalsByCurrency(Array.isArray(result?.totalsByCurrency) ? result.totalsByCurrency : []);
      setMixedCurrency(!!result?.mixedCurrency);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setTransactions([]);
      setTotal(0);
      setTotalAmount(0);
      setTotalsByCurrency([]);
      setMixedCurrency(false);
    } finally {
      setLoading(false);
    }
  }, [
    filters.card,
    filters.cards,
    filters.from,
    filters.to,
    filters.category,
    filters.search,
    filters.tags,
    filters.direction,
    filters.source,
    filters.bankAccounts,
    filters.amountMin,
    filters.amountMax,
    filters.limit,
    filters.offset,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params: GetTransactionsParams = {
          limit: filters.limit ?? 50,
          offset: filters.offset ?? 0,
        };
        if (filters.cards) params.cards = filters.cards;
        else if (filters.card) params.card = filters.card;
        if (filters.from) params.from = filters.from;
        if (filters.to) params.to = filters.to;
        if (filters.category) params.category = filters.category;
        if (filters.search) params.search = filters.search;
        if (filters.tags) params.tags = filters.tags;
        if (filters.direction) params.direction = filters.direction;
        if (filters.source) params.source = filters.source;
        if (filters.bankAccounts) params.bank_accounts = filters.bankAccounts;
        if (filters.amountMin !== undefined) params.amount_min = filters.amountMin;
        if (filters.amountMax !== undefined) params.amount_max = filters.amountMax;
        const result = await apiGetTransactions(params);
        if (!cancelled) {
          setTransactions(Array.isArray(result?.transactions) ? result.transactions : []);
          setTotal(typeof result?.total === 'number' ? result.total : 0);
          const ta = result?.totalAmount;
          setTotalAmount(typeof ta === 'number' ? ta : ta === null ? null : 0);
          setTotalsByCurrency(Array.isArray(result?.totalsByCurrency) ? result.totalsByCurrency : []);
          setMixedCurrency(!!result?.mixedCurrency);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setTransactions([]);
          setTotal(0);
          setTotalAmount(0);
          setTotalsByCurrency([]);
          setMixedCurrency(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    filters.card,
    filters.cards,
    filters.from,
    filters.to,
    filters.category,
    filters.search,
    filters.tags,
    filters.direction,
    filters.source,
    filters.bankAccounts,
    filters.amountMin,
    filters.amountMax,
    filters.limit,
    filters.offset,
  ]);

  return { transactions, total, totalAmount, totalsByCurrency, mixedCurrency, loading, error, refetch };
}

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  cards?: string;
  categories?: string;
  tags?: string;
  direction?: string;
  amountMin?: number;
  amountMax?: number;
  source?: string;
  bankAccounts?: string;
}

export function useAnalytics(filters: AnalyticsFilters = {}) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [categories, setCategories] = useState<import('@/lib/types').CategoryBreakdown[]>([]);
  const [categoriesByCurrency, setCategoriesByCurrency] = useState<CategoryBlockByCurrency[]>([]);
  const [trends, setTrends] = useState<import('@/lib/types').MonthlyTrend[]>([]);
  const [trendsByCurrency, setTrendsByCurrency] = useState<TrendsBlockByCurrency[]>([]);
  const [merchants, setMerchants] = useState<import('@/lib/types').MerchantSpend[]>([]);
  const [merchantsByCurrency, setMerchantsByCurrency] = useState<MerchantsBlockByCurrency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.cards ? { cards: filters.cards } : {}),
        ...(filters.categories ? { categories: filters.categories } : {}),
        ...(filters.tags ? { tags: filters.tags } : {}),
        ...(filters.direction ? { direction: filters.direction } : {}),
        ...(filters.amountMin !== undefined ? { amount_min: filters.amountMin } : {}),
        ...(filters.amountMax !== undefined ? { amount_max: filters.amountMax } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.bankAccounts ? { bank_accounts: filters.bankAccounts } : {}),
      };
      const hasParams = Object.keys(params).length > 0;
      const apiParams = hasParams ? params : undefined;
      const [summaryRes, categoriesRes, trendsRes, merchantsRes] =
        await Promise.all([
          getSummary(apiParams),
          getCategories(apiParams),
          getTrends(apiParams),
          getMerchants(apiParams),
        ]);
      setSummary(isUsableSummary(summaryRes) ? summaryRes! : EMPTY_SUMMARY);
      if (categoriesRes?.mixedCurrency && categoriesRes.byCurrency?.length) {
        setCategories([]);
        setCategoriesByCurrency(categoriesRes.byCurrency);
      } else {
        setCategories(Array.isArray(categoriesRes?.breakdown) ? categoriesRes.breakdown : []);
        setCategoriesByCurrency([]);
      }
      if (trendsRes?.mixedCurrency && trendsRes.trendsByCurrency?.length) {
        setTrends([]);
        setTrendsByCurrency(trendsRes.trendsByCurrency);
      } else {
        setTrends(Array.isArray(trendsRes?.trends) ? trendsRes.trends : []);
        setTrendsByCurrency([]);
      }
      if (merchantsRes?.mixedCurrency && merchantsRes.merchantsByCurrency?.length) {
        setMerchants([]);
        setMerchantsByCurrency(merchantsRes.merchantsByCurrency);
      } else {
        setMerchants(Array.isArray(merchantsRes?.merchants) ? merchantsRes.merchants : []);
        setMerchantsByCurrency([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setSummary(EMPTY_SUMMARY);
      setCategories([]);
      setCategoriesByCurrency([]);
      setTrends([]);
      setTrendsByCurrency([]);
      setMerchants([]);
      setMerchantsByCurrency([]);
    } finally {
      setLoading(false);
    }
  }, [
    filters.from,
    filters.to,
    filters.cards,
    filters.categories,
    filters.tags,
    filters.direction,
    filters.amountMin,
    filters.amountMax,
    filters.source,
    filters.bankAccounts,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
          ...(filters.cards ? { cards: filters.cards } : {}),
          ...(filters.categories ? { categories: filters.categories } : {}),
          ...(filters.tags ? { tags: filters.tags } : {}),
          ...(filters.direction ? { direction: filters.direction } : {}),
          ...(filters.amountMin !== undefined ? { amount_min: filters.amountMin } : {}),
          ...(filters.amountMax !== undefined ? { amount_max: filters.amountMax } : {}),
          ...(filters.source ? { source: filters.source } : {}),
          ...(filters.bankAccounts ? { bank_accounts: filters.bankAccounts } : {}),
        };
        const hasParams = Object.keys(params).length > 0;
        const apiParams = hasParams ? params : undefined;
        const [summaryRes, categoriesRes, trendsRes, merchantsRes] =
          await Promise.all([
            getSummary(apiParams),
            getCategories(apiParams),
            getTrends(apiParams),
            getMerchants(apiParams),
          ]);
        if (!cancelled) {
          setSummary(isUsableSummary(summaryRes) ? summaryRes! : EMPTY_SUMMARY);
          if (categoriesRes?.mixedCurrency && categoriesRes.byCurrency?.length) {
            setCategories([]);
            setCategoriesByCurrency(categoriesRes.byCurrency);
          } else {
            setCategories(Array.isArray(categoriesRes?.breakdown) ? categoriesRes.breakdown : []);
            setCategoriesByCurrency([]);
          }
          if (trendsRes?.mixedCurrency && trendsRes.trendsByCurrency?.length) {
            setTrends([]);
            setTrendsByCurrency(trendsRes.trendsByCurrency);
          } else {
            setTrends(Array.isArray(trendsRes?.trends) ? trendsRes.trends : []);
            setTrendsByCurrency([]);
          }
          if (merchantsRes?.mixedCurrency && merchantsRes.merchantsByCurrency?.length) {
            setMerchants([]);
            setMerchantsByCurrency(merchantsRes.merchantsByCurrency);
          } else {
            setMerchants(Array.isArray(merchantsRes?.merchants) ? merchantsRes.merchants : []);
            setMerchantsByCurrency([]);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setSummary(EMPTY_SUMMARY);
          setCategories([]);
          setCategoriesByCurrency([]);
          setTrends([]);
          setTrendsByCurrency([]);
          setMerchants([]);
          setMerchantsByCurrency([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    filters.from,
    filters.to,
    filters.cards,
    filters.categories,
    filters.tags,
    filters.direction,
    filters.amountMin,
    filters.amountMax,
    filters.source,
    filters.bankAccounts,
  ]);

  return {
    summary,
    categories,
    categoriesByCurrency,
    trends,
    trendsByCurrency,
    merchants,
    merchantsByCurrency,
    loading,
    error,
    refetch,
  };
}

export function useCards() {
  const [cards, setCards] = useState<import('@/lib/types').Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGetCards();
      setCards(Array.isArray(result) ? result : []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiGetCards();
        if (!cancelled) setCards(Array.isArray(result) ? result : []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setCards([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { cards, loading, error, refetch };
}


/**
 * Poll the backend every `intervalMs` for unread processing logs.
 * Calls `onLog` for each new log entry so the caller can show toasts.
 */
export function useProcessingLogPoller(
  onLog: (log: { id: string; status: string; fileName: string; message: string | null; transactionCount: number }) => void,
  intervalMs = 60_000,
) {
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const logs = await getProcessingLogs();
        for (const log of logs) {
          if (!seenRef.current.has(log.id)) {
            seenRef.current.add(log.id);
            if (active) onLog(log);
            acknowledgeProcessingLog(log.id).catch(() => {});
          }
        }
      } catch {
        // Silently ignore polling failures
      }
    }

    poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [onLog, intervalMs]);
}
