import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@race/shared';
import { installLeaderboardReporter } from './bloxity/leaderboardReporter.js';
import { installStatReporter } from './bloxity/statReporter.js';
import { installRoomReporter } from './legion-room-reporter.js';
import { serverConfig } from './config/serverConfig.js';
import { createHttpServer } from './httpServer.js';
import { flushStorageSync } from './persistence/index.js';
import { profileStore } from './progression/ProfileStore.js';
import { GameRoom } from './rooms/GameRoom.js';
import { logger } from './util/logger.js';

const SCOPE = 'server';

/** Longest a shutdown waits for queued saves before going anyway. */
const FLUSH_TIMEOUT_MS = 20_000;

const boot = async (): Promise<void> => {
  // Open the store BEFORE listening. This never throws: a database that is
  // down is logged loudly and joins are refused until it is back, while
  // /health keeps answering so the host does not restart-loop the pod.
  await profileStore.open();

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createHttpServer() }),
    greet: false,
    // Colyseus's own SIGTERM/SIGINT handler would exit the process as soon as the
    // rooms close, racing `shutdown` below and cutting off the saves it waits for.
    gracefullyShutdown: false,
  });

  gameServer.define(ROOM_NAME, GameRoom);

  await gameServer.listen(serverConfig.port, serverConfig.host);
  logger.info(
    SCOPE,
    `listening on ${serverConfig.host}:${serverConfig.port} ` +
      `room="${ROOM_NAME}" health=/health storage=${profileStore.kind} ` +
      `game=${serverConfig.hostingId} tokens-verified-for=${serverConfig.portalSlug}`,
  );

  // Bloxity profile stats: every ~60s, and once more on shutdown. Inert without the hosting env.
  const stats = installStatReporter();
  // Boxity leaderboards (money earned, rides, rebirths): every 15 s and on shutdown.
  const boards = installLeaderboardReporter();
  // Legion's room reporter: pushes this pod's rooms to the cross-pod directory every 2 s. No-op outside a Legion deployment.
  const roomReporter = installRoomReporter();

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info(SCOPE, `received ${signal}, shutting down`);
    void (async () => {
      try {
        // `false`: do NOT let Colyseus exit the process - the saves that
        // disconnecting every client queued still have to land first.
        await gameServer.gracefullyShutdown(false);
      } catch (error) {
        logger.error(SCOPE, 'graceful shutdown failed:', error);
      }
      // Once more on the way out, or up to a minute of everyone's progress on this pod is never reported.
      roomReporter.stop();
      stats.stop();
      boards.stop();
      await Promise.all([stats.flush(), boards.flush()]);
      const landed = await profileStore.flush(FLUSH_TIMEOUT_MS);
      if (!landed) logger.error(SCOPE, 'some saves were still outstanding at the flush deadline');
      await profileStore.close().catch((error: unknown) => logger.error(SCOPE, 'store close failed:', error));
      logger.info(SCOPE, 'stopped');
      process.exit(0);
    })();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

// A last resort for any exit path that skipped the handler above. The JSON
// store writes synchronously here; Mongo writes are awaited in `shutdown`.
process.on('exit', () => flushStorageSync());

boot().catch((error: unknown) => {
  logger.error(SCOPE, 'failed to start', error);
  process.exit(1);
});
