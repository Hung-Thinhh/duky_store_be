import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GoogleLoginDto } from '../auth/dto/google-login.dto';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import type { RequestMeta } from '../auth/types/request-meta.type';
import { CustomerAuthService } from './customer-auth.service';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordWithOtpDto } from './dto/reset-password-with-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import type { CustomerAuthUser } from './types/customer-auth-user.type';

@ApiTags('Customer Auth')
@Controller('customer/auth')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new customer with email and password' })
  @ApiBody({ type: RegisterDto })
  register(@Body() registerDto: RegisterDto, @Req() request: Request) {
    return this.customerAuthService.register(
      registerDto,
      this.getRequestMeta(request),
    );
  }

  @Post('login')
  @ApiOperation({ summary: 'Login customer with email and password' })
  @ApiBody({ type: LoginDto })
  login(@Body() loginDto: LoginDto, @Req() request: Request) {
    return this.customerAuthService.loginWithEmail(
      loginDto,
      this.getRequestMeta(request),
    );
  }

  @Post('google')
  @ApiOperation({
    summary: 'Login customer with Google, auto-create account if needed',
  })
  googleLogin(@Body() googleLoginDto: GoogleLoginDto, @Req() request: Request) {
    return this.customerAuthService.loginWithGoogle(
      googleLoginDto,
      this.getRequestMeta(request),
    );
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh customer access token' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() request: Request) {
    return this.customerAuthService.refresh(
      refreshTokenDto,
      this.getRequestMeta(request),
    );
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout customer' })
  @ApiBody({ type: RefreshTokenDto })
  logout(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.customerAuthService.logout(refreshTokenDto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current customer' })
  @UseGuards(CustomerJwtAuthGuard)
  me(@CurrentCustomer() customer: CustomerAuthUser) {
    return this.customerAuthService.me(customer.id);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update customer profile' })
  @UseGuards(CustomerJwtAuthGuard)
  updateProfile(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.customerAuthService.updateProfile(
      customer.id,
      updateProfileDto,
    );
  }

  @Put('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change customer password' })
  @UseGuards(CustomerJwtAuthGuard)
  changePassword(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.customerAuthService.changePassword(
      customer.id,
      changePasswordDto,
    );
  }

  @Get('addresses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List customer addresses' })
  @UseGuards(CustomerJwtAuthGuard)
  listAddresses(@CurrentCustomer() customer: CustomerAuthUser) {
    return this.customerAuthService.listAddresses(customer.id);
  }

  @Post('addresses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new customer address' })
  @UseGuards(CustomerJwtAuthGuard)
  createAddress(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    return this.customerAuthService.createAddress(
      customer.id,
      createAddressDto,
    );
  }

  @Patch('addresses/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update customer address' })
  @UseGuards(CustomerJwtAuthGuard)
  updateAddress(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Param('id') addressId: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    return this.customerAuthService.updateAddress(
      customer.id,
      addressId,
      updateAddressDto,
    );
  }

  @Delete('addresses/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete customer address' })
  @UseGuards(CustomerJwtAuthGuard)
  deleteAddress(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Param('id') addressId: string,
  ) {
    return this.customerAuthService.deleteAddress(customer.id, addressId);
  }

  @Get('orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List customer orders' })
  @UseGuards(CustomerJwtAuthGuard)
  listOrders(@CurrentCustomer() customer: CustomerAuthUser) {
    return this.customerAuthService.listOrders(customer.id);
  }

  @Get('orders/:code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get customer order by code' })
  @UseGuards(CustomerJwtAuthGuard)
  getOrder(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Param('code') code: string,
  ) {
    return this.customerAuthService.getOrder(customer.id, code);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset OTP' })
  @ApiBody({ type: ForgotPasswordDto })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.customerAuthService.forgotPassword(dto);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify the password reset OTP' })
  @ApiBody({ type: VerifyOtpDto })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.customerAuthService.verifyOtp(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset customer password using verified OTP' })
  @ApiBody({ type: ResetPasswordWithOtpDto })
  resetPassword(@Body() dto: ResetPasswordWithOtpDto) {
    return this.customerAuthService.resetPasswordWithOtp(dto);
  }

  private getRequestMeta(request: Request): RequestMeta {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
