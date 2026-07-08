import { CapturedNotification } from './captured-notification.entity';

describe('CapturedNotification entity', () => {
  it('constructs with expected fields', () => {
    const c = new CapturedNotification();
    c.packageName = 'com.rapido';
    c.text = 'Your ride ₹159';
    c.dedupKey = 'abc';
    c.analyzed = false;
    expect(c.packageName).toBe('com.rapido');
    expect(c.analyzed).toBe(false);
  });
});
