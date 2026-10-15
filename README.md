# Warframe Damage Calc

A personal Warframe damage calculator and build optimizer. Runs locally, no install needed for the UI.

## Use it

- **Desktop app:** run `dist/WarframeDamageCalc-Setup-0.2.0.exe` once to install. It adds Start menu and desktop shortcuts.
  The installer is unsigned, so Windows SmartScreen may say "Windows protected your PC": click **More info > Run anyway**.
  Use the **Update game data** button (top right) after a patch; downloaded data is stored in `%APPDATA%\Warframe Damage Calc`.
- **Web version:** https://warframe.hardn.net (or double-click `index.html`). Same calculator.
- **Interface:** arsenal-style layout with weapon, Warframe and arcane browsers, drag-and-drop mod cards and a filterable mod grid. Item images load from the warframestat.us CDN; without internet they fall back to text placeholders.
- **CLI (needs Node 18+):**
  - `node cli.js calc examples/soma-prime-grineer.json`
  - `node cli.js optimize examples/optimize-soma-steelpath.json`
  - `node cli.js weapon "Soma Prime"` / `node cli.js mods "Soma Prime" crit` / `node cli.js search galvanized`
  - Add `--json` for machine-readable output.
- **Update game data after a patch:** `node cli.js sync` (downloads the latest `@wfcd/items`). Or just ask Claude.
- **Tests:** `node test/test.js` checks the engine against worked examples from the WARFRAME Wiki.

In the UI, **Copy build JSON** gives you a build you can paste to Claude or feed to the CLI.

## What it models

- Mods by slot order, element combination (HCET rules, innate elements merge or go last), quantization (1/32 of base)
- Base damage pool (Serration, Galvanized, arcane damage stacks, Vex Armor), separate multipliers (Eclipse), faction pool (Bane, Roar), extra Void (Xata's Whisper)
- Crit tiers (orange/red), flat crit (Arcane Avenger etc.), headshot crit x2, weak point and headshot bonuses
- Status chance, proc weighting, Hunter Munitions, Slash/Heat/Toxin/Electricity/Gas DoTs (faction applied twice)
- Enemy faction vulnerabilities (x1.5 / x0.5), armor DR `0.9 * sqrt(armor/2700)`, Corrosive/Heat/flat armor strip, Viral stacks
- Fire rate, charge time, magazine, reload, burst and sustained DPS
- Conditional buffs (On Kill stacks, per status type, combo) with per-buff stack overrides
- Riven stats and custom buffs for anything not built in
- Optimizer: greedy + local search with slot reordering, exilus, weapon arcane, locked and excluded mods

## Not modeled yet

Shields/Overguard, mod capacity and forma, burst-fire delay, Incarnon perk trees (use overrides/custom buffs),
heavy attacks/melee stances, Blast/Cold/Radiation/Magnetic status effects beyond damage, ability damage.
Mod text the parser does not understand is listed under "Not modeled" so nothing is dropped silently.

## Where values come from

- Game data: [@wfcd/items](https://www.npmjs.com/package/@wfcd/items) (community dataset)
- Formulas: [Damage calculation](https://wiki.warframe.com/w/Damage_calculation), [Quantization](https://wiki.warframe.com/w/Quantization),
  [Critical Hit](https://wiki.warframe.com/w/Critical_Hit), [Status Effect](https://wiki.warframe.com/w/Status_Effect),
  [Damage over Time](https://wiki.warframe.com/w/Damage_over_Time), [Armor](https://wiki.warframe.com/w/Armor),
  [Weak Point](https://wiki.warframe.com/w/Weak_Point), [Damage/Overview Table](https://wiki.warframe.com/w/Damage/Overview_Table)
- Hand-maintained constants (factions, abilities, incompatible mods) live in `src/static.js` with a source link on each.
- Anything the wiki does not state outright is tagged **ASSUMPTION** in the code and shown in the results notes.

## Features

- Arsenal-style builder: weapon/Warframe/arcane/enemy browsers, drag-and-drop mod cards, mod ranks, slot polarities
- Mod value preview (what each equipped mod adds, what each mod in the browser would add), undo/redo (Ctrl+Z / Ctrl+Y, `/` focuses mod search)
- Capacity and forma checker (Orokin Catalyst, matching/mismatched polarity drain)
- Incarnon evolution presets (hand-entered per weapon in `src/incarnon.js`; currently Soma/Soma Prime and Laetum)
- Enemy units with level scaling and Steel Path (`src/enemy.js`), shields, Overguard, Magnetic, time to kill
- Build compare (pin A vs current), weapon leaderboard (optionally quick-optimized per weapon)
- Community builds (public share links, likes, reports), Discord link previews
- Installable web app with offline support (`sw.js`), light/dark toggle, feedback button, patch-change banner
- Desktop app: Discord sign-in, cloud sync, update notifications

## Accounts (website and desktop app)

Optional Discord sign-in syncs saved builds and the owned-mods list, and lets you create share links
(`https://warframe.hardn.net/#share=ID`). Without signing in, everything is stored in the browser.
The desktop app signs in through a Discord window and syncs the same way. Opening `index.html` from disk keeps using local storage.
- Moderation: set the optional repository secret `ADMIN_DISCORD_IDS` (comma-separated Discord user IDs) to use `/admin/reports` and remove builds.

- API: `api/` (Cloudflare Worker + D1) served at `https://warframe-api.hardn.net`. Deployed by `.github/workflows/deploy-api.yml`.
- Repository secrets it needs: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.
- Tests: `cd api && npm install && npm test` (runs the Worker locally with a mocked Discord).
- Privacy policy: `privacy.html`.

## Rebuilding the desktop app

Needs Node 18+. `npm install` then `npm start` (run in a window) or `npm run dist:win` (build the installer into `dist/`).
Building the Windows installer on Linux also needs Wine.

## Files

```
index.html, ui/        Browser UI
cli.js                 Command line
electron/              Desktop app shell (window, data updater)
build/                 App icon
api/                   Accounts API (Cloudflare Worker + D1)
src/static.js          Hand-maintained constants with sources
src/parser.js          Mod/arcane text -> structured effects
src/engine.js          Damage math
src/optimizer.js       Build search
scripts/sync-data.js   Data download/build
data/                  Generated game data (game-data.json for CLI, game-data.js for UI)
examples/, test/       Sample builds, wiki-based tests
```
