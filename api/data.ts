import { MongoClient } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const uri = process.env.MONGODB_STRING;
let cachedClient: MongoClient | null = null;

const LEGACY_ACCOUNT_ID = 'default-account';

const createDefaultAccount = () => ({
  id: LEGACY_ACCOUNT_ID,
  institution: 'Custom',
  type: 'Taxable',
  color: '#6366f1',
  nickname: 'Primary Account'
});

function normalizePortfolioData(payload: any) {
  const brokerAccounts = Array.isArray(payload?.brokerAccounts) && payload.brokerAccounts.length > 0
    ? payload.brokerAccounts
    : [createDefaultAccount()];

  const validAccountIds = new Set(brokerAccounts.map((account: any) => account.id));
  const fallbackAccountId = brokerAccounts[0]?.id || LEGACY_ACCOUNT_ID;

  const stocks = Array.isArray(payload?.stocks)
    ? payload.stocks.map((stock: any) => ({
        ...stock,
        accountId: validAccountIds.has(stock.accountId) ? stock.accountId : fallbackAccountId,
        purchases: Array.isArray(stock.purchases) ? stock.purchases : []
      }))
    : [];

  const stockAccountMap = new Map(stocks.map((stock: any) => [stock.id, stock.accountId]));

  const dividends = Array.isArray(payload?.dividends)
    ? payload.dividends.map((dividend: any) => ({
        ...dividend,
        accountId: validAccountIds.has(dividend.accountId)
          ? dividend.accountId
          : stockAccountMap.get(dividend.stockId) || fallbackAccountId
      }))
    : [];

  return {
    brokerAccounts,
    stocks,
    dividends
  };
}

async function getMongoClient() {
  if (cachedClient) return cachedClient;
  if (!uri) throw new Error('MONGODB_STRING environment variable is not set');
  
  const client = new MongoClient(uri, {
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  });
  
  await client.connect();
  cachedClient = client;
  return client;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // If no DB configured, serve empty data for GET to avoid frontend breaking
    if (req.method === 'GET' && !uri) {
      return res.status(200).json(normalizePortfolioData(null));
    }

    const client = await getMongoClient();
    // Use the database from the connection string or environment variable if available
    const db = client.db(process.env.MONGODB_DB_NAME || undefined);
    // Using <any> to prevent TS error when using a string for _id
    const collection = db.collection<any>('portfolio');

    if (req.method === 'GET') {
      try {
        const data = await collection.findOne({ _id: 'master_portfolio' });
        return res.status(200).json(normalizePortfolioData(data));
      } catch (err) {
        return res.status(200).json(normalizePortfolioData(null));
      }
    } 
    
    if (req.method === 'POST') {
      let payload = req.body;
      
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid JSON body' });
        }
      }

      const cleanedData = normalizePortfolioData(payload);
      
      await collection.updateOne(
        { _id: 'master_portfolio' },
        { $set: cleanedData },
        { upsert: true }
      );
      
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Database connection failed', 
      message: error.message 
    });
  }
}