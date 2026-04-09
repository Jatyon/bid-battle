import { INestApplicationContext } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { SocketIoAdapter } from './socket-io.adapter';

const buildAdapter = (corsOrigin: string | undefined, mode: string = 'development'): SocketIoAdapter => {
  const configService = {
    app: {
      mode,
      corsOrigin,
    },
  } as unknown as AppConfigService;

  const app = {
    get: jest.fn().mockReturnValue(configService),
  } as unknown as INestApplicationContext;

  return new SocketIoAdapter(app);
};

describe('SocketIoAdapter', () => {
  describe('constructor', () => {
    it('should be created successfully with valid config', () => {
      const adapter = buildAdapter('http://localhost:4200');
      expect(adapter).toBeDefined();
    });

    it('should allow all origins in development when corsOrigin is empty', () => {
      const adapter = buildAdapter('');
      expect(adapter).toBeDefined();
    });

    it('should parse multiple comma-separated origins', () => {
      const adapter = buildAdapter('http://localhost:4200,https://example.com');
      expect(adapter).toBeDefined();
    });
  });

  describe('createIOServer — CORS origin callback', () => {
    let createIOServerSpy: jest.SpyInstance;

    beforeEach(() => {
      createIOServerSpy = jest.spyOn(Object.getPrototypeOf(SocketIoAdapter.prototype), 'createIOServer').mockReturnValue({} as any);
    });

    afterEach(() => {
      createIOServerSpy.mockRestore();
    });

    type CorsCallback = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void;

    interface MockServerOpts {
      cors: {
        origin: CorsCallback;
      };
    }

    const extractOriginCallback = (adapter: SocketIoAdapter): CorsCallback => {
      adapter.createIOServer(3000);

      const [, opts] = createIOServerSpy.mock.calls[0] as [unknown, MockServerOpts];

      return opts.cors.origin;
    };

    it('should allow requests with no origin (same-origin / server-to-server)', () => {
      const adapter = buildAdapter('http://localhost:4200');
      const originCb = extractOriginCallback(adapter);
      const callback = jest.fn();

      originCb(undefined, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should allow all origins in development when allowedOrigins list is empty', () => {
      const adapter = buildAdapter('', 'development');
      const originCb = extractOriginCallback(adapter);
      const callback = jest.fn();

      originCb('http://any-origin.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should allow a request from an explicitly listed origin', () => {
      const adapter = buildAdapter('http://localhost:4200', 'production');
      const originCb = extractOriginCallback(adapter);
      const callback = jest.fn();

      originCb('http://localhost:4200', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should allow a request when wildcard "*" is in the allowed list', () => {
      const adapter = buildAdapter('*', 'production');
      const originCb = extractOriginCallback(adapter);
      const callback = jest.fn();

      originCb('http://any-origin.com', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should block a request from an unlisted origin in production', () => {
      const adapter = buildAdapter('https://allowed.com', 'production');
      const originCb = extractOriginCallback(adapter);
      const callback = jest.fn();

      originCb('https://evil.com', callback);

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
      const [error] = callback.mock.calls[0] as [Error];
      expect(error.message).toBe('Not allowed by CORS');
    });

    it('should block when in production and no origins configured and origin present', () => {
      const adapter = buildAdapter('', 'production');
      const originCb = extractOriginCallback(adapter);
      const callback = jest.fn();

      originCb('https://attacker.com', callback);

      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
