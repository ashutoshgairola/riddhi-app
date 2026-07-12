import { mapNotificationToScreen, fallbackTargetForType } from './deepLink';

describe('mapNotificationToScreen', () => {
  it('resolves tx-detail with an id', () => {
    expect(mapNotificationToScreen({ screen: 'tx-detail', id: 't1' }))
      .toEqual({ kind: 'tx-detail', data: { id: 't1' } });
  });
  it('resolves a screen with no id', () => {
    expect(mapNotificationToScreen({ screen: 'budgets' })).toEqual({ kind: 'budgets' });
  });
  it('rejects an unknown screen', () => {
    expect(mapNotificationToScreen({ screen: 'nope' })).toBeNull();
  });
  it('rejects a null payload', () => {
    expect(mapNotificationToScreen(null)).toBeNull();
  });
});

describe('fallbackTargetForType', () => {
  it('maps every type to a target', () => {
    expect(fallbackTargetForType('budget')).toEqual({ kind: 'budgets' });
    expect(fallbackTargetForType('goal')).toEqual({ kind: 'goals' });
    expect(fallbackTargetForType('tx')).toEqual({ kind: 'txns' });
    expect(fallbackTargetForType('report')).toEqual({ kind: 'reports' });
    expect(fallbackTargetForType('security')).toEqual({ kind: 'settings' });
    expect(fallbackTargetForType('munshi')).toEqual({ kind: 'chat' });
  });
});
