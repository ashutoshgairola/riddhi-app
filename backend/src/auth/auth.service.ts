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
import { createHash, randomBytes } from 'crypto';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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

  /**
   * Issues a password-reset token (30-min expiry). Always resolves the same
   * way whether or not the email exists, so the endpoint can't be used to
   * enumerate accounts. No email service is wired yet — the token is logged
   * server-side so a reset can be completed manually in dev.
   */
  async forgotPassword(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      user.resetTokenHash = createHash('sha256').update(token).digest('hex');
      user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await this.userRepo.save(user);
      // TODO: send via email service; logged for manual dev use until then.
      console.log(`[auth] password reset token for ${email}: ${token}`);
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.resetTokenHash')
      .where('user.resetTokenHash = :tokenHash', { tokenHash })
      .getOne();
    if (
      !user ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    await this.userRepo.save(user);
    return { ok: true };
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
