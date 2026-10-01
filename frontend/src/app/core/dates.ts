// The stall's business day rolls over at 05:00 India time (same rule as the server).
const IST_OFFSET_MS = 5.5 * 3600_000;
const ROLLOVER_MS = 5 * 3600_000;

export const businessToday = (): string =>
  new Date(Date.now() + IST_OFFSET_MS - ROLLOVER_MS).toISOString().slice(0, 10);

export const addDays = (isoDate: string, days: number): string => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const shortDate = (isoDate: string): string =>
  new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
