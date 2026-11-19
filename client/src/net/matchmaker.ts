import { resolveEndpoint } from '../bloxity/Bloxity.js';

/** Where a join should open its Colyseus client: a relay that is pinned to one live pod. */
export interface Relay {
  /** `{playUrl as ws}/v1/ws/<relayRoomId>` - hand straight to `new Client()`. */
  endpoint: string;
  /** True when the matchmaker had to boot a pod for this (the first player in a while). */
  cold: boolean;
}

/**
 * ASK BOXITY'S MATCHMAKER WHERE TO PLAY, through `Legion.SDK.net.resolveEndpoint`
 * and nothing else: the SDK posts to the playUrl Boxity told this page (prod,
 * stage or local), reuses the player's seat on retries and carries the party
 * ticket, so a party lands in one room. A page on <id>.dev.play.bloxity.io
 * reaches the dev backend by itself. The game socket never goes to
 * `<id>.host.bloxity.io`.
 *
 * Asked again for EVERY join, reconnects included, and every answer gets a
 * NEW Colyseus Client: after a deploy or a scale to zero the pod a previous
 * relay pointed at no longer exists.
 */
export const resolveRelay = (gameId: string): Promise<Relay> => resolveEndpoint(gameId);
