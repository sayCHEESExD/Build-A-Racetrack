/** Small DOM helpers shared by every panel. */

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A modal panel: a dimmed backdrop, the panel with its title and close button. */
export class Modal {
  readonly root: HTMLDivElement;
  readonly panel: HTMLDivElement;
  readonly title: HTMLHeadingElement;
  readonly body: HTMLDivElement;
  private shown = false;

  constructor(
    parent: HTMLElement,
    title: string,
    private readonly onClose: () => void,
    extraClass = '',
  ) {
    this.root = el('div', 'ob-modal ob-hidden');
    this.panel = el('div', `ob-panel ${extraClass}`);
    this.title = el('h2', '', escapeHtml(title));
    const x = el('button', 'ob-x', '✕');
    x.onclick = () => this.onClose();
    this.title.append(x);
    this.body = el('div', 'ob-body');
    this.panel.append(this.title, this.body);
    this.root.append(this.panel);
    // A click on the backdrop closes it.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.onClose();
    });
    parent.append(this.root);
  }

  get open(): boolean {
    return this.shown;
  }

  setTitle(text: string): void {
    this.title.firstChild!.textContent = text;
  }

  show(): void {
    this.shown = true;
    this.root.classList.remove('ob-hidden');
  }

  hide(): void {
    this.shown = false;
    this.root.classList.add('ob-hidden');
  }
}
