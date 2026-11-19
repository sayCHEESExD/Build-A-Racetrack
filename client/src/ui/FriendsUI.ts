import type { LegionFriend } from '../bloxity/legionTypes.js';
import { Modal, el, escapeHtml } from './dom.js';

export interface FriendsActions {
  load(): Promise<LegionFriend[]>;
  /** Invite into THIS room (the room is published to the portal first). */
  invite(userId: string): Promise<boolean>;
  link(): string;
  login(): void;
  signedIn(): boolean;
  close(): void;
}

const statusOf = (friend: LegionFriend): string => {
  const s = friend.presence?.status ?? 'offline';
  return s === 'in_game' ? 'in-game' : s;
};

const STATUS: Readonly<Record<string, { label: string; color: string }>> = {
  online: { label: 'Online', color: '#5cf24a' },
  'in-game': { label: 'In game', color: '#5ad8ff' },
  away: { label: 'Away', color: '#ffc93c' },
  offline: { label: 'Offline', color: '#8a8fa8' },
};

/**
 * FRIENDS (F): Bloxity friends with their presence, an Invite button into
 * this lobby, and a shareable invite link. Signed out, it offers the login.
 */
export class FriendsUI {
  private readonly modal: Modal;
  private loading = 0;

  constructor(parent: HTMLElement, private readonly actions: FriendsActions) {
    this.modal = new Modal(parent, 'Friends', () => this.actions.close());
  }

  get open(): boolean {
    return this.modal.open;
  }

  show(): void {
    this.modal.show();
    void this.refresh();
  }

  hide(): void {
    this.modal.hide();
  }

  private frame(content: HTMLElement): void {
    const list = el('div', 'ob-list');
    list.append(content);
    const link = this.actions.link();
    if (link) {
      const copy = el('button', 'ob-btn gold', 'Copy invite link');
      copy.style.marginTop = '8px';
      copy.onclick = () => {
        void navigator.clipboard?.writeText(link).then(
          () => (copy.textContent = 'Copied!'),
          () => (copy.textContent = link),
        );
      };
      list.append(copy);
    }
    this.modal.body.replaceChildren(list);
  }

  async refresh(): Promise<void> {
    if (!this.actions.signedIn()) {
      const box = el('div', 'ob-greet', 'Log in to see your friends and invite them to build with you.');
      const login = el('button', 'ob-btn', 'Log in');
      login.onclick = () => this.actions.login();
      const wrap = el('div');
      wrap.append(box, login);
      this.frame(wrap);
      return;
    }
    const ticket = ++this.loading;
    this.frame(el('div', 'ob-greet', 'Loading friends...'));
    let friends: LegionFriend[] = [];
    try {
      friends = await this.actions.load();
    } catch {
      friends = [];
    }
    if (ticket !== this.loading || !this.open) return;
    if (friends.length === 0) {
      this.frame(el('div', 'ob-greet', 'No friends yet - share the invite link to play together!'));
      return;
    }
    const order = ['in-game', 'online', 'away', 'offline'];
    friends.sort((a, b) => order.indexOf(statusOf(a)) - order.indexOf(statusOf(b)));
    const rows = el('div', 'ob-list');
    for (const f of friends) {
      const status = STATUS[statusOf(f)] ?? STATUS.offline!;
      const where = f.presence?.gameName ? ` · ${f.presence.gameName}` : '';
      const row = el('div', 'ob-row');
      const pfp = f.pfp ? `<img src="${escapeHtml(f.pfp)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">` : '';
      row.append(el('div', 'nm', `${pfp} ${escapeHtml(f.displayName || f.username)}<span class="sub"><span style="color:${status.color}">●</span> ${status.label}${escapeHtml(where)}</span>`));
      const invite = el('button', 'ob-btn small', 'Invite');
      invite.disabled = statusOf(f) === 'offline';
      invite.onclick = async () => {
        invite.disabled = true;
        const sent = await this.actions.invite(f._id).catch(() => false);
        invite.textContent = sent ? 'Invited!' : 'Failed';
      };
      row.append(invite);
      rows.append(row);
    }
    this.frame(rows);
  }
}
