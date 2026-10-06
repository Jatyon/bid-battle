import { io } from 'socket.io-client';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SocketConnectionOptions {
  /** Full namespace URL, e.g. `https://api.example.com/bid` */
  url: string;
  /** Callback returning the current access token — called on every (re)connect to support silent refresh */
  getToken: () => string;
  /**
   * Optional factory used to create the Socket instance.
   * Defaults to `io` from socket.io-client.
   * Override in tests to avoid real network connections.
   */
  socketFactory?: typeof io;
}
