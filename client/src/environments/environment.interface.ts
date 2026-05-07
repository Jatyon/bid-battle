export interface Environment {
  production: boolean;
  appName: string;
  storageKeyPrefix: string;
  /** Base URL for REST API calls, e.g. `https://api.example.com/api/v1` or `/api/v1` */
  apiUrl: string;
  /**
   * Base URL for WebSocket connections, e.g. `https://api.example.com`.
   * Set to `''` (empty string) when `sameOriginWs` is `true` — the socket
   * will connect to the same host that serves the Angular app.
   */
  wsUrl: string;
  /**
   * When `true`, WebSocket connections use the same origin as the app (wsUrl is ignored).
   * Typical for production deployments where Nginx proxies both HTTP and WS traffic.
   * When `false`, `wsUrl` must be a non-empty absolute URL.
   */
  sameOriginWs: boolean;
}
