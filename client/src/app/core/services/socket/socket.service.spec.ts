import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { TokenService } from '@core/index';
import { SocketService, SOCKET_IO_FACTORY } from './socket.service';

const createMockSocket = () => ({
  connected: false,
  id: 'mock-id',
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

let ioMock: ReturnType<typeof vi.fn>;

const createService = (platformId = 'browser', token = 'token'): SocketService => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platformId },
      { provide: TokenService, useValue: { accessToken: vi.fn().mockReturnValue(token) } },
      { provide: SOCKET_IO_FACTORY, useValue: ioMock },
    ],
  });
  return TestBed.inject(SocketService);
};

describe('SocketService', () => {
  let service: SocketService;

  beforeEach(() => {
    ioMock = vi.fn().mockReturnValue(createMockSocket());
    service = createService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getOrCreate()', () => {
    it('should return a SocketConnection instance', () => {
      const conn = service.getOrCreate('/bid');
      expect(conn).toBeDefined();
      expect(typeof conn.connect).toBe('function');
      expect(typeof conn.disconnect).toBe('function');
    });

    it('should return the same instance on subsequent calls', () => {
      const first = service.getOrCreate('/bid');
      const second = service.getOrCreate('/bid');
      expect(first).toBe(second);
    });

    it('should create separate connections per namespace', () => {
      const bid = service.getOrCreate('/bid');
      const auctions = service.getOrCreate('/auctions');
      expect(bid).not.toBe(auctions);
    });

    it('should build the URL from environment.wsUrl + namespace', () => {
      service.getOrCreate('/bid');
      const conn = service.getOrCreate('/bid');
      conn.connect();
      expect(ioMock).toHaveBeenCalledWith(expect.stringContaining('/bid'), expect.any(Object));
    });

    it('should pass a getToken function that returns the current access token', () => {
      service.getOrCreate('/bid').connect();
      const authCallback = (ioMock.mock.calls[0][1] as { auth: (cb: (data: unknown) => void) => void }).auth;
      const cb = vi.fn();
      authCallback(cb);
      expect(cb).toHaveBeenCalledWith({ token: 'token' });
    });

    it('should pass an empty string when accessToken is null', () => {
      const s = createService('browser', null as unknown as string);
      const tokenService = TestBed.inject(TokenService);
      (tokenService.accessToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
      s.getOrCreate('/bid').connect();
      const authCallback = (ioMock.mock.calls[0][1] as { auth: (cb: (data: unknown) => void) => void }).auth;
      const cb = vi.fn();
      authCallback(cb);
      expect(cb).toHaveBeenCalledWith({ token: '' });
    });

    it('should throw when called on the server (SSR)', () => {
      const ssrService = createService('server');
      expect(() => ssrService.getOrCreate('/bid')).toThrow(/getOrCreate.*was called during SSR/);
    });
  });

  describe('has()', () => {
    it('should return false before a connection is created', () => {
      expect(service.has('/bid')).toBe(false);
    });

    it('should return true after getOrCreate()', () => {
      service.getOrCreate('/bid');
      expect(service.has('/bid')).toBe(true);
    });

    it('should return false for an unknown namespace after creating another', () => {
      service.getOrCreate('/bid');
      expect(service.has('/auctions')).toBe(false);
    });
  });

  describe('remove()', () => {
    it('should disconnect and remove the connection', () => {
      const conn = service.getOrCreate('/bid');
      vi.spyOn(conn, 'disconnect');

      service.remove('/bid');

      expect(conn.disconnect).toHaveBeenCalled();
      expect(service.has('/bid')).toBe(false);
    });

    it('should do nothing for a non-existent namespace', () => {
      expect(() => service.remove('/non-existent')).not.toThrow();
    });
  });

  describe('disconnectAll()', () => {
    it('should disconnect all active connections', () => {
      const bid = service.getOrCreate('/bid');
      const auctions = service.getOrCreate('/auctions');
      vi.spyOn(bid, 'disconnect');
      vi.spyOn(auctions, 'disconnect');

      service.disconnectAll();

      expect(bid.disconnect).toHaveBeenCalled();
      expect(auctions.disconnect).toHaveBeenCalled();
    });

    it('should remove all connections from the registry', () => {
      service.getOrCreate('/bid');
      service.getOrCreate('/auctions');

      service.disconnectAll();

      expect(service.has('/bid')).toBe(false);
      expect(service.has('/auctions')).toBe(false);
    });
  });

  describe('ngOnDestroy()', () => {
    it('should disconnect all connections in the browser', () => {
      const conn = service.getOrCreate('/bid');
      vi.spyOn(conn, 'disconnect');

      service.ngOnDestroy();

      expect(conn.disconnect).toHaveBeenCalled();
    });

    it('should NOT disconnect anything on the server', () => {
      const ssrService = createService('server');
      expect(() => ssrService.ngOnDestroy()).not.toThrow();
    });
  });
});
