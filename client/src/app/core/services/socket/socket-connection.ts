import { Signal, computed, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, switchMap, take } from 'rxjs';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SocketConnectionOptions {
  /** Full namespace URL, e.g. `https://api.example.com/bid` */
  url: string;
  /** Callback returning the current access token — called on every (re)connect to support silent refresh */
  getToken: () => string;
}

/**
 * Represents a single socket.io connection to a specific namespace.
 *
 * Instances are created and stored by `SocketService`.
 * Feature services (e.g. `BidSocketService`) inject `SocketService`
 * and retrieve or create their connection via `getOrCreate(namespace)`.
 */
export class SocketConnection {
  private socket: Socket | null = null;

  private readonly _status = signal<ConnectionStatus>('disconnected');
  private readonly _socketId = signal<string | null>(null);

  /**
   * Emits once every time a new socket instance is created inside connect().
   * Used by on() to defer listener registration when connect() has not been called yet.
   *
   * Replaced with a fresh Subject on every disconnect() so that any on() calls
   * pending during a disconnect→reconnect cycle do not leak or receive stale emissions.
   */
  private _socketReady$ = new Subject<void>();

  readonly status: Signal<ConnectionStatus> = this._status.asReadonly();
  readonly socketId: Signal<string | null> = this._socketId.asReadonly();
  readonly isConnected = computed(() => this._status() === 'connected');

  constructor(private readonly options: SocketConnectionOptions) {}

  // ── Connection ─────────────────────────────────────────────────────────────

  /**
   * Creates and opens the connection.
   * Idempotent — safe to call multiple times.
   */
  connect(): void {
    if (this.socket?.connected) return;

    this._status.set('connecting');

    this.socket = io(this.options.url, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      auth: (cb: (data: Record<string, unknown>) => void) => {
        // Token is fetched fresh on every (re)connect to support silent refresh
        cb({ token: this.options.getToken() });
      },
    });

    // Notify any on() calls that were deferred because the socket did not exist yet
    this._socketReady$.next();
    this.registerCoreListeners();
  }

  /** Disconnects the socket and resets internal state. */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this._status.set('disconnected');
    this._socketId.set(null);

    // Complete the current subject so any on() calls that were waiting for
    // connect() (and never got it) have their observable terminated cleanly
    // instead of hanging forever and leaking memory.
    // A fresh subject is created so the next connect() cycle works correctly.
    this._socketReady$.complete();
    this._socketReady$ = new Subject<void>();
  }

  // ── Emitting events ────────────────────────────────────────────────────────

  emit<T>(event: string, payload?: T): void {
    if (!this.socket?.connected) {
      console.warn(
        `[SocketConnection:${this.options.url}] Attempted to emit "${event}" without an active connection`,
      );
      return;
    }
    this.socket.emit(event, payload);
  }

  // ── Listening to events ────────────────────────────────────────────────────

  /**
   * Returns an Observable that emits every time the given `event` is received from the server.
   * The subscriber is responsible for unsubscribing (e.g. via `takeUntilDestroyed`).
   *
   * Safe to call before connect() — the listener registration is deferred until
   * the socket instance is created, so no events are missed and no error is thrown.
   */
  on<T>(event: string): Observable<T> {
    if (this.socket) return this.attachListener<T>(event);

    // connect() has not been called yet — wait for the socket to be created,
    // then attach the listener. take(1) ensures we subscribe only once per on() call.
    return this._socketReady$.pipe(
      take(1),
      switchMap(() => this.attachListener<T>(event)),
    );
  }

  private attachListener<T>(event: string): Observable<T> {
    return new Observable<T>((observer) => {
      if (!this.socket) {
        observer.error(
          new Error(
            `[SocketConnection:${this.options.url}] Socket instance unexpectedly missing for event "${event}".`,
          ),
        );
        return;
      }
      const handler = (data: T) => observer.next(data);
      this.socket.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private registerCoreListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this._status.set('connected');
      this._socketId.set(this.socket?.id ?? null);
    });

    this.socket.on('disconnect', (reason: string) => {
      this._status.set('disconnected');
      this._socketId.set(null);
      console.info(`[SocketConnection:${this.options.url}] Disconnected: ${reason}`);
    });

    this.socket.on('connect_error', (err: Error) => {
      this._status.set('error');
      console.error(`[SocketConnection:${this.options.url}] Connection error: ${err.message}`);
    });

    this.socket.on('reconnect', (attempt: number) => {
      this._status.set('connected');
      console.info(
        `[SocketConnection:${this.options.url}] Reconnected after ${attempt} attempt(s)`,
      );
    });

    this.socket.on('reconnect_attempt', () => {
      this._status.set('connecting');
    });
  }
}
