/** Repeat-customer ladder for offers like "Make Your Own Combo" (5% -> 10% -> 15% -> 20%). */
export interface LoyaltyRule {
  value: number; // starting percent
  loyaltyStep: number; // percent added per repeat visit (0 = no ladder)
  loyaltyMax: number | null; // highest percent
  loyaltyGapHours: number; // a repeat visit only counts this long after the last counted one
}

/**
 * Percent this customer gets now, from the times of their earlier paid bills that used the offer.
 * Bills closer together than the gap belong to the same visit, so ordering twice in one night
 * doesn't climb the ladder. Levels never reset.
 */
export function loyaltyPercent(rule: LoyaltyRule, history: Date[], now: Date): number {
  if (!rule.loyaltyStep) return rule.value;
  const gapMs = rule.loyaltyGapHours * 3600_000;
  let visits = 0;
  let anchor: number | null = null; // time of the last bill that counted as a new visit
  for (const t of history.map((d) => d.getTime()).sort((a, b) => a - b)) {
    if (anchor === null || t - anchor >= gapMs) {
      visits++;
      anchor = t;
    }
  }
  // This bill starts a new visit if enough time has passed since the last counted one.
  const level = anchor !== null && now.getTime() - anchor < gapMs ? visits - 1 : visits;
  return Math.min(rule.value + rule.loyaltyStep * level, rule.loyaltyMax ?? 100);
}
