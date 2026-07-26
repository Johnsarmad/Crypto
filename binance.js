const axios = require('axios');

const BASE_URL = 'https://api.binance.com';

// Pairs jo skip karne hain kyunke ye signals ke liye useless hain
// (stablecoin-to-stablecoin, aur leveraged tokens jo bohot volatile/misleading hote hain)
const STABLE_QUOTES = ['USDCUSDT', 'BUSDUSDT', 'TUSDUSDT', 'DAIUSDT', 'FDUSDUSDT', 'USDPUSDT', 'EURUSDT', 'GBPUSDT'];
const LEVERAGED_PATTERNS = ['UPUSDT', 'DOWNUSDT', 'BULLUSDT', 'BEARUSDT'];

async function getUSDTSymbols() {
  const { data } = await axios.get(`${BASE_URL}/api/v3/exchangeInfo`, { timeout: 15000 });

  const symbols = data.symbols
    .filter((s) => {
      if (s.quoteAsset !== 'USDT') return false;
      if (s.status !== 'TRADING') return false;
      if (!s.isSpotTradingAllowed) return false;
      if (STABLE_QUOTES.includes(s.symbol)) return false;
      if (LEVERAGED_PATTERNS.some((p) => s.symbol.endsWith(p))) return false;
      return true;
    })
    .map((s) => s.symbol);

  return symbols;
}

async function getKlines(symbol, interval = '1h', limit = 100) {
  const { data } = await axios.get(`${BASE_URL}/api/v3/klines`, {
    params: { symbol, interval, limit },
    timeout: 10000,
  });
  return data;
}

// Simple concurrency-limited runner taake Binance rate limit / IP ban se bacha jaye
async function runWithConcurrency(items, worker, concurrency = 5, delayMs = 150) {
  const results = [];
  let index = 0;

  async function runNext() {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        const result = await worker(items[currentIndex]);
        results.push(result);
      } catch (err) {
        // Ek symbol fail ho to poora scan mat roko, bas skip karo
        results.push(null);
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const workers = Array.from({ length: concurrency }, () => runNext());
  await Promise.all(workers);
  return results;
}

module.exports = { getUSDTSymbols, getKlines, runWithConcurrency };
