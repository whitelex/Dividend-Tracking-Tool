
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  Wallet, 
  PieChart as PieIcon, 
  Plus, 
  History, 
  Trash2,
  DollarSign,
  ChevronRight,
  ChevronDown,
  Calendar,
  Cloud,
  CloudOff,
  RefreshCw,
  LayoutDashboard
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
  const [portfolio, setPortfolio] = useState<PortfolioState>({ stocks: [], dividends: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  const [activeModal, setActiveModal] = useState<'stock' | 'dividend' | null>(null);
  const [expandedStock, setExpandedStock] = useState<string | null>(null);

  const [formStock, setFormStock] = useState({ ticker: '', shares: '', price: '', date: new Date().toISOString().split('T')[0] });
  const [formDiv, setFormDiv] = useState({ stockId: '', amount: '', date: new Date().toISOString().split('T')[0] });

  // Load Data
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/data');
        if (res.ok) {
          const data = await res.json();
          setPortfolio(data || { stocks: [], dividends: [] });
          setSyncStatus('saved');
        }
      } catch (e) {
        console.error("Load error:", e);
        setSyncStatus('error');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Sync Data
  // Fix line 66: useRef requires an initial value in certain TypeScript configurations.
  const saveTimeout = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (isLoading) return;
    
    setSyncStatus('saving');
    clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(portfolio)
        });
        if (res.ok) setSyncStatus('saved');
        else throw new Error("Save failed");
      } catch (e) {
        setSyncStatus('error');
      }
    }, 1500);
  }, [portfolio, isLoading]);

  const stats = useMemo(() => {
    const stockStats = portfolio.stocks.map(s => {
      const shares = s.purchases.reduce((acc, p) => acc + p.shares, 0);
      const cost = s.purchases.reduce((acc, p) => acc + (p.shares * p.price), 0);
      const dividends = portfolio.dividends.filter(d => d.stockId === s.id).reduce((acc, d) => acc + d.amount, 0);
      return { ...s, totalShares: shares, totalCost: cost, avgPrice: shares > 0 ? cost / shares : 0, totalDividends: dividends };
    });

    const totalInvested = stockStats.reduce((acc, s) => acc + s.totalCost, 0);
    const totalDividends = portfolio.dividends.reduce((acc, d) => acc + d.amount, 0);
    const yieldOnCost = totalInvested > 0 ? (totalDividends / totalInvested) * 100 : 0;

    return { stockStats, totalInvested, totalDividends, yieldOnCost };
  }, [portfolio]);

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = formStock.ticker.toUpperCase();
    const purchase: Purchase = {
      id: crypto.randomUUID(),
      shares: parseFloat(formStock.shares),
      price: parseFloat(formStock.price),
      date: formStock.date
    };

    setPortfolio(prev => {
      const existing = prev.stocks.find(s => s.ticker === ticker);
      if (existing) {
        return {
          ...prev,
          stocks: prev.stocks.map(s => s.ticker === ticker ? { ...s, purchases: [...s.purchases, purchase] } : s)
        };
      }
      return {
        ...prev,
        stocks: [...prev.stocks, { id: crypto.randomUUID(), ticker, purchases: [purchase] }]
      };
    });
    setActiveModal(null);
    setFormStock({ ticker: '', shares: '', price: '', date: new Date().toISOString().split('T')[0] });
  };

  const handleAddDiv = (e: React.FormEvent) => {
    e.preventDefault();
    const stock = portfolio.stocks.find(s => s.id === formDiv.stockId);
    if (!stock) return;

    const div: Dividend = {
      id: crypto.randomUUID(),
      stockId: stock.id,
      ticker: stock.ticker,
      amount: parseFloat(formDiv.amount),
      date: formDiv.date
    };

    setPortfolio(prev => ({ ...prev, dividends: [...prev.dividends, div] }));
    setActiveModal(null);
    setFormDiv({ stockId: '', amount: '', date: new Date().toISOString().split('T')[0] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <TrendingUp className="text-white h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800">DiviTrack <span className="text-indigo-600">Pro</span></span>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center px-3 py-1 rounded-full bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {syncStatus === 'saving' ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : 
               syncStatus === 'error' ? <CloudOff className="h-3 w-3 mr-1 text-red-500" /> : 
               <Cloud className="h-3 w-3 mr-1 text-indigo-500" />}
              {syncStatus}
            </div>
            <button onClick={() => setActiveModal('stock')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center">
              <Plus className="h-4 w-4 mr-1" /> Add Stock
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 mt-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-500">Portfolio Value</p>
              <Wallet className="h-4 w-4 text-slate-400" />
            </div>
            <h2 className="text-3xl font-bold">${stats.totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-500">Total Dividends</p>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <h2 className="text-3xl font-bold text-emerald-600">${stats.totalDividends.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-500">Yield on Cost</p>
              <PieIcon className="h-4 w-4 text-indigo-500" />
            </div>
            <h2 className="text-3xl font-bold text-indigo-600">{stats.yieldOnCost.toFixed(2)}%</h2>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[400px]">
            <h3 className="text-lg font-bold mb-6 flex items-center"><LayoutDashboard className="h-5 w-5 mr-2 text-indigo-600" /> Allocation</h3>
            <div className="h-full max-h-[300px]">
              {portfolio.stocks.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.stockStats.map(s => ({ name: s.ticker, value: s.totalCost }))} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {stats.stockStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 italic">No assets to visualize</div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold mb-6 flex items-center"><History className="h-5 w-5 mr-2 text-emerald-600" /> Dividend Growth</h3>
            <div className="h-full max-h-[300px]">
              {portfolio.dividends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={portfolio.dividends.slice(-12).map(d => ({ date: d.date, amount: d.amount }))}>
                    <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 italic">No income history found</div>
              )}
            </div>
          </div>
        </div>

        {/* Assets List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-lg font-bold">Your Assets</h3>
            <button 
              disabled={portfolio.stocks.length === 0}
              onClick={() => setActiveModal('dividend')} 
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center disabled:opacity-50"
            >
              <DollarSign className="h-3 w-3 mr-1" /> Log Income
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 w-10"></th>
                  <th className="px-6 py-4">Ticker</th>
                  <th className="px-6 py-4">Shares</th>
                  <th className="px-6 py-4">Avg Cost</th>
                  <th className="px-6 py-4">Total Invested</th>
                  <th className="px-6 py-4">Dividends</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.stockStats.map(s => (
                  <React.Fragment key={s.id}>
                    <tr onClick={() => setExpandedStock(expandedStock === s.id ? null : s.id)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="px-6 py-4">{expandedStock === s.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-300" />}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{s.ticker}</td>
                      <td className="px-6 py-4">{s.totalShares.toFixed(3)}</td>
                      <td className="px-6 py-4 text-slate-500">${s.avgPrice.toFixed(2)}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700">${s.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-emerald-600 font-bold">${s.totalDividends.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if(confirm("Delete position?")) setPortfolio(p => ({ ...p, stocks: p.stocks.filter(st => st.id !== s.id), dividends: p.dividends.filter(d => d.stockId !== s.id) }));
                          }}
                          className="p-1 text-slate-300 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedStock === s.id && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={7} className="px-12 py-4">
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Purchase History</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              {s.purchases.map(p => (
                                <div key={p.id} className="bg-white p-3 rounded-lg border border-slate-200 text-sm flex justify-between items-center group">
                                  <div>
                                    <p className="font-bold text-slate-800">{p.shares} sh @ ${p.price}</p>
                                    <p className="text-[10px] text-slate-400">{p.date}</p>
                                  </div>
                                  <button onClick={() => setPortfolio(prev => ({...prev, stocks: prev.stocks.map(st => st.id === s.id ? {...st, purchases: st.purchases.filter(pur => pur.id !== p.id)} : st).filter(st => st.purchases.length > 0)}))} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {portfolio.stocks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">No stocks added yet. Start by clicking "Add Stock".</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setActiveModal(null)} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-6">{activeModal === 'stock' ? 'Record Purchase' : 'Log Dividend'}</h3>
            {activeModal === 'stock' ? (
              <form onSubmit={handleAddStock} className="space-y-4">
                <input type="text" placeholder="Ticker (e.g. AAPL)" required value={formStock.ticker} onChange={e => setFormStock({...formStock, ticker: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none uppercase" />
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" step="0.0001" placeholder="Shares" required value={formStock.shares} onChange={e => setFormStock({...formStock, shares: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <input type="number" step="0.01" placeholder="Price" required value={formStock.price} onChange={e => setFormStock({...formStock, price: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <input type="date" required value={formStock.date} onChange={e => setFormStock({...formStock, date: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors">Record Transaction</button>
              </form>
            ) : (
              <form onSubmit={handleAddDiv} className="space-y-4">
                <select required value={formDiv.stockId} onChange={e => setFormDiv({...formDiv, stockId: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">Select Stock...</option>
                  {portfolio.stocks.map(s => <option key={s.id} value={s.id}>{s.ticker}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Amount ($)" required value={formDiv.amount} onChange={e => setFormDiv({...formDiv, amount: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                <input type="date" required value={formDiv.date} onChange={e => setFormDiv({...formDiv, date: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors">Log Payment</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
