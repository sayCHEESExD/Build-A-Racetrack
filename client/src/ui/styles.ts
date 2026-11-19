/**
 * THE UI STYLES: Bloxd.io's look from the reference - navy translucent
 * panels, white Rubik text, a 10-slot hotbar with the cart and backpack
 * buttons either side, the ONE BLOCK side panel, centred banners - over a
 * Minecraft world. One continuous scale (--s) from the real window:
 * 1 on desktop, down to ~0.55 on a phone in landscape.
 */
const CSS = `
:root {
  --s: 1;
  --ts: 1;
  --panel-alpha: 0.9;
  --navy: rgba(44, 50, 86, calc(var(--panel-alpha) * 0.98));
  --navy-solid: #2c3256;
  --navy-light: #4a5288;
  --slot: rgba(58, 66, 110, 0.92);
  --slot-edge: #232842;
  --gold: #ffd23f;
  --green: #4fd84a;
  --safe-t: env(safe-area-inset-top, 0px);
  --safe-r: env(safe-area-inset-right, 0px);
  --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-l: env(safe-area-inset-left, 0px);
}
.ob-root { position: fixed; inset: 0; pointer-events: none; z-index: 10; font-family: "Rubik", "Segoe UI", system-ui, sans-serif; color: #fff; user-select: none; }
.ob-root * { box-sizing: border-box; }
.ob-hidden { display: none !important; }
.ob-icon { image-rendering: pixelated; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }

/* ---- top left: the lobby badge and the feed */
.ob-tl { position: absolute; left: calc(8px + var(--safe-l)); top: calc(54px + var(--safe-t)); transform-origin: top left; transform: scale(var(--s)); display: flex; flex-direction: column; gap: 3px; max-width: 380px; }
.ob-badge { display: inline-flex; align-self: flex-start; background: var(--navy); border-radius: 4px; font-weight: 700; font-size: 13px; overflow: hidden; }
.ob-badge span { padding: 4px 9px; border-right: 1px solid rgba(255,255,255,0.2); }
.ob-badge span:last-child { border-right: 0; }
.ob-feed { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.ob-line { background: rgba(30, 34, 56, 0.72); padding: 2px 6px; border-radius: 3px; font-size: 12px; max-width: 380px; line-height: 1.35; animation: ob-in 160ms ease-out; transition: opacity 1s; }
.ob-line.old { opacity: 0; }
.ob-line b { font-weight: 600; }
.ob-line .hi { color: var(--gold); font-weight: 700; }
.ob-line.event .k { color: var(--gold); font-weight: 800; }
.ob-line.phase { color: #ffb84a; font-weight: 700; }
.ob-line.phase .hi { color: var(--green); }
.ob-line.tip { color: #e4e8ff; }
.ob-line.chat .n { color: #bfe0ff; font-weight: 700; }
body.ob-chatting .ob-line.old { opacity: 1; }
.ob-chat { pointer-events: auto; display: flex; gap: 4px; margin-top: 4px; }
.ob-chat input { width: 300px; background: rgba(20,22,40,0.85); border: 1px solid rgba(255,255,255,0.35); color: #fff; font: 600 13px inherit; font-family: inherit; padding: 6px 8px; border-radius: 4px; outline: none; }

/* ---- top right: small round buttons */
.ob-tr { position: absolute; right: calc(10px + var(--safe-r)); top: calc(10px + var(--safe-t)); transform-origin: top right; transform: scale(var(--s)); display: flex; gap: 8px; pointer-events: auto; }
.ob-rbtn { position: relative; width: 40px; height: 40px; border-radius: 8px; background: var(--navy); border: 0; color: #fff; display: grid; place-items: center; font-size: 19px; cursor: pointer; padding: 6px; }
.ob-rbtn:hover { background: var(--navy-light); }
.ob-rbtn .k { position: absolute; right: -3px; bottom: -3px; font-size: 9px; font-weight: 800; background: #fff; color: #222; border-radius: 3px; padding: 0 3px; line-height: 13px; }
.ob-account { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px; border-radius: 8px; border: 0; background: #3a7bea; color: #fff; font: 700 14px inherit; font-family: inherit; cursor: pointer; max-width: 230px; }
.ob-account[data-signed='1'] { background: var(--navy); }
.ob-account img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; }
.ob-account span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ob-account b { color: #7ad0ff; font-size: 12px; white-space: nowrap; }
body.ob-touch .ob-account { max-width: 120px; }
.ob-coins { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px 0 8px; border-radius: 8px; background: var(--navy); font-weight: 800; font-size: 16px; color: var(--gold); }
.ob-coins i { width: 22px; height: 22px; display: inline-block; }

/* ---- the ONE BLOCK side panel */
.ob-side { position: absolute; right: calc(6px + var(--safe-r)); top: 50%; transform-origin: right center; transform: translateY(-50%) scale(var(--s)); width: 178px; background: rgba(70, 90, 120, 0.62); padding: 8px 9px; font-size: 11px; line-height: 1.5; border-radius: 3px; }
.ob-side .t { color: var(--gold); font-weight: 800; }
.ob-side .sep { color: rgba(255,255,255,0.6); letter-spacing: -1px; }
.ob-side .own { color: var(--gold); }
.ob-side .row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ob-side .bar { font-family: "Silkscreen", monospace; font-size: 9px; letter-spacing: 0.5px; }
.ob-side .luck { color: #cfd6ff; }
.ob-side .luck b { color: var(--green); font-weight: 600; }
.ob-side .q { margin-top: 6px; }
.ob-side .q .row { white-space: normal; }
.ob-side .q .d { color: var(--gold); font-weight: 700; }
.ob-side .q .w { color: #5ab8ff; font-weight: 700; }
.ob-side .q .done { color: var(--green); }
body.ob-touch .ob-side { top: calc(4px + var(--safe-t)); right: auto; left: 50%; transform: translateX(-50%) scale(calc(var(--s) * 0.95)); transform-origin: top center; pointer-events: auto; cursor: pointer; }
body.ob-touch .ob-side:not(.open) .full { display: none; }
body.ob-touch .ob-side:not(.open)::after { content: "tap for skills"; display: block; text-align: center; font-size: 9px; color: rgba(255,255,255,0.7); }

/* ---- the crosshair, hints and the prompt */
.ob-cross { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; transform: translate(-50%, -50%); }
.ob-cross::before, .ob-cross::after { content: ''; position: absolute; background: rgba(255,255,255,0.92); mix-blend-mode: difference; }
.ob-cross::before { left: 8px; top: 2px; width: 2px; height: 14px; }
.ob-cross::after { left: 2px; top: 8px; width: 14px; height: 2px; }
.ob-need { position: absolute; left: calc(50% + 18px); top: calc(50% - 10px); font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 4px; text-shadow: 0 1px 2px #000; }
.ob-need i { width: 18px; height: 18px; display: inline-block; }
.ob-prompt { position: absolute; left: 50%; top: calc(50% + 46px); transform: translateX(-50%) scale(var(--s)); background: var(--navy); padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 14px; pointer-events: auto; cursor: pointer; white-space: nowrap; }
.ob-prompt kbd { background: #fff; color: #222; border-radius: 3px; padding: 0 5px; margin-right: 6px; font: 800 12px inherit; }

/* ---- centred banner ("+Digging Level 2", "New Phase / Plains", events) */
.ob-banner { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); background: rgba(60, 80, 110, 0.62); text-align: center; padding: calc(10px * var(--s)) 12px; font-weight: 700; font-size: calc(34px * var(--s)); line-height: 1.25; animation: ob-banner 220ms ease-out; text-shadow: 0 2px 3px rgba(0,0,0,0.4); }
.ob-banner .sub { display: block; color: var(--green); }
.ob-banner.phase .title { color: #ffb84a; }
.ob-banner.event .hi, .ob-banner .hi { color: var(--gold); }
.ob-banner.quest .title, .ob-banner.achievement .title { color: var(--gold); }
.ob-banner.quest .sub, .ob-banner.achievement .sub { color: #fff; font-size: 0.6em; }

/* ---- small toasts over the hotbar ("+Digging Level exp") */
.ob-toasts { position: absolute; left: 50%; bottom: calc(150px * var(--s) + var(--safe-b) + var(--lift, 0px)); transform: translateX(-50%) scale(var(--s)); transform-origin: bottom center; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ob-toast { background: rgba(50, 58, 90, 0.85); padding: 5px 12px; border-radius: 4px; font-weight: 600; font-size: 14px; animation: ob-in 140ms ease-out; white-space: nowrap; }
.ob-toast.bad { background: rgba(140, 40, 50, 0.9); }
.ob-toast.good { background: rgba(40, 110, 60, 0.9); }
.ob-toast.gold { background: rgba(140, 105, 20, 0.92); }

/* ---- the bottom: held name, coins/xp bar, health, hotbar, cart and backpack */
.ob-bottom { position: absolute; left: 50%; bottom: calc(6px + var(--safe-b) + var(--lift, 0px)); transform-origin: bottom center; transform: translateX(-50%) scale(var(--s)); display: flex; flex-direction: column; align-items: stretch; gap: 3px; }
.ob-above { position: relative; height: 34px; }
.ob-held { position: absolute; left: 50px; bottom: 16px; font-weight: 700; font-size: 14px; text-shadow: 0 1px 2px #000; white-space: nowrap; transition: opacity 0.4s; }
.ob-health { position: absolute; right: 50px; bottom: 15px; width: 104px; height: 19px; background: #7a1a26; border: 2px solid #3a0c12; border-radius: 3px; overflow: hidden; }
.ob-health .fill { position: absolute; inset: 0; background: linear-gradient(#ff5a6a, #e02a3e); transform-origin: left; }
.ob-health .txt { position: relative; text-align: center; font-size: 10px; font-weight: 700; line-height: 15px; }
.ob-xp { position: absolute; left: 50px; right: 50px; bottom: 0; height: 12px; background: #1c2a24; border: 2px solid #0f1a14; border-radius: 2px; overflow: hidden; }
.ob-xp .fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(#7aff7a, #2ec02e); }
.ob-xp .txt { position: absolute; left: 4px; top: -3px; font-size: 9px; font-weight: 800; color: #fff; text-shadow: 0 1px 1px #000; }
.ob-bar { display: flex; align-items: center; gap: 4px; pointer-events: auto; }
.ob-hotbar { display: flex; gap: 2px; background: rgba(20, 24, 42, 0.5); padding: 2px; border-radius: 3px; }
.ob-slot { position: relative; width: 44px; height: 44px; background: var(--slot); border: 2px solid var(--slot-edge); border-radius: 2px; padding: 5px; cursor: pointer; }
.ob-slot.sel { background: #8b95d2; border-color: #fff; box-shadow: 0 0 0 1px #fff inset; }
.ob-slot .n { position: absolute; right: 2px; bottom: 0; font-size: 12px; font-weight: 800; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; pointer-events: none; }
.ob-slot .dur { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 3px; background: #000; pointer-events: none; }
.ob-slot .dur i { display: block; height: 100%; }
.ob-sq { position: relative; width: 44px; height: 44px; background: var(--navy); border: 0; border-radius: 4px; display: grid; place-items: center; color: #fff; font-size: 22px; cursor: pointer; padding: 6px; }
.ob-sq .k { position: absolute; right: 1px; bottom: 0; font-size: 9px; font-weight: 800; }

/* ---- bottom left: island menu, worlds, emotes */
.ob-bl { position: absolute; left: calc(10px + var(--safe-l)); bottom: calc(10px + var(--safe-b)); transform-origin: bottom left; transform: scale(var(--s)); display: flex; gap: 8px; pointer-events: auto; }
body.ob-touch .ob-bl { bottom: auto; top: calc(10px + var(--safe-t)); left: calc(60px + var(--safe-l)); transform-origin: top left; }

/* ---- death */
.ob-dead { position: absolute; inset: 0; background: rgba(40, 60, 90, 0.45); display: grid; place-items: center; pointer-events: auto; }
.ob-dead .box { transform: scale(var(--s)); background: var(--navy-solid); padding: 12px; border-radius: 4px; display: flex; flex-direction: column; gap: 10px; min-width: 230px; text-align: center; }
.ob-dead button { background: linear-gradient(#e8e8ec, #b4b6c0); border: 2px solid #8e909a; color: #2a2a3a; font: 500 22px inherit; font-family: inherit; padding: 8px 16px; border-radius: 3px; cursor: pointer; }
.ob-dead button:disabled { cursor: default; color: #fff; text-shadow: 0 1px 1px rgba(0,0,0,0.35); }
.ob-dead.ready button { background: linear-gradient(#3b8cff, #1f6fe8); border-color: #1550b0; color: #fff; }
.ob-dead.ready button.exit { background: linear-gradient(#ff3b48, #d81e2c); border-color: #9c1420; }
.ob-dead.ready button:hover { filter: brightness(1.1); }

/* ---- connection */
.ob-conn { position: absolute; left: 50%; top: calc(12px + var(--safe-t)); transform: translateX(-50%); background: rgba(140, 40, 40, 0.9); padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; }

/* ---- panels (inventory, shop, island, worlds) */
.ob-modal { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: auto; background: rgba(10, 14, 30, 0.35); }
.ob-panel { zoom: var(--s); background: rgba(44, 50, 86, max(0.55, var(--panel-alpha))); border-radius: 6px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); max-height: calc(100vh / var(--s) - 20px); max-width: calc(100vw / var(--s) - 20px); display: flex; flex-direction: column; overflow: hidden; }
.ob-panel h2 { margin: 0; font-size: 17px; font-weight: 700; text-align: center; padding: 10px 40px 8px; position: relative; }
.ob-x { position: absolute; right: 6px; top: 6px; width: 30px; height: 30px; border-radius: 4px; border: 0; background: #d83a3a; color: #fff; font-weight: 900; font-size: 16px; cursor: pointer; }
.ob-tabs { display: flex; gap: 2px; padding: 0 10px; border-bottom: 2px solid rgba(255,255,255,0.12); }
.ob-tabs button { background: transparent; border: 0; color: #c8cdf0; font: 700 13px inherit; font-family: inherit; padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
.ob-tabs button.on { color: #fff; border-bottom-color: var(--gold); }
.ob-body { padding: 10px; overflow: auto; }
.ob-btn { background: #3a7bea; border: 0; border-bottom: 3px solid #2556b0; color: #fff; font: 700 14px inherit; font-family: inherit; padding: 7px 14px; border-radius: 4px; cursor: pointer; }
.ob-btn:hover { filter: brightness(1.1); }
.ob-btn:disabled { background: #5a6080; border-bottom-color: #3f4460; color: #b8bcd4; cursor: default; filter: none; }
.ob-btn.gold { background: #e8a81c; border-bottom-color: #a87410; }
.ob-btn.red { background: #d84a4a; border-bottom-color: #9a2a2a; }
.ob-btn.green { background: #3fae4a; border-bottom-color: #26782e; }
.ob-btn.small { padding: 4px 9px; font-size: 12px; }

/* inventory */
.ob-inv { display: flex; gap: 10px; align-items: flex-start; }
.ob-craft { width: 300px; background: #3b4270; border-radius: 4px; padding: 8px; }
.ob-craft h3 { margin: 0 0 6px; text-align: center; font-size: 15px; }
.ob-recipes { display: grid; grid-template-columns: repeat(6, 40px); gap: 3px; max-height: 260px; overflow-y: auto; padding-right: 2px; }
.ob-recipe { position: relative; width: 40px; height: 40px; background: #565e94; border: 2px solid #2b3054; border-radius: 3px; padding: 4px; cursor: pointer; }
.ob-recipe.can { background: #6b8f5a; }
.ob-recipe.sel { border-color: #fff; }
.ob-recipe .n { position: absolute; right: 1px; bottom: -1px; font-size: 10px; font-weight: 800; text-shadow: 1px 1px 0 #000; }
.ob-rdetail { margin-top: 8px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ob-rdetail .name { font-weight: 700; font-size: 14px; }
.ob-needs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.ob-need-i { display: flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 700; background: #2b3054; padding: 2px 6px 2px 2px; border-radius: 3px; }
.ob-need-i.miss { color: #ff9a9a; }
.ob-need-i i { width: 22px; height: 22px; display: inline-block; }
.ob-bags { background: #3b4270; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.ob-grid { display: grid; grid-template-columns: repeat(6, 44px); gap: 2px; }
.ob-grid.ten { grid-template-columns: repeat(10, 44px); }
.ob-grid.nine { grid-template-columns: repeat(9, 44px); }
.ob-armor { display: flex; gap: 2px; justify-content: center; }
.ob-armor .ob-slot .ghost { position: absolute; inset: 7px; opacity: 0.25; }
.ob-cursor { position: fixed; width: 40px; height: 40px; pointer-events: none; z-index: 40; transform: translate(-50%, -50%); }
.ob-cursor .n { position: absolute; right: -2px; bottom: -4px; font-size: 13px; font-weight: 800; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
.ob-tip { position: fixed; z-index: 41; pointer-events: none; background: rgba(16, 8, 30, 0.95); border: 2px solid #4a1a8a; padding: 5px 8px; border-radius: 3px; font-size: 13px; max-width: 240px; }
.ob-tip .d { color: #aab; font-size: 11px; display: block; }
.ob-tip .s { color: var(--gold); font-size: 11px; display: block; }

/* shop */
.ob-shop { width: 640px; }
.ob-greet { font-size: 13px; color: #d8dcf8; text-align: center; margin-bottom: 8px; }
.ob-offers { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
.ob-offer { background: #3b4270; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
.ob-offer .ic { width: 40px; height: 40px; }
.ob-offer .nm { font-weight: 700; font-size: 12px; }
.ob-offer .pr { color: var(--gold); font-weight: 800; font-size: 13px; display: flex; align-items: center; gap: 3px; }
.ob-offer .pr i { width: 16px; height: 16px; display: inline-block; }
.ob-sell-row { display: flex; align-items: center; gap: 8px; background: #3b4270; padding: 4px 8px; border-radius: 4px; }
.ob-sell-row .ic { width: 30px; height: 30px; }
.ob-sell-row .nm { flex: 1; font-weight: 600; font-size: 13px; }
.ob-sell-row .pr { color: var(--gold); font-weight: 700; font-size: 12px; width: 110px; text-align: right; }
.ob-sell { display: flex; flex-direction: column; gap: 4px; }

/* phases */
.ob-phases { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
.ob-phase { background: #3b4270; border-radius: 4px; padding: 8px; text-align: center; border: 2px solid transparent; cursor: pointer; }
.ob-phase.on { border-color: var(--gold); }
.ob-phase.locked { opacity: 0.45; cursor: default; }
.ob-phase .nm { font-weight: 800; font-size: 14px; }
.ob-phase .req { font-size: 11px; color: #c8cdf0; }

/* island menu / worlds / achievements */
.ob-list { display: flex; flex-direction: column; gap: 4px; min-width: 460px; }
.ob-row { display: flex; align-items: center; gap: 8px; background: #3b4270; padding: 6px 8px; border-radius: 4px; }
.ob-row .nm { flex: 1; font-weight: 700; font-size: 14px; }
.ob-row .sub { font-size: 11px; color: #c8cdf0; font-weight: 500; display: block; }
.ob-row select { background: #2b3054; color: #fff; border: 1px solid #6a72a8; border-radius: 3px; padding: 3px 6px; font: 600 12px inherit; font-family: inherit; }
.ob-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
.ob-stat { background: #3b4270; border-radius: 4px; padding: 8px; text-align: center; }
.ob-stat b { display: block; font-size: 18px; }
.ob-stat span { font-size: 11px; color: #c8cdf0; }
.ob-ach { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; width: 560px; }
.ob-ach .ob-row { opacity: 0.5; }
.ob-ach .ob-row.got { opacity: 1; background: #3e6a4a; }
.ob-ach .ic { width: 32px; height: 32px; }
.ob-check { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; cursor: pointer; }

/* ---- touch */
.ob-touch-btns { position: absolute; inset: 0; pointer-events: none; }
.ob-tbtn { position: absolute; pointer-events: auto; width: calc(60px * var(--ts)); height: calc(60px * var(--ts)); border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); background: rgba(30, 34, 56, 0.5); color: #fff; font-weight: 800; font-size: calc(11px * var(--ts)); display: grid; place-items: center; padding: calc(10px * var(--ts)); touch-action: none; }
.ob-tbtn.big { width: calc(78px * var(--ts)); height: calc(78px * var(--ts)); }
.ob-tbtn.on { background: rgba(80, 140, 240, 0.65); }
.ob-tbtn.pressed { background: rgba(255,255,255,0.35); }
.ob-tbtn .lbl { position: absolute; bottom: calc(-14px * var(--ts)); font-size: calc(10px * var(--ts)); text-shadow: 0 1px 2px #000; white-space: nowrap; }
body.ob-touch .ob-cross { display: block; }
body.ob-touch { --lift: 0px; }
body.ob-touch .ob-held { display: none; }
body.ob-panel .ob-touch-btns, body.ob-panel .gm-touch { visibility: hidden; }
body.ob-is-dead .ob-touch-btns { visibility: hidden; }

@keyframes ob-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes ob-banner { from { opacity: 0; transform: translateY(-50%) scaleY(0.6); } to { opacity: 1; transform: translateY(-50%); } }
`;

