import { NotificationType } from '../common/enums';

describe('NotificationType', () => {
  it('includes the Munshi suggestion type', () => {
    expect(NotificationType.MUNSHI_SUGGESTION).toBe('munshi_suggestion');
  });
});
