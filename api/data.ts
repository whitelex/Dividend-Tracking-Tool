
import { MongoClient } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const uri = process.env.MONGODB_STRING;
const client = new MongoClient(uri || '');

let cachedDb: any = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  await client.connect();
  const db = client.db('divitrack');
  cachedDb = db;
  return db;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!uri) {
    return res.status(500).json({ error: 'MONGODB_STRING environment variable is not set' });
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection('portfolio');

    if (req.method === 'GET') {
      // For this app, we manage a single global portfolio record
      const data = await collection.findOne({ _id: 'master_portfolio' });
      return res.status(200).json(data || { stocks: [], dividends: [] });
    } 
    
    if (req.method === 'POST') {
      const payload = JSON.parse(req.body);
      // Clean the payload to ensure it matches our state structure
      const cleanedData = {
        stocks: payload.stocks || [],
        dividends: payload.dividends || []
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
    console.error('DB Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
