import React, { useEffect, useMemo, useRef, useState } from 'react';
// Passcode gate helpers
const getStoredPasscode = () => {
  try {
    return localStorage.getItem('divitrack_passcode') || '';
  } catch {
    return '';
  }
};

const setStoredPasscode = (val: string) => {
  try {
    localStorage.setItem('divitrack_passcode', val);
  } catch {}
};

import {
  ArrowRightLeft,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  DollarSign,
  History,
  PieChart as PieChartIcon,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BrokerAccount,
  ChartData,
  Dividend,
  DividendMonthData,
  PortfolioState,
  Purchase,
  Stock,
} from './types.ts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const ACCOUNT_COLOR_OPTIONS = ['#6366f1', '#10b981', '#0f766e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#0ea5e9'];
const BROKER_INSTITUTIONS = ['Fidelity', 'Robinhood', 'Charles Schwab', 'Vanguard', 'Interactive Brokers', 'ETRADE', 'Webull', 'M1 Finance', 'Custom'];
const ACCOUNT_TYPES = ['Taxable', 'Roth IRA', 'Traditional IRA', '401(k)', 'Cash', 'HSA', '529', 'Trust', 'Other'];
const ALL_ACCOUNTS_ID = 'all-accounts';
const LEGACY_ACCOUNT_ID = 'default-account';

const generateId = () => Math.random().toString(36).slice(2, 11);

const createDefaultAccount = (): BrokerAccount => ({
  id: LEGACY_ACCOUNT_ID,
  institution: 'Custom',
  type: 'Taxable',
  color: '#6366f1',
  nickname: 'Primary Account',
});

const createEmptyPortfolio = (): PortfolioState => ({
  brokerAccounts: [createDefaultAccount()],
  stocks: [],
  dividends: [],
});

const createBlankPurchaseForm = (accountId: string) => ({
  ticker: '',
  shares: 0,
  price: 0,
  date: new Date().toISOString().split('T')[0],
  accountId,
});

const createBlankDividendForm = (stockId = '') => ({
  stockId,
  amount: 0,
  date: new Date().toISOString().split('T')[0],
  reinvested: false,
  sharePrice: 0,
  sharesBought: 0,
});

const createBlankAccountForm = () => ({
  institution: 'Fidelity',
  customInstitution: '',
  type: 'Taxable',
  color: ACCOUNT_COLOR_OPTIONS[0],
  nickname: '',
});

const getAccountDisplayName = (account: BrokerAccount) => account.nickname || `${account.institution} ${account.type}`;

const formatCurrency = (amount: number, minimumFractionDigits = 2) =>
  `$${amount.toLocaleString(undefined, { minimumFractionDigits, maximumFractionDigits: minimumFractionDigits })}`;

const normalizePortfolioData = (payload: any): PortfolioState => {
  const brokerAccounts: BrokerAccount[] = Array.isArray(payload?.brokerAccounts) && payload.brokerAccounts.length > 0
    ? payload.brokerAccounts.map((account: any, index: number) => ({
        id: account?.id || generateId(),
        institution: account?.institution || 'Custom',
        type: account?.type || 'Taxable',
        color: account?.color || ACCOUNT_COLOR_OPTIONS[index % ACCOUNT_COLOR_OPTIONS.length],
        nickname: account?.nickname || `${account?.institution || 'Broker'} ${account?.type || 'Account'}`,
      }))
    : [createDefaultAccount()];

  const fallbackAccountId = brokerAccounts[0]?.id || LEGACY_ACCOUNT_ID;
  const accountIds = new Set(brokerAccounts.map(account => account.id));

  const stocks: Stock[] = Array.isArray(payload?.stocks)
    ? payload.stocks.map((stock: any) => ({
        id: stock?.id || generateId(),
        ticker: (stock?.ticker || '').toUpperCase(),
        accountId: accountIds.has(stock?.accountId) ? stock.accountId : fallbackAccountId,
        purchases: Array.isArray(stock?.purchases) ? stock.purchases : [],
        currentPrice: typeof stock?.currentPrice === 'number' ? stock.currentPrice : undefined,
      }))
    : [];

  const stockAccountMap = new Map(stocks.map(stock => [stock.id, stock.accountId]));

  const dividends: Dividend[] = Array.isArray(payload?.dividends)
    ? payload.dividends.map((dividend: any) => ({
        id: dividend?.id || generateId(),
        stockId: dividend?.stockId || '',
        accountId: accountIds.has(dividend?.accountId)
          ? dividend.accountId
          : stockAccountMap.get(dividend?.stockId) || fallbackAccountId,
        ticker: (dividend?.ticker || '').toUpperCase(),
        amount: Number(dividend?.amount || 0),
        date: dividend?.date || new Date().toISOString().split('T')[0],
        reinvested: Boolean(dividend?.reinvested),
        linkedPurchaseId: dividend?.linkedPurchaseId,
      }))
    : [];

  return { brokerAccounts, stocks, dividends };
};

const moveStockToAccount = (
  stocks: Stock[],
  dividends: Dividend[],
  stockId: string,
  targetAccountId: string
) => {
  const movingStock = stocks.find(stock => stock.id === stockId);
  if (!movingStock) {
    return { stocks, dividends };
  }

  const existingTargetStock = stocks.find(
    stock => stock.id !== stockId && stock.accountId === targetAccountId && stock.ticker === movingStock.ticker
  );

  if (!existingTargetStock) {
    return {
      stocks: stocks.map(stock => (
        stock.id === stockId ? { ...stock, accountId: targetAccountId } : stock
      )),
      dividends: dividends.map(dividend => (
        dividend.stockId === stockId ? { ...dividend, accountId: targetAccountId } : dividend
      )),
    };
  }

  return {
    stocks: stocks
      .map(stock => {
        if (stock.id === existingTargetStock.id) {
          return {
            ...stock,
            purchases: [...stock.purchases, ...movingStock.purchases],
            currentPrice: stock.currentPrice || movingStock.currentPrice,
          };
        }

        return stock;
      })
      .filter(stock => stock.id !== stockId),
    dividends: dividends.map(dividend => (
      dividend.stockId === stockId
        ? { ...dividend, stockId: existingTargetStock.id, accountId: targetAccountId }
        : dividend
    )),
  };
};

const reassignAccountHoldings = (
  stocks: Stock[],
  dividends: Dividend[],
  fromAccountId: string,
  targetAccountId: string
) => {
  const stockIdsToMove = stocks.filter(stock => stock.accountId === fromAccountId).map(stock => stock.id);

  return stockIdsToMove.reduce(
    (current, stockId) => moveStockToAccount(current.stocks, current.dividends, stockId, targetAccountId),
    { stocks, dividends }
  );
};

