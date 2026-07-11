/**
 * categories.update / categories.remove — verify each issues the right verb +
 * path and bumps the data version. Mocks the transport (`./client`) and the
 * refresh bus (`./refresh`) so no native modules load.
 */
jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setAuthToken: jest.fn(),
  setSessionHandlers: jest.fn(),
}));
jest.mock('./refresh', () => ({ bumpData: jest.fn(), subscribeData: jest.fn() }));

import { api } from './index';
import { apiClient } from './client';
import { bumpData } from './refresh';

describe('api.categories mutations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('update PATCHes /categories/:id with the partial and bumps data', async () => {
    (apiClient.patch as jest.Mock).mockResolvedValueOnce({});
    await api.categories.update('c1', { name: 'Groceries', icon: 'cart', color: '#7faf93' });
    expect(apiClient.patch).toHaveBeenCalledWith('/categories/c1', {
      name: 'Groceries', icon: 'cart', color: '#7faf93',
    });
    expect(bumpData).toHaveBeenCalledTimes(1);
  });

  it('remove DELETEs /categories/:id and bumps data', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValueOnce(undefined);
    await api.categories.remove('c1');
    expect(apiClient.delete).toHaveBeenCalledWith('/categories/c1');
    expect(bumpData).toHaveBeenCalledTimes(1);
  });
});
