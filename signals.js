const { RSI, MACD, EMA } = require('technicalindicators');

// candles = raw Binance kline array
// [ openTime, open, high, low, close, volume, closeTime, ... ]
function analyzeSymbol(symbol, candles) {
  if (!candles || candles.length < 40) return null;

  const closes = candles.map((c) => parseFloat(c[4]));
  const highs = candles.map((c) => parseFloat(c[2]));
  const lows = candles.map((c) => parseFloat(c[3]));
  const volumes = candles.map((c) => parseFloat(c[5]));
  const opens = candles.map((c) => parseFloat(c[1]));

  const lastClose = closes[closes.length - 1];
  const lastOpen = opens[opens.length - 1];
  const lastVolume = volumes[volumes.length - 1];

  let bullScore = 0;
  let bearScore = 0;
  const bullReasons = [];
  const bearReasons = [];

  // ---- RSI (14) ----
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi = rsiValues[rsiValues.length - 1];
  if (rsi !== undefined) {
    if (rsi < 30) {
      bullScore += 20;
      bullReasons.push(`RSI oversold (${rsi.toFixed(1)})`);
    } else if (rsi > 70) {
      bearScore += 20;
      bearReasons.push(`RSI overbought (${rsi.toFixed(1)})`);
    }
  }

  // ---- MACD (12,26,9) crossover ----
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  if (macdValues.length >= 2) {
    const prev = macdValues[macdValues.length - 2];
    const curr = macdValues[macdValues.length - 1];
    if (prev.histogram !== undefined && curr.histogram !== undefined) {
      if (prev.histogram <= 0 && curr.histogram > 0) {
        bullScore += 25;
        bullReasons.push('MACD bullish crossover');
      } else if (prev.histogram >= 0 && curr.histogram < 0) {
        bearScore += 25;
        bearReasons.push('MACD bearish crossover');
      }
    }
  }

  // ---- EMA9 / EMA21 crossover ----
  const ema9Values = EMA.calculate({ values: closes, period: 9 });
  const ema21Values = EMA.calculate({ values: closes, period: 21 });
  if (ema9Values.length >= 2 && ema21Values.length >= 2) {
    const prev9 = ema9Values[ema9Values.length - 2];
    const curr9 = ema9Values[ema9Values.length - 1];
    const prev21 = ema21Values[ema21Values.length - 2];
    const curr21 = ema21Values[ema21Values.length - 1];

    if (prev9 <= prev21 && curr9 > curr21) {
      bullScore += 25;
      bullReasons.push('EMA9 crossed above EMA21');
    } else if (prev9 >= prev21 && curr9 < curr21) {
      bearScore += 25;
      bearReasons.push('EMA9 crossed below EMA21');
    }
  }

  // ---- Volume spike ----
  const recentVolumes = volumes.slice(-21, -1);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / (recentVolumes.length || 1);
  const volumeRatio = avgVolume > 0 ? lastVolume / avgVolume : 0;
  if (volumeRatio > 1.5) {
    if (lastClose > lastOpen) {
      bullScore += 15;
      bullReasons.push(`Volume spike ${volumeRatio.toFixed(1)}x (buying)`);
    } else {
      bearScore += 15;
      bearReasons.push(`Volume spike ${volumeRatio.toFixed(1)}x (selling)`);
    }
  }

  // ---- Breakout / Breakdown ----
  const recentHighs = highs.slice(-21, -1);
  const recentLows = lows.slice(-21, -1);
  const rangeHigh = Math.max(...recentHighs);
  const rangeLow = Math.min(...recentLows);
  if (lastClose > rangeHigh) {
    bullScore += 15;
    bullReasons.push('Breakout above 20-candle high');
  } else if (lastClose < rangeLow) {
    bearScore += 15;
    bearReasons.push('Breakdown below 20-candle low');
  }

  const score = Math.max(bullScore, bearScore);
  if (score === 0) return null;

  const direction = bullScore > bearScore ? 'BUY' : 'SELL';
  const reasons = direction === 'BUY' ? bullReasons : bearReasons;

  return {
    symbol,
    direction,
    score,
    price: lastClose,
    reasons,
  };
}

module.exports = { analyzeSymbol };
