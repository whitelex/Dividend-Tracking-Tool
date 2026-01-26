
import React, { useState, useEffect, useMemo, useRef } from 'react';
// Passcode gate helpers
const getStoredPasscode = () => {
  try {
    return localStorage.getItem('divitrack_passcode') || '';
  } catch { return ''; }
};
const setStoredPasscode = (val: string) => {
  try { localStorage.setItem('divitrack_passcode', val); } catch {}
};
import { 
  TrendingUp, 
  Wallet, 
  PieChart as PieChartIcon, 
  Plus, 
  History, 
  Trash2,
  DollarSign,
  ChevronRight,
  ChevronDown,
  Calendar,
  Cloud,
  CloudOff,
  RefreshCw
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from 'recharts';
import { Stock, Dividend, PortfolioState, ChartData, DividendMonthData, Purchase } from './types.ts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const App: React.FC = () => {
  const [passcode, setPasscode] = useState(getStoredPasscode());
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  // Ensure passcode is string and trim whitespace
  // Use Vite env variable directly
  const publicPasscode = (import.meta.env.VITE_PUBLIC_PASSCODE || '').toString().trim();

  useEffect(() => {
    if (passcode && passcode === publicPasscode) {
      setStoredPasscode(passcode);
    }
  }, [passcode, publicPasscode]);

  const [portfolio, setPortfolio] = useState<PortfolioState>({ stocks: [], dividends: [] });
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading');
  
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isDivModalOpen, setIsDivModalOpen] = useState(false);
  const [expandedStockId, setExpandedStockId] = useState<string | null>(null);

  const [newPurchase, setNewPurchase] = useState({ ticker: '', shares: 0, price: 0, date: new Date().toISOString().split('T')[0] });
  const [newDiv, setNewDiv] = useState({ 
    stockId: '', 
    amount: 0, 
    date: new Date().toISOString().split('T')[0],
    reinvested: false,
    sharePrice: 0,
    sharesBought: 0
  });

  // Move hooks before any conditional return
  useEffect(() => {
    const fetchData = async () => {
      // Don't fetch if locked
      if (!passcode || passcode.trim() !== publicPasscode) return;
      
      try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setPortfolio(data);
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

  const saveTimeoutRef = useRef<number | null>(null);
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(portfolio)
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

  // Fetch stock prices
  useEffect(() => {
    if (!passcode || passcode.trim() !== publicPasscode) return;
    if (portfolio.stocks.length === 0) return;

    const fetchPrices = async () => {
      try {
        const tickers = portfolio.stocks.map(s => s.ticker).join(',');
        const response = await fetch(`/api/price?tickers=${tickers}`);
        if (!response.ok) return;
        const prices = await response.json();
        
        setPortfolio(prev => ({
          ...prev,
          stocks: prev.stocks.map(s => ({
            ...s,
            currentPrice: prices[s.ticker] || s.currentPrice
          }))
        }));
      } catch (err) {
        console.error('Price fetch error:', err);
      }
    };

    fetchPrices();
    // Refresh prices every 5 minutes
    const interval = setInterval(fetchPrices, 300000);
    return () => clearInterval(interval);
  }, [portfolio.stocks.map(s => s.ticker).join(','), passcode, publicPasscode]);


  // Annual YoC progression for each stock
  function getAnnualYoC(stock: Stock, dividends: Dividend[]) {
    // Get all years from first purchase to current year
    const years = Array.from(new Set([
      ...stock.purchases.map(p => new Date(p.date).getFullYear()),
      ...dividends.filter(d => d.stockId === stock.id).map(d => new Date(d.date).getFullYear())
    ])).sort();
    if (years.length === 0) return [];
    const minYear = Math.min(...years);
    const maxYear = new Date().getFullYear();
    const result = [];
    for (let year = minYear; year <= maxYear; year++) {
      // Invested capital up to and including this year (cash only)
      const invested = stock.purchases
        .filter(p => (!p.type || p.type === 'buy') && new Date(p.date).getFullYear() <= year)
        .reduce((sum, p) => sum + (p.shares * p.price), 0);
      // Dividends received in this year
      const divs = dividends
        .filter(d => d.stockId === stock.id && new Date(d.date).getFullYear() === year)
        .reduce((sum, d) => sum + d.amount, 0);
      // Cumulative dividends up to this year
      const cumDivs = dividends
        .filter(d => d.stockId === stock.id && new Date(d.date).getFullYear() <= year)
        .reduce((sum, d) => sum + d.amount, 0);
      result.push({
        year,
        invested,
        divs,
        cumDivs,
        yoc: invested > 0 ? (cumDivs / invested) * 100 : 0,
        yocYear: invested > 0 ? (divs / invested) * 100 : 0
      });
    }
    return result;
  }

  const stockStats = useMemo(() => {
    return portfolio.stocks.map(stock => {
      const totalShares = stock.purchases.reduce((sum, p) => sum + p.shares, 0);
      const totalCost = stock.purchases.reduce((sum, p) => sum + (p.shares * p.price), 0);
      const investedCapital = stock.purchases
        .filter(p => !p.type || p.type === 'buy')
        .reduce((sum, p) => sum + (p.shares * p.price), 0);
      const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
      const stockDividends = portfolio.dividends
        .filter(d => d.stockId === stock.id)
        .reduce((sum, d) => sum + d.amount, 0);
      const yieldOnCost = investedCapital > 0 ? (stockDividends / investedCapital) * 100 : 0;
      const annualYoC = getAnnualYoC(stock, portfolio.dividends);
      
      const marketValue = stock.currentPrice 
        ? totalShares * stock.currentPrice 
        : totalCost; // Fallback to cost if no price
      
      const gainLoss = marketValue - totalCost;
      const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;

      return {
        ...stock,
        totalShares,
        totalCost,
        investedCapital,
        avgPrice,
        stockDividends,
        yieldOnCost,
        annualYoC,
        marketValue,
        gainLoss,
        gainLossPercent
      };
    });
  }, [portfolio.stocks, portfolio.dividends]);

  const totalPortfolioValue = useMemo(() => {
    // Current value based on market price or cost fallback
    return stockStats.reduce((sum, s) => sum + s.marketValue, 0);
  }, [stockStats]);

  const totalInvestedCapital = useMemo(() => {
    return stockStats.reduce((sum, s) => sum + s.investedCapital, 0);
  }, [stockStats]);

  const totalDividends = useMemo(() => {
    return portfolio.dividends.reduce((sum, d) => sum + d.amount, 0);
  }, [portfolio.dividends]);

  const allocationData: ChartData[] = useMemo(() => {
    return stockStats.map(s => ({
      name: s.ticker,
      value: s.totalCost
    }));
  }, [stockStats]);

  const monthlyDividendData: DividendMonthData[] = useMemo(() => {
    const months: Record<string, number> = {};
    portfolio.dividends.forEach(d => {
      const month = d.date.substring(0, 7); 
      months[month] = (months[month] || 0) + d.amount;
    });
    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount }));
  }, [portfolio.dividends]);

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
            onChange={e => { setPasscodeInput(e.target.value); setPasscodeError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') {
              if (passcodeInput.trim() === publicPasscode) {
                setPasscode(passcodeInput.trim());
                setPasscodeError('');
              } else {
                setPasscodeError('Incorrect passcode');
              }
            }}}
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
          >Access</button>
          {passcodeError && <div className="text-red-500 text-xs mt-2">{passcodeError}</div>}
          <div className="text-xs text-slate-400 mt-4 select-all">
          </div>
        </div>
      </div>
    );
  }

  const handleAddPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPurchase.ticker || newPurchase.shares <= 0) return;

    const tickerUpper = newPurchase.ticker.toUpperCase();
    const existingStockIndex = portfolio.stocks.findIndex(s => s.ticker === tickerUpper);
    
    const purchase: Purchase = {
      id: Math.random().toString(36).substr(2, 9),
      shares: Number(newPurchase.shares),
      price: Number(newPurchase.price),
      date: newPurchase.date,
      type: 'buy'
    };

    const newStocks = [...portfolio.stocks];
    if (existingStockIndex >= 0) {
      newStocks[existingStockIndex] = {
        ...newStocks[existingStockIndex],
        purchases: [...newStocks[existingStockIndex].purchases, purchase]
      };
    } else {
      newStocks.push({
        id: Math.random().toString(36).substr(2, 9),
        ticker: tickerUpper,
        purchases: [purchase]
      });
    }

    setPortfolio(prev => ({ ...prev, stocks: newStocks }));
    setIsStockModalOpen(false);
    setNewPurchase({ ticker: '', shares: 0, price: 0, date: new Date().toISOString().split('T')[0] });
  };

  const handleAddDividend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiv.stockId || newDiv.amount <= 0) return;

    const selectedStock = portfolio.stocks.find(s => s.id === newDiv.stockId);
    if (!selectedStock) return;

    let linkedPurchaseId = undefined;
    let newStocks = [...portfolio.stocks];

    if (newDiv.reinvested && newDiv.sharesBought > 0 && newDiv.sharePrice > 0) {
      linkedPurchaseId = Math.random().toString(36).substr(2, 9);
      const purchase: Purchase = {
        id: linkedPurchaseId,
        shares: Number(newDiv.sharesBought),
        price: Number(newDiv.sharePrice),
        date: newDiv.date,
        type: 'drip'
      };

      const stockIndex = newStocks.findIndex(s => s.id === newDiv.stockId);
      if (stockIndex >= 0) {
        newStocks[stockIndex] = {
          ...newStocks[stockIndex],
          purchases: [...newStocks[stockIndex].purchases, purchase]
        };
      }
    }

    const div: Dividend = {
      id: Math.random().toString(36).substr(2, 9),
      stockId: newDiv.stockId,
      ticker: selectedStock.ticker,
      amount: Number(newDiv.amount),
      date: newDiv.date,
      reinvested: newDiv.reinvested,
      linkedPurchaseId
    };

    setPortfolio(prev => ({ 
      stocks: newStocks,
      dividends: [...prev.dividends, div] 
    }));
    setIsDivModalOpen(false);
    setNewDiv({ 
      stockId: '', 
      amount: 0, 
      date: new Date().toISOString().split('T')[0],
      reinvested: false,
      sharePrice: 0,
      sharesBought: 0
    });
  };

  const deleteStock = (id: string) => {
    if (window.confirm("Are you sure you want to delete this position and all its history?")) {
      setPortfolio(prev => ({
        stocks: prev.stocks.filter(s => s.id !== id),
        dividends: prev.dividends.filter(d => d.stockId !== id)
      }));
    }
  };

  const deletePurchase = (stockId: string, purchaseId: string) => {
    const updatedStocks = portfolio.stocks.map(s => {
      if (s.id === stockId) {
        return { ...s, purchases: s.purchases.filter(p => p.id !== purchaseId) };
      }
      return s;
    }).filter(s => s.purchases.length > 0);

    setPortfolio(prev => ({ ...prev, stocks: updatedStocks }));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <nav className="bg-indigo-700 text-white p-4 shadow-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-8 w-8 text-indigo-200" />
            <h1 className="text-2xl font-bold tracking-tight text-white">DiviTrack <span className="text-indigo-200">Pro</span></h1>
            
            <div className={`ml-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center transition-colors ${
              syncStatus === 'saved' ? 'bg-indigo-600 text-indigo-100' : 
              syncStatus === 'saving' || syncStatus === 'loading' ? 'bg-indigo-500 text-white' : 
              'bg-red-500 text-white'
            }`}>
              {syncStatus === 'loading' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              {syncStatus === 'saving' && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              {syncStatus === 'saved' && <Cloud className="h-3 w-3 mr-1" />}
              {syncStatus === 'error' && <CloudOff className="h-3 w-3 mr-1" />}
              {syncStatus.toUpperCase()}
            </div>
          </div>
          <div className="flex space-x-3">
             <button 
              disabled={syncStatus === 'loading'}
              onClick={() => setIsStockModalOpen(true)}
              className="bg-white text-indigo-700 px-4 py-2 rounded-xl font-bold flex items-center shadow-md hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-50"
            >
              <Plus className="h-4 w-4 mr-2" /> Add Purchase
            </button>
            <button 
              disabled={syncStatus === 'loading' || portfolio.stocks.length === 0}
              onClick={() => setIsDivModalOpen(true)}
              className="bg-indigo-600 text-white border border-indigo-500 px-4 py-2 rounded-xl font-bold flex items-center hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50"
            >
              <DollarSign className="h-4 w-4 mr-2" /> Log Div
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 animate-in fade-in duration-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Portfolio Value</p>
              <p className="text-2xl font-black text-slate-900">${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Dividends</p>
              <p className="text-2xl font-black text-emerald-600">${totalDividends.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Yield on Invested</p>
              <p className="text-2xl font-black text-indigo-600">
                {totalInvestedCapital > 0 ? ((totalDividends / totalInvestedCapital) * 100).toFixed(2) : '0.00'}%
              </p>
              <p className="text-[10px] text-slate-400 font-bold mt-1">on ${totalInvestedCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })} cash invested</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Positions</p>
              <p className="text-2xl font-black text-slate-900">{portfolio.stocks.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                <PieChartIcon className="h-5 w-5 mr-2 text-indigo-500" /> Capital Allocation
              </h2>
              <div className="h-64">
                {allocationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {allocationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                <History className="h-5 w-5 mr-2 text-indigo-500" /> Income History
              </h2>
              <div className="h-64">
                {monthlyDividendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyDividendData}>
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <p className="italic">No income logged yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="text-lg font-bold text-slate-800">Your Portfolio</h2>
                  <div className="flex items-center text-slate-400 text-xs">
                    <Calendar className="h-3 w-3 mr-1" /> Last updated: {new Date().toLocaleDateString()}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 w-10"></th>
                        <th className="px-6 py-4">Asset</th>
                        <th className="px-6 py-4 text-right">Shares</th>
                        <th className="px-6 py-4 text-right">Avg Cost</th>
                        <th className="px-6 py-4 text-right">Price</th>
                        <th className="px-6 py-4 text-right">Total Invested</th>
                        <th className="px-6 py-4 text-right">Performance</th>
                        <th className="px-6 py-4 text-right">Return from Divs</th>
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
                            <td className="px-6 py-4">
                              {expandedStockId === stock.id ? <ChevronDown className="h-4 w-4 text-indigo-500" /> : <ChevronRight className="h-4 w-4 text-slate-300" />}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-black text-slate-900">{stock.ticker}</span>
                                <span className="text-[10px] text-indigo-500 font-bold uppercase">{stock.purchases.length} buys</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-slate-600">{stock.totalShares.toFixed(4)}</td>
                            <td className="px-6 py-4 text-right text-slate-600">${stock.avgPrice.toFixed(2)}</td>
                            <td className="px-6 py-4 text-right text-slate-900 font-bold">
                              {stock.currentPrice ? `$${stock.currentPrice.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900">
                              <div className="flex flex-col items-end">
                                <span>${stock.investedCapital.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                <span className="text-[10px] text-slate-400 font-normal">Mkt Value: ${stock.marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className={`flex flex-col items-end font-bold ${stock.gainLoss >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                <span>{stock.gainLossPercent > 0 ? '+' : ''}{stock.gainLossPercent.toFixed(2)}%</span>
                                <span className="text-[10px] opacity-75">${stock.gainLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${stock.yieldOnCost > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                {stock.yieldOnCost.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteStock(stock.id); }}
                                className="p-2 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                          {expandedStockId === stock.id && (
                            <tr>
                              <td colSpan={9} className="px-6 py-4 bg-slate-50/50">
                                <div className="pl-10 space-y-3">
                                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Purchase History</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    {stock.purchases.sort((a,b) => b.date.localeCompare(a.date)).map(p => (
                                      <div key={p.id} className={`group flex justify-between items-center p-3 border rounded-xl hover:border-indigo-200 hover:bg-indigo-50/20 transition-all ${p.type === 'drip' ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-100'}`}>
                                        <div className="flex flex-col">
                                          <div className="flex items-center space-x-2">
                                            <span className="text-[10px] font-bold text-slate-400">{p.date}</span>
                                            {p.type === 'drip' && <span className="text-[8px] font-black uppercase bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">DRIP</span>}
                                          </div>
                                          <span className="text-sm font-bold text-slate-800">{p.shares.toFixed(4)} sh @ ${p.price.toFixed(2)}</span>
                                        </div>
                                        <button 
                                          onClick={() => deletePurchase(stock.id, p.id)}
                                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 transition-all"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
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
                                            <td className="px-2 py-1 text-right">${row.invested.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                                            <td className="px-2 py-1 text-right">${row.divs.toLocaleString(undefined, {maximumFractionDigits:2})}</td>
                                            <td className="px-2 py-1 text-right">${row.cumDivs.toLocaleString(undefined, {maximumFractionDigits:2})}</td>
                                            <td className="px-2 py-1 text-right">{row.yocYear.toFixed(2)}%</td>
                                            <td className="px-2 py-1 text-right">{row.yoc.toFixed(2)}%</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )) : (
                        <tr>
                          <td colSpan={9} className="px-6 py-20 text-center text-slate-300 italic">
                            <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p className="text-lg">Your portfolio is currently empty.</p>
                            <p className="text-sm">Click "Add Purchase" to track your first asset.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                  <History className="h-5 w-5 mr-2 text-indigo-500" /> Recent Income
                </h2>
                <div className="space-y-3">
                  {portfolio.dividends.slice(-8).reverse().map(div => (
                    <div key={div.id} className="flex justify-between items-center p-4 rounded-2xl border border-slate-50 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center mr-4 text-emerald-600">
                          <DollarSign className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900">{div.ticker}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{div.date}</p>
                        </div>
                      </div>
                      <p className="font-black text-emerald-600 text-lg">+${div.amount.toFixed(2)}</p>
                    </div>
                  ))}
                  {portfolio.dividends.length === 0 && (
                    <p className="text-sm text-slate-300 italic text-center py-6">No income recorded</p>
                  )}
                </div>
              </div>
            </div>
          </div>
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
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Ticker Symbol</label>
                <input 
                  type="text" 
                  placeholder="e.g. MSFT" 
                  required
                  autoFocus
                  value={newPurchase.ticker}
                  onChange={e => setNewPurchase({...newPurchase, ticker: e.target.value})}
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
                    onChange={e => setNewPurchase({...newPurchase, shares: Number(e.target.value)})}
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
                    onChange={e => setNewPurchase({...newPurchase, price: Number(e.target.value)})}
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
                  onChange={e => setNewPurchase({...newPurchase, date: e.target.value})}
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
                  onChange={e => setNewDiv({...newDiv, stockId: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                >
                  <option value="">Select an asset...</option>
                  {portfolio.stocks.map(s => (
                    <option key={s.id} value={s.id}>{s.ticker}</option>
                  ))}
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
                  onChange={e => setNewDiv({...newDiv, amount: Number(e.target.value)})}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Payment Date</label>
                <input 
                  type="date"
                  required
                  value={newDiv.date}
                  onChange={e => setNewDiv({...newDiv, date: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold text-slate-900"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="reinvested"
                    checked={newDiv.reinvested}
                    onChange={e => setNewDiv({...newDiv, reinvested: e.target.checked})}
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
                            sharesBought: price > 0 ? Number((prev.amount / price).toFixed(6)) : 0
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
                        onChange={e => setNewDiv({...newDiv, sharesBought: Number(e.target.value)})}
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
    </div>
  );
};

export default App;
