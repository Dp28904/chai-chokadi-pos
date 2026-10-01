import { loyaltyPercent, LoyaltyRule } from './loyalty';

const myoc: LoyaltyRule = { value: 5, loyaltyStep: 5, loyaltyMax: 20, loyaltyGapHours: 15 };
const at = (h: number) => new Date(Date.UTC(2026, 9, 1) + h * 3600_000); // hours from 1 Oct 00:00 UTC

describe('loyaltyPercent', () => {
  it('first visit gets the starting 5%', () => {
    expect(loyaltyPercent(myoc, [], at(2))).toBe(5);
  });

  it('2 AM then 10 PM the same day (20 h later) gets 10%', () => {
    expect(loyaltyPercent(myoc, [at(2)], at(22))).toBe(10);
  });

  it('coming back within 15 h keeps the same level', () => {
    expect(loyaltyPercent(myoc, [at(2)], at(14))).toBe(5); // 12 h later
    expect(loyaltyPercent(myoc, [at(2), at(22)], at(30))).toBe(10); // 8 h after the 10% visit
  });

  it('climbs 5 -> 10 -> 15 -> 20 and stays at 20', () => {
    const visits = [at(0), at(20), at(40), at(60), at(80)];
    expect(loyaltyPercent(myoc, visits.slice(0, 1), at(20))).toBe(10);
    expect(loyaltyPercent(myoc, visits.slice(0, 2), at(40))).toBe(15);
    expect(loyaltyPercent(myoc, visits.slice(0, 3), at(60))).toBe(20);
    expect(loyaltyPercent(myoc, visits, at(100))).toBe(20);
  });

  it('several bills in one night count as one visit', () => {
    // three bills at 20:00, 21:00, 23:00, then next evening
    expect(loyaltyPercent(myoc, [at(20), at(21), at(23)], at(44))).toBe(10);
  });

  it('measures the 15 h from the visit that counted, so frequent short gaps still progress', () => {
    // 0 h (visit 1), 10 h (same visit), 20 h is 20 h after visit 1 -> new visit
    expect(loyaltyPercent(myoc, [at(0), at(10)], at(20))).toBe(10);
  });

  it('never resets after a long break', () => {
    expect(loyaltyPercent(myoc, [at(0), at(20)], at(24 * 10))).toBe(15);
  });

  it('offers without a ladder use their fixed percent', () => {
    expect(loyaltyPercent({ ...myoc, loyaltyStep: 0 }, [at(0), at(20), at(40)], at(60))).toBe(5);
  });
});
