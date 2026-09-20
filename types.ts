
export interface Purchase {
  id: string;
  shares: number;
  price: number;
  date: string;
  type?: 'buy' | 'drip' | 'sell'; // 'buy' = cash purchase, 'drip' = dividend reinvestment, 'sell' = shares sold
}

export interface BrokerAccount {
  id: string;
  institution: string;
  type: string;
  color: string;
  nickname: string;
}

export interface Stock {
  id: string;
  ticker: string;
  accountId: string;
  purchases: Purchase[];
  currentPrice?: number; // Real-time market price
}

export interface Dividend {
  id: string;
  stockId: string;
  accountId: string;
  ticker: string;
  amount: number;
  date: string;
  reinvested?: boolean;
  linkedPurchaseId?: string; // ID of the Purchase created from this dividend
}

export interface PortfolioState {
  brokerAccounts: BrokerAccount[];
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
  projected?: boolean;
}
