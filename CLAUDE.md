# Build A Racetrack

Browser multiplayer racetrack tycoon for Bloxity (`window.Legion.SDK`): six players, a plot each, buying track
pieces, snapping them onto the glowing end of their track, driving it to grab the cash every piece piles up,
launching off ramps for air-time bonuses, unboxing cars from crates, repairing and upgrading them, upgrading the
base (bigger plot, longer track, new pieces), decorating, publishing tracks to a shared gallery, rebirthing.
Three.js client, Colyseus 0.16 server, npm workspaces (`shared` / `server` / `client`, scope `@race`).

References (2026-11-19):
1. Gameplay, UI, lobby and shop layout: the user's recording
   `C:\Users\kavin\AppData\Local\Packages\Microsoft.ScreenSketch_8wekyb3d8bbwe\TempState\Recordings\20261119-0436-46.6622104.mp4`
   (the brief attached `...0425-54...mp4`, which is a different game - Kick a Lucky Block; the racetrack one is the
   recording made right after it). ffmpeg: `imageio_ffmpeg` in the user's Python site-packages.
2. Systems blueprint (platform layer, persistence, plots, piece grid, shops): FORKED from `D:\Build a Roller Coaster`.
   Its map, lobby, shop placement and look are NOT used.
3. Art direction: `D:\+1 Monkey Evolution` (bright studded Roblox plastic; `render/PartBuilder.ts`, `world/Nature.ts`,
   `world/Wild.ts` are ported from it).

## Commands

```bash
npm run dev                 # shared, then server (tsx watch, :3681, --dev-cheats) + Vite client (:6181)
npm run build               # shared + server + client (client/dist)
npm run typecheck           # all workspaces
npm run verify              # track geometry/rules, movement, assets, persistence, offline earnings (own servers)
npm run verify:multiplayer  # needs `npm run dev`: 6/room, buying, snapping, runs, anti-cheat, visits, likes, gallery
npm run verify:capacity     # needs a running server
npm run size:client         # client/dist against the 12 MB budget (~6.9 MB; 4.2 MB of it the music)
```

Do NOT use python from the Bash tool. Write multi-line edit scripts to files / heredocs for node. Never commit or push
unasked. `tsx watch` restarts the server when `shared/dist` changes (runs in progress are lost; clients reconnect).

## Non-negotiable rules

- Ports: server **3681**, Vite **6181**, preview 4781, persistence test 3683, offline test 3684. Room `racetrack`.
  Hosting id + portal slug `build-racetrack` (`shared/src/config/accounts.ts`, `BLOXITY_GAME_ID` in the deploy
  workflow) - CONFIRM against the game registered on Bloxity before deploying. **6 players per room.** Colyseus only.
- **Server-authoritative.** Clients send INPUT and REQUESTS. A piece is placed by naming only the ITEM and its flip
  (`Place {k, flip}`): the server puts it on the sender's own chain end and checks it with the shared `checkPlace`.
  Every price/stock/tier is checked against `shared/src/config/racetrack.ts` - the ONE economy table (pieces,
  cars, crates, decorations, base tiers, rebirth, passes, packs). Never write a price anywhere else.
- **Driving is simulated on the client with the SHARED `CarSim`** (`shared/src/drive/CarSim.ts`) for instant
  response; the server checks what it reports: `DriveCollect` only forward along the chain (or one lap on, on a
  circuit) and no faster than the car's top speed allows (`RaceGame.driveCollect`), air time capped by the run's
  clock and the car's speed, crash damage from a clamped impact. Poses are cosmetic (bounds-checked).
- **Snapping**: pieces go ONLY onto the glowing end (`traceChain(...).end`), so a track is always one connected road
  from its Start Gate; deleting piece i takes back i and everything after it. `verify-track` proves every shape's
  road ends exactly where the next begins (every heading, both plot orientations) and the car drives every shape.
- **Client build < 12 MB.** Only the used `assets/` ship; `client/vite.config.ts` prunes the rest and
  `scripts/verify-assets.mjs` pins their digests. Everything else (world, track, cars, decor, thumbnails) is code.
- Art: studded Roblox plastic everywhere (`render/Studs.ts`, `render/PartBuilder.ts`), ONE painted terrain
  (`world/Terrain.ts`; nothing coplanar on top of it - markings are raised strips), road paint as strips of the same
  deck surface (`world/TrackMesh.ts`), signs via `world/signs.ts` (face 4 cm proud of the frame).
- The top-left corner belongs to Boxity's toolbar/chat: `Hud.layout()` drops the menu, tabs and build menu below
  the reserved areas. Never bind P.

## Layout (`shared/src/world/map.ts`, like the reference)

