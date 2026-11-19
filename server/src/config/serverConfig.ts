import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { BLOXITY_HOSTING_ID, BLOXITY_PORTAL_SLUG, DEFAULT_SERVER_PORT, SERVER_TICK_RATE } from '@race/shared';

/** Runtime server configuration, overridable by environment variables. */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly tickRate: number;
  /** Milliseconds between state patches sent to clients. */
  readonly patchRateMs: number;
  /**
   * Directory holding the JSON dev store (`profiles.json`, `grants.json`),
   * and the legacy `profiles.json` a Mongo deployment imports on boot.
   */
  readonly dataDir: string;
  /**
   * The managed MongoDB Legion injects (`MONGODB_URI`), or '' to use the JSON
   * file in `dataDir`. Set on every Bloxity pod; unset on a laptop.
   */
  readonly mongoUri: string;
  /**
   * The Bloxity PORTAL slug: what a token is verified AGAINST. A constant, not
   * the `BLOXITY_GAME_ID` Legion injects - that is the hosting id, a different
   * name for this game (see `BLOXITY_PORTAL_SLUG`).
   */
  readonly portalSlug: string;
  /** The Legion hosting id (`BLOXITY_GAME_ID`), for logs only. */
  readonly hostingId: string;
  /** This process, for logs. Legion injects `POD_NAME`. */
  readonly podName: string;
  /**
   * Dev test hooks (teleport, grant gear, force a catch, finish objectives).
   * ON only when the dev script passes --dev-cheats; never on a pod.
   */
  readonly devCheats: boolean;
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * `--port N` from the command line.
 *
 * Takes precedence over `PORT`, and the dev script passes it. That order
 * matters: a dev harness that hosts the CLIENT often exports `PORT` for its
 * own web server, and without an explicit override the game server silently
 * binds to the same port - which looks like a working server and a client that
 * cannot reach it. Managed hosts have no argv to pass, so `PORT` still wins in
 * production, which is exactly where it should.
 */
const portArgument = (): string | undefined => {
  const at = process.argv.indexOf('--port');
  return at >= 0 ? process.argv[at + 1] : undefined;
};

export const serverConfig: ServerConfig = {
  port: int(portArgument() ?? process.env['PORT'], DEFAULT_SERVER_PORT),
  host: process.env['HOST'] ?? '0.0.0.0',
  tickRate: SERVER_TICK_RATE,
  patchRateMs: 1000 / SERVER_TICK_RATE,
  // Relative to the server package, which is the working directory for both
  // `npm run dev` and `npm start`, so a restart finds the same file either way.
  dataDir: resolve(process.env['RACETRACK_DATA_DIR'] ?? 'data'),
  mongoUri: (process.env['MONGODB_URI'] ?? '').trim(),
  portalSlug: BLOXITY_PORTAL_SLUG,
  hostingId: (process.env['BLOXITY_GAME_ID'] ?? '').trim() || BLOXITY_HOSTING_ID,
  podName: (process.env['POD_NAME'] ?? '').trim() || `${hostname()}:${process.pid}`,
  devCheats: process.argv.includes('--dev-cheats') && process.env['NODE_ENV'] !== 'production',
};
