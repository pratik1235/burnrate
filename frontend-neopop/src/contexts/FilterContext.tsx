import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

export type Direction = 'all' | 'incoming' | 'outgoing';
export type SourceFilter = 'all' | 'CC' | 'BANK';

export interface FilterState {
  selectedCards: string[];
  /** BANK account keys `bank:last4` from GET /transactions/bank-accounts */
  selectedBankAccounts: string[];
  selectedCategories: string[];
  selectedTags: string[];
  dateRange: { from?: string; to?: string };
  amountRange: { min?: number; max?: number };
  direction: Direction;
  source: SourceFilter;
}

export interface FilterContextValue {
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

const defaultState: FilterState = {
  selectedCards: [],
  selectedBankAccounts: [],
  selectedCategories: [],
  selectedTags: [],
  dateRange: {},
  amountRange: {},
  direction: 'all',
  source: 'all',
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<FilterState>(defaultState);

  const setFilters = useCallback((updates: Partial<FilterState>) => {
    setFiltersState((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(defaultState);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.selectedCards.length > 0 ||
      filters.selectedBankAccounts.length > 0 ||
      filters.selectedCategories.length > 0 ||
      filters.selectedTags.length > 0 ||
      !!filters.dateRange.from ||
      !!filters.dateRange.to ||
      filters.amountRange.min !== undefined ||
      filters.amountRange.max !== undefined ||
      filters.direction !== 'all' ||
      filters.source !== 'all'
    );
  }, [filters]);

  const value = useMemo<FilterContextValue>(
    () => ({
      filters,
      setFilters,
      clearFilters,
      hasActiveFilters,
    }),
    [filters, setFilters, clearFilters, hasActiveFilters]
  );

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return ctx;
}