One road runs north-south down the middle (spawn plaza + three leaderboards + trophy + title arch in the south,
a tunnel through a purple cliff in the north). Three plots each side (`PLOTS`, 14 x 22 tiles of 4 units; west ones
are the east ones turned half round). By the tunnel: TRACKS stall left, Decors and Crates right (`SHOPS`). Through
the tunnel: the SHOWCASE (`ARENA`, index 6) where a published track is loaded for one player and driven.
Each plot: a road-facing ENTRANCE ARCH in the middle of its road side (`Raceway.entranceArch`, `GATE_Z_C`), the Start
Gate just inside it at canonical tiles (1,10)-(1,11) heading +Z (along the road), the pit lane tiles (0, 10..12) between
them with the Spawn Car pad under the arch and the Pit Stop beside it, nameplate wall, Length / Likes boards either
side of the arch. Base tiers open rows outward from the gate (`openRows`); locked rows at both ends are dimmed with
an Expand Plot sign each. Tracks saved with the old corner gate (2,1) are shifted on load (`adoptLayout`).
Shops (`world/Shops.ts`): Track Works depot, Decors garden boutique, Crate Vault; solids in `SCENERY_SOLIDS`.

## Track (`shared/src/track/track.ts`)

Shapes (saved by `SHAPE_CODES`, never renumber): start, straight, turn_r/l, bumpy, climb, drop, uturn_r/l, finish,
bump (launches: `F_LAUNCH`), swerve_r/l, cliff, upturn_r/l, wide_r/l, boost, jump (kicker / gap / landing),
loop, mega, corkscrew, rainbow, golden. Each claims a level span per tile (two pieces share a tile only stacked).
`TrackPath` samples a chain (pos, tangent, up, right, flags: GAP / WALL / LOCK / BOOST / KICK / FINISH / LAUNCH).
Items (`TRACK_ITEMS`) map to shapes; turns have two (R flips; the client auto-flips a turn that would not fit).

## Server (`server/src/game/`)

`RaceGame` (plots, building, decor, shops with per-player stock per restock epoch, crates, garage, base tiers,
rebirth, runs, visits/likes, gallery, save slots, free gift, ad boost, Gems grants, offline earnings on join,
piles filling, `Coins` each second), `Player` (save v2: cash, tier, inventories, cars {lv, cond}, passes, slots,
code, leftAt; track doc: pieces, decor, piles, likes, visits), `Gallery` (`published` collection, codes, cached
lists). Gems: `progression/BuxGrants.ts` records webhook grants; the room claims them on join and every minute and
applies `PACK_CONTENTS` (`grantSku`).

## Client (`client/src/`)

`core/Game.ts` (modes walk / build / drive, prompts, build interactions, chase camera, network events),
`core/Tutorial.ts` (the reference's first-run steps), `drive/Driver.ts` (local CarSim, reports), `world/`
(`Raceway` static world, `Terrain`, `TrackMesh`, `TrackView` per-plot meshes / labels / cash stacks / ghost /
cars, `CarModel` 14 car styles, `DecorModels`, `Nature`/`Wild` ported), `ui/` (`Hud`, `Windows` every shop and
menu, `Thumbs` 3D card thumbnails, `rtStyles` `rt-` classes with one unit `--u`).

## Keys

WASD drive/walk, Space exit drive / jump, 1 Build, 2 Delete, 3 Drive, R flip/rotate, F or Enter place, G decor tab,
Q delete toggle, E use prompt, Tab friends, M sound, Enter chat, L log in, Esc close/exit build.
HUD buttons (keycaps drawn on them, hidden on touch; `MENU_KEYS` / `PACK_KEYS` in `ui/Hud.ts`, bound in
`Game.onHotkey`): T Tracks, B or H Base, C Crates, O Shop, U Upgrade, K RaceTracks, Z Save, X Garage, N Rebirth,
Y Free, 4 First Lap Pack, 5 Stunt Pack, 6 2x Money pass, 7 Boost Pack.
Phones: joystick + GAS / BRAKE / arrow buttons while driving; tap the glowing end or Place while building.

## Testing in the in-app browser

The pane may be hidden: step frames with `__race.game.update(1/60, performance.now())` and take screenshots twice
(a hidden pane shows the previous paint); CSS animations stall while hidden. Dev handle `__race.game`:
`debugSnapshot()`, `build(on)`, `appendEnd(key, flip)`, `pickItem`, `clickAt(x, y)`, `driveNow(plot)`,
`setPedals(throttle, steer)`, `openWindowByName(kind|'close')`, `freeCam(eye, target)`, `forceTouch()`,
`dev({ cash, tier, items, piles: true, cond, cars: true, tp: [x,y,z], endgame: true })` (endgame: max tier, every car, the
fastest maxed, and `ENDGAME_TRACK` - every piece, 76 long - laid on your plot; `verify-track` drives it). `?pid=name` plays as another guest.
