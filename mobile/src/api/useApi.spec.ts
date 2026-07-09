import { runWithOneRetry, RETRY_BACKOFF_MS } from './useApi';

describe('runWithOneRetry', () => {
  it('resolves from the first attempt without waiting/retrying on success', async () => {
    let calls = 0;
    const run = () => {
      calls++;
      return Promise.resolve('ok');
    };
    const wait = jest.fn(() => Promise.resolve());

    await expect(runWithOneRetry(run, wait)).resolves.toBe('ok');
    expect(calls).toBe(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('retries exactly once after a rejection, backing off first', async () => {
    let calls = 0;
    const run = () => {
      calls++;
      return calls === 1 ? Promise.reject(new Error('network')) : Promise.resolve('ok');
    };
    const wait = jest.fn(() => Promise.resolve());

    await expect(runWithOneRetry(run, wait, 1200)).resolves.toBe('ok');
    expect(calls).toBe(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(1200);
  });

  it('uses RETRY_BACKOFF_MS as the default backoff', async () => {
    const run = jest
      .fn()
      .mockReturnValueOnce(Promise.reject(new Error('network')))
      .mockReturnValueOnce(Promise.resolve('ok'));
    const wait = jest.fn(() => Promise.resolve());

    await runWithOneRetry(run, wait);
    expect(wait).toHaveBeenCalledWith(RETRY_BACKOFF_MS);
  });

  it('rejects with the retry attempt error when both attempts fail (never a 3rd attempt)', async () => {
    let calls = 0;
    const run = () => {
      calls++;
      return Promise.reject(new Error(`fail-${calls}`));
    };
    const wait = jest.fn(() => Promise.resolve());

    await expect(runWithOneRetry(run, wait)).rejects.toThrow('fail-2');
    expect(calls).toBe(2);
  });

  it('never calls the network-facing run a 3rd time even if the retry also rejects', async () => {
    const run = jest.fn(() => Promise.reject(new Error('down')));
    const wait = jest.fn(() => Promise.resolve());

    await runWithOneRetry(run, wait).catch(() => {});
    // Give any (incorrect) extra retry a chance to schedule before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(2);
  });
});
