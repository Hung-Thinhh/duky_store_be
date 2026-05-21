import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GoogleLoginDto } from '../auth/dto/google-login.dto';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import type { RequestMeta } from '../auth/types/request-meta.type';
import { CustomerAuthService } from './customer-auth.service';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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

  private getRequestMeta(request: Request): RequestMeta {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
