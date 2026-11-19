import { Schema, type } from '@colyseus/schema';
import { AvatarState } from './AvatarState.js';

/**
 * Replicated per-PLAYER state. Written by the SERVER only: the transform by
 * the simulation (or the ride), the rest by the game. Nothing is ever copied
 * from a client message unchecked.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  // ---- who
  @type(AvatarState) avatar = new AvatarState();
  @type('string') displayName = '';
  @type('string') avatarUrl = '';
  /** The VERIFIED Bloxity account's public handle, '' for a guest. */
  @type('string') username = '';
  /** The VERIFIED Boxity account id (the token's sub), '' for a guest: Boxity chat names senders by it. */
  @type('string') bloxityId = '';

  // ---- motion (mirrors `BodyMotion`)
  @type('float32') x = 0;
  @type('float32') y = 6;
  @type('float32') z = 0;
  @type('float32') rotationY = 0;
  @type('float32') pitch = 0;
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('float32') fallStart = 6;
  @type('boolean') grounded = true;
  @type('boolean') sprinting = false;
  @type('boolean') crouched = false;
  @type('uint32') lastInputSeq = 0;
  @type('string') emote = '';
  @type('uint16') emoteCount = 0;

  // ---- the plot and the car
  /** Their plot (0..5), -1 none. */
  @type('int8') plot = -1;
  /** Base Upgrade tier (plot size, length limit, unlocks). */
  @type('uint8') tier = 0;
  /** The car they drive, and its condition (0..100). */
  @type('string') car = 'kart';
  @type('uint8') condition = 100;
  /** How many cars they own (profile stats). */
  @type('uint8') carsOwned = 1;
  /** Driving now, on which plot (6: the Showcase); the run id (clients reset the car on a new one). */
  @type('boolean') driving = false;
  @type('int8') drivePlot = -1;
  @type('uint16') runId = 0;
  /** The car's pose (the body's x / y / z are the car's while driving). */
  @type('float32') carPitch = 0;
  @type('float32') carRoll = 0;
  @type('float32') carSpeed = 0;
  /** Building (shows the hard hat to everyone). */
  @type('boolean') building = false;

  // ---- economy (what the HUD shows; the inventory is in the Profile message)
  @type('float64') cash = 0;
  /** Income per second of their track right now (all piles filling, every multiplier). */
  @type('float32') rate = 0;
  /** Money multiplier from passes and boosts (the HUD's "1x Boost"). */
  @type('float32') boost = 1;
  /** Likes and visits their track has. */
  @type('uint32') likes = 0;
  @type('uint32') visits = 0;
  /** Their longest jump, studs. */
  @type('float32') bestAir = 0;

  // ---- career (saved to the profile, reported to Bloxity)
  @type('float64') earned = 0;
  @type('uint32') rides = 0;
  @type('uint16') rebirths = 0;
  @type('uint32') careerPlaced = 0;
  @type('float64') playSeconds = 0;

  /** True once the server has simulated at least one input and placed them. */
  @type('boolean') ready = false;
}
