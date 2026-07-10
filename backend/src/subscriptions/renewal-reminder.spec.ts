import { isReminderDue } from './renewal-reminder';

const sub = (over: any = {}) => ({
  id: 's1', status: 'active', reminderDays: 2, nextRenewalDate: '2026-05-03',
  lastReminderSentFor: null, ...over,
});

describe('isReminderDue', () => {
  const today = new Date('2026-05-01T00:00:00Z');

  it('is due when renewal is within reminderDays', () => {
    expect(isReminderDue(sub(), today)).toBe(true);
  });
  it('is not due when renewal is further out than reminderDays', () => {
    expect(isReminderDue(sub({ nextRenewalDate: '2026-05-20' }), today)).toBe(false);
  });
  it('is not due when reminders are off', () => {
    expect(isReminderDue(sub({ reminderDays: null }), today)).toBe(false);
  });
  it('is not due when already reminded for this renewal', () => {
    expect(isReminderDue(sub({ lastReminderSentFor: '2026-05-03' }), today)).toBe(false);
  });
  it('is not due for paused subs', () => {
    expect(isReminderDue(sub({ status: 'paused' }), today)).toBe(false);
  });
});
