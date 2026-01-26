import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  
  const { tickers } = req.query;
  
  if (!tickers || typeof tickers !== 'string') {
    return res.status(400).json({ error: 'Missing tickers parameter' });
  }

  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());

  try {
    const results: Record<string, number> = {};
    
    // Yahoo Finance can fetch multiple quotes at once
    const quotes = await yahooFinance.quote(tickerList) as any;

    // Check if quotes is array (multiple results) or single object
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    quotesArray.forEach((q: any) => {
      if (q && typeof q.symbol === 'string' && typeof q.regularMarketPrice === 'number') {
        results[q.symbol] = q.regularMarketPrice;
      }
    });

    return res.status(200).json(results);
  } catch (error: any) {
    console.error('Price fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch prices' });
  }
}
