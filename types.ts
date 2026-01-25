
export interface Purchase {
  id: string;
  shares: number;
  price: number;
  date: string;
  type?: 'buy' | 'drip'; // 'buy' = cash purchase, 'drip' = dividend reinvestment
}

export interface Stock {
  id: string;
  ticker: string;
  purchases: Purchase[];
}

export interface Dividend {
  id: string;
  stockId: string;
  ticker: string;
  amount: number;
  date: string;
  reinvested?: boolean;
  linkedPurchaseId?: string; // ID of the Purchase created from this dividend
}

export interface PortfolioState {
  stocks: Stock[];
  dividends: Dividend[];
}

export interface ChartData {
  name: string;
  value: number;
}

export interface DividendMonthData {
  month: string;
  amount: number;
}
