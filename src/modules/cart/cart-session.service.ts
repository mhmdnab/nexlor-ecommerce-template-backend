import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Env } from '../../config/env.validation';
import { CartIdentity, CartService } from './cart.service';

export const CART_COOKIE = 'cart_session';
const ONE_YEAR = 60 * 60 * 24 * 365 * 1000;

export interface ResolvedCart {
  identity: CartIdentity;
  /** Set when the request is authenticated (used as order.userId). */
  userId?: string;
}

/**
 * Resolves whose cart a request touches and manages the guest session cookie.
 * Shared by the cart and checkout controllers so the rules live in one place.
 */
@Injectable()
export class CartSessionService {
  constructor(
    private readonly cart: CartService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Cookie attributes shared by set/clear. SameSite/Secure/Domain come from env
   * so the guest-cart cookie survives cross-site requests in production (where
   * the storefront and API sit on different domains) the same way auth does.
   */
  private cookieOptions(): CookieOptions {
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });
    const opts: CookieOptions = {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAMESITE', { infer: true }),
      path: '/',
    };
    if (domain) opts.domain = domain;
    return opts;
  }

  async resolve(req: Request, res: Response): Promise<ResolvedCart> {
    const user = req.user as AuthUser | undefined;
    const sessionId: string | undefined = req.cookies?.[CART_COOKIE];

    if (user) {
      if (sessionId) {
        await this.cart.mergeGuestIntoUser(user.id, sessionId);
        res.clearCookie(CART_COOKIE, this.cookieOptions());
      }
      return { identity: { userId: user.id }, userId: user.id };
    }

    if (sessionId) return { identity: { sessionId } };

    const fresh = nanoid();
    res.cookie(CART_COOKIE, fresh, { ...this.cookieOptions(), maxAge: ONE_YEAR });
    return { identity: { sessionId: fresh } };
  }
}
