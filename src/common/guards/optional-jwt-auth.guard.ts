import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Populates req.user when a valid token is present, but never rejects the
 * request. Used for endpoints that work for both guests and signed-in users
 * (the cart). Pair with @Public() so the global JwtAuthGuard doesn't reject.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Always allow through; handleRequest decides whether a user is attached.
  handleRequest<TUser = AuthUser>(_err: unknown, user: TUser | false): TUser | undefined {
    return user || undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // No / invalid token — proceed as a guest.
    }
    return true;
  }
}
