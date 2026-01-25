
import { GoogleGenAI } from "@google/genai";
import { PortfolioState } from "../types";

export const getPortfolioInsights = async (portfolio: PortfolioState): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const stockSummary = portfolio.stocks.map(s => {
    const totalShares = s.purchases.reduce((sum, p) => sum + p.shares, 0);
    const totalCost = s.purchases.reduce((sum, p) => sum + (p.shares * p.price), 0);
    const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
    return `${s.ticker}: ${totalShares.toFixed(2)} shares @ avg $${avgPrice.toFixed(2)}`;
  }).join(', ');

  const dividendTotal = portfolio.dividends.reduce((sum, d) => sum + d.amount, 0);

  const prompt = `
    Analyze this stock dividend portfolio:
    Stocks: ${stockSummary || 'None yet'}
    Total Dividends Collected: $${dividendTotal.toFixed(2)}
    
    Provide a professional, concise financial analysis (max 200 words). 
    Discuss diversification, potential yield strategies, and the impact of their purchase history on their yield on cost.
    Use professional investor terminology.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Unable to generate insights at this time.";
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Error connecting to AI advisor. Please check your connection and try again.";
  }
};
