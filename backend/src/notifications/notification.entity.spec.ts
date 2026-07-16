import { NotificationType } from '../common/enums';

describe('NotificationType', () => {
  it('includes the Munshi ji suggestion type', () => {
    expect(NotificationType.MUNSHI_SUGGESTION).toBe('munshi_suggestion');
  });
});
