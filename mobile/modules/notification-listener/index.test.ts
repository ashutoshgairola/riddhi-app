jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));

import { isNotificationListenerAvailable, getPending, isEnabled } from './index';

describe('notification-listener (unsupported platform)', () => {
  it('reports unavailable and no-ops', async () => {
    expect(isNotificationListenerAvailable).toBe(false);
    expect(isEnabled()).toBe(false);
    await expect(getPending()).resolves.toEqual([]);
  });
});
