import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import * as express from 'express';
import ms from 'ms';

/**
 * Central service for managing HttpOnly cookies.
 *
 * Encapsulates all cookie setting and clearing options,
 * eliminating logic duplication across controllers.
 */
@Injectable()
export class CookieService {
  private readonly SAME_SITE: 'lax' | 'strict' | 'none' = 'lax';
  private readonly PATH = '/';

  constructor(private readonly configService: AppConfigService) {}

  /**
   * Sets an HttpOnly cookie containing the refresh token.
   *
   * @param res - Express response object
   * @param token - Refresh token value
   */
  setRefreshToken(res: express.Response, token: string): void {
    const maxAge = ms(this.configService.jwt.refreshTokenLife as Parameters<typeof ms>[0]);
    res.cookie(this.configService.cookies.refreshTokenName, token, {
      httpOnly: true,
      secure: this.configService.app.mode === 'production',
      sameSite: this.SAME_SITE,
      maxAge,
      path: this.PATH,
    });
  }

  /**
   * Clears the refresh token cookie.
   *
   * @param res - Express response object
   */
  clearRefreshToken(res: express.Response): void {
    res.clearCookie(this.configService.cookies.refreshTokenName, {
      httpOnly: true,
      path: this.PATH,
    });
  }

  /**
   * Retrieves the value of any cookie from the request object.
   * Used by the @Cookie() decorator.
   *
   * @param req - Express request object (or any object with a cookies field)
   * @param name - Name of the cookie to read
   */
  getCookie(req: { cookies?: Record<string, string> }, name: string): string | undefined {
    return req.cookies?.[name];
  }

  /**
   * Retrieves the refresh token from the request.
   */
  getRefreshToken(req: { cookies?: Record<string, string> }): string | undefined {
    return this.getCookie(req, this.configService.cookies.refreshTokenName);
  }
}
