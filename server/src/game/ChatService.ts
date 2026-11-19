import { GAME, MessageType, type ChatLineMessage } from '@race/shared';
import type { RaceGame } from './RaceGame.js';
import type { Player } from './Player.js';

const TIPS = [
  'Tip: Every piece joined to your Start Gate piles up cash - drive over it to grab it',
  'Tip: Pieces snap onto the glowing end of your track - press R to flip turns',
  'Tip: Bring the track back into your Start Gate for a +50% Circuit Bonus, and lap it!',
  'Tip: Better cars collect more cash per dollar - open crates at the Crates stall',
  'Tip: Crashes wear your car down - repair it at your Pit Stop',
  'Tip: Air time pays! Bump and Ramp Jump tracks send you flying',
  'Tip: Upgrade your Base to expand your plot and unlock new track pieces',
  "Tip: Drive other players' tracks for tips - they get a share too",
  'Tip: Decorations add +1% income each - visit the Decors stall',
  'Tip: Publish your track in RaceTracks and share its code',
  'Tip: Rebirth for a permanent +50% income',
]

/** Strip control characters, collapse spaces, cap the length. */
export const cleanChat = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, GAME.chatMaxLength);
};

/** THE CHAT: players' lines, joins and leaves, and a building tip now and then. */
export class ChatService {
  private tipClock = 0;
  private tipIndex = Math.floor(Math.random() * TIPS.length);

  constructor(private readonly game: RaceGame) {}

  line(message: ChatLineMessage): void {
    this.game.ctx.broadcast(MessageType.ChatLine, message);
  }

  say(p: Player, raw: unknown): void {
    const text = cleanChat(raw);
    if (!text || this.game.now < p.nextChat) return;
    p.nextChat = this.game.now + GAME.chatCooldown;
    this.line({ kind: 'chat', name: p.name, text });
  }

  tick(dt: number): void {
    this.tipClock += dt;
    if (this.tipClock < 120) return;
    this.tipClock = 0;
    this.tipIndex = (this.tipIndex + 1) % TIPS.length;
    this.line({ kind: 'tip', text: TIPS[this.tipIndex]! });
  }

}
