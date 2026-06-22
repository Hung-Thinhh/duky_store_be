import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordWithOtpDto } from './dto/reset-password-with-otp.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
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
  private readonly failedAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number; lockedUntil: number | null }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
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

  async register(registerDto: RegisterDto, requestMeta: RequestMeta) {
    if (registerDto.password !== registerDto.passwordConfirmation) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const email = registerDto.email.toLowerCase();

    const existingCustomer = await this.prisma.customer.findUnique({
      where: { email },
    });

    if (existingCustomer) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);

    const customer = await this.prisma.customer.create({
      data: {
        email,
        fullName: email.split('@')[0],
        passwordHash,
        status: 'ACTIVE',
        type: 'NEW',
      },
    });

    return this.issueTokenPair(customer, requestMeta);
  }

  async loginWithEmail(loginDto: LoginDto, requestMeta: RequestMeta) {
    const email = loginDto.email.toLowerCase();

    this.checkRateLimit(email);

    const customer = await this.prisma.customer.findUnique({
      where: { email },
    });

    if (!customer) {
      this.recordFailedAttempt(email);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (!customer.passwordHash) {
      this.recordFailedAttempt(email);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      customer.passwordHash,
    );

    if (!isPasswordValid) {
      this.recordFailedAttempt(email);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (customer.status === 'BLOCKED') {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    this.clearFailedAttempts(email);

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

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const customer = await this.findCustomerById(customerId);
    if (!customer || customer.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản khách hàng không hoạt động');
    }

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName.trim();
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone?.trim() || null;
      if (phone) {
        const existing = await this.prisma.customer.findFirst({
          where: { phone, NOT: { id: customerId } },
        });
        if (existing) {
          throw new ConflictException('Số điện thoại đã được sử dụng');
        }
        data.phone = phone;
      } else {
        data.phone = null;
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data,
    });

    return this.toCustomerAuthUser(updated);
  }

  async changePassword(customerId: string, dto: ChangePasswordDto) {
    const customer = await this.findCustomerById(customerId);
    if (!customer || customer.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản khách hàng không hoạt động');
    }

    if (!customer.passwordHash) {
      throw new BadRequestException('Tài khoản liên kết bên thứ ba không thể đổi mật khẩu');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      customer.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash },
    });

    return { success: true };
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
      hasPassword: !!customer.passwordHash,
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

  private checkRateLimit(email: string): void {
    const record = this.failedAttempts.get(email);

    if (!record) {
      return;
    }

    const now = Date.now();

    if (record.lockedUntil && now < record.lockedUntil) {
      throw new HttpException(
        'Quá nhiều lần thử, vui lòng đợi 15 phút',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (record.lockedUntil && now >= record.lockedUntil) {
      this.failedAttempts.delete(email);
      return;
    }

    const windowMs = 15 * 60 * 1000;

    if (now - record.firstAttemptAt > windowMs) {
      this.failedAttempts.delete(email);
      return;
    }

    if (record.count >= 5) {
      record.lockedUntil = now + windowMs;
      throw new HttpException(
        'Quá nhiều lần thử, vui lòng đợi 15 phút',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedAttempt(email: string): void {
    const record = this.failedAttempts.get(email);
    const now = Date.now();

    if (!record) {
      this.failedAttempts.set(email, {
        count: 1,
        firstAttemptAt: now,
        lockedUntil: null,
      });
      return;
    }

    const windowMs = 15 * 60 * 1000;

    if (now - record.firstAttemptAt > windowMs) {
      this.failedAttempts.set(email, {
        count: 1,
        firstAttemptAt: now,
        lockedUntil: null,
      });
      return;
    }

    record.count += 1;
  }

  private clearFailedAttempts(email: string): void {
    this.failedAttempts.delete(email);
  }

  async listAddresses(customerId: string) {
    return this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAddress(customerId: string, createAddressDto: CreateAddressDto) {
    const addressCount = await this.prisma.customerAddress.count({
      where: { customerId },
    });
    const isDefault = addressCount === 0 ? true : !!createAddressDto.isDefault;

    if (isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerAddress.create({
      data: {
        customerId,
        fullName: createAddressDto.fullName,
        phone: createAddressDto.phone,
        addressLine: createAddressDto.addressLine,
        ward: createAddressDto.ward,
        district: createAddressDto.district,
        province: createAddressDto.province,
        country: createAddressDto.country || 'VN',
        isDefault,
        note: createAddressDto.note,
      },
    });
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    updateAddressDto: UpdateAddressDto,
  ) {
    const existingAddress = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });
    if (!existingAddress) {
      throw new BadRequestException(
        'Không tìm thấy địa chỉ hoặc bạn không có quyền chỉnh sửa',
      );
    }

    if (updateAddressDto.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        fullName: updateAddressDto.fullName,
        phone: updateAddressDto.phone,
        addressLine: updateAddressDto.addressLine,
        ward: updateAddressDto.ward,
        district: updateAddressDto.district,
        province: updateAddressDto.province,
        country: updateAddressDto.country,
        isDefault: updateAddressDto.isDefault,
        note: updateAddressDto.note,
      },
    });
  }

  async deleteAddress(customerId: string, addressId: string) {
    const existingAddress = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });
    if (!existingAddress) {
      throw new BadRequestException(
        'Không tìm thấy địa chỉ hoặc bạn không có quyền xóa',
      );
    }

    await this.prisma.customerAddress.delete({
      where: { id: addressId },
    });

    if (existingAddress.isDefault) {
      const firstRemaining = await this.prisma.customerAddress.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'asc' },
      });
      if (firstRemaining) {
        await this.prisma.customerAddress.update({
          where: { id: firstRemaining.id },
          data: { isDefault: true },
        });
      }
    }

    return { success: true };
  }

  async listOrders(customerId: string) {
    return this.prisma.order.findMany({
      where: {
        customerId,
      },
      include: {
        items: true,
        payments: true,
        shippingAddress: true,
        shipments: true,
        statusHistories: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(customerId: string, code: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        code,
      },
      include: {
        items: true,
        payments: true,
        shippingAddress: true,
        shipments: true,
        statusHistories: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();

    const customer = await this.prisma.customer.findUnique({
      where: { email },
    });

    if (!customer) {
      throw new NotFoundException('tài khoản gmail này chưa được đăng ký');
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.customerPasswordReset.deleteMany({
      where: { email },
    });

    await this.prisma.customerPasswordReset.create({
      data: {
        email,
        otpCode,
        expiresAt,
      },
    });

    await this.notificationsService.enqueueRawEmail({
      recipient: email,
      subject: 'Đặt lại mật khẩu - DUKY Store',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #c9a96e; text-align: center;">Yêu Cầu Đặt Lại Mật Khẩu</h2>
          <p>Chào bạn,</p>
          <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại DUKY Store. Dưới đây là mã xác thực (OTP) của bạn:</p>
          <div style="background-color: #faf8f5; border: 1px dashed #c9a96e; border-radius: 4px; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #1a1a2e; margin: 20px 0;">
            ${otpCode}
          </div>
          <p style="color: #666; font-size: 14px;">Mã xác thực này chỉ tồn tại trong vòng <strong>5 phút</strong>. Quá 5 phút mã xác thực sẽ không còn hiệu lực.</p>
          <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">DUKY Store - Luxury Minimalist Fashion</p>
        </div>
      `,
    });

    return { success: true };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase();

    const resetRecord = await this.prisma.customerPasswordReset.findFirst({
      where: { email, otpCode: dto.otpCode },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      throw new BadRequestException('mã xác thực không hợp lệ vui lòng nhập lại mã mới');
    }

    await this.prisma.customerPasswordReset.update({
      where: { id: resetRecord.id },
      data: { verified: true },
    });

    return { success: true };
  }

  async resetPasswordWithOtp(dto: ResetPasswordWithOtpDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    const email = dto.email.toLowerCase();

    const resetRecord = await this.prisma.customerPasswordReset.findFirst({
      where: { email, otpCode: dto.otpCode, verified: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      throw new BadRequestException('mã xác thực không hợp lệ vui lòng nhập lại mã mới');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.customer.update({
      where: { email },
      data: { passwordHash },
    });

    await this.prisma.customerPasswordReset.delete({
      where: { id: resetRecord.id },
    });

    return { success: true };
  }
}
