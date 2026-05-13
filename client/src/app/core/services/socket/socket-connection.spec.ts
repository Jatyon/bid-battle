import { SocketConnection } from './socket-connection';
import { firstValueFrom, take, noop } from 'rxjs';

const createMockSocket = (connected = false) => {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  const socket = {
    connected,
    id: 'mock-socket-id',
    disconnect: vi.fn().mockImplementation(() => {
      socket.connected = false;
    }),
    emit: vi.fn(),
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    off: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      handlers.set(
        event,
        list.filter((h) => h !== handler),
      );
    }),
    trigger: (event: string, ...args: unknown[]) => {
      (handlers.get(event) ?? []).forEach((h) => h(...args));
    },
    handlers,
  };

  return socket;
};

type MockSocket = ReturnType<typeof createMockSocket>;

describe('SocketConnection', () => {
  let mockSocket: MockSocket;
  let socketFactory: ReturnType<typeof vi.fn>;
  let getToken: ReturnType<typeof vi.fn>;
  let connection: SocketConnection;

  beforeEach(() => {
    mockSocket = createMockSocket();
    socketFactory = vi.fn().mockReturnValue(mockSocket);
    getToken = vi.fn().mockReturnValue('test-token');
    connection = new SocketConnection({
      url: 'http://localhost:3000/test',
      getToken: getToken as unknown as () => string,
      socketFactory: socketFactory as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with status "disconnected"', () => {
      expect(connection.status()).toBe('disconnected');
    });

    it('should start with socketId null', () => {
      expect(connection.socketId()).toBeNull();
    });

    it('should start with isConnected false', () => {
      expect(connection.isConnected()).toBe(false);
    });
  });

  describe('connect()', () => {
    it('should set status to "connecting" immediately', () => {
      connection.connect();
      expect(connection.status()).toBe('connecting');
    });

    it('should call io() with the correct URL', () => {
      connection.connect();
      expect(socketFactory).toHaveBeenCalledWith(
        'http://localhost:3000/test',
        expect.objectContaining({ transports: ['websocket'] }),
      );
    });

    it('should be idempotent when socket is already connected', () => {
      mockSocket.connected = true;
      connection.connect();
      connection.connect();
      expect(socketFactory).toHaveBeenCalledTimes(1);
    });

    it('should set status to "connected" on connect event', () => {
      connection.connect();
      mockSocket.trigger('connect');
      expect(connection.status()).toBe('connected');
      expect(connection.isConnected()).toBe(true);
    });

    it('should set socketId on connect event', () => {
      connection.connect();
      mockSocket.trigger('connect');
      expect(connection.socketId()).toBe('mock-socket-id');
    });

    it('should set status to "disconnected" on disconnect event', () => {
      connection.connect();
      mockSocket.trigger('connect');
      mockSocket.trigger('disconnect', 'io server disconnect');
      expect(connection.status()).toBe('disconnected');
      expect(connection.socketId()).toBeNull();
    });

    it('should set status to "error" on connect_error event', () => {
      connection.connect();
      mockSocket.trigger('connect_error', new Error('timeout'));
      expect(connection.status()).toBe('error');
    });

    it('should set status to "connected" on reconnect event', () => {
      connection.connect();
      mockSocket.trigger('reconnect', 1);
      expect(connection.status()).toBe('connected');
    });

    it('should set status to "connecting" on reconnect_attempt event', () => {
      connection.connect();
      mockSocket.trigger('connect');
      mockSocket.trigger('reconnect_attempt');
      expect(connection.status()).toBe('connecting');
    });

    it('should call getToken inside the auth callback', () => {
      connection.connect();
      const authCallback = (
        socketFactory.mock.calls[0][1] as { auth: (cb: (data: unknown) => void) => void }
      ).auth;
      const cb = vi.fn();
      authCallback(cb);
      expect(getToken).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ token: 'test-token' });
    });
  });

  describe('disconnect()', () => {
    it('should call socket.disconnect()', () => {
      connection.connect();
      connection.disconnect();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should reset status to "disconnected"', () => {
      connection.connect();
      mockSocket.trigger('connect');
      connection.disconnect();
      expect(connection.status()).toBe('disconnected');
    });

    it('should reset socketId to null', () => {
      connection.connect();
      mockSocket.trigger('connect');
      connection.disconnect();
      expect(connection.socketId()).toBeNull();
    });

    it('should allow a new connect() after disconnect()', () => {
      connection.connect();
      connection.disconnect();

      const newSocket = createMockSocket();
      socketFactory.mockReturnValue(newSocket);

      connection.connect();
      expect(socketFactory).toHaveBeenCalledTimes(2);
    });
  });

  describe('emit()', () => {
    it('should forward event and payload to the socket', () => {
      connection.connect();
      mockSocket.connected = true;
      connection.emit('bid:place', { amount: 100 });
      expect(mockSocket.emit).toHaveBeenCalledWith('bid:place', { amount: 100 });
    });

    it('should warn and not throw when socket is not connected', () => {
      vi.spyOn(console, 'warn').mockImplementation(noop);
      connection.emit('bid:place', { amount: 100 });
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('on()', () => {
    it('should emit values when event is triggered after connect()', async () => {
      connection.connect();
      mockSocket.connected = true;

      const values: unknown[] = [];
      connection
        .on<number>('bid:new')
        .pipe(take(2))
        .subscribe((v) => values.push(v));

      mockSocket.trigger('bid:new', 42);
      mockSocket.trigger('bid:new', 99);

      expect(values).toEqual([42, 99]);
    });

    it('should defer listener registration until connect() is called', async () => {
      const promise = firstValueFrom(connection.on<string>('bid:new'));

      connection.connect();
      mockSocket.trigger('bid:new', 'hello');

      expect(await promise).toBe('hello');
    });

    it('should unsubscribe listener via socket.off() when observable is unsubscribed', () => {
      connection.connect();
      mockSocket.connected = true;

      const sub = connection.on<string>('bid:new').subscribe(noop);
      sub.unsubscribe();

      expect(mockSocket.off).toHaveBeenCalledWith('bid:new', expect.any(Function));
    });

    it('should complete the deferred observable cleanly when disconnect() is called before connect()', async () => {
      const results: string[] = [];
      let completed = false;

      connection
        .on<string>('bid:new')
        .subscribe({ next: (v) => results.push(v), complete: () => (completed = true) });

      connection.disconnect();

      expect(completed).toBe(true);
      expect(results).toHaveLength(0);
    });
  });
});
