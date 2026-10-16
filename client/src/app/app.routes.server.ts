import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Auth pages must not be pre-rendered — pre-rendered HTML arrives in the browser
    // before Angular bootstraps, making the login form briefly visible to authenticated
    // users even after guestGuard redirects. Client rendering lets Angular control the
    // full lifecycle: provideAppInitializer blocks bootstrap until silentRefresh resolves,
    // so the guard redirects before any auth component ever enters the DOM.
    path: 'auth/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
