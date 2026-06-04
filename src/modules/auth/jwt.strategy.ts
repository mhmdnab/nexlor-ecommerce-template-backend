import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Env } from '../../config/env.validation';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: AuthUser['role'];
}

/** Pull the access token from the httpOnly cookie first, then Bearer header. */
function fromCookieOrHeader(req: Request): string | null {
  const cookieToken = req?.cookies?.['access_token'];
  if (cookieToken) return cookieToken;
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: fromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token.');
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
