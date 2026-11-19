import { logger } from '../util/logger.js';
import { bloxityServerEnv } from './environment.js';
import { reportIdentityOf } from './statReporter.js';

const SCOPE = 'bloxity/leaderboards';

/**
 * BOXITY LEADERBOARDS, reported by the SERVER (BLOXITY_CODE_METADATA.md:
 * hasScore). Every score is read from state this server owns - what the
 * server saw the player earn, ride or rebirth, the career it
 * counted - never a value a client sent.
 *
 * The same declarations the browser makes (client/src/bloxity/Bloxity.ts
 * LEADERBOARDS) travel with each report. Inert without BLOXITY_REPORT_TOKEN /
 * BLOXITY_GAME_ID (local development).
 */
export type BoardId = 'earned' | 'rides' | 'rebirths';

export const LEADERBOARD_DEFINITIONS = [
  { id: 'earned', label: 'Money Earned', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'rides', label: 'Runs Driven', order: 'desc', mode: 'sum', format: 'number', reset: 'weekly' },
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
] as const;

const SUM: ReadonlySet<BoardId> = new Set(['rides']);
const INTERVAL_MS = 15_000;
const TIMEOUT_MS = 8_000;
/** Boxity takes at most this many scores per call. */
const BATCH = 200;

/** What is waiting to be sent: userId|board -> score (summed for 'sum' boards, the highest for 'best'). */
const pending = new Map<string, { board: BoardId; userId: string; score: number }>();

/**
 * Record a score for a profile. For a 'sum' board `score` is the amount just
 * gained (1 wave, 1 monster); for 'best' it is the score itself. Guests
 * (no Boxity account) are skipped: they have no board row to attach to.
 */
export const recordScore = (profileKey: string, board: BoardId, score: number): void => {
  const userId = reportIdentityOf(profileKey);
  if (!userId || typeof score !== 'number' || !Number.isFinite(score) || score < 0) return;
  const key = `${userId}|${board}`;
  const was = pending.get(key);
  if (!was) pending.set(key, { board, userId, score });
  else was.score = SUM.has(board) ? was.score + score : Math.max(was.score, score);
};

export interface LeaderboardReporter {
  /** Send everything queued now (the interval, the end of a wave, shutdown). Never throws. */
  flush(): Promise<void>;
  stop(): void;
}

let installed: LeaderboardReporter = { flush: async () => undefined, stop: () => undefined };

/** The installed reporter (inert until installed with the hosting environment). */
export const leaderboards = (): LeaderboardReporter => installed;

/** Install once at server start. A no-op without the Boxity reporting environment. */
export const installLeaderboardReporter = (): LeaderboardReporter => {
  const token = process.env['BLOXITY_REPORT_TOKEN']?.trim();
  const gameId = process.env['BLOXITY_GAME_ID']?.trim();
  if (!token || !gameId) {
    logger.info(SCOPE, 'leaderboard reporting off (BLOXITY_REPORT_TOKEN / BLOXITY_GAME_ID not set)');
    pending.clear();
    return installed;
  }
  const url = `${bloxityServerEnv().apiUrl}/v1/leaderboards/hosted/${encodeURIComponent(gameId)}/report`;

  const post = async (scores: { board: string; userId: string; score: number }[]): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ boards: LEADERBOARD_DEFINITIONS, scores }),
        signal: controller.signal,
      });
      const body = await response.text().catch(() => '');
      // The response (accepted, dropped counts) is the only window into a missing score: always logged.
      const line = `POST leaderboards (${scores.length} score(s)) -> ${response.status} ${body.slice(0, 500)}`;
      if (response.ok) logger.info(SCOPE, line);
      else logger.warn(SCOPE, line);
    } catch (error) {
      logger.warn(SCOPE, `leaderboard report failed: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  };

  let flushing: Promise<void> | null = null;
  const flush = (): Promise<void> => {
    const run = async (): Promise<void> => {
      try {
        if (pending.size === 0) return;
        const scores = [...pending.values()];
        pending.clear();
        for (let i = 0; i < scores.length; i += BATCH) await post(scores.slice(i, i + BATCH));
      } catch (error) {
        logger.warn(SCOPE, `leaderboard flush failed: ${String(error)}`);
      }
    };
    flushing = (flushing ?? Promise.resolve()).then(run, run);
    return flushing;
  };

  const interval = setInterval(() => void flush(), INTERVAL_MS);
  interval.unref?.();
  logger.info(SCOPE, `leaderboard reporting on for "${gameId}" every ${INTERVAL_MS / 1000}s`);
  installed = { flush, stop: () => clearInterval(interval) };
  return installed;
};
