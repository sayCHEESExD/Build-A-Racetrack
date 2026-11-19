import type { AvatarAppearance, AvatarProportions } from '@race/shared';

/**
 * Read-only views of the replicated Colyseus state. They mirror the server's
 * schemas field for field; the client only ever reads them.
 */
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface NetPlayerState {
  sessionId: string;
  avatar: AvatarAppearance & AvatarProportions;
  displayName: string;
  avatarUrl: string;
  username: string;
  /** The verified Boxity account id ('' for a guest): Boxity chat names senders by it. */
  bloxityId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  pitch: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  fallStart: number;
  grounded: boolean;
  sprinting: boolean;
  crouched: boolean;
  lastInputSeq: number;
  emote: string;
  emoteCount: number;
  plot: number;
  tier: number;
  car: string;
  condition: number;
  carsOwned: number;
  driving: boolean;
  drivePlot: number;
  runId: number;
  carPitch: number;
  carRoll: number;
  carSpeed: number;
  building: boolean;
  cash: number;
  rate: number;
  boost: number;
  likes: number;
  visits: number;
  bestAir: number;
  earned: number;
  rides: number;
  rebirths: number;
  careerPlaced: number;
  playSeconds: number;
  ready: boolean;
}

/** Colyseus collections, as far as the client uses them. */
export interface NetMap<T> {
  get(key: string): T | undefined;
  forEach(callback: (value: T, key: string) => void): void;
  readonly size: number;
  values(): IterableIterator<T>;
  entries(): IterableIterator<[string, T]>;
  [Symbol.iterator](): IterableIterator<[string, T]>;
}

export interface NetGameState {
  players: NetMap<NetPlayerState>;
  elapsed: number;
  lobby: number;
}
