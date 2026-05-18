import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { GoogleLoginDto } from '../auth/dto/google-login.dto';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { RequestMeta } from '../auth/types/request-meta.type';
import { CustomerAuthUser } from './types/customer-auth-user.type';
import { CustomerJwtPayload } from './types/customer-jwt-payload.type';

type CustomerRecord = NonNullable<
  Awaited<ReturnType<CustomerAuthService['findCustomerById']>>
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
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithGoogle(
    googleLoginDto: GoogleLoginDto,
    requestMeta: RequestMeta,
  ) {
    const tokenInfo = await this.verifyGoogleIdToken(googleLoginDto);
    const email = tokenInfo.email?.toLowerCase();

    if (!email) {
      throw new UnauthorizedException('Google account email is missing');
    }

    const customer = await this.findOrCreateGoogleCustomer(email, tokenInfo);

    if (customer.status !== 'ACTIVE') {
      throw new ForbiddenException('Customer account is blocked');
    }

    return this.issueTokenPair(customer, requestMeta);
  }

  async refresh(refreshTokenDto: RefreshTokenDto, requestMeta: RequestMeta) {
    const tokenHash = this.hashRefreshToken(refreshTokenDto.refreshToken);
    const refreshToken = await this.prisma.customerRefreshToken.findUnique({
      where: { tokenHash },
      include: { customer: true },
    });

    if (
      !refreshToken ||
      refreshToken.revokedAt ||
      refreshToken.expiresAt <= new Date() ||
      refreshToken.customer.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.customerRefreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(refreshToken.customer, requestMeta);
  }

  async logout(refreshTokenDto: RefreshTokenDto) {
    await this.prisma.customerRefreshToken.updateMany({
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

  async me(customerId: string) {
    const customer = await this.findCustomerById(customerId);

    if (!customer || customer.status !== 'ACTIVE') {
      throw new UnauthorizedException('Customer account is not active');
    }

    return this.toCustomerAuthUser(customer);
  }

  async validateJwtPayload(
    payload: CustomerJwtPayload,
  ): Promise<CustomerAuthUser> {
    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Invalid customer token');
    }

    const customer = await this.findCustomerById(payload.sub);

    if (!customer || customer.status !== 'ACTIVE') {
      throw new UnauthorizedException('Customer account is not active');
    }

    return this.toCustomerAuthUser(customer);
  }

  private async findOrCreateGoogleCustomer(
    email: string,
    tokenInfo: GoogleTokenInfo,
  ) {
    const now = new Date();
    const customer = await this.prisma.customer.findUnique({
      where: { email },
    });

    if (customer) {
      if (!customer.emailVerifiedAt) {
        return this.prisma.customer.update({
          where: { id: customer.id },
          data: { emailVerifiedAt: now },
        });
      }

      return customer;
    }

    return this.prisma.customer.create({
      data: {
        email,
        fullName: tokenInfo.name?.trim() || email.split('@')[0],
        emailVerifiedAt: now,
      },
    });
  }

  private async issueTokenPair(
    customer: CustomerRecord,
    requestMeta: RequestMeta,
  ) {
    const authCustomer = this.toCustomerAuthUser(customer);
    const payload: CustomerJwtPayload = {
      sub: authCustomer.id,
      email: authCustomer.email,
      type: 'customer',
    };
    const accessExpiresIn = this.getExpiration('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.getExpiration('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshToken = this.createRefreshToken();

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    await this.prisma.customerRefreshToken.create({
      data: {
        customerId: customer.id,
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
      customer: authCustomer,
    };
  }

  private async findCustomerById(id: string) {
    return this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
  }

  private toCustomerAuthUser(customer: CustomerRecord): CustomerAuthUser {
    return {
      id: customer.id,
      email: customer.email ?? '',
      fullName: customer.fullName,
      phone: customer.phone,
      status: customer.status,
      type: customer.type,
      emailVerifiedAt: customer.emailVerifiedAt,
    };
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
      this.configService.get<string>('GOOGLE_CUSTOMER_CLIENT_IDS') ??
      this.configService.get<string>('GOOGLE_CLIENT_IDS') ??
      this.configService.get<string>('GOOGLE_CLIENT_ID') ??
      '';

    return configuredClientIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
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
