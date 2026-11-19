---
canDie: false
hasScore: true
rewards: true
---

# Bloxity integration facts

- **canDie: false.** Nobody dies in Build A Racetrack: there is no health and no death screen (a crash only damages
  the car). Boxity's Reset Character / "Stuck?" sends the player home to their pit (`Respawn` -> `RaceGame.base`).
- **hasScore: true.** Three boards, confirmed by the developer (2026-10-27), reported from the server
  (`server/src/bloxity/leaderboardReporter.ts`) from state the server owns, declared in the browser too
  (`client/src/bloxity/Bloxity.ts` LEADERBOARDS):
  - `earned` - Money Earned: lifetime earnings (mode `best`, format `compact`), never resets. Reported when a run ends.
  - `rides` - Runs Driven: +1 per run (mode `sum`), resets weekly (All Time kept). The id stays `rides` (ids are permanent).
  - `rebirths` - Rebirths (mode `best`), never resets.
- **rewards: true.** One rewarded ad: **2x Money for 10 minutes** (placement `money-boost`, in the Free window,
  shown only while `Legion.SDK.ads.isAvailable()`). The browser sends the reward token; the server verifies it with
  `POST {BLOXITY_API_URL}/v1/ads/reward/verify` (`server/src/bloxity/adRewards.ts`) and grants only on `valid: true`.
- **No purchases (no Gems / Bux).** Everything is bought with in-game cash. The Shop window and the HUD's pack
  buttons sell the 2x Money pass and three packs for cash (`PACKS` / `PACK_CONTENTS` in
  `shared/src/config/racetrack.ts`, message `BuyPack`, checked by `RaceGame.buyPack`). The game server has no
  purchase webhook.
- **Ads.** Ad breaks pause input and mute all audio (`Bloxity.start` -> the `adBreak` host callback in `Game`).
  Rewarded: a non-completed result shows its real status (skipped, no-fill, blocked, denied + reason, disabled, error)
  and is logged. Screen ads: `panel` while a window or the friends list is open, none during play. `ui/AdScreens.ts`
  measures the visible UI at the current window size (phones included; content scrolled out of a window's list does
  not count) and asks only for slots and sizes whose banners touch none of it; while a window is open the side menus,
  packs and hotbar step aside (`panel-open`) and the window keeps off the bottom strip. The layout is re-sent only
  when it changes, and never while a rewarded ad is pending (re-sent when it resolves).
- **Profile stats** (`server/src/bloxity/statReporter.ts`, every 60 s and on shutdown, from server state only):
  money_earned, rides (Runs Driven), pieces_placed, rebirths, track_income ($/s, currency), cars_owned,
  base_upgrade, track_likes. Best air is NOT reported: its distance starts as a client report (clamped, not owned).
- **Party play / CrazyGames Play with friends: case A** (hosted on Boxity, connecting through
  `Legion.SDK.net.resolveEndpoint`, SDK script tag before the bundle, room maxClients 6). Nothing game-side to add.
