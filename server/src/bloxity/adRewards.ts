import { serverConfig } from '../config/serverConfig.js';
import { logger } from '../util/logger.js';
import { bloxityServerEnv } from './environment.js';

const SCOPE = 'bloxity/ads';
const TIMEOUT_MS = 8000;
const MAX_TOKEN_LENGTH = 4096;

/**
 * IS THIS REWARDED AD REAL? The browser sends the reward token Boxity gave it
 * when the ad completed; only Boxity can say whether it is genuine, for this
 * game, unused and under five minutes old. Each token works once. Never
 * throws: anything but `valid: true` is a no.
 */
export const verifyAdReward = async (rewardToken: unknown): Promise<boolean> => {
  if (typeof rewardToken !== 'string' || rewardToken.length === 0 || rewardToken.length > MAX_TOKEN_LENGTH) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${bloxityServerEnv().apiUrl}/v1/ads/reward/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // The PORTAL slug, as for login tokens.
      body: JSON.stringify({ gameSlug: serverConfig.portalSlug, rewardToken }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { valid?: unknown } | null;
    const valid = response.ok && body?.valid === true;
    if (!valid) logger.warn(SCOPE, `reward token refused (${response.status}) ${JSON.stringify(body).slice(0, 200)}`);
    return valid;
  } catch (error) {
    logger.warn(SCOPE, `reward verify failed: ${String(error)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
};
