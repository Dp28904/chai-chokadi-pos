import { csvCell } from './csv';

describe('csvCell', () => {
  it('quotes commas and quotes', () => expect(csvCell('a,"b"')).toBe('"a,""b"""'));
  it('neutralises formulas', () => expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)"));
  it('leaves plain values alone', () => expect(csvCell(42)).toBe('42'));
});
