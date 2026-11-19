/**
 * THE UI'S LOOK: a polished Roblox simulator. Chunky rounded buttons with a
 * dark outline and a glossy top, Fredoka text with a black stroke, windows
 * with a bold coloured title bar, dark glassy rows. Laid out like the
 * reference: the Tracks / Base / Crates tabs top middle, the menu down the
 * left middle, cash and boost bottom left, the hotbar bottom middle, packs
 * and the 2x Money pass on the right. One unit (--u) scales it all.
 */
const CSS = `
:root { --u: 1px; }
.rt-root { position: fixed; inset: 0; pointer-events: none; z-index: 10; font-family: "Fredoka", "Rubik", system-ui, sans-serif; color: #fff; user-select: none; }
.rt-root * { box-sizing: border-box; }
.rt-hidden { display: none !important; }
.rt-ol { -webkit-text-stroke: calc(var(--u) * 1.3) rgba(0,0,0,0.9); paint-order: stroke fill; text-shadow: 0 calc(var(--u) * 2) 0 rgba(0,0,0,0.5); }
.rt-img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; display: block; }
.rt-root svg { width: 100%; height: 100%; display: block; }
.rt-key { position: absolute; left: calc(var(--u) * 3); top: calc(var(--u) * 1); font: 800 calc(var(--u) * 11) Rubik, sans-serif; color: #fff; -webkit-text-stroke: calc(var(--u) * 0.8) #000; paint-order: stroke fill; }
body.rt-touch .rt-key { display: none; }
/* PC shortcut keycaps (bottom-right of a button; hidden on touch screens). */
.rt-kc { position: absolute; right: calc(var(--u) * -6); bottom: calc(var(--u) * -6); min-width: calc(var(--u) * 18); height: calc(var(--u) * 18); padding: 0 calc(var(--u) * 4); border-radius: calc(var(--u) * 5); background: #fff; color: #15172a; font: 800 calc(var(--u) * 11)/calc(var(--u) * 18) Rubik, sans-serif; text-align: center; -webkit-text-stroke: 0; text-shadow: none; box-shadow: 0 calc(var(--u) * 2) 0 rgba(0,0,0,0.4); pointer-events: none; z-index: 2; font-style: normal; white-space: nowrap; }
.rt-sbtn .rt-kc, .rt-icbtn .rt-kc { right: auto; bottom: auto; left: calc(var(--u) * -6); top: calc(var(--u) * -6); }
.rt-kc-inline { position: static; align-self: center; margin-left: auto; }
.rt-pack .art { position: relative; }
body.rt-touch .rt-kc { display: none; }

.rt-btn { pointer-events: auto; position: relative; border: calc(var(--u) * 3) solid #15172a; border-radius: calc(var(--u) * 10); cursor: pointer; color: #fff; font-family: inherit; font-weight: 700; background: linear-gradient(#5fb4ff, #2f7fe6); box-shadow: inset 0 calc(var(--u) * -4) 0 rgba(0,0,0,0.25), inset 0 calc(var(--u) * 3) 0 rgba(255,255,255,0.35), 0 calc(var(--u) * 3) 0 rgba(0,0,0,0.4); transition: transform 70ms, filter 70ms; }
.rt-btn:hover { filter: brightness(1.1); }
.rt-btn:active { transform: translateY(calc(var(--u) * 2)) scale(0.97); }
.rt-btn.pink { background: linear-gradient(#ff7ae0, #c43fd8); }
.rt-btn.purple { background: linear-gradient(#b58cff, #7a3fe0); }
.rt-btn.green { background: linear-gradient(#8af06a, #33b83a); }
.rt-btn.lime { background: linear-gradient(#c6ff5a, #5fd42a); color: #fff; }
.rt-btn.red { background: linear-gradient(#ff6a6a, #d8242a); }
.rt-btn.gold { background: linear-gradient(#ffe36a, #ffaf1a); }
.rt-btn.blue { background: linear-gradient(#6ad8ff, #2f8fe6); }
.rt-btn.teal { background: linear-gradient(#6ff0e0, #1fb0a8); }
.rt-btn.orange { background: linear-gradient(#ffb36b, #ff6a1a); }
.rt-btn.dark { background: linear-gradient(#4a5070, #2a2e44); }
.rt-btn.grey { background: linear-gradient(#bfc6d1, #8d939c); }
.rt-btn.magenta { background: linear-gradient(#ff5ac8, #e0209a); }
.rt-btn[disabled] { filter: grayscale(0.75) brightness(0.8); cursor: default; }
.rt-btn.glow, .rt-glow { animation: rt-glow 0.9s ease-in-out infinite alternate; }
@keyframes rt-glow { from { box-shadow: 0 0 0 calc(var(--u) * 2) #fff, 0 0 calc(var(--u) * 14) calc(var(--u) * 4) #fff6a0; } to { box-shadow: 0 0 0 calc(var(--u) * 4) #fff6a0, 0 0 calc(var(--u) * 24) calc(var(--u) * 8) #fff6a0; } }

/* ---- top middle: Tracks / Base / Crates */
.rt-top { position: absolute; left: 50%; top: calc(var(--u) * 10 + env(safe-area-inset-top, 0px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 6); }
.rt-tabs { display: flex; gap: calc(var(--u) * 8); }
.rt-tab { height: calc(var(--u) * 46); padding: 0 calc(var(--u) * 14) 0 calc(var(--u) * 6); display: flex; align-items: center; gap: calc(var(--u) * 4); font-size: calc(var(--u) * 21); border-radius: calc(var(--u) * 8); background: linear-gradient(#3a3f58, #23263a); }
.rt-tab .ic { width: calc(var(--u) * 40); height: calc(var(--u) * 40); margin-top: calc(var(--u) * -8); }
.rt-hint { font-size: calc(var(--u) * 19); font-weight: 600; text-align: center; max-width: calc(var(--u) * 640); }
.rt-hint b { color: #ffe14a; }

/* ---- left middle: the menu */
.rt-left { position: absolute; left: calc(var(--u) * 10 + env(safe-area-inset-left, 0px)); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: calc(var(--u) * 7); width: calc(var(--u) * 168); transform-origin: top left; }
.rt-mbtn { height: calc(var(--u) * 46); display: flex; align-items: center; gap: calc(var(--u) * 6); padding: 0 calc(var(--u) * 8) 0 calc(var(--u) * 4); font-size: calc(var(--u) * 20); text-align: left; }
.rt-mbtn .ic { width: calc(var(--u) * 38); height: calc(var(--u) * 38); flex: none; }
.rt-mbtn .badge, .rt-sbtn .badge { position: absolute; right: calc(var(--u) * -6); top: calc(var(--u) * -6); min-width: calc(var(--u) * 20); height: calc(var(--u) * 20); border-radius: calc(var(--u) * 10); background: #ff2a3a; border: calc(var(--u) * 2) solid #fff; font-size: calc(var(--u) * 13); line-height: calc(var(--u) * 16); text-align: center; }
.rt-small { display: flex; gap: calc(var(--u) * 6); }
.rt-sbtn { width: calc(var(--u) * 50); height: calc(var(--u) * 54); padding: calc(var(--u) * 2) 0 0; display: flex; flex-direction: column; align-items: center; font-size: calc(var(--u) * 12.5); border-radius: calc(var(--u) * 8); background: linear-gradient(#3a3f58, #23263a); }
.rt-sbtn .ic { width: calc(var(--u) * 34); height: calc(var(--u) * 34); }

/* ---- bottom left: cash, boost, rate */
.rt-money { position: absolute; left: calc(var(--u) * 12 + env(safe-area-inset-left, 0px)); bottom: calc(var(--u) * 10 + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 0; font-style: italic; line-height: 1.05; }
.rt-cash { font-size: calc(var(--u) * 40); font-weight: 700; color: #ffe14a; }
.rt-cash.bump { animation: rt-bump 260ms ease-out; }
@keyframes rt-bump { 40% { transform: scale(1.08); } }
.rt-sub { display: flex; gap: calc(var(--u) * 22); font-size: calc(var(--u) * 22); font-weight: 700; }
.rt-sub .boost { color: #fff; }
.rt-sub .rate { color: #ffe14a; }
.rt-plus { position: absolute; left: 0; bottom: calc(var(--u) * 66); font-size: calc(var(--u) * 26); font-weight: 700; color: #7dff6a; animation: rt-rise 1.2s ease-out forwards; white-space: nowrap; font-style: italic; }
.rt-plus.minus { color: #ff4a4a; }
@keyframes rt-rise { from { transform: translateY(0); opacity: 1; } to { transform: translateY(calc(var(--u) * -40)); opacity: 0; } }

/* ---- bottom middle: hotbar */
.rt-hotbar { position: absolute; left: 50%; bottom: calc(var(--u) * 8 + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; gap: calc(var(--u) * 5); }
.rt-slot { width: calc(var(--u) * 54); height: calc(var(--u) * 54); padding: calc(var(--u) * 3) 0 0; display: flex; flex-direction: column; align-items: center; font-size: calc(var(--u) * 11.5); border-radius: calc(var(--u) * 7); background: linear-gradient(#3a3f58cc, #23263acc); }
.rt-slot .ic { width: calc(var(--u) * 32); height: calc(var(--u) * 32); }
.rt-slot.on { background: linear-gradient(#6ad8ff, #2f8fe6); outline: calc(var(--u) * 3) solid #fff; }

/* ---- right: packs, the pass */
.rt-right { position: absolute; right: calc(var(--u) * 10 + env(safe-area-inset-right, 0px)); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: flex-end; gap: calc(var(--u) * 8); transform-origin: top right; }
.rt-pack { width: calc(var(--u) * 78); display: flex; flex-direction: column; align-items: center; background: none; border: 0; box-shadow: none; font-size: calc(var(--u) * 13); }
.rt-pack .art { width: calc(var(--u) * 70); height: calc(var(--u) * 62); border-radius: calc(var(--u) * 12); border: calc(var(--u) * 3) solid #15172a; display: grid; place-items: center; font-size: calc(var(--u) * 36); background: radial-gradient(circle at 50% 35%, #fff6a0, #ff8a2a 55%, #c4202a); box-shadow: 0 calc(var(--u) * 3) 0 rgba(0,0,0,0.4); }
.rt-pack .gems, .rt-pass .gems { display: flex; align-items: center; gap: calc(var(--u) * 3); color: #7dff6a; font-size: calc(var(--u) * 15); }
.rt-gem { display: inline-block; width: calc(var(--u) * 14); height: calc(var(--u) * 14); border-radius: 50%; background: radial-gradient(circle at 35% 35%, #c8ffd0, #2fd36a 60%, #137a3a); border: calc(var(--u) * 2) solid #0a3a1a; vertical-align: middle; }
.rt-pass { height: calc(var(--u) * 50); padding: 0 calc(var(--u) * 10); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: calc(var(--u) * 20); background: linear-gradient(#ff5a5a, #c4202a); }
.rt-pass small { font-size: calc(var(--u) * 11); color: #ffe14a; }
.rt-boostpack { position: absolute; right: calc(var(--u) * 14 + env(safe-area-inset-right, 0px)); top: calc(var(--u) * 60 + env(safe-area-inset-top, 0px)); text-align: center; pointer-events: auto; cursor: pointer; }
.rt-boostpack b { display: block; font-size: calc(var(--u) * 28); color: #7dff6a; }
.rt-boostpack small { font-size: calc(var(--u) * 14); color: #fff; }

/* ---- the prompt (E) */
.rt-prompt { position: absolute; left: 50%; bottom: calc(var(--u) * 92 + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 6) calc(var(--u) * 14) calc(var(--u) * 6) calc(var(--u) * 6); border-radius: calc(var(--u) * 12); background: rgba(20,22,36,0.78); border: calc(var(--u) * 2) solid rgba(255,255,255,0.25); pointer-events: auto; cursor: pointer; }
.rt-prompt .k { width: calc(var(--u) * 36); height: calc(var(--u) * 36); border-radius: calc(var(--u) * 8); background: #fff; color: #15172a; display: grid; place-items: center; font: 800 calc(var(--u) * 18) Rubik, sans-serif; }
body.rt-touch .rt-prompt .k { width: auto; padding: 0 calc(var(--u) * 8); }
.rt-prompt .t { display: flex; flex-direction: column; line-height: 1.1; }
.rt-prompt .t span { font-size: calc(var(--u) * 13); color: #c8cde8; }
.rt-prompt .t b { font-size: calc(var(--u) * 20); }

/* ---- notices, banners */
.rt-notices { position: absolute; left: 50%; top: calc(var(--u) * 118); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 4); }
.rt-notice { font-size: calc(var(--u) * 20); font-weight: 700; padding: calc(var(--u) * 3) calc(var(--u) * 14); border-radius: calc(var(--u) * 10); background: rgba(20,22,36,0.7); animation: rt-pop 180ms ease-out; white-space: nowrap; }
.rt-notice.good { color: #7dff6a; }
.rt-notice.bad { color: #ff6a6a; }
.rt-notice.gold { color: #ffe14a; }
@keyframes rt-pop { from { transform: scale(0.7); opacity: 0; } }
.rt-banner { position: absolute; left: 50%; top: 24%; transform: translateX(-50%); text-align: center; animation: rt-bannerin 380ms cubic-bezier(.2,1.6,.4,1); }
.rt-banner h1 { font-size: calc(var(--u) * 54); font-weight: 700; color: #ffe14a; white-space: nowrap; }
.rt-banner.level h1 { color: #7dff6a; }
.rt-banner.ride h1 { color: #6ad8ff; }
.rt-banner p { font-size: calc(var(--u) * 22); font-weight: 600; }
@keyframes rt-bannerin { from { transform: translateX(-50%) scale(0.4); opacity: 0; } }

/* ---- driving: air time, crash, the run */
.rt-air { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); text-align: center; line-height: 1.0; }
.rt-air .a { font-size: calc(var(--u) * 46); font-weight: 700; color: #fff; }
.rt-air .a i { font-style: normal; color: #6ad8ff; }
.rt-air .s { font-size: calc(var(--u) * 40); font-weight: 700; color: #ffe14a; }
.rt-air .best { font-size: calc(var(--u) * 32); font-weight: 700; color: #ffe14a; animation: rt-pop 200ms ease-out; }
.rt-air .crash { font-size: calc(var(--u) * 70); font-weight: 700; color: #ff7a1a; -webkit-text-stroke: calc(var(--u) * 2.4) #3a0a0a; animation: rt-shake 360ms ease-out; }
@keyframes rt-shake { 0% { transform: scale(1.6) rotate(-6deg); } 50% { transform: scale(0.95) rotate(3deg); } 100% { transform: scale(1) rotate(0); } }
.rt-run { position: absolute; left: 50%; top: calc(var(--u) * 70); transform: translateX(-50%); font-size: calc(var(--u) * 34); font-weight: 700; color: #7dff6a; font-style: italic; }
.rt-speed { position: absolute; right: calc(var(--u) * 16 + env(safe-area-inset-right, 0px)); bottom: calc(var(--u) * 16 + env(safe-area-inset-bottom, 0px)); width: calc(var(--u) * 150); height: calc(var(--u) * 150); border-radius: 50%; background: radial-gradient(circle, rgba(30,32,52,0.9) 55%, rgba(20,22,36,0.6)); border: calc(var(--u) * 4) solid #15172a; display: grid; place-items: center; text-align: center; }
.rt-speed b { font-size: calc(var(--u) * 42); line-height: 1; display: block; }
.rt-speed span { font-size: calc(var(--u) * 14); color: #c8cde8; }
.rt-speed .cond { font-size: calc(var(--u) * 13); }
.rt-drivebar { position: absolute; left: 50%; bottom: calc(var(--u) * 14 + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 6); }
.rt-drivebar .hint { font-size: calc(var(--u) * 18); font-weight: 600; }
.rt-drivebar .hint b { color: #ffe14a; }
.rt-pedals { position: absolute; right: calc(var(--u) * 180 + env(safe-area-inset-right, 0px)); bottom: calc(var(--u) * 24 + env(safe-area-inset-bottom, 0px)); display: flex; gap: calc(var(--u) * 12); }
.rt-pedal { width: calc(var(--u) * 92); height: calc(var(--u) * 92); border-radius: 50%; font-size: calc(var(--u) * 18); }
body.rt-touch .rt-drivebar .hint { display: none; }
/* Portrait phones: the pedals go to the right edge (clear of the steering arrows), the speedometer above them. */
@media (orientation: portrait) {
  body.rt-touch .rt-pedals { right: calc(var(--u) * 12 + env(safe-area-inset-right, 0px)); }
  body.rt-touch .rt-speed { bottom: calc(var(--u) * 132 + env(safe-area-inset-bottom, 0px)); width: calc(var(--u) * 112); height: calc(var(--u) * 112); }
  body.rt-touch .rt-speed b { font-size: calc(var(--u) * 32); }
}
.rt-root.mode-build .rt-feed, .rt-root.mode-drive .rt-feed { display: none; }
/* A window is open: the side menus, packs and hotbar step aside, and the window stays off the bottom edge,
   so Boxity's screen-ad banners (sides, bottom centre) have room without touching the game's UI. */
.rt-root.panel-open .rt-left, .rt-root.panel-open .rt-right, .rt-root.panel-open .rt-hotbar, .rt-root.panel-open .rt-boostpack, .rt-root.panel-open .rt-top, .rt-root.panel-open .rt-build, .rt-root.panel-open .rt-btools, .rt-root.panel-open .rt-feed { display: none !important; }
.rt-root.panel-open .rt-win { top: calc(50% - 62px); max-height: calc(100% - 140px); }
@media (max-width: 700px) { .rt-root.panel-open .rt-money { display: none; } }
.rt-whead .cash { font-size: calc(var(--u) * 18); color: #ffe14a; background: rgba(0,0,0,0.35); padding: calc(var(--u) * 2) calc(var(--u) * 8); border-radius: calc(var(--u) * 8); white-space: nowrap; }
@media (max-height: 520px) { .rt-boostpack { display: none; } }
.rt-steer { position: absolute; left: calc(var(--u) * 24 + env(safe-area-inset-left, 0px)); bottom: calc(var(--u) * 24 + env(safe-area-inset-bottom, 0px)); display: flex; gap: calc(var(--u) * 12); }

/* ---- build mode */
.rt-build { position: absolute; left: calc(var(--u) * 10 + env(safe-area-inset-left, 0px)); top: calc(var(--u) * 70 + env(safe-area-inset-top, 0px)); width: calc(var(--u) * 300); display: flex; flex-direction: column; gap: calc(var(--u) * 4); pointer-events: auto; transform-origin: top left; }
.rt-build h3 { font-size: calc(var(--u) * 24); font-weight: 700; }
.rt-btabs { display: flex; gap: calc(var(--u) * 4); padding: calc(var(--u) * 5); border-radius: calc(var(--u) * 8); background: linear-gradient(#6ad8ff, #2f8fe6); border: calc(var(--u) * 3) solid #15172a; }
.rt-btabs .rt-btn { height: calc(var(--u) * 34); padding: 0 calc(var(--u) * 10); font-size: calc(var(--u) * 16); border-radius: calc(var(--u) * 6); }
.rt-btabs .rt-btn.on { outline: calc(var(--u) * 3) solid #fff; }
.rt-bgrid { height: calc(var(--u) * 300); overflow-y: auto; display: grid; grid-template-columns: repeat(2, 1fr); align-content: start; gap: calc(var(--u) * 6); padding: calc(var(--u) * 6); border-radius: calc(var(--u) * 8); background: rgba(10,40,10,0.72); border: calc(var(--u) * 3) solid #15172a; }
.rt-bcard { position: relative; height: calc(var(--u) * 92); border-radius: calc(var(--u) * 6); padding: calc(var(--u) * 3); border: calc(var(--u) * 3) solid #15172a; background: linear-gradient(#5a6080, #383c58); cursor: pointer; overflow: hidden; display: flex; flex-direction: column; }
.rt-bcard.on { outline: calc(var(--u) * 3) solid #fff; background: linear-gradient(#7ae0ff, #3a90e6); }
.rt-bcard.empty { opacity: 0.45; }
.rt-bcard .nm { font-size: calc(var(--u) * 13); font-weight: 700; line-height: 1.05; z-index: 1; }
.rt-bcard .th { position: absolute; inset: calc(var(--u) * 14) calc(var(--u) * 6) calc(var(--u) * 16); background-size: contain; background-position: center; background-repeat: no-repeat; }
.rt-bcard .rate { position: absolute; left: calc(var(--u) * 4); bottom: calc(var(--u) * 2); font-size: calc(var(--u) * 13); color: #7dff6a; }
.rt-bcard .rar { position: absolute; left: calc(var(--u) * 4); bottom: calc(var(--u) * 15); font-size: calc(var(--u) * 10); }
.rt-bcard .cnt { position: absolute; right: calc(var(--u) * 5); bottom: calc(var(--u) * 2); font-size: calc(var(--u) * 16); color: #ffe14a; }
.rt-btools { position: absolute; left: 50%; bottom: calc(var(--u) * 74 + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 6); }
.rt-btools .row { display: flex; gap: calc(var(--u) * 8); }
.rt-btools .lbl { font-size: calc(var(--u) * 22); font-weight: 700; }
.rt-btools .rt-btn { height: calc(var(--u) * 44); min-width: calc(var(--u) * 120); font-size: calc(var(--u) * 20); padding: 0 calc(var(--u) * 14); }
.rt-btools .rt-btn.big { min-width: calc(var(--u) * 180); }

/* ---- windows */
.rt-dim { position: absolute; inset: 0; background: rgba(0,0,0,0.25); pointer-events: auto; }
.rt-win { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(calc(var(--u) * 640), 94vw); max-height: 88vh; display: flex; flex-direction: column; pointer-events: auto; animation: rt-winin 200ms cubic-bezier(.2,1.4,.4,1); }
@keyframes rt-winin { from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; } }
.rt-win.wide { width: min(calc(var(--u) * 820), 96vw); }
.rt-whead { position: relative; display: flex; align-items: center; gap: calc(var(--u) * 8); height: calc(var(--u) * 56); padding: 0 calc(var(--u) * 8) 0 calc(var(--u) * 58); border: calc(var(--u) * 3) solid #15172a; border-radius: calc(var(--u) * 10) calc(var(--u) * 10) 0 0; background: linear-gradient(#ff6a8a, #d8243a); }
.rt-whead.green { background: linear-gradient(#8af06a, #2fa83a); }
.rt-whead.yellow { background: linear-gradient(#fff07a, #ffc21a); }
.rt-whead.blue { background: linear-gradient(#7ae6ff, #2f8fe6); }
.rt-whead.purple { background: linear-gradient(#c79cff, #7a3fe0); }
.rt-whead.dark { background: linear-gradient(#5a6080, #2a2e44); }
.rt-whead .wic { position: absolute; left: calc(var(--u) * -12); top: calc(var(--u) * -14); width: calc(var(--u) * 70); height: calc(var(--u) * 70); }
.rt-whead h2 { flex: 1; font-size: calc(var(--u) * 30); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt-whead .rt-btn { height: calc(var(--u) * 38); padding: 0 calc(var(--u) * 12); font-size: calc(var(--u) * 18); }
.rt-x { width: calc(var(--u) * 40); height: calc(var(--u) * 40); padding: 0 !important; font-size: calc(var(--u) * 22) !important; }
.rt-wbody { overflow-y: auto; padding: calc(var(--u) * 10); background: rgba(28,30,46,0.94); border: calc(var(--u) * 3) solid #15172a; border-top: 0; border-radius: 0 0 calc(var(--u) * 10) calc(var(--u) * 10); display: flex; flex-direction: column; gap: calc(var(--u) * 8); min-height: 0; }
.rt-wfoot { font-size: calc(var(--u) * 17); font-weight: 700; padding: calc(var(--u) * 4) calc(var(--u) * 4) 0; }

/* rows (Track Shop, Crates) */
.rt-row { position: relative; display: flex; align-items: center; gap: calc(var(--u) * 10); padding: calc(var(--u) * 6); border-radius: calc(var(--u) * 8); background: linear-gradient(#4a4e66, #33364a); border: calc(var(--u) * 3) solid #15172a; }
.rt-row .th { position: relative; width: calc(var(--u) * 96); height: calc(var(--u) * 66); flex: none; border-radius: calc(var(--u) * 6); background: #1c1e2e center / contain no-repeat; }
.rt-row .th .rar { position: absolute; left: calc(var(--u) * 4); bottom: calc(var(--u) * 2); font-size: calc(var(--u) * 11); }
.rt-row .info { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.15; }
.rt-row .info b { font-size: calc(var(--u) * 21); }
.rt-row .info .r { font-size: calc(var(--u) * 14); color: #7dff6a; font-style: italic; }
.rt-row .info .st { font-size: calc(var(--u) * 14); color: #ffe14a; font-style: italic; }
.rt-row .info .bl { font-size: calc(var(--u) * 12.5); color: #c8cde8; }
.rt-row .buy { display: flex; flex-direction: column; gap: calc(var(--u) * 4); }
.rt-row .buy .rt-btn { min-width: calc(var(--u) * 110); height: calc(var(--u) * 36); font-size: calc(var(--u) * 19); }
.rt-row .new { position: absolute; left: calc(var(--u) * -4); top: calc(var(--u) * -9); font-size: calc(var(--u) * 11); padding: 0 calc(var(--u) * 6); border-radius: calc(var(--u) * 6); background: #2f8fe6; border: calc(var(--u) * 2) solid #fff; }
.rt-row.locked .lockov { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 6); background: rgba(10,10,20,0.62); border-radius: calc(var(--u) * 6); font-size: calc(var(--u) * 20); font-weight: 700; }
.rt-row.locked .lockov .ic { width: calc(var(--u) * 34); height: calc(var(--u) * 34); }

/* grids (Decorations, Garage, Gallery) */
.rt-cols { display: flex; gap: calc(var(--u) * 10); min-height: 0; }
.rt-side { display: flex; flex-direction: column; gap: calc(var(--u) * 8); }
.rt-side .rt-btn { height: calc(var(--u) * 54); min-width: calc(var(--u) * 150); display: flex; align-items: center; justify-content: space-between; gap: calc(var(--u) * 6); padding: 0 calc(var(--u) * 6) 0 calc(var(--u) * 12); font-size: calc(var(--u) * 17); }
.rt-side .rt-btn .ic { width: calc(var(--u) * 40); height: calc(var(--u) * 40); font-size: calc(var(--u) * 28); line-height: calc(var(--u) * 40); text-align: center; }
.rt-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--u) * 116), 1fr)); gap: calc(var(--u) * 8); align-content: start; }
.rt-card { position: relative; border-radius: calc(var(--u) * 8); padding: calc(var(--u) * 4); border: calc(var(--u) * 3) solid #15172a; background: linear-gradient(#4a4e66, #33364a); display: flex; flex-direction: column; gap: calc(var(--u) * 3); cursor: pointer; }
.rt-card.on { outline: calc(var(--u) * 3) solid #fff; }
.rt-card .nm { font-size: calc(var(--u) * 13.5); font-weight: 700; line-height: 1.05; min-height: calc(var(--u) * 28); }
.rt-card .st { font-size: calc(var(--u) * 11); color: #ffe14a; }
.rt-card .th { height: calc(var(--u) * 70); background: #1c1e2e center / contain no-repeat; border-radius: calc(var(--u) * 5); position: relative; }
.rt-card .rar { font-size: calc(var(--u) * 11); }
.rt-card .rt-btn { height: calc(var(--u) * 30); font-size: calc(var(--u) * 15); }
.rt-card.locked::after { content: '🔒'; position: absolute; inset: 0; display: grid; place-items: center; font-size: calc(var(--u) * 34); background: rgba(10,10,20,0.55); border-radius: calc(var(--u) * 6); }
.rt-card .eq { position: absolute; right: calc(var(--u) * 4); top: calc(var(--u) * 4); font-size: calc(var(--u) * 11); background: #33b83a; padding: 0 calc(var(--u) * 5); border-radius: calc(var(--u) * 5); border: calc(var(--u) * 2) solid #15172a; }

/* bars and stats */
.rt-stat { display: flex; align-items: center; gap: calc(var(--u) * 8); font-size: calc(var(--u) * 15); }
.rt-stat .n { width: calc(var(--u) * 90); }
.rt-bar { flex: 1; height: calc(var(--u) * 14); border-radius: calc(var(--u) * 7); background: #15172a; overflow: hidden; border: calc(var(--u) * 2) solid #15172a; }
.rt-bar i { display: block; height: 100%; background: linear-gradient(#8af06a, #33b83a); border-radius: calc(var(--u) * 5); }
.rt-bar.cond i { background: linear-gradient(#ffe36a, #ff8a1a); }
.rt-bar.low i { background: linear-gradient(#ff6a6a, #d8242a); }
.rt-pips { display: flex; gap: calc(var(--u) * 3); }
.rt-pips i { width: calc(var(--u) * 10); height: calc(var(--u) * 14); border-radius: calc(var(--u) * 3); background: #15172a; }
.rt-pips i.on { background: #7dff6a; }
.rt-panel { padding: calc(var(--u) * 10); border-radius: calc(var(--u) * 8); background: linear-gradient(#3f4360, #2c2f45); border: calc(var(--u) * 3) solid #15172a; display: flex; flex-direction: column; gap: calc(var(--u) * 6); }
.rt-panel h3 { font-size: calc(var(--u) * 22); }
.rt-panel p { font-size: calc(var(--u) * 15); color: #dfe3f5; }
.rt-big { height: calc(var(--u) * 48); font-size: calc(var(--u) * 22); padding: 0 calc(var(--u) * 18); }
.rt-perk { display: flex; justify-content: space-between; font-size: calc(var(--u) * 16); padding: calc(var(--u) * 2) 0; border-bottom: calc(var(--u) * 1) solid rgba(255,255,255,0.08); }
.rt-perk b { color: #7dff6a; }
.rt-input { pointer-events: auto; height: calc(var(--u) * 42); border-radius: calc(var(--u) * 8); border: calc(var(--u) * 3) solid #15172a; padding: 0 calc(var(--u) * 10); font: 600 calc(var(--u) * 18) Fredoka, sans-serif; background: #f4f5fb; color: #15172a; width: 100%; user-select: text; }
textarea.rt-input { height: calc(var(--u) * 70); padding: calc(var(--u) * 6) calc(var(--u) * 10); resize: none; }
.rt-gtabs { display: flex; gap: calc(var(--u) * 6); flex-wrap: wrap; }
.rt-gtabs .rt-btn { height: calc(var(--u) * 38); padding: 0 calc(var(--u) * 12); font-size: calc(var(--u) * 17); }
.rt-gtabs .rt-btn.on { outline: calc(var(--u) * 3) solid #fff; }
.rt-gcard { position: relative; border-radius: calc(var(--u) * 8); border: calc(var(--u) * 3) solid #15172a; background: #5ab8f0; padding: calc(var(--u) * 4); cursor: pointer; display: flex; flex-direction: column; gap: calc(var(--u) * 2); color: #fff; }
.rt-gcard canvas { width: 100%; height: calc(var(--u) * 70); border-radius: calc(var(--u) * 5); background: #2a6aa0; }
.rt-gcard .code { position: absolute; left: calc(var(--u) * 6); top: calc(var(--u) * 6); font-size: calc(var(--u) * 11); background: rgba(0,0,0,0.55); padding: 0 calc(var(--u) * 5); border-radius: calc(var(--u) * 4); }
.rt-gcard b { font-size: calc(var(--u) * 15); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt-gcard small { font-size: calc(var(--u) * 11); display: flex; justify-content: space-between; }
.rt-reveal { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 10); }
.rt-reveal .art { width: calc(var(--u) * 300); height: calc(var(--u) * 190); background: center / contain no-repeat; animation: rt-revealin 600ms cubic-bezier(.2,1.6,.4,1); }
.rt-reveal .crate { width: calc(var(--u) * 150); height: calc(var(--u) * 150); background: center / contain no-repeat; animation: rt-wobble 0.25s ease-in-out infinite alternate; }
@keyframes rt-wobble { from { transform: rotate(-8deg) scale(1); } to { transform: rotate(8deg) scale(1.08); } }
@keyframes rt-revealin { from { transform: scale(0.2) rotate(-20deg); opacity: 0; } }
.rt-reveal h1 { font-size: calc(var(--u) * 40); }
.rt-reveal .rar { font-size: calc(var(--u) * 24); font-weight: 700; }
.rt-flex { display: flex; gap: calc(var(--u) * 8); align-items: center; flex-wrap: wrap; }
.rt-muted { color: #aab0cc; font-size: calc(var(--u) * 14); }

/* the tutorial arrow card */
.rt-tut { position: absolute; left: 50%; top: calc(var(--u) * 116); transform: translateX(-50%); font-size: calc(var(--u) * 21); font-weight: 600; text-align: center; white-space: nowrap; }
.rt-tut b { color: #ffe14a; }
.rt-tut .skip { pointer-events: auto; margin-left: calc(var(--u) * 10); font-size: calc(var(--u) * 13); height: calc(var(--u) * 24); padding: 0 calc(var(--u) * 8); border-radius: calc(var(--u) * 6); }
.rt-edge { position: absolute; width: calc(var(--u) * 48); height: calc(var(--u) * 48); pointer-events: none; }

/* chat feed (outside Boxity) */
.rt-feed { position: absolute; left: calc(var(--u) * 190); bottom: calc(var(--u) * 90); width: calc(var(--u) * 360); display: flex; flex-direction: column; gap: calc(var(--u) * 2); font-size: calc(var(--u) * 14); }
.rt-feed .ln { background: rgba(20,22,36,0.55); padding: calc(var(--u) * 2) calc(var(--u) * 8); border-radius: calc(var(--u) * 6); }
.rt-feed .ln.tip { color: #bfe0ff; }
.rt-feed .ln.system { color: #ffe14a; }
.rt-feed input { pointer-events: auto; }
.rt-tr { position: absolute; right: calc(var(--u) * 10 + env(safe-area-inset-right, 0px)); top: calc(var(--u) * 10 + env(safe-area-inset-top, 0px)); display: flex; gap: calc(var(--u) * 6); }
.rt-icbtn { width: calc(var(--u) * 40); height: calc(var(--u) * 40); padding: calc(var(--u) * 5); background: linear-gradient(#4a5070, #2a2e44); }
.rt-conn { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); font-size: calc(var(--u) * 26); font-weight: 700; padding: calc(var(--u) * 12) calc(var(--u) * 20); background: rgba(20,22,36,0.85); border-radius: calc(var(--u) * 12); }
`;

let injected = false;

/** The HUD unit: 1 px on a 1280 x 720 desktop, smaller on phones, larger on big screens. */
export const applyScale = (): void => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const touch = document.body?.classList.contains('rt-touch') ?? false;
  // Phones: landscape is limited by height, portrait by width (so buttons stay thumb-sized).
  const u = touch ? (h > w ? Math.max(0.55, Math.min(1, w / 560)) : Math.max(0.5, Math.min(1, Math.min(w / 900, h / 470)))) : Math.max(0.58, Math.min(1.4, Math.min(w / 1280, h / 720)));
  document.documentElement.style.setProperty('--u', `${u.toFixed(3)}px`);
};

export const injectRtStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  applyScale();
  window.addEventListener('resize', applyScale);
  window.addEventListener('orientationchange', applyScale);
  window.visualViewport?.addEventListener('resize', applyScale);
};
