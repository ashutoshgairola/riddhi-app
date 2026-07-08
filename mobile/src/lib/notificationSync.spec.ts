const getPending = jest.fn();
const markUploaded = jest.fn();
jest.mock('../../modules/notification-listener', () => ({
  isNotificationListenerAvailable: true,
  DEFAULT_ALLOWLIST: ['com.rapido.passenger'],
  getPending: (...a: any[]) => getPending(...a),
  markUploaded: (...a: any[]) => markUploaded(...a),
  setAllowlist: jest.fn(),
  isEnabled: () => true,
}));
const post = jest.fn();
jest.mock('../api/client', () => ({ apiClient: { post: (...a: any[]) => post(...a), get: jest.fn() } }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { uploadCaptured } from './notificationSync';

describe('uploadCaptured', () => {
  beforeEach(() => { getPending.mockReset(); markUploaded.mockReset(); post.mockReset(); });

  it('uploads pending captures and marks them uploaded', async () => {
    getPending.mockResolvedValueOnce([
      { id: '1', packageName: 'com.rapido.passenger', title: 'Ride', text: '₹159', postedAt: 1 },
    ]);
    post.mockResolvedValueOnce({ inserted: 1 });
    const n = await uploadCaptured();
    expect(post).toHaveBeenCalledWith('/notification-sync/ingest', {
      notifications: [
        { packageName: 'com.rapido.passenger', title: 'Ride', text: '₹159', postedAt: 1 },
      ],
    });
    expect(markUploaded).toHaveBeenCalledWith(['1']);
    expect(n).toBe(1);
  });

  it('no captures → no upload', async () => {
    getPending.mockResolvedValueOnce([]);
    const n = await uploadCaptured();
    expect(post).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });
});