const App: React.FC = () => {
  const [passcode, setPasscode] = useState(getStoredPasscode());
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const publicPasscode = (import.meta.env.VITE_PUBLIC_PASSCODE || '').toString().trim();

  useEffect(() => {
    if (passcode && passcode === publicPasscode) {
      setStoredPasscode(passcode);
    }
  }, [passcode, publicPasscode]);

  const [portfolio, setPortfolio] = useState<PortfolioState>(createEmptyPortfolio());
  const [activeAccountId, setActiveAccountId] = useState<string>(ALL_ACCOUNTS_ID);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading');

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isDivModalOpen, setIsDivModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isManageAccountsOpen, setIsManageAccountsOpen] = useState(false);
  const [expandedStockId, setExpandedStockId] = useState<string | null>(null);

  const [newPurchase, setNewPurchase] = useState(createBlankPurchaseForm(LEGACY_ACCOUNT_ID));
  const [newDiv, setNewDiv] = useState(createBlankDividendForm());
  const [newAccount, setNewAccount] = useState(createBlankAccountForm());
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState<{
    accountId: string;
    mode: 'reassign' | 'delete';
    reassignToId: string;
  } | null>(null);
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});
  const [allocationMode, setAllocationMode] = useState<'stock' | 'broker'>('stock');

  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!passcode || passcode.trim() !== publicPasscode) return;

      try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setPortfolio(normalizePortfolioData(data));
        setSyncStatus('saved');
      } catch (err) {
        console.error('Initial load error:', err);
        setSyncStatus('error');
      } finally {
        setIsInitialLoad(false);
      }
    };

    fetchData();
  }, [passcode, publicPasscode]);

  useEffect(() => {
    if (isInitialLoad) return;
    if (!passcode || passcode.trim() !== publicPasscode) return;

    setSyncStatus('saving');
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(portfolio),
        });
        if (!response.ok) throw new Error('Save failed');
        setSyncStatus('saved');
      } catch (err) {
        console.error('Save error:', err);
        setSyncStatus('error');
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [portfolio, isInitialLoad, passcode, publicPasscode]);

  useEffect(() => {
    if (!passcode || passcode.trim() !== publicPasscode) return;
    if (portfolio.stocks.length === 0) return;

    const fetchPrices = async () => {
      try {
        const tickers = Array.from(new Set(portfolio.stocks.map(stock => stock.ticker))).join(',');
        if (!tickers) return;

        const response = await fetch(`/api/price?tickers=${tickers}`);
        if (!response.ok) return;

        const prices = await response.json();

        setPortfolio(prev => ({
          ...prev,
          stocks: prev.stocks.map(stock => ({
            ...stock,
            currentPrice: prices[stock.ticker] || stock.currentPrice,
          })),
        }));
      } catch (err) {
        console.error('Price fetch error:', err);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 300000);
    return () => clearInterval(interval);
  }, [portfolio.stocks.map(stock => stock.ticker).sort().join(','), passcode, publicPasscode]);

  useEffect(() => {
    if (activeAccountId !== ALL_ACCOUNTS_ID && !portfolio.brokerAccounts.some(account => account.id === activeAccountId)) {
      setActiveAccountId(ALL_ACCOUNTS_ID);
    }
  }, [activeAccountId, portfolio.brokerAccounts]);

  const accountMap = useMemo(
    () => new Map(portfolio.brokerAccounts.map(account => [account.id, account])),
    [portfolio.brokerAccounts]
  );

  const selectedAccount = activeAccountId === ALL_ACCOUNTS_ID
    ? null
    : portfolio.brokerAccounts.find(account => account.id === activeAccountId) || null;

  const visibleStocks = useMemo(
    () => activeAccountId === ALL_ACCOUNTS_ID
      ? portfolio.stocks
      : portfolio.stocks.filter(stock => stock.accountId === activeAccountId),
    [activeAccountId, portfolio.stocks]
  );

  const visibleDividends = useMemo(
    () => activeAccountId === ALL_ACCOUNTS_ID
      ? portfolio.dividends
      : portfolio.dividends.filter(dividend => dividend.accountId === activeAccountId),
    [activeAccountId, portfolio.dividends]
  );

  const dividendStockOptions = useMemo(
    () => visibleStocks.slice().sort((left, right) => left.ticker.localeCompare(right.ticker)),
    [visibleStocks]
  );

  function getAnnualYoC(stock: Stock, dividends: Dividend[]) {
    const years = Array.from(new Set([
      ...stock.purchases.map(purchase => new Date(purchase.date).getFullYear()),
      ...dividends.filter(dividend => dividend.stockId === stock.id).map(dividend => new Date(dividend.date).getFullYear()),
    ])).sort();

    if (years.length === 0) return [];

    const minYear = Math.min(...years);
    const maxYear = new Date().getFullYear();
    const result = [];

    for (let year = minYear; year <= maxYear; year += 1) {
      const invested = stock.purchases
        .filter(purchase => (!purchase.type || purchase.type === 'buy') && new Date(purchase.date).getFullYear() <= year)
        .reduce((sum, purchase) => sum + purchase.shares * purchase.price, 0);

      const yearDividends = dividends
        .filter(dividend => dividend.stockId === stock.id && new Date(dividend.date).getFullYear() === year)
        .reduce((sum, dividend) => sum + dividend.amount, 0);

      const cumulativeDividends = dividends
        .filter(dividend => dividend.stockId === stock.id && new Date(dividend.date).getFullYear() <= year)
        .reduce((sum, dividend) => sum + dividend.amount, 0);

      result.push({
        year,
        invested,
        divs: yearDividends,
        cumDivs: cumulativeDividends,
        yoc: invested > 0 ? (cumulativeDividends / invested) * 100 : 0,
        yocYear: invested > 0 ? (yearDividends / invested) * 100 : 0,
      });
    }

    return result;
  }

  const stockStats = useMemo(() => (
    visibleStocks.map(stock => {
      const totalShares = stock.purchases.reduce((sum, purchase) => sum + purchase.shares, 0);
      const totalCost = stock.purchases.reduce((sum, purchase) => sum + purchase.shares * purchase.price, 0);
      const investedCapital = stock.purchases
        .filter(purchase => !purchase.type || purchase.type === 'buy')
        .reduce((sum, purchase) => sum + purchase.shares * purchase.price, 0);
      const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
      const stockDividends = visibleDividends
        .filter(dividend => dividend.stockId === stock.id)
        .reduce((sum, dividend) => sum + dividend.amount, 0);
      const annualYoC = getAnnualYoC(stock, visibleDividends);
      const marketValue = stock.currentPrice ? totalShares * stock.currentPrice : totalCost;
      const gainLoss = marketValue - totalCost;
      const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;
      const account = accountMap.get(stock.accountId) || null;

      return {
        ...stock,
        account,
        totalShares,
        totalCost,
        investedCapital,
        avgPrice,
        stockDividends,
        annualYoC,
        marketValue,
        gainLoss,
        gainLossPercent,
        yieldOnCost: investedCapital > 0 ? (stockDividends / investedCapital) * 100 : 0,
      };
    })
  ), [accountMap, visibleDividends, visibleStocks]);

  const totalPortfolioValue = useMemo(
    () => stockStats.reduce((sum, stock) => sum + stock.marketValue, 0),
    [stockStats]
  );

  const totalInvestedCapital = useMemo(
    () => stockStats.reduce((sum, stock) => sum + stock.investedCapital, 0),
    [stockStats]
  );

  const totalDividends = useMemo(
    () => visibleDividends.reduce((sum, dividend) => sum + dividend.amount, 0),
    [visibleDividends]
  );

  const stockAllocationData: ChartData[] = useMemo(() => (
    stockStats.map(stock => ({
      name: selectedAccount || !stock.account ? stock.ticker : `${stock.ticker} (${getAccountDisplayName(stock.account)})`,
      value: stock.marketValue,
    }))
  ), [selectedAccount, stockStats]);

  const monthlyDividendData: DividendMonthData[] = useMemo(() => {
    const months: Record<string, number> = {};
    visibleDividends.forEach(dividend => {
      const month = dividend.date.substring(0, 7);
      months[month] = (months[month] || 0) + dividend.amount;
    });

    return Object.entries(months)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([month, amount]) => ({ month, amount }));
  }, [visibleDividends]);

  const recentDividends = useMemo(() => (
    visibleDividends
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 8)
  ), [visibleDividends]);

  const totalPayouts = visibleDividends.length;

  const accountSummaries = useMemo(() => (
    portfolio.brokerAccounts.map(account => {
      const stocks = portfolio.stocks.filter(stock => stock.accountId === account.id);
      const dividends = portfolio.dividends.filter(dividend => dividend.accountId === account.id);
      const marketValue = stocks.reduce((sum, stock) => {
        const shares = stock.purchases.reduce((shareSum, purchase) => shareSum + purchase.shares, 0);
        const cost = stock.purchases.reduce((costSum, purchase) => costSum + purchase.shares * purchase.price, 0);
        return sum + (stock.currentPrice ? shares * stock.currentPrice : cost);
      }, 0);
      const investedCapital = stocks.reduce((sum, stock) => (
        sum + stock.purchases
          .filter(purchase => !purchase.type || purchase.type === 'buy')
          .reduce((purchaseSum, purchase) => purchaseSum + purchase.shares * purchase.price, 0)
      ), 0);
      const totalDividendsForAccount = dividends.reduce((sum, dividend) => sum + dividend.amount, 0);

      return {
        account,
        positions: stocks.length,
        marketValue,
        investedCapital,
        totalDividends: totalDividendsForAccount,
        yieldOnCost: investedCapital > 0 ? (totalDividendsForAccount / investedCapital) * 100 : 0,
      };
    })
  ), [portfolio.brokerAccounts, portfolio.dividends, portfolio.stocks]);

  const totalAccountMarketValue = useMemo(
    () => accountSummaries.reduce((sum, summary) => sum + summary.marketValue, 0),
    [accountSummaries]
  );

  const brokerAllocationData: ChartData[] = useMemo(() => {
    const source = selectedAccount
      ? accountSummaries.filter(summary => summary.account.id === selectedAccount.id)
      : accountSummaries;

    return source.map(summary => ({
      name: getAccountDisplayName(summary.account),
      value: summary.marketValue,
    }));
  }, [accountSummaries, selectedAccount]);

  const allocationData = allocationMode === 'broker' ? brokerAllocationData : stockAllocationData;

  const heroTitle = selectedAccount ? getAccountDisplayName(selectedAccount) : 'Consolidated Portfolio';
  const heroSubtitle = selectedAccount
    ? `${selectedAccount.institution} ${selectedAccount.type} dividend holdings and account-level income.`
    : 'Aggregated view of all your brokerage holdings, dividends, and asset allocations in one place.';

  const openPurchaseModal = () => {
    const defaultAccountId = activeAccountId === ALL_ACCOUNTS_ID
      ? portfolio.brokerAccounts[0]?.id || LEGACY_ACCOUNT_ID
      : activeAccountId;
    setNewPurchase(createBlankPurchaseForm(defaultAccountId));
    setIsStockModalOpen(true);
  };

  const openDividendModal = () => {
    const defaultStock = dividendStockOptions[0]?.id || '';
    setNewDiv(createBlankDividendForm(defaultStock));
    setIsDivModalOpen(true);
  };

  const handleAddPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPurchase.ticker || newPurchase.shares <= 0 || !newPurchase.accountId) return;

    const tickerUpper = newPurchase.ticker.toUpperCase();
    const existingStockIndex = portfolio.stocks.findIndex(
      stock => stock.ticker === tickerUpper && stock.accountId === newPurchase.accountId
    );

    const purchase: Purchase = {
      id: generateId(),
      shares: Number(newPurchase.shares),
      price: Number(newPurchase.price),
      date: newPurchase.date,
      type: 'buy',
    };

    const newStocks = [...portfolio.stocks];
    if (existingStockIndex >= 0) {
      newStocks[existingStockIndex] = {
        ...newStocks[existingStockIndex],
        purchases: [...newStocks[existingStockIndex].purchases, purchase],
      };
    } else {
      newStocks.push({
        id: generateId(),
        ticker: tickerUpper,
        accountId: newPurchase.accountId,
        purchases: [purchase],
      });
    }

    setPortfolio(prev => ({ ...prev, stocks: newStocks }));
    setIsStockModalOpen(false);
    setNewPurchase(createBlankPurchaseForm(newPurchase.accountId));
  };

  const handleAddDividend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiv.stockId || newDiv.amount <= 0) return;

    const selectedStockRecord = portfolio.stocks.find(stock => stock.id === newDiv.stockId);
    if (!selectedStockRecord) return;

    let linkedPurchaseId: string | undefined;
    const newStocks = [...portfolio.stocks];

    if (newDiv.reinvested && newDiv.sharesBought > 0 && newDiv.sharePrice > 0) {
      linkedPurchaseId = generateId();
      const purchase: Purchase = {
        id: linkedPurchaseId,
        shares: Number(newDiv.sharesBought),
        price: Number(newDiv.sharePrice),
        date: newDiv.date,
        type: 'drip',
      };

      const stockIndex = newStocks.findIndex(stock => stock.id === newDiv.stockId);
      if (stockIndex >= 0) {
        newStocks[stockIndex] = {
          ...newStocks[stockIndex],
          purchases: [...newStocks[stockIndex].purchases, purchase],
        };
      }
    }

    const dividend: Dividend = {
      id: generateId(),
      stockId: newDiv.stockId,
      accountId: selectedStockRecord.accountId,
      ticker: selectedStockRecord.ticker,
      amount: Number(newDiv.amount),
      date: newDiv.date,
      reinvested: newDiv.reinvested,
      linkedPurchaseId,
    };

    setPortfolio(prev => ({
      ...prev,
      stocks: newStocks,
      dividends: [...prev.dividends, dividend],
    }));
    setIsDivModalOpen(false);
    setNewDiv(createBlankDividendForm());
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();

    const institution = newAccount.institution === 'Custom'
      ? newAccount.customInstitution.trim()
      : newAccount.institution;

    if (!institution || !newAccount.nickname.trim()) return;

    const brokerAccount: BrokerAccount = {
      id: generateId(),
      institution,
      type: newAccount.type,
      color: newAccount.color,
      nickname: newAccount.nickname.trim(),
    };

    setPortfolio(prev => ({
      ...prev,
      brokerAccounts: [...prev.brokerAccounts, brokerAccount],
    }));
    setActiveAccountId(brokerAccount.id);
    setIsAccountModalOpen(false);
    setNewAccount(createBlankAccountForm());
  };

  const updateBrokerAccount = (accountId: string, updates: Partial<BrokerAccount>) => {
    setPortfolio(prev => ({
      ...prev,
      brokerAccounts: prev.brokerAccounts.map(account => (
        account.id === accountId ? { ...account, ...updates } : account
      )),
    }));
  };

  const deleteStock = (stockId: string) => {
    if (!window.confirm('Are you sure you want to delete this position and all its history?')) return;

    setPortfolio(prev => ({
      ...prev,
      stocks: prev.stocks.filter(stock => stock.id !== stockId),
      dividends: prev.dividends.filter(dividend => dividend.stockId !== stockId),
    }));
    setExpandedStockId(current => (current === stockId ? null : current));
  };

  const deletePurchase = (stockId: string, purchaseId: string) => {
    setPortfolio(prev => {
      const updatedStocks = prev.stocks
        .map(stock => (
          stock.id === stockId
            ? { ...stock, purchases: stock.purchases.filter(purchase => purchase.id !== purchaseId) }
            : stock
        ))
        .filter(stock => stock.purchases.length > 0);

      const stockStillExists = updatedStocks.some(stock => stock.id === stockId);
      const updatedDividends = stockStillExists
        ? prev.dividends.filter(dividend => dividend.linkedPurchaseId !== purchaseId)
        : prev.dividends.filter(dividend => dividend.stockId !== stockId && dividend.linkedPurchaseId !== purchaseId);

      return {
        ...prev,
        stocks: updatedStocks,
        dividends: updatedDividends,
      };
    });
  };

  const transferHolding = (stockId: string) => {
    const targetAccountId = transferTargets[stockId];
    if (!targetAccountId) return;

    setPortfolio(prev => {
      const moved = moveStockToAccount(prev.stocks, prev.dividends, stockId, targetAccountId);
      return {
        ...prev,
        stocks: moved.stocks,
        dividends: moved.dividends,
      };
    });
    setTransferTargets(prev => {
      const next = { ...prev };
      delete next[stockId];
      return next;
    });
  };

  const confirmDeleteAccount = () => {
    if (!pendingDeleteAccount) return;
    if (portfolio.brokerAccounts.length <= 1) return;

    const { accountId, mode, reassignToId } = pendingDeleteAccount;
    if (mode === 'reassign' && !reassignToId) return;

    setPortfolio(prev => {
      const reassigned = mode === 'reassign'
        ? reassignAccountHoldings(prev.stocks, prev.dividends, accountId, reassignToId)
        : {
            stocks: prev.stocks.filter(stock => stock.accountId !== accountId),
            dividends: prev.dividends.filter(dividend => dividend.accountId !== accountId),
          };

      return {
        ...prev,
        brokerAccounts: prev.brokerAccounts.filter(account => account.id !== accountId),
        stocks: reassigned.stocks,
        dividends: reassigned.dividends,
      };
    });

    if (activeAccountId === accountId) {
      setActiveAccountId(ALL_ACCOUNTS_ID);
    }
    setPendingDeleteAccount(null);
  };

  if (!passcode || passcode.trim() !== publicPasscode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-xs w-full flex flex-col items-center">
          <h2 className="text-xl font-bold mb-4 text-indigo-700">Enter Access Passcode</h2>
          <input
            type="password"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 mb-3 text-center text-lg"
            placeholder="Passcode"
            value={passcodeInput}
            onChange={e => {
              setPasscodeInput(e.target.value);
              setPasscodeError('');
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (passcodeInput.trim() === publicPasscode) {
                  setPasscode(passcodeInput.trim());
                  setPasscodeError('');
                } else {
                  setPasscodeError('Incorrect passcode');
                }
              }
            }}
            autoFocus
          />
          <button
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm mt-2 hover:bg-indigo-700 transition-all"
            onClick={() => {
              if (passcodeInput.trim() === publicPasscode) {
                setPasscode(passcodeInput.trim());
                setPasscodeError('');
              } else {
                setPasscodeError('Incorrect passcode');
              }
            }}
          >
            Access
          </button>
          {passcodeError && <div className="text-red-500 text-xs mt-2">{passcodeError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] pb-12 text-slate-900">
      <nav className="bg-[linear-gradient(90deg,#5142da_0%,#4f46e5_50%,#4c3fcf_100%)] text-white shadow-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/12 border border-white/15 flex items-center justify-center shadow-inner">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-white">DiviTrack Pro</h1>
                <span className="px-2 py-0.5 rounded-full bg-white/12 border border-white/10 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-100">
                  Multi-Broker
                </span>
              </div>
              <p className="text-xs text-indigo-100/80 font-semibold">Dividend &amp; Portfolio Tracking</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-start xl:justify-end">
            <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] flex items-center transition-colors ${
              syncStatus === 'saved'
                ? 'bg-white/12 text-white'
                : syncStatus === 'saving' || syncStatus === 'loading'
                  ? 'bg-white/16 text-white'
                  : 'bg-red-500 text-white'
            }`}>
              {(syncStatus === 'loading' || syncStatus === 'saving') && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              {syncStatus === 'saved' && <Cloud className="h-3 w-3 mr-1" />}
              {syncStatus === 'error' && <CloudOff className="h-3 w-3 mr-1" />}
              {syncStatus}
            </div>
            <button
              disabled={syncStatus === 'loading'}
              onClick={openPurchaseModal}
              className="bg-white text-indigo-700 px-4 py-2.5 rounded-full font-black text-sm flex items-center shadow-sm hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-50"
            >
              <Plus className="h-4 w-4 mr-2" /> ADD BUY
            </button>
            <button
              disabled={syncStatus === 'loading' || dividendStockOptions.length === 0}
              onClick={openDividendModal}
              className="bg-emerald-500 text-white px-4 py-2.5 rounded-full font-black text-sm flex items-center shadow-sm hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50"
            >
              <DollarSign className="h-4 w-4 mr-2" /> LOG DIV
            </button>
          </div>
        </div>
      </nav>

      {syncStatus === 'loading' && isInitialLoad ? (
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <RefreshCw className="h-12 w-12 text-indigo-500 animate-spin mb-4" />
          <p className="text-slate-400 font-medium">Connecting to your portfolio...</p>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-3 sm:px-6 mt-4 animate-in fade-in duration-700 space-y-5">
          <section className="bg-white/90 backdrop-blur rounded-[24px] border border-slate-200 px-4 py-3 shadow-sm overflow-hidden">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] font-black text-slate-400 shrink-0">Brokers:</p>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 min-w-0">
                  <button
                    onClick={() => setActiveAccountId(ALL_ACCOUNTS_ID)}
                    className={`shrink-0 rounded-2xl px-4 py-2.5 border flex items-center gap-3 transition-all ${
                      activeAccountId === ALL_ACCOUNTS_ID
                        ? 'bg-[linear-gradient(135deg,#5b4ff0_0%,#4f46e5_100%)] border-indigo-500 text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className={`h-3.5 w-3.5 ${activeAccountId === ALL_ACCOUNTS_ID ? 'text-indigo-100' : 'text-slate-400'}`} />
                      <span className="font-black text-sm">All Accounts</span>
                    </div>
                    <span className={`text-xs font-black px-2 py-1 rounded-xl ${activeAccountId === ALL_ACCOUNTS_ID ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {formatCurrency(totalAccountMarketValue, 0)}
                    </span>
                  </button>

                  {accountSummaries.map(summary => (
                    <button
                      key={summary.account.id}
                      onClick={() => setActiveAccountId(summary.account.id)}
                      className={`shrink-0 rounded-2xl px-4 py-2.5 border flex items-center gap-3 transition-all ${
                        activeAccountId === summary.account.id
                          ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: summary.account.color }} />
                      <div className="text-left min-w-0">
                        <p className={`font-black text-sm truncate max-w-40 ${activeAccountId === summary.account.id ? 'text-white' : 'text-slate-800'}`}>
                          {getAccountDisplayName(summary.account)}
                        </p>
                      </div>
                      <span className={`text-xs font-black px-2 py-1 rounded-xl ${activeAccountId === summary.account.id ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {formatCurrency(summary.marketValue, 0)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  disabled={syncStatus === 'loading'}
                  onClick={() => setIsAccountModalOpen(true)}
                  className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-4 py-2.5 rounded-2xl font-black text-sm flex items-center hover:bg-indigo-100 transition-all disabled:opacity-50"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Broker
                </button>
                <button
                  disabled={syncStatus === 'loading'}
                  onClick={() => setIsManageAccountsOpen(true)}
                  className="bg-white text-slate-700 border border-slate-200 px-4 py-2.5 rounded-2xl font-black text-sm flex items-center hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  <Settings2 className="h-4 w-4 mr-2" /> Manage
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] bg-[radial-gradient(circle_at_top_left,#1f2f5f_0%,#111a37_55%,#0c132b_100%)] text-white px-6 py-6 shadow-[0_20px_50px_rgba(17,24,39,0.18)]">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="text-3xl font-black tracking-tight">{heroTitle}</h2>
                  <span className="rounded-full bg-indigo-400/20 text-indigo-100 border border-indigo-300/20 px-3 py-1 text-xs font-black">
                    {portfolio.brokerAccounts.length} Broker Accounts
                  </span>
                </div>
                <p className="text-sm text-slate-300 max-w-2xl">{heroSubtitle}</p>
              </div>

              <div className="grid grid-cols-2 gap-6 lg:gap-10">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Yield on Cost</p>
                  <p className="text-3xl font-black text-emerald-300">
                    {totalInvestedCapital > 0 ? ((totalDividends / totalInvestedCapital) * 100).toFixed(2) : '0.00'}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Total Dividends</p>
                  <p className="text-3xl font-black text-white">{formatCurrency(totalDividends)}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white px-5 py-5 rounded-[24px] shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2">Total Portfolio Value</p>
                  <p className="text-[2rem] leading-none font-black text-slate-900">{formatCurrency(totalPortfolioValue)}</p>
                  <p className="text-xs text-slate-400 mt-3">All combined broker balances</p>
                </div>
                <div className="h-9 w-9 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center"><TrendingUp className="h-4 w-4" /></div>
              </div>
            </div>
            <div className="bg-white px-5 py-5 rounded-[24px] shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2">Total Dividends</p>
                  <p className="text-[2rem] leading-none font-black text-emerald-500">{formatCurrency(totalDividends)}</p>
                  <p className="text-xs text-slate-400 mt-3">Cumulative payouts received</p>
                </div>
                <div className="h-9 w-9 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center"><DollarSign className="h-4 w-4" /></div>
              </div>
            </div>
            <div className="bg-white px-5 py-5 rounded-[24px] shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2">Yield on Cost</p>
                  <p className="text-[2rem] leading-none font-black text-indigo-600">
                    {totalInvestedCapital > 0 ? ((totalDividends / totalInvestedCapital) * 100).toFixed(2) : '0.00'}%
                  </p>
                  <p className="text-xs text-slate-400 mt-3">Dividend yield relative to cost basis</p>
                </div>
                <div className="h-9 w-9 rounded-2xl bg-violet-50 text-violet-500 flex items-center justify-center"><PieChartIcon className="h-4 w-4" /></div>
              </div>
            </div>
            <div className="bg-white px-5 py-5 rounded-[24px] shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em] mb-2">Active Holdings</p>
                  <p className="text-[2rem] leading-none font-black text-slate-900">{stockStats.length}</p>
                  <p className="text-xs text-slate-400 mt-3">Across {selectedAccount ? getAccountDisplayName(selectedAccount) : 'all broker accounts'}</p>
                </div>
                <div className="h-9 w-9 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center"><Building2 className="h-4 w-4" /></div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-[26px] shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                <PieChartIcon className="h-5 w-5 mr-2 text-indigo-500" />
                Capital Allocation
              </h2>
              <div className="flex items-center gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setAllocationMode('stock')}
                  className={`px-3 py-1.5 rounded-full text-xs font-black transition-colors ${allocationMode === 'stock' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  By Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAllocationMode('broker')}
                  className={`px-3 py-1.5 rounded-full text-xs font-black transition-colors ${allocationMode === 'broker' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  By Broker
                </button>
              </div>
              <div className="h-64">
                {allocationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={84}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {allocationData.map((entry, index) => (
                          <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <p className="italic">No allocations found</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-[26px] shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6 gap-3">
                <h2 className="text-lg font-bold text-slate-800 flex items-center">
                  <History className="h-5 w-5 mr-2 text-indigo-500" />
                  Dividend Income History
                </h2>
                <span className="text-xs font-black text-slate-300">{totalPayouts} payouts</span>
              </div>
              <div className="h-64">
                {monthlyDividendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyDividendData} barCategoryGap="20%">
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value: number) => `$${value.toFixed(2)}`} />
                      <Bar dataKey="amount" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <p className="italic">No income logged yet</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={`grid gap-4 ${activeAccountId === ALL_ACCOUNTS_ID ? 'xl:grid-cols-[1.95fr_0.95fr]' : 'grid-cols-1'}`}>
            <div className="bg-white rounded-[26px] shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center">
                <div>
                  <h2 className="text-2xl font-black text-slate-800">{selectedAccount ? `${getAccountDisplayName(selectedAccount)} Holdings` : 'All Holdings'}</h2>
                  <p className="text-sm text-slate-400">
                    {selectedAccount
                      ? `View of holdings and income for ${getAccountDisplayName(selectedAccount)}.`
                      : 'Consolidated view across all broker accounts.'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-slate-400 text-xs font-black uppercase tracking-[0.18em]">
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 normal-case tracking-normal text-sm font-bold">{stockStats.length} Holdings</span>
                  <div className="flex items-center"><Calendar className="h-3 w-3 mr-1" /> {new Date().toLocaleDateString()}</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] font-black uppercase tracking-[0.16em]">
                    <tr>
                      <th className="px-6 py-4 w-10"></th>
                      <th className="px-6 py-4">Asset</th>
                      {!selectedAccount && <th className="px-6 py-4">Broker Account</th>}
                      <th className="px-6 py-4 text-right">Shares</th>
                      <th className="px-6 py-4 text-right">Avg Cost</th>
                      <th className="px-6 py-4 text-right">Total Invested</th>
                      <th className="px-6 py-4 text-right">Yield on Cost</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stockStats.length > 0 ? stockStats.map(stock => (
                      <React.Fragment key={stock.id}>
                        <tr
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedStockId === stock.id ? 'bg-indigo-50/30' : ''}`}
                          onClick={() => setExpandedStockId(expandedStockId === stock.id ? null : stock.id)}
                        >
                          <td className="px-6 py-5">
                            {expandedStockId === stock.id
                              ? <ChevronDown className="h-4 w-4 text-indigo-500" />
                              : <ChevronRight className="h-4 w-4 text-slate-300" />}
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-1">
                              <span className="font-black text-slate-900 text-base">{stock.ticker}</span>
                              <span className="text-[10px] text-indigo-500 font-black uppercase tracking-[0.16em]">{stock.purchases.length} buys</span>
                            </div>
                          </td>
                          {!selectedAccount && (
                            <td className="px-6 py-5">
                              {stock.account && (
                                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: `${stock.account.color}16`, color: stock.account.color }}>
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stock.account.color }} />
                                  {getAccountDisplayName(stock.account)}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-5 text-right font-semibold text-slate-700">{stock.totalShares.toFixed(2)}</td>
                          <td className="px-6 py-5 text-right font-semibold text-slate-600">${stock.avgPrice.toFixed(2)}</td>
                          <td className="px-6 py-5 text-right font-black text-slate-900">{formatCurrency(stock.investedCapital)}</td>
                          <td className="px-6 py-5 text-right">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black ${stock.yieldOnCost > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {stock.yieldOnCost.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                deleteStock(stock.id);
                              }}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                        {expandedStockId === stock.id && (
                          <tr>
                            <td colSpan={selectedAccount ? 7 : 8} className="px-6 py-4 bg-slate-50/50">
                              <div className="pl-10 space-y-5">
                                {portfolio.brokerAccounts.length > 1 && (
                                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                      <div>
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Holding Transfer</h4>
                                        <p className="text-sm text-slate-500">Move this holding and all purchase history to another broker account.</p>
                                      </div>
                                      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                                        <select
                                          value={transferTargets[stock.id] || ''}
                                          onChange={e => setTransferTargets(prev => ({ ...prev, [stock.id]: e.target.value }))}
                                          className="px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900 text-sm min-w-56"
                                        >
                                          <option value="">Select destination account...</option>
                                          {portfolio.brokerAccounts
                                            .filter(account => account.id !== stock.accountId)
                                            .map(account => (
                                              <option key={account.id} value={account.id}>{getAccountDisplayName(account)}</option>
                                            ))}
                                        </select>
                                        <button
                                          onClick={() => transferHolding(stock.id)}
                                          disabled={!transferTargets[stock.id]}
                                          className="bg-slate-900 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center hover:bg-slate-800 transition-all disabled:opacity-50"
                                        >
                                          <ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer Holding
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Purchase History</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mt-3">
                                    {stock.purchases.slice().sort((left, right) => right.date.localeCompare(left.date)).map(purchase => (
                                      <div key={purchase.id} className={`group flex justify-between items-center p-3 border rounded-xl hover:border-indigo-200 hover:bg-indigo-50/20 transition-all ${purchase.type === 'drip' ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100'}`}>
                                        <div className="flex flex-col">
                                          <div className="flex items-center space-x-2">
                                            <span className="text-[10px] font-bold text-slate-400">{purchase.date}</span>
                                            {purchase.type === 'drip' && <span className="text-[8px] font-black uppercase bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">DRIP</span>}
                                          </div>
                                          <span className="text-sm font-bold text-slate-800">{purchase.shares.toFixed(4)} sh @ ${purchase.price.toFixed(2)}</span>
                                        </div>
                                        <button
                                          onClick={() => deletePurchase(stock.id, purchase.id)}
                                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 transition-all"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mt-8">Yield on Cost Progression</h4>
                                  <div className="overflow-x-auto mt-2">
                                    <table className="min-w-[400px] text-xs border border-slate-200 rounded-xl">
                                      <thead className="bg-slate-100">
                                        <tr>
                                          <th className="px-2 py-1">Year</th>
                                          <th className="px-2 py-1">Invested</th>
                                          <th className="px-2 py-1">Divs (yr)</th>
                                          <th className="px-2 py-1">Cum Divs</th>
                                          <th className="px-2 py-1">YoC (yr)</th>
                                          <th className="px-2 py-1">YoC (cum)</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {stock.annualYoC.map(row => (
                                          <tr key={row.year}>
                                            <td className="px-2 py-1 text-center font-bold">{row.year}</td>
                                            <td className="px-2 py-1 text-right">${row.invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                            <td className="px-2 py-1 text-right">${row.divs.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-1 text-right">${row.cumDivs.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                            <td className="px-2 py-1 text-right">{row.yocYear.toFixed(2)}%</td>
                                            <td className="px-2 py-1 text-right">{row.yoc.toFixed(2)}%</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )) : (
                      <tr>
                        <td colSpan={selectedAccount ? 7 : 8} className="px-6 py-20 text-center text-slate-300 italic">
                          <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
                          <p className="text-lg">No holdings in this view yet.</p>
                          <p className="text-sm">Click Add Purchase to track your next position.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {activeAccountId === ALL_ACCOUNTS_ID ? (
              <div className="bg-white rounded-[26px] shadow-sm border border-slate-200 p-6">
                <div className="flex items-start justify-between mb-6 gap-3">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">Broker Account Breakdown</h2>
                    <p className="text-sm text-slate-400">Capital allocation and yield across each brokerage.</p>
                  </div>
                  <div className="text-right text-xs font-black text-slate-400">
                    <div>{portfolio.brokerAccounts.length} active</div>
                    <div>accounts</div>
                  </div>
                </div>

                <div className="space-y-4">
                  {accountSummaries.map(summary => {
                    const allocationPercent = totalAccountMarketValue > 0 ? (summary.marketValue / totalAccountMarketValue) * 100 : 0;
                    return (
                      <div key={summary.account.id} className="rounded-3xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: summary.account.color }} />
                              <p className="font-black text-slate-900 truncate">{getAccountDisplayName(summary.account)}</p>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{summary.account.institution}</span>
                            </div>
                            <p className="text-xs text-slate-400">{allocationPercent.toFixed(1)}% of portfolio • {summary.positions} assets</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-slate-900">{formatCurrency(summary.marketValue)}</p>
                            <p className="text-xs font-black text-emerald-500">+{formatCurrency(summary.totalDividends)} divs ({summary.yieldOnCost.toFixed(2)}% YoC)</p>
                          </div>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${allocationPercent}%`, backgroundColor: summary.account.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[26px] shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                  <History className="h-5 w-5 mr-2 text-indigo-500" /> Recent Income
                </h2>
                <div className="space-y-3">
                  {recentDividends.map(dividend => {
                    const account = accountMap.get(dividend.accountId);
                    return (
                      <div key={dividend.id} className="flex justify-between items-center p-4 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <DollarSign className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black text-slate-900">{dividend.ticker}</p>
                              {account && (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black"
                                  style={{ backgroundColor: `${account.color}1A`, color: account.color }}
                                >
                                  {getAccountDisplayName(account)}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{dividend.date}</p>
                          </div>
                        </div>
                        <p className="font-black text-emerald-600 text-lg">+${dividend.amount.toFixed(2)}</p>
                      </div>
                    );
                  })}
                  {recentDividends.length === 0 && (
                    <p className="text-sm text-slate-300 italic text-center py-6">No income recorded</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {isStockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 p-8">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-slate-900">Add Purchase</h3>
              <button onClick={() => setIsStockModalOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="h-6 w-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddPurchase} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Broker Account</label>
                <select
                  required
                  value={newPurchase.accountId}
                  onChange={e => setNewPurchase({ ...newPurchase, accountId: e.target.value })}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                >
                  {portfolio.brokerAccounts.map(account => (
                    <option key={account.id} value={account.id}>{getAccountDisplayName(account)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Ticker Symbol</label>
                <input
                  type="text"
                  placeholder="e.g. MSFT"
                  required
                  autoFocus
                  value={newPurchase.ticker}
                  onChange={e => setNewPurchase({ ...newPurchase, ticker: e.target.value })}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Shares</label>
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="0.00"
                    required
                    value={newPurchase.shares || ''}
                    onChange={e => setNewPurchase({ ...newPurchase, shares: Number(e.target.value) })}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Price per Share</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    required
                    value={newPurchase.price || ''}
                    onChange={e => setNewPurchase({ ...newPurchase, price: Number(e.target.value) })}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Purchase Date</label>
                <input
                  type="date"
                  required
                  value={newPurchase.date}
                  onChange={e => setNewPurchase({ ...newPurchase, date: e.target.value })}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl active:scale-95 mt-4">
                Record Purchase
              </button>
            </form>
          </div>
        </div>
      )}

      {isDivModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 p-8">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-slate-900">Log Dividend</h3>
              <button onClick={() => setIsDivModalOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="h-6 w-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddDividend} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Holding</label>
                <select
                  required
                  value={newDiv.stockId}
                  onChange={e => setNewDiv({ ...newDiv, stockId: e.target.value })}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                >
                  <option value="">Select an asset...</option>
                  {dividendStockOptions.map(stock => {
                    const account = accountMap.get(stock.accountId);
                    return (
                      <option key={stock.id} value={stock.id}>
                        {selectedAccount ? stock.ticker : `${stock.ticker} • ${account ? getAccountDisplayName(account) : 'Unknown Account'}`}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Dividend Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={newDiv.amount || ''}
                  onChange={e => setNewDiv({ ...newDiv, amount: Number(e.target.value) })}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Payment Date</label>
                <input
                  type="date"
                  required
                  value={newDiv.date}
                  onChange={e => setNewDiv({ ...newDiv, date: e.target.value })}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="reinvested"
                    checked={newDiv.reinvested}
                    onChange={e => setNewDiv({ ...newDiv, reinvested: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="reinvested" className="ml-2 text-sm font-bold text-slate-700">Reinvested (DRIP)</label>
                </div>

                {newDiv.reinvested && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Share Price</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        required={newDiv.reinvested}
                        value={newDiv.sharePrice || ''}
                        onChange={e => {
                          const price = Number(e.target.value);
                          setNewDiv(prev => ({
                            ...prev,
                            sharePrice: price,
                            sharesBought: price > 0 ? Number((prev.amount / price).toFixed(6)) : 0,
                          }));
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Shares Bought</label>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="0.0000"
                        required={newDiv.reinvested}
                        value={newDiv.sharesBought || ''}
                        onChange={e => setNewDiv({ ...newDiv, sharesBought: Number(e.target.value) })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl active:scale-95 mt-4">
                Record Payment
              </button>
            </form>
          </div>
        </div>
      )}

      {isAccountModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 p-8">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-slate-900">Add Broker Account</h3>
              <button onClick={() => setIsAccountModalOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="h-6 w-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Brokerage Institution</label>
                  <select
                    value={newAccount.institution}
                    onChange={e => setNewAccount({ ...newAccount, institution: e.target.value })}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                  >
                    {BROKER_INSTITUTIONS.map(institution => (
                      <option key={institution} value={institution}>{institution}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Account Type</label>
                  <select
                    value={newAccount.type}
                    onChange={e => setNewAccount({ ...newAccount, type: e.target.value })}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                  >
                    {ACCOUNT_TYPES.map(accountType => (
                      <option key={accountType} value={accountType}>{accountType}</option>
                    ))}
                  </select>
                </div>
              </div>

              {newAccount.institution === 'Custom' && (
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Custom Institution Name</label>
                  <input
                    type="text"
                    placeholder="Your brokerage name"
                    required={newAccount.institution === 'Custom'}
                    value={newAccount.customInstitution}
                    onChange={e => setNewAccount({ ...newAccount, customInstitution: e.target.value })}
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Account Nickname</label>
                <input
                  type="text"
                  placeholder="e.g. Dividend IRA"
                  required
                  value={newAccount.nickname}
                  onChange={e => setNewAccount({ ...newAccount, nickname: e.target.value })}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Theme Color</label>
                <div className="flex flex-wrap gap-3">
                  {ACCOUNT_COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewAccount({ ...newAccount, color })}
                      className={`h-10 w-10 rounded-full border-4 transition-all ${newAccount.color === color ? 'border-slate-900 scale-110' : 'border-white'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95 mt-4">
                Create Broker Account
              </button>
            </form>
          </div>
        </div>
      )}

      {isManageAccountsOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Manage Broker Accounts</h3>
                <p className="text-sm text-slate-400 mt-1">Edit account details, review balances and yields, or safely reassign/delete accounts.</p>
              </div>
              <button onClick={() => { setIsManageAccountsOpen(false); setPendingDeleteAccount(null); }} className="bg-slate-100 p-2 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="h-6 w-6 rotate-45" />
              </button>
            </div>

            <div className="space-y-5">
              {accountSummaries.map(summary => {
                const reassignmentTargets = portfolio.brokerAccounts.filter(account => account.id !== summary.account.id);
                return (
                  <div key={summary.account.id} className="border border-slate-200 rounded-3xl p-6">
                    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: summary.account.color }} />
                          <h4 className="text-lg font-black text-slate-900">{getAccountDisplayName(summary.account)}</h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Nickname</label>
                            <input
                              type="text"
                              value={summary.account.nickname}
                              onChange={e => updateBrokerAccount(summary.account.id, { nickname: e.target.value })}
                              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Institution</label>
                            <input
                              type="text"
                              value={summary.account.institution}
                              onChange={e => updateBrokerAccount(summary.account.id, { institution: e.target.value })}
                              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Account Type</label>
                            <select
                              value={summary.account.type}
                              onChange={e => updateBrokerAccount(summary.account.id, { type: e.target.value })}
                              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                            >
                              {ACCOUNT_TYPES.map(accountType => (
                                <option key={accountType} value={accountType}>{accountType}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Theme Color</label>
                            <div className="flex flex-wrap gap-2 pt-2">
                              {ACCOUNT_COLOR_OPTIONS.map(color => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => updateBrokerAccount(summary.account.id, { color })}
                                  className={`h-8 w-8 rounded-full border-4 ${summary.account.color === color ? 'border-slate-900' : 'border-white'}`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-3xl p-5 space-y-3 border border-slate-100">
                        <div>
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Account Snapshot</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Balance</p>
                            <p className="font-black text-slate-900">{formatCurrency(summary.marketValue)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Positions</p>
                            <p className="font-black text-slate-900">{summary.positions}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dividends</p>
                            <p className="font-black text-emerald-600">{formatCurrency(summary.totalDividends)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Yield on Cost</p>
                            <p className="font-black text-indigo-600">{summary.yieldOnCost.toFixed(2)}%</p>
                          </div>
                        </div>

                        {portfolio.brokerAccounts.length > 1 && (
                          <div className="pt-3 border-t border-slate-200">
                            <button
                              type="button"
                              onClick={() => setPendingDeleteAccount({
                                accountId: summary.account.id,
                                mode: 'reassign',
                                reassignToId: reassignmentTargets[0]?.id || '',
                              })}
                              className="w-full bg-red-50 text-red-600 px-4 py-3 rounded-2xl font-black text-sm hover:bg-red-100 transition-colors"
                            >
                              Delete or Reassign Account
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {pendingDeleteAccount?.accountId === summary.account.id && (
                      <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5 space-y-4">
                        <div>
                          <p className="text-sm font-black text-red-700">Choose how to remove this account</p>
                          <p className="text-sm text-red-600/80">You can move all holdings and dividend history to another broker or delete all associated records.</p>
                        </div>

                        <div className="space-y-3">
                          <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
                            <input
                              type="radio"
                              checked={pendingDeleteAccount.mode === 'reassign'}
                              onChange={() => setPendingDeleteAccount(prev => prev ? {
                                ...prev,
                                mode: 'reassign',
                                reassignToId: prev.reassignToId || reassignmentTargets[0]?.id || '',
                              } : prev)}
                            />
                            <span>Reassign holdings and dividend records to another broker account.</span>
                          </label>
                          {pendingDeleteAccount.mode === 'reassign' && (
                            <select
                              value={pendingDeleteAccount.reassignToId}
                              onChange={e => setPendingDeleteAccount(prev => prev ? { ...prev, reassignToId: e.target.value } : prev)}
                              className="w-full px-4 py-3 rounded-2xl border border-red-200 bg-white focus:ring-4 focus:ring-red-500/10 focus:border-red-400 outline-none font-bold text-slate-900"
                            >
                              {reassignmentTargets.map(account => (
                                <option key={account.id} value={account.id}>{getAccountDisplayName(account)}</option>
                              ))}
                            </select>
                          )}
                          <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
                            <input
                              type="radio"
                              checked={pendingDeleteAccount.mode === 'delete'}
                              onChange={() => setPendingDeleteAccount(prev => prev ? { ...prev, mode: 'delete' } : prev)}
                            />
                            <span>Delete the account and remove all holdings, purchases, and dividend history tied to it.</span>
                          </label>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                          <button
                            type="button"
                            onClick={() => setPendingDeleteAccount(null)}
                            className="px-4 py-3 rounded-2xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={confirmDeleteAccount}
                            className="px-4 py-3 rounded-2xl font-bold text-white bg-red-600 hover:bg-red-700"
                          >
                            Confirm Removal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;