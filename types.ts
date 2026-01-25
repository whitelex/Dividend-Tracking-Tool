export interface Purchase {
  id: string;
  shares: number;
  price: number;
  date: string;
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