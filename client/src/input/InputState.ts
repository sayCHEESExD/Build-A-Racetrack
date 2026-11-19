/** A control the player can press: a key, a mouse button or a touch button all map to one of these. */
export type Control =
  | 'sprint'
  | 'sprintToggle'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'use'
  | 'pick'
  | 'drop'
  | 'dropAll'
  | 'inventory'
  | 'scoreboard'
  | 'recall'
  | 'ability'
  | 'viewToggle'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'slot7'
  | 'slot8'
  | 'slot9';

/** Normalised, device-agnostic input snapshot for one frame. */
export interface InputState {
  /** -1 (left) .. 1 (right), camera-relative. */
  moveX: number;
  /** -1 (back) .. 1 (forward), camera-relative. */
  moveZ: number;
  /** Held. */
  sprint: boolean;
  crouch: boolean;
  jumpHeld: boolean;
  attack: boolean;
  use: boolean;
  scoreboard: boolean;
  /** Pressed THIS frame (edges). */
  jump: boolean;
  attackPressed: boolean;
  usePressed: boolean;
  useReleased: boolean;
  attackReleased: boolean;
  pickPressed: boolean;
  drop: boolean;
  dropAll: boolean;
  inventory: boolean;
  recall: boolean;
  ability: boolean;
  viewToggle: boolean;
  /** Hotbar slot pressed this frame (1-9), or 0. */
  slot: number;
  /** Hotbar scroll this frame (wheel notches, + = next). */
  scroll: number;
}

export const createInputState = (): InputState => ({
  moveX: 0,
  moveZ: 0,
  sprint: false,
  crouch: false,
  jumpHeld: false,
  attack: false,
  use: false,
  scoreboard: false,
  jump: false,
  attackPressed: false,
  usePressed: false,
  useReleased: false,
  attackReleased: false,
  pickPressed: false,
  drop: false,
  dropAll: false,
  inventory: false,
  recall: false,
  ability: false,
  viewToggle: false,
  slot: 0,
  scroll: 0,
});
