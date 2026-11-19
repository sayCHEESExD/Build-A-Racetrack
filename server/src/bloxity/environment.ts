/**
 * THE ENVIRONMENT BOXITY HOSTING TOLD THIS POD (prod or stage; local in a
 * local stack). Hosting injects these on every deploy; the production values
 * are only the fallback for a variable that is missing (local development).
 * Every Boxity URL the server builds comes from here - never written out
 * anywhere else, never worked out from a hostname.
 */
const read = (name: string, fallback: string): string => (process.env[name]?.trim() || fallback).replace(/\/+$/, '');

export const bloxityServerEnv = (): { env: string; apiUrl: string; matchmakerUrl: string; portalUrl: string; staticUrl: string } => ({
  env: process.env['BLOXITY_ENV']?.trim() || 'prod',
  apiUrl: read('BLOXITY_API_URL', 'https://api.bloxity.io'),
  matchmakerUrl: read('BLOXITY_MATCHMAKER_URL', 'https://play.bloxity.io'),
  portalUrl: read('BLOXITY_PORTAL_URL', 'https://bloxity.io'),
  staticUrl: read('BLOXITY_STATIC_URL', 'https://static.bloxity.io'),
});
