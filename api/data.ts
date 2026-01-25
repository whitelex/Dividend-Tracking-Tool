import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const uri = process.env.MONGODB_STRING;
let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  if (cachedClient) {
    try {
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedClient;
    } catch {
      cachedClient = null;
    }
  }

  if (!uri) throw new Error('MONGODB_STRING is required');

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  await client.connect();
  cachedClient = client;
  return client;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const client = await connectToDatabase();
    // Using <any> here prevents TypeScript from enforcing ObjectId for the _id field,
    // which allows us to use the string 'master' as a stable key.
    const collection = client.db('divitrack').collection<any>('data');

    if (req.method === 'GET') {
      const data = await collection.findOne({ _id: 'master' });
      return res.status(200).json(data || { stocks: [], dividends: [] });
    }

    if (req.method === 'POST') {
      const payload = req.body;
      await collection.updateOne(
        { _id: 'master' },
        { $set: { stocks: payload.stocks || [], dividends: payload.dividends || [] } },
        { upsert: true }
      );
      return res.status(200).json({ success: true });
    }

    return res.status(405).end();
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}