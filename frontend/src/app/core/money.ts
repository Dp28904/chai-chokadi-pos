export const toPaise = (rupees: number | string): number => Math.round(Number(rupees) * 100);
export const toRupees = (paise: number): number => paise / 100;
export const formatRupees = (paise: number): string =>
  '₹' + toRupees(paise).toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

/** Axis-friendly amount: 120000 paise -> ₹1.2k */
export const compactRupees = (paise: number): string => {
  const r = paise / 100;
  if (r >= 100000) return '₹' + +(r / 100000).toFixed(1) + 'L';
  if (r >= 1000) return '₹' + +(r / 1000).toFixed(1) + 'k';
  return '₹' + Math.round(r);
};
