/** Newest day first. Weights favour recent days. */
const WEIGHTS = [3, 2, 1];
const BUFFER = 1.15;

export interface Recommendation {
  avgDaily: number;
  needed: number;
  toPrepare: number;
  slow: boolean;
}

/**
 * @param dailyQty units sold per day, newest first (only days the stall traded)
 * @param onHand   units currently in stock
 * @param peak     demand multiplier for tomorrow (1 = normal, 1.3 = busy night)
 */
export function recommend(dailyQty: number[], onHand: number, peak = 1): Recommendation {
  const days = dailyQty.slice(0, WEIGHTS.length);
  if (!days.length) return { avgDaily: 0, needed: 0, toPrepare: 0, slow: false };
  const weights = WEIGHTS.slice(0, days.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const avgDaily = days.reduce((s, q, i) => s + q * weights[i], 0) / weightSum;
  const needed = Math.ceil(avgDaily * peak * BUFFER);
  return {
    avgDaily: Math.round(avgDaily * 10) / 10,
    needed,
    toPrepare: Math.max(0, needed - Math.max(0, onHand)),
    slow: avgDaily === 0,
  };
}
