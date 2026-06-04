import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Env } from '../../config/env.validation';
import { CookieConfig, clearAuthCookies, setAuthCookies } from './auth.cookies';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private cookieConfig(): CookieConfig {
    return {
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      sameSite: this.config.get('COOKIE_SAMESITE', { infer: true }),
    };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a customer account and sign in.' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(dto);
    setAuthCookies(res, tokens, this.cookieConfig());
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email + password.' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto);
    setAuthCookies(res, tokens, this.cookieConfig());
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token and mint a new access token.' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['refresh_token'];
    const { user, tokens } = await this.auth.refresh(token);
    setAuthCookies(res, tokens, this.cookieConfig());
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the current refresh token and clear cookies.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.['refresh_token']);
    clearAuthCookies(res, this.cookieConfig());
    return { success: true };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated user.' })
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
