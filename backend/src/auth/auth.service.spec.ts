import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';

describe('AuthService.googleLogin', () => {
  let service: AuthService;

  const existingUser = {
    id: 'u1',
    name: 'Riddhi',
    email: 'r@gmail.com',
    isFirstLogin: false,
  } as User;

  const userRepo = {
    findOne: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    create: jest.fn().mockImplementation((u) => u),
    save: jest
      .fn()
      .mockImplementation((u) =>
        Promise.resolve({ ...u, id: 'u2', isFirstLogin: true }),
      ),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('tok') };
  const config = { get: jest.fn().mockReturnValue('secret') };
  const mail = {
    send: jest.fn().mockResolvedValue(true),
    isConfigured: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  function mockVerify(payload: unknown) {
    // googleClient is a private field; override its verifyIdToken for the test.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (service as any).googleClient = {
      verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => payload }),
    };
  }

  it('returns tokens for an existing user', async () => {
    mockVerify({ email: 'r@gmail.com', name: 'Riddhi' });
    userRepo.findOne.mockResolvedValue(existingUser);
    const result = await service.googleLogin('id-token');
    expect(result.user.email).toBe('r@gmail.com');
    expect(result.accessToken).toBe('tok');
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('creates a new user when email is unknown', async () => {
    mockVerify({ email: 'new@gmail.com', name: 'New User' });
    userRepo.findOne.mockResolvedValue(null);
    const result = await service.googleLogin('id-token');
    expect(userRepo.save).toHaveBeenCalled();
    expect(result.user.isFirstLogin).toBe(true);
  });

  it('throws UnauthorizedException on invalid token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (service as any).googleClient = {
      verifyIdToken: jest.fn().mockRejectedValue(new Error('bad')),
    };
    await expect(service.googleLogin('bad')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when payload has no email', async () => {
    mockVerify({ name: 'No Email' });
    await expect(service.googleLogin('t')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when GOOGLE_CLIENT_ID is not configured', async () => {
    config.get.mockReturnValueOnce('');
    // Mock googleClient to verify it is not called
    const verifyIdTokenMock = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (service as any).googleClient = { verifyIdToken: verifyIdTokenMock };
    await expect(service.googleLogin('id-token')).rejects.toThrow(
      UnauthorizedException,
    );
    // Verify verifyIdToken was never called
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });
});

describe('AuthService password reset (email OTP)', () => {
  let service: AuthService;

  // Repo whose createQueryBuilder resolves to whatever `qbUser` is set to.
  let qbUser: (Partial<User> & { resetAttempts?: number }) | null;
  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((u: unknown) => Promise.resolve(u)),
    createQueryBuilder: jest.fn(() => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(qbUser),
    })),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('tok') };
  const config = { get: jest.fn().mockReturnValue('secret') };
  const mail = {
    send: jest.fn().mockResolvedValue(true),
    isConfigured: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    qbUser = null;
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  // Reproduce the service's own hashing so tests can forge a stored code.
  function hash(code: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return (service as any).hashCode(code);
  }

  describe('forgotPassword', () => {
    it('emails a 6-digit code and resets the attempt counter', async () => {
      const user = { email: 'a@b.com' } as User;
      userRepo.findOne.mockResolvedValue(user);
      const res = await service.forgotPassword('a@b.com');
      expect(res).toEqual({ ok: true });
      expect(userRepo.save).toHaveBeenCalled();
      expect(user.resetTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(user.resetAttempts).toBe(0);
      expect(user.resetTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
      const [, , body] = mail.send.mock.calls[0] as [string, string, string];
      expect(body).toMatch(/\b\d{6}\b/);
    });

    it('is a no-op (still ok) for an unknown email — no enumeration', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const res = await service.forgotPassword('missing@b.com');
      expect(res).toEqual({ ok: true });
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('swallows mail-send failures', async () => {
      userRepo.findOne.mockResolvedValue({ email: 'a@b.com' });
      mail.send.mockRejectedValueOnce(new Error('smtp down'));
      await expect(service.forgotPassword('a@b.com')).resolves.toEqual({
        ok: true,
      });
    });
  });

  describe('resetPassword', () => {
    const future = () => new Date(Date.now() + 5 * 60 * 1000);

    it('sets the new password when the code matches', async () => {
      qbUser = {
        email: 'a@b.com',
        resetTokenHash: hash('123456'),
        resetTokenExpiresAt: future(),
        resetAttempts: 0,
      };
      const res = await service.resetPassword(
        'a@b.com',
        '123456',
        'newpassw0rd',
      );
      expect(res).toEqual({ ok: true });
      expect(qbUser.resetTokenHash).toBeNull();
      expect(qbUser.resetTokenExpiresAt).toBeNull();
      expect(qbUser.password).toBeDefined();
      expect(qbUser.password).not.toBe('newpassw0rd');
    });

    it('rejects and increments attempts on a wrong code', async () => {
      qbUser = {
        email: 'a@b.com',
        resetTokenHash: hash('123456'),
        resetTokenExpiresAt: future(),
        resetAttempts: 0,
      };
      await expect(
        service.resetPassword('a@b.com', '000000', 'newpassw0rd'),
      ).rejects.toThrow(UnauthorizedException);
      expect(qbUser.resetAttempts).toBe(1);
      expect(qbUser.resetTokenHash).not.toBeNull();
    });

    it('burns the code once the attempt cap is reached', async () => {
      qbUser = {
        email: 'a@b.com',
        resetTokenHash: hash('123456'),
        resetTokenExpiresAt: future(),
        resetAttempts: 5,
      };
      await expect(
        service.resetPassword('a@b.com', '123456', 'newpassw0rd'),
      ).rejects.toThrow(UnauthorizedException);
      // Even the correct code is refused, and the code is cleared.
      expect(qbUser.resetTokenHash).toBeNull();
    });

    it('rejects an expired code', async () => {
      qbUser = {
        email: 'a@b.com',
        resetTokenHash: hash('123456'),
        resetTokenExpiresAt: new Date(Date.now() - 1000),
        resetAttempts: 0,
      };
      await expect(
        service.resetPassword('a@b.com', '123456', 'newpassw0rd'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when no reset was requested', async () => {
      qbUser = { email: 'a@b.com', resetAttempts: 0 };
      await expect(
        service.resetPassword('a@b.com', '123456', 'newpassw0rd'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email with the same generic error', async () => {
      qbUser = null;
      await expect(
        service.resetPassword('missing@b.com', '123456', 'newpassw0rd'),
      ).rejects.toThrow('Invalid or expired reset code');
    });
  });
});
