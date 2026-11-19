/**
 * Gameplay constants both sides read.
 */
export const GAME = {
  /** How far from your eyes you may build, delete or paint. */
  placeReach: 16,
  /** Building actions per second a held button may make. */
  buildRate: 12,
  /** How far from a door / food you may use it. */
  useReach: 4.5,
  chatMaxLength: 120,
  chatCooldown: 0.9,
} as const;

/** Placing has its own small cooldown so a held button builds a steady line. */
export const PLACE_COOLDOWN = 0.09;
