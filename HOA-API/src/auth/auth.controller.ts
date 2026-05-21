import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { PasswordResetService, ResetApp } from './password-reset.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public, CurrentUser } from '../common/decorators';
import { successResponse } from '../common/dto';

class RequestPasswordResetDto {
  @IsEmail() @MaxLength(255) email: string;
  @IsIn(['enterprise', 'residents']) app: ResetApp;
}

class ConfirmPasswordResetDto {
  @IsString() @MinLength(20) @MaxLength(200) token: string;
  @IsString() @MinLength(8) @MaxLength(200) password: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private passwordReset: PasswordResetService,
  ) {}

  @Public()
  // Strict throttle: 10 failed attempts / 5 min per IP. Mitigates credential
  // stuffing without locking out legitimate users on a typo flurry.
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 10, ttl: 5 * 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(dto, { ip, userAgent });
    return successResponse(result);
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    return successResponse(result);
  }

  /**
   * Forgot-password — start the reset flow. Always returns 200 with the
   * same shape regardless of whether the email exists; the service never
   * leaks user enumeration. Strict throttle so an attacker can't dial up
   * thousands of probes per minute.
   */
  @Public()
  @Throttle({ short: { limit: 3, ttl: 60_000 }, medium: { limit: 10, ttl: 15 * 60_000 } })
  @Post('password-reset/request')
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await this.passwordReset.request(dto.email, dto.app, { ip, userAgent });
    // Neutral response — never branches on existence.
    return successResponse({
      ok: true,
      message: 'If that email is on file, a reset link is on its way.',
    });
  }

  /**
   * Forgot-password — finish: swap the token for a new password. Throttle
   * here too because a brute-force on a stolen email link could try a
   * dictionary of passwords; the user only needs ~1 attempt.
   */
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 20, ttl: 15 * 60_000 } })
  @Post('password-reset/confirm')
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const result = await this.passwordReset.confirm(dto.token, dto.password, ip);
    return successResponse(result);
  }

  @ApiBearerAuth()
  @Get('profile')
  async getProfile(@CurrentUser('sub') userId: string) {
    const profile = await this.authService.getProfile(userId);
    return successResponse(profile);
  }

  /**
   * Swap the active role for the current session. The body specifies which
   * role + (optional) organization the caller wants their fresh JWT to be
   * issued for. The service re-verifies the assignment exists and is active
   * — a revoked role can't be re-acquired by hitting this endpoint.
   */
  @ApiBearerAuth()
  @Post('switch-role')
  async switchRole(
    @CurrentUser('sub') userId: string,
    @Body() body: { targetRole: string; targetOrganizationId?: string },
  ) {
    const result = await this.authService.switchRole(
      userId,
      body.targetRole,
      body.targetOrganizationId,
    );
    return successResponse(result);
  }
}
