import { MapSchema, Schema, type } from '@colyseus/schema';
import { PlayerState } from './PlayerState.js';

/** Root replicated state for one room: the players and the clock. Tracks and coin piles go as messages. */
export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  /** The room clock, in seconds. */
  @type('float64') elapsed = 0;
  /** The lobby number. */
  @type('uint16') lobby = 0;
}
