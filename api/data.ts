import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const uri = process.env.MONGODB_STRING;
let cachedClient: MongoClient | null = null;

async function getMongoClient() {
  if (cachedClient) {
    try {
      // Basic check if connection is still alive
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedClient;
    } catch (e) {
      cachedClient = null;
    }
  }
  
  if (!uri) throw new Error('MONGODB_STRING environment variable is missing in Vercel');
  
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    connectTimeoutMS: 10000,
    socketTimeoutMS: 15000,
  });
  
  await client.connect();
  cachedClient = client;
  return client;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const client = await getMongoClient();
    const db = client.db('divitrack');
    const collection = db.collection('portfolio');

    if (req.method === 'GET') {
      const data = await collection.findOne({ _id: 'master_portfolio' });
      return res.status(200).json(data || { stocks: [], dividends: [] });
    } 
    
    if (req.method === 'POST') {
      let payload = req.body;
      if (typeof payload === 'string') {
        payload = JSON.parse(payload);
      }

      const cleanedData = {
        stocks: Array.isArray(payload.stocks) ? payload.stocks : [],
        dividends: Array.isArray(payload.dividends) ? payload.dividends : []
      };
      
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
      error: 'Backend Database Error', 
      message: error.message
    });
  }
}