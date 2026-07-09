import { pluralize } from './pluralize';

it('uses the singular form for 1', () => {
  expect(pluralize(1, 'day')).toBe('1 day');
});

it('appends "s" for counts other than 1', () => {
  expect(pluralize(0, 'day')).toBe('0 days');
  expect(pluralize(2, 'day')).toBe('2 days');
});

it('uses the explicit plural override when given', () => {
  expect(pluralize(1, 'day left', 'days left')).toBe('1 day left');
  expect(pluralize(3, 'day left', 'days left')).toBe('3 days left');
});
