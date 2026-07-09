import { needsPinBackfill } from './lockPolicy';

describe('needsPinBackfill', () => {
  it('is true only when biometric is on and no PIN is set', () => {
    expect(needsPinBackfill({ pin: false, biometric: true })).toBe(true);
  });
  it('is false when a PIN exists (with biometric)', () => {
    expect(needsPinBackfill({ pin: true, biometric: true })).toBe(false);
  });
  it('is false when biometric is off (PIN-only is valid)', () => {
    expect(needsPinBackfill({ pin: true, biometric: false })).toBe(false);
  });
  it('is false when neither factor is configured', () => {
    expect(needsPinBackfill({ pin: false, biometric: false })).toBe(false);
  });
});
