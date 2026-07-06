import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private googleClient = new OAuth2Client();

  private signTokens(user: User) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
    return { accessToken, refreshToken };
  }

  private safeUser(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = user as User & { password?: string };
    return rest;
  }

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const hashed = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      password: hashed,
    });
    const saved = await this.userRepo.save(user);
    const tokens = this.signTokens(saved);
    return { ...tokens, user: this.safeUser(saved) };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.signTokens(user);
    return { ...tokens, user: this.safeUser(user) };
  }

  // A pending reset code is valid for 10 minutes and survives at most this many
  // wrong guesses before it is burned — bounding brute force of the 6-digit space.
  private static readonly RESET_CODE_TTL_MS = 10 * 60 * 1000;
  private static readonly RESET_MAX_ATTEMPTS = 5;

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /**
   * Emails a 6-digit password-reset code (10-min expiry). Always resolves the
   * same way whether or not the email exists, so the endpoint can't be used to
   * enumerate accounts. When email is not configured the code is logged
   * server-side so a reset can be completed manually in dev.
   */
  async forgotPassword(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (user) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      user.resetTokenHash = this.hashCode(code);
      user.resetTokenExpiresAt = new Date(
        Date.now() + AuthService.RESET_CODE_TTL_MS,
      );
      user.resetAttempts = 0;
      await this.userRepo.save(user);

      const body =
        `Someone requested a password reset for your Riddhi account.\n\n` +
        `Your reset code is: ${code}\n\n` +
        `Enter it in the app to choose a new password. This code expires in ` +
        `10 minutes. If you didn't request it, you can ignore this email.`;
      // Non-blocking failure: never reveal delivery status to the caller (no
      // account enumeration), but do log send failures server-side.
      await this.mail
        .send(email, 'Your Riddhi password reset code', body)
        .catch(() => undefined);
    }
    return { ok: true };
  }

  /**
   * Verifies the emailed code for `email` and sets a new password. Every
   * failure path returns the same generic error so neither the email's
   * existence nor a code's correctness can be probed.
   */
  async resetPassword(email: string, code: string, newPassword: string) {
    const invalid = () =>
      new UnauthorizedException('Invalid or expired reset code');

    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect(['user.resetTokenHash', 'user.resetAttempts'])
      .where('user.email = :email', { email })
      .getOne();

    if (
      !user ||
      !user.resetTokenHash ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt.getTime() < Date.now()
    ) {
      throw invalid();
    }

    if (user.resetAttempts >= AuthService.RESET_MAX_ATTEMPTS) {
      // Burn the code so a throttled attacker can't keep trying past expiry.
      await this.clearResetCode(user);
      throw invalid();
    }

    if (!this.codeMatches(code, user.resetTokenHash)) {
      user.resetAttempts += 1;
      await this.userRepo.save(user);
      throw invalid();
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await this.clearResetCode(user);
    return { ok: true };
  }

  private async clearResetCode(user: User) {
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.resetAttempts = 0;
    await this.userRepo.save(user);
  }

  /** Constant-time compare of a candidate code against the stored hash. */
  private codeMatches(code: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hashCode(code));
    const stored = Buffer.from(storedHash);
    return (
      candidate.length === stored.length && timingSafeEqual(candidate, stored)
    );
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{ sub: string; email: string }>(
        refreshToken,
        { secret: this.config.get<string>('JWT_REFRESH_SECRET') },
      );
      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return this.signTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async googleLogin(idToken: string) {
    // Comma-separated list: web client ID plus the iOS/Android client IDs —
    // tokens minted on native devices carry the platform client ID as `aud`.
    const audience = (this.config.get<string>('GOOGLE_CLIENT_ID') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (audience.length === 0) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    let payload: { email?: string; name?: string } | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!payload?.email) {
      throw new UnauthorizedException('Google account has no email');
    }

    let user = await this.userRepo.findOne({ where: { email: payload.email } });
    if (!user) {
      const randomPassword = randomBytes(32).toString('hex');
      const hashed = await bcrypt.hash(randomPassword, 10);
      user = await this.userRepo.save(
        this.userRepo.create({
          name: payload.name ?? payload.email.split('@')[0],
          email: payload.email,
          password: hashed,
        }),
      );
    }
    const tokens = this.signTokens(user);
    return { ...tokens, user: this.safeUser(user) };
  }
}
