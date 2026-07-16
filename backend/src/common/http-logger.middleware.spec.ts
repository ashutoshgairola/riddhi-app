import { Logger } from '@nestjs/common';
import { HttpLoggerMiddleware } from './http-logger.middleware';

type FinishListener = () => void;

function makeRes(statusCode: number, contentLength?: string) {
  let finishListener: FinishListener | undefined;
  const res = {
    statusCode,
    get: jest.fn().mockReturnValue(contentLength),
    on: jest.fn((event: string, cb: FinishListener) => {
      if (event === 'finish') finishListener = cb;
    }),
    emitFinish: () => finishListener?.(),
  };
  return res;
}

describe('HttpLoggerMiddleware', () => {
  let middleware: HttpLoggerMiddleware;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    middleware = new HttpLoggerMiddleware();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const req = { method: 'GET', originalUrl: '/accounts', ip: '127.0.0.1' } as never;

  it('calls next()', () => {
    const next = jest.fn();
    middleware.use(req, makeRes(200) as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('logs method, url, status and ip on finish', () => {
    const res = makeRes(200, '123');
    middleware.use(req, res as never, jest.fn());
    res.emitFinish();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/accounts 200 123b \d+ms - 127\.0\.0\.1$/),
    );
  });

  it('logs 4xx as warn', () => {
    const res = makeRes(404);
    middleware.use(req, res as never, jest.fn());
    res.emitFinish();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('404'));
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs 5xx as error', () => {
    const res = makeRes(500);
    middleware.use(req, res as never, jest.fn());
    res.emitFinish();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does not log before the response finishes', () => {
    middleware.use(req, makeRes(200) as never, jest.fn());
    expect(logSpy).not.toHaveBeenCalled();
  });
});
