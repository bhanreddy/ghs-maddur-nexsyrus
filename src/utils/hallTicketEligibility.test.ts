import {
  parseHallTicketPercent,
  presetForRange,
  validateHallTicketRange,
} from './hallTicketEligibility';

describe('hall-ticket fee eligibility', () => {
  it('accepts inclusive percentage boundaries with two decimals', () => {
    expect(parseHallTicketPercent('0')).toBe(0);
    expect(parseHallTicketPercent('21.22')).toBe(21.22);
    expect(parseHallTicketPercent('100')).toBe(100);
    expect(parseHallTicketPercent('20.001')).toBeNull();
    expect(parseHallTicketPercent('100.01')).toBeNull();
  });

  it('validates ordered ranges', () => {
    expect(validateHallTicketRange('10', '20')).toBeNull();
    expect(validateHallTicketRange('21', '20')).toMatch(/cannot be greater/);
    expect(validateHallTicketRange('', '20')).toMatch(/0 to 100/);
  });

  it('maps exact ranges to presets and keeps other ranges custom', () => {
    expect(presetForRange(100, 100)).toBe('full');
    expect(presetForRange(75, 100)).toBe('75-plus');
    expect(presetForRange(21, 22)).toBe('custom');
  });
});
