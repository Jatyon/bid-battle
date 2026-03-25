import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthStrategy } from '../enums';

/**
 * Optional authentication guard.
 * * If a valid JWT token is present in the request, it extracts the payload and
 * assigns it to `request.user`. If the token is missing, invalid, or expired,
 * it safely ignores the error and leaves the user as undefined/null without
 * throwing an `UnauthorizedException`.
 * * This is particularly useful for public endpoints that optionally enhance
 * their response based on the user's identity (e.g., `GET /auctions/:id`
 * hiding CANCELED auctions for anonymous guests but showing them to the owner).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard(AuthStrategy.JWT) {
  /**
   * Evaluates whether the current request is allowed to proceed by triggering
   * the underlying Passport JWT strategy.
   * * @param context - The execution context of the current request.
   * @returns A boolean, Promise, or Observable indicating if the request can proceed.
   */
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  /**
   * Overrides the default Passport request handling.
   * * Standard JWT guards throw an `UnauthorizedException` if an error occurs
   * during verification or if the user is falsy. This override suppresses those
   * exceptions and simply returns `null`, allowing the route handler to process
   * the request anonymously.
   * * @param _err - Any error thrown by the Passport strategy during verification.
   * @param user - The decoded user object if authentication was successful.
   * @returns The user object, or `null` if authentication failed.
   */
  handleRequest<TUser = any>(_err: any, user: TUser): TUser | null {
    return user ?? null;
  }
}
