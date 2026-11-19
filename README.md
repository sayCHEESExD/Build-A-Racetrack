# Build A Racetrack

A browser multiplayer racetrack tycoon for Bloxity. Six players share a raceway: one long road with three plots
either side, the Track, Decors and Crates stalls by the tunnel, leaderboards at the spawn. Buy track pieces, snap
them onto the glowing end of your track, and every piece joined to your Start Gate piles up cash. Hop into your kart
and drive over it to grab the cash, hit bumps and ramp jumps for air-time bonuses, close your track into a circuit
for +50% income and laps. Unbox better cars from crates (faster, and they multiply what they collect), repair crash
damage at your Pit Stop, upgrade engine / turbo / tyres / armor / cash tuning, upgrade your base for a bigger plot
and new pieces, decorate (+1% income each), publish your track for everyone to drive, and rebirth for a permanent
multiplier. Your track keeps earning while you are away.

Three.js client, authoritative Colyseus server (6 players per room), hosted on Bloxity.

## Play

| Action | PC | Mobile |
| --- | --- | --- |
| Walk | WASD, Space jump | stick |
| Build / delete | 1 / 2 (Build Menu on the left) | hotbar |
| Place a piece | click the glowing end, F or Enter | tap the glowing end / Place |
| Flip a turn / rotate decor | R | Rotate |
| Drive your track | 3, or E at the Spawn Car pad | Drive |
| Drive | W / S gas and brake, A / D steer, Space exit | GAS / BRAKE, arrows, Exit |
| Shops | Tracks / Base / Crates tabs, E at a stall | tabs, tap the prompt |
| Garage / Upgrade | C / U | menu |

## Develop

```bash
npm install
npm run dev
```

Client on http://localhost:6181, server on :3681. See `CLAUDE.md` for the rules, verification scripts and layout.

## Deploy (Bloxity Hosting)

`.github/workflows/deploy.yml` publishes on push (`dev` -> the dev channel, `main` -> prod) under the game id
`build-racetrack`: verify (typecheck, `npm run verify`, stats, Docker context, the one client build, the 12 MB
budget, the zip) -> server (image `ghcr.io/<owner>/build-racetrack-server:<channel>-<sha>`, rolled on Legion with
`seatCap` 6) -> frontend (the zip to Boxity Hosting). One-time setup: create the game `build-racetrack` on
https://hosting.bloxity.io, add the `LEGION_DEPLOY_TOKEN` repository secret, make the GHCR package
`build-racetrack-server` public after the first run. There are no purchases (no Gems SKUs or
webhook): packs and the 2x Money pass are bought with in-game cash. Stage is not deployed: Boxity does not document a stage Legion deploy route yet.

| | Game page | Backend health |
| --- | --- | --- |
| dev | https://build-racetrack.dev.play.bloxity.io | https://build-racetrack.dev.host.bloxity.io/health |
| prod | https://build-racetrack.play.bloxity.io | https://build-racetrack.host.bloxity.io/health |
