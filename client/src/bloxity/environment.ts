/**
 * THE ENVIRONMENT BOXITY TOLD US: prod (bloxity.io), stage (stage.bloxity.io)
 * or local. ONE build runs unchanged in all three because nothing here works
 * it out from the page's own address, the referrer or a build flag: the SDK
 * answers `Legion.SDK.environment()` from `window.BLOXITY_ENV` (injected into
 * the pages Boxity serves) or the portal handshake (embedded), and production
 * when nobody said anything.
 *
 * Every Boxity URL the client builds goes through `bloxityEnv()`. Code that
 * runs before the SDK script has loaded reads `window.BLOXITY_ENV` with the
 * same production fallback.
 */
export interface BloxityEnvironment {
  env: 'prod' | 'stage' | 'local';
  apiUrl: string;
  playUrl: string;
  portalUrl: string;
  staticUrl: string;
}

const PRODUCTION: BloxityEnvironment = {
  env: 'prod',
  apiUrl: 'https://api.bloxity.io',
  playUrl: 'https://play.bloxity.io',
  portalUrl: 'https://bloxity.io',
  staticUrl: 'https://static.bloxity.io',
};

const trim = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const url = value.trim().replace(/\/+$/, '');
  return /^(https?|wss?):\/\/[^\s/]+/i.test(url) ? url : null;
};

/** A told environment, whole, or null (anything incomplete is ignored as a whole, as the SDK does). */
const parse = (raw: unknown): BloxityEnvironment | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const env = o['env'];
  if (env !== 'prod' && env !== 'stage' && env !== 'local') return null;
  const apiUrl = trim(o['apiUrl']);
  const playUrl = trim(o['playUrl']);
  const portalUrl = trim(o['portalUrl']);
  const staticUrl = trim(o['staticUrl']);
  if (!apiUrl || !playUrl || !portalUrl || !staticUrl) return null;
  return { env, apiUrl, playUrl, portalUrl, staticUrl };
};

/** The environment now: the SDK's answer when it is loaded, else the page's `window.BLOXITY_ENV`, else prod. */
export const bloxityEnv = (): BloxityEnvironment => {
  try {
    const sdk = (window as Window & { Legion?: { SDK?: { environment?: () => unknown } } }).Legion?.SDK;
    const told = parse(sdk?.environment?.());
    if (told) return told;
  } catch {
    /* an SDK without environment(): fall through */
  }
  return parse((window as Window & { BLOXITY_ENV?: unknown }).BLOXITY_ENV) ?? PRODUCTION;
};
