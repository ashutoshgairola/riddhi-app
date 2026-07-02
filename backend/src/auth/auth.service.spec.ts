import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
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
