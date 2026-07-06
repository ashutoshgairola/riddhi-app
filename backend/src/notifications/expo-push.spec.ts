import { chunk, buildExpoMessages } from './expo-push';

describe('expo-push helpers', () => {
  it('chunks arrays by size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('builds one Expo message per token', () => {
    const msgs = buildExpoMessages(['ExponentPushToken[a]', 'ExponentPushToken[b]'], {
      title: 'Hello',
      body: 'World',
      data: { screen: 'budgets' },
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({
      to: 'ExponentPushToken[a]',
      title: 'Hello',
      body: 'World',
      data: { screen: 'budgets' },
      channelId: 'default',
      sound: 'default',
    });
  });
});
