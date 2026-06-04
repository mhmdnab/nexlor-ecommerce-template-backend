import { CookieOptions, Response } from 'express';
import { AuthTokens } from './auth.service';

export interface CookieConfig {
  secure: boolean;
  /** Empty string => host-only cookie (no Domain attribute). */
  domain: string;
  sameSite: 'lax' | 'strict' | 'none';
}

/**
 * Centralizes auth cookie config so login/refresh/logout stay consistent.
 * httpOnly (JS can't read them); SameSite/Secure come from env so the same code
 * works same-site on localhost (lax) and cross-site in prod (none + secure).
 */
function baseOptions(cfg: CookieConfig): CookieOptions {
  const opts: CookieOptions = {
    httpOnly: true,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    path: '/',
  };
  // Omit Domain entirely when empty so the cookie is scoped to the API host.
  if (cfg.domain) opts.domain = cfg.domain;
  return opts;
}

export function setAuthCookies(res: Response, tokens: AuthTokens, cfg: CookieConfig): void {
  const base = baseOptions(cfg);
  res.cookie('access_token', tokens.accessToken, { ...base, maxAge: tokens.accessTtl * 1000 });
  res.cookie('refresh_token', tokens.refreshToken, { ...base, maxAge: tokens.refreshTtl * 1000 });
}

export function clearAuthCookies(res: Response, cfg: CookieConfig): void {
  const base = baseOptions(cfg);
  res.clearCookie('access_token', base);
  res.clearCookie('refresh_token', base);
}