let injected = false;

/**
 * The UI scale from the real window.
 *
 * A mouse: 1 at about 1100 x 650, growing on big monitors (1.6 at most, so a
 * 1440p screen does not get a postage-stamp HUD) and shrinking on small ones.
 * Touch: sized for fingers - judged against a phone's own size, so a portrait
 * phone does not shrink everything to its narrow width. The hotbar (--hs) is
 * the one row that must fit the width, so it gets its own, never larger.
 */
export const applyUiScale = (): void => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const touch = document.body?.classList.contains('bv-touchmode') ?? false;
  const scale = touch ? Math.max(0.5, Math.min(1.05, Math.min(w / 460, h / 560))) : Math.max(0.5, Math.min(1.6, Math.min(w / 1100, h / 650)));
  const hotbar = Math.max(0.4, Math.min(scale, (w - 16) / 650));
  document.documentElement.style.setProperty('--hs', hotbar.toFixed(3));
  // Windows (Shop, Backpack, Furniture...) are already big: they grow only a little on large monitors.
  document.documentElement.style.setProperty('--ws', Math.min(scale, 1.1).toFixed(3));
  const buttons = Math.max(0.62, Math.min(1, Math.min(w / 900, h / 520)));
  const root = document.documentElement.style;
  root.setProperty('--s', scale.toFixed(3));
  root.setProperty('--ts', buttons.toFixed(3));
};

export const injectStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  applyUiScale();
  window.addEventListener('resize', applyUiScale);
  window.addEventListener('orientationchange', applyUiScale);
  window.visualViewport?.addEventListener('resize', applyUiScale);
};
