import { recommend } from './recommend';

describe('recommend', () => {
  it('weights recent days more', () => {
    // (30*3 + 20*2 + 10*1) / 6 = 23.33
    expect(recommend([30, 20, 10], 0).avgDaily).toBe(23.3);
  });

  it('adds a 15% buffer and subtracts stock on hand', () => {
    const r = recommend([100, 100, 100], 40); // need ceil(115) = 115
    expect(r.needed).toBe(115);
    expect(r.toPrepare).toBe(75);
  });

  it('applies the peak factor', () => {
    expect(recommend([100], 0, 1.3).needed).toBe(150); // ceil(100*1.3*1.15)
  });

  it('never recommends a negative amount', () => {
    expect(recommend([10], 500).toPrepare).toBe(0);
  });

  it('uses only the days available', () => {
    expect(recommend([40], 0).avgDaily).toBe(40);
  });

  it('flags items with days of data but no sales as slow; no data is not slow', () => {
    expect(recommend([0, 0, 0], 5).slow).toBe(true);
    expect(recommend([], 5).slow).toBe(false);
  });
});
