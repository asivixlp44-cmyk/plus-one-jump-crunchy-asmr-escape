# [UPDATE] +1 Jump Crunchy ASMR Escape!

A Bloxity game built with Three.js and Colyseus. It is a clone of the Roblox game
"[UPDATE] +1 Jump Crunchy ASMR Escape!" (reference video: `reference/Gameplay.mp4`).

## How it plays

- **Every step is +Jump.** Walking on the crunchy floor (or the wall steps) cracks the tile under you with an ASMR crunch.
  Each step gives `(boost per step) x Gamepass x Aura x Rebirth x Trail x Pets x events x Friend Boost` Jump.
- **Jump fills the level bar.** Levels need 85, 155, 250 ... Jump (like the reference). After Level 6 the curve gets steeper.
  **Jump Height = 10 + 5 x Level** (Level 1 = 15, Level 2 = 20, Level 3 = 25), shown as "Level Up! (1 -> 2) Jump Height: 20".
  **Custom Jump** (right side) lets you jump lower than your max.
- **The Crunchy Wall** is a giant staircase of food: 20, 35, 55, 75, 100, 130, 160 ... 1,500 Studs (chocolate, butter, cheese, lego,
  waffle, candy, cake, galaxy, gold). Your Jump Height must clear the rise to the next step. The **Wins pad** at the right end of every
  step pays +1, +2, +4, +8, +15 ... +1M Wins (the top step is "ESCAPE!"), then sends you back to the spawn.
- **Boost pads** (the numbered row on the right): +2/Step (1 Win), +5 (5), +10 (25), +25 (125), +60 (600), +150 (3K),
  +350 (15K), +800 (75K), +2K (400K), +4.5K (2M), +10K/Step (10M Wins). Wins are a requirement, not spent.
  The green **2x Step** pad sells the 2x Step pass.
- **Trampolines** bounce you by themselves for Jump x the trampoline: x1.5 (free), x2 (after 8 minutes of playtime),
  4x, 8x, Bubblegum x25, VOID x100, IMMORTAL x500 and HEAVEN x1000 (passes).
- **Pet boxes** by the spawn: Common (100 Wins), Slime (15K), Jelly (150K); Galaxy Box and Secret Egg are sold for Bux.
  Pets follow you and add their boost (up to 3 equipped, "Equip Best" in the Pets panel). The limited Unicorn Dumpling is +50x.
- **Trail Shop** (x1.15 / x1.25 / x1.4 ... with a Wins price and a Bux price, like the reference) and **Auras** (x1.25 to x8).
- **Rebirth** at Level 25: +1x Jump per rebirth. Level and Jump Height start over; Wins, boosts, pets, trails and auras stay.
- **Skip Wall** (Bux): lifts you onto the first step your Jump Height can't reach yet.
- **Muckbang World** (Level 100 + 4 Rebirths): a second island with a 4,500-stud fast-food wall and much bigger Wins.
- **CRUNCH RUSH** event: the last 5 minutes of every 30 (server clock) are x2 Jumps; the "Stay Tuned!" screen counts down.
- **Earn Jumps Offline**: one step every 10 s while you are away (up to 8 hours), paid when you come back.
- **Friend Boost**: +10% per Bloxity friend in your server (up to +50%).
- Free! gifts (playtime), 7-day Daily Rewards, a quest chain (the first four steps are the tutorial along the top of the screen,
  with guide arrows), redeem codes (`RELEASE`, `CRUNCH`, `ASMR`, `LEGION`, `BLOXITY`), and three leaderboards
  (Most Wins, Highest Playtime, Most JUMPS).
- The +100K / +1M / +10M / +100M Jump buttons under the level bar are Bux products.

## Run it

```bash
npm install        # also installs client/ and server/
npm run build      # builds the client into client/dist
npm start          # server + built client on http://localhost:2567 (PORT to change)
```

For development, run the server and the Vite client side by side:

```bash
npm run dev:server
VITE_SERVER_URL=http://localhost:2567 npm run dev:client
```

## Deploy (Bloxity hosting)

Every push to `main` (prod) or `dev` runs `.github/workflows/deploy.yml`:

1. Builds the server image from `server/Dockerfile` and pushes it to `ghcr.io/asivixlp44-cmyk/plus-one-jump-crunchy-asmr-escape-server`.
2. Tells Legion (`legion.bloxity.io/v1/apps/plus-one-jump-crunchy-asmr-escape/deploy`) to roll it out (seat cap 24, up to 5 replicas).
3. Builds the client with `VITE_BLOXITY_GAME_ID` and uploads it to the Bloxity hosting API.

Play at https://plus-one-jump-crunchy-asmr-escape.play.bloxity.io (prod) or https://plus-one-jump-crunchy-asmr-escape.dev.play.bloxity.io (dev).
The hosted client finds its server through the Bloxity matchmaker (`<id>.host.bloxity.io`).

One-time setup:

- Create the app `plus-one-jump-crunchy-asmr-escape` on hosting.bloxity.io (Legion has no create-on-deploy).
- Repo secret: `LEGION_DEPLOY_TOKEN` (from hosting.bloxity.io). The image is pushed with the workflow's own `GITHUB_TOKEN`; a `GHCR_PUSH_TOKEN` PAT is optional.
- After the first run, make the GHCR package public so Legion can pull it.
- On Legion, `MONGODB_URI` is provided: player profiles live in MongoDB and are shared by every pod.
  Without it (local dev) they are kept in `server/data/profiles.json`.

## Controls

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Walk (= Jump) | WASD / arrows | Left stick |
| Jump | Space | A |
| Camera | Drag, wheel to zoom | Right stick, D-pad up/down to zoom |
| Interact (boxes, shops) | E | X |
| Shop / Pets / Rebirth / Teleport / Settings | HUD buttons | Y / LB / RB / Back / Start |

Phones get an on-screen joystick and a jump button.

## Layout

- `shared/config.js`: game data used by both sides (levels, Jump Height, boosts, wall steps, pets, boxes, auras, trails,
  trampolines, store, quests, daily, gifts, codes).
- `server/src/CrunchRoom.js`: the room. It owns Jump from steps and bounces, levels, Wins, pets, rebirths, codes and purchases.
- `client/src/main.js`: player, steps and crunch, jumping, trampolines, networking, other players.
- `client/src/world.js`: the crunchy tile floor (instanced), the walls, boost pads, trampolines, boxes, shops, portal, leaderboards.
- `client/src/textures.js`: canvas food textures (chocolate, cheese, butter, lego, waffle ...) and the crack decal.
- `client/src/pets.js`: pet models and the pets that follow players.
- `client/src/ui.js` and `client/index.html`: the HUD (laid out like the reference) and the panels.

## Multiplayer and anti-cheat

- Movement is client-side; the client sends its position about 15 times a second.
- A step is only paid if the server saw that much ground walking in the position updates, at most 6 steps a second.
- Trampoline bounces are checked against the player's position and a 0.45 s cooldown. Wins pads check position and Jump Height,
  boost pads check position and Wins, boxes check that you are standing next to them.

## Bloxity

Bloxity integration works the same way as in the other Legion games:

- Login, avatars, friends, settings, Bux purchases and stats (Jump, Wins, Rebirths).
- Game slug: `plus-one-jump-crunchy-asmr-escape` (`client/src/bloxity.js`). Confirm it with Bloxity.
- Create the Bux SKUs from `SKUS` in `shared/config.js` in the game's IAP catalog.
- Set `LEGION_WEBHOOK_SECRET` on the host to turn on Bux mode.

UI rules: the top-left corner stays empty for the Bloxity overlay, prices are in Bux only, and there is no start menu.
