import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthUser } from './types/auth-user.type';
import { JwtPayload } from './types/jwt-payload.type';
import { RequestMeta } from './types/request-meta.type';

type UserWithAuthRelations = NonNullable<
  Awaited<ReturnType<AuthService['findUserById']>>
>;
type ExpirationString = `${number}${'s' | 'm' | 'h' | 'd'}`;
type GoogleTokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string;
  iss?: string;
  name?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto, requestMeta: RequestMeta) {
    const user = await this.findUserByEmail(loginDto.email);

    if (!user) {
      await this.writeLoginHistory(loginDto.email, false, requestMeta);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      await this.writeLoginHistory(loginDto.email, false, requestMeta, user.id);
      throw new ForbiddenException('User is not active');
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      await this.writeLoginHistory(loginDto.email, false, requestMeta, user.id);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.writeLoginHistory(loginDto.email, true, requestMeta, user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokenPair(user, requestMeta);
  }

  async loginWithGoogle(
    googleLoginDto: GoogleLoginDto,
    requestMeta: RequestMeta,
  ) {
    const tokenInfo = await this.verifyGoogleIdToken(googleLoginDto);
    const email = tokenInfo.email?.toLowerCase();

    if (!email) {
      throw new UnauthorizedException('Google account email is missing');
    }

    const user = await this.findUserByEmail(email);

    if (!user) {
      await this.writeLoginHistory(email, false, requestMeta);
      throw new UnauthorizedException('Google account is not allowed');
    }

    if (user.status !== 'ACTIVE') {
      await this.writeLoginHistory(email, false, requestMeta, user.id);
      throw new ForbiddenException('User is not active');
    }

    await this.writeLoginHistory(email, true, requestMeta, user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokenPair(user, requestMeta);
  }

  async refresh(refreshTokenDto: RefreshTokenDto, requestMeta: RequestMeta) {
    const tokenHash = this.hashRefreshToken(refreshTokenDto.refreshToken);
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: this.userAuthInclude(),
        },
      },
    });

    if (
      !refreshToken ||
      refreshToken.revokedAt ||
      refreshToken.expiresAt <= new Date() ||
      refreshToken.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(refreshToken.user, requestMeta);
  }

  async logout(refreshTokenDto: RefreshTokenDto) {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshTokenDto.refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.findUserById(userId);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }

    return this.toAuthUser(user);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }

    const passwordMatches = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(changePasswordDto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    return { success: true };
  }

  async validateJwtPayload(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.findUserById(payload.sub);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }

    return this.toAuthUser(user);
  }

  private async issueTokenPair(
    user: UserWithAuthRelations,
    requestMeta: RequestMeta,
  ) {
    const authUser = this.toAuthUser(user);
    const payload: JwtPayload = {
      sub: authUser.id,
      email: authUser.email,
      roles: authUser.roles,
    };
    const accessExpiresIn = this.getExpiration('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.getExpiration('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshToken = this.createRefreshToken();

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        userAgent: requestMeta.userAgent,
        ipAddress: requestMeta.ipAddress,
        expiresAt: new Date(Date.now() + this.toMilliseconds(refreshExpiresIn)),
      },
    });

    return {
      tokenType: 'Bearer',
      accessToken,
      refreshToken,
      accessExpiresIn,
      refreshExpiresIn,
      user: authUser,
    };
  }

  private async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: this.userAuthInclude(),
    });
  }

  private async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: this.userAuthInclude(),
    });
  }

  private userAuthInclude() {
    return {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    } as const;
  }

  private toAuthUser(user: UserWithAuthRelations): AuthUser {
    const roles = user.roles.map((userRole) => userRole.role.name);
    const permissions = user.roles.flatMap((userRole) =>
      userRole.role.permissions.map(
        (rolePermission) =>
          `${rolePermission.permission.subject}.${rolePermission.permission.action}`,
      ),
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roles: [...new Set(roles)],
      permissions: [...new Set(permissions)],
    };
  }

  private async writeLoginHistory(
    email: string,
    success: boolean,
    requestMeta: RequestMeta,
    userId?: string,
  ) {
    await this.prisma.loginHistory.create({
      data: {
        userId,
        email: email.toLowerCase(),
        success,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      },
    });
  }

  private async verifyGoogleIdToken(googleLoginDto: GoogleLoginDto) {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        googleLoginDto.idToken,
      )}`,
    );

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const tokenInfo = (await response.json()) as GoogleTokenInfo;
    const allowedClientIds = this.getAllowedGoogleClientIds();

    if (!allowedClientIds.length) {
      throw new BadRequestException('GOOGLE_CLIENT_ID is not configured');
    }

    if (!tokenInfo.aud || !allowedClientIds.includes(tokenInfo.aud)) {
      throw new UnauthorizedException('Google token audience is not allowed');
    }

    if (
      googleLoginDto.clientId &&
      tokenInfo.aud !== googleLoginDto.clientId.trim()
    ) {
      throw new UnauthorizedException('Google token audience mismatch');
    }

    if (
      tokenInfo.iss &&
      !['accounts.google.com', 'https://accounts.google.com'].includes(
        tokenInfo.iss,
      )
    ) {
      throw new UnauthorizedException('Invalid Google token issuer');
    }

    if (
      tokenInfo.email_verified !== true &&
      tokenInfo.email_verified !== 'true'
    ) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    if (tokenInfo.exp && Number(tokenInfo.exp) * 1000 <= Date.now()) {
      throw new UnauthorizedException('Google ID token has expired');
    }

    return tokenInfo;
  }

  private getAllowedGoogleClientIds() {
    const configuredClientIds =
      this.configService.get<string>('GOOGLE_CLIENT_IDS') ??
      this.configService.get<string>('GOOGLE_CLIENT_ID') ??
      '';
    const allowedClientIds = configuredClientIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    return allowedClientIds;
  }

  private createRefreshToken() {
    return `${randomUUID()}.${randomBytes(48).toString('hex')}`;
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private getExpiration(key: string, fallback: ExpirationString) {
    const value = this.configService.get<string>(key);
    return this.isExpirationString(value) ? value : fallback;
  }

  private isExpirationString(
    value: string | undefined,
  ): value is ExpirationString {
    return Boolean(value?.match(/^\d+(s|m|h|d)$/));
  }

  private toMilliseconds(value: ExpirationString) {
    const match = value.match(/^(\d+)(s|m|h|d)$/);

    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return amount * multipliers[unit];
  }
}
