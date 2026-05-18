import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request } from 'express';
import type { AuthUser } from './types/auth-user.type';
import type { RequestMeta } from './types/request-meta.type';

@ApiTags('Admin Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login admin user' })
  login(@Body() loginDto: LoginDto, @Req() request: Request) {
    return this.authService.login(loginDto, this.getRequestMeta(request));
  }

  @Post('google')
  @ApiOperation({ summary: 'Login admin user with Google ID token' })
  googleLogin(@Body() googleLoginDto: GoogleLoginDto, @Req() request: Request) {
    return this.authService.loginWithGoogle(
      googleLoginDto,
      this.getRequestMeta(request),
    );
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(
      refreshTokenDto,
      this.getRequestMeta(request),
    );
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout admin user' })
  @ApiBody({ type: RefreshTokenDto })
  logout(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.logout(refreshTokenDto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current admin user' })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CONTENT_EDITOR', 'ORDER_MANAGER')
  @UseGuards(JwtAuthGuard, RolesGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current admin password' })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CONTENT_EDITOR', 'ORDER_MANAGER')
  @UseGuards(JwtAuthGuard, RolesGuard)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, changePasswordDto);
  }

  private getRequestMeta(request: Request): RequestMeta {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
