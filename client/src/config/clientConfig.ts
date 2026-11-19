import { DEFAULT_SERVER_PORT } from '@race/shared';

/** Runtime client configuration, overridable at build time via Vite env vars. */
export interface ClientConfig {
  /** A dev build's Colyseus endpoint, e.g. ws://localhost:3681 ('' in production). */
  readonly serverUrl: string;
  /**
   * Join through Boxity's matchmaker (`Legion.SDK.net.resolveEndpoint`, at the
   * playUrl Boxity told the page). Every production build does; only a dev
   * build (`npm run dev`) connects straight to its own local server.
   */
  readonly useMatchmaker: boolean;
  /** Verbose console diagnostics. */
  readonly debug: boolean;
  /** Cap on devicePixelRatio, to protect mobile GPUs. */
  readonly maxPixelRatio: number;
}

/**
 * Accept an http(s) address and hand back the ws(s) one.
 *
 * A pasted `https://` origin would fail with a message about the socket rather
 * than the scheme; converting is unambiguous, so it is done.
 */
const asWebSocketUrl = (raw: string): string => {
  const url = raw.trim().replace(/\/+$/, '');
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`;
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`;
  return url;
};

/**
 * Where a DEV build's Colyseus server is: `VITE_SERVER_URL` when set, else the
 * dev script's own server beside Vite. Production builds leave it empty and
 * join through Boxity's matchmaker instead (see `useMatchmaker`).
 */
const resolveServerUrl = (): string => {
  if (!import.meta.env.DEV) return '';
  const fromEnv = import.meta.env['VITE_SERVER_URL'] as string | undefined;
  if (fromEnv && fromEnv.trim()) return asWebSocketUrl(fromEnv);
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.hostname}:${DEFAULT_SERVER_PORT}`;
};

export const clientConfig: ClientConfig = {
  serverUrl: resolveServerUrl(),
  // A production build never connects anywhere but the matchmaker (never <id>.host.bloxity.io).
  useMatchmaker: !import.meta.env.DEV,
  debug: import.meta.env.DEV || import.meta.env['VITE_DEBUG'] === '1',
  maxPixelRatio: 2,
};
