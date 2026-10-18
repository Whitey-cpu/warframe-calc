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
- Status chance and proc weighting; Slash/Heat/Toxin/Electricity/Gas DoTs (faction applied twice), Heat refresh, Blast fuse and 10-stack burst
- Statuses you apply yourself (Viral, Corrosive, Magnetic, Puncture, Cold, Heat strip) build up over the fight and feed back into damage
- Fight length: DoT ticks, lingering clouds and status build-up all need time, so the calculator solves time-to-kill = fight length
- Extra attacks per shot (grenade + cloud), lingering damage fields (Torid cloud: 1 hit/s for 10 s), multi-target group DPS
- Enemy level scaling, Steel Path, shields, Overguard, faction vulnerabilities, armor DR `0.9 * sqrt(armor/2700)`
- Incarnon evolutions for 53 weapons, generated from the wiki (perk text turned into effects; unmodeled lines are listed)
- Mod rules: "Fire Rate / Multishot cannot be modified", trigger-only mods (Cannonades, incl. the Incarnon both-modes rule), weak point triggers
- Conditional buffs (On Kill stacks, per status type, combo) with per-buff stack overrides. On Kill stacks follow a kill rate (Horde 60/min, Steady 12/min, Boss, or custom), each buff's duration and how it loses stacks (one at a time for Galvanized and Merciless, each stack separately for Galvanized Scope, all at once for Frostbite-style arcanes, per the wiki); proc and weak point hit arcanes use the build's own proc and hit rate
- Riven stats (including spliced weak point traits) and custom buffs for anything not built in
- Optimizer: beam search plus local search (single and pair swaps, slot order, exilus, weapon arcane), locked and excluded mods

## Not modeled yet

Burst-fire delay, Radiation/Magnetic side effects beyond damage, ability damage, ammo economy (Plentiful Mayhem style ammo use),
Initial Combo and Heavy Attack Efficiency loops (the combo multiplier is set by hand), projectile speed extending falloff range. Mod and perk text the parser does not understand is listed
under "Not modeled" so nothing is dropped silently.

## Where values come from

Public sources only. Nothing is read from the game client or a player account.

| Data | Source | Refreshed |
|---|---|---|
| Weapons, mods, arcanes, frames, enemy list | [@wfcd/items](https://www.npmjs.com/package/@wfcd/items) | weekly (GitHub Actions) |
| Enemy health/shield/armor/faction, cross-checks | [warframe-public-export-plus](https://www.npmjs.com/package/warframe-public-export-plus) (DE Public Export) | weekly |
| Incarnon evolutions | [WARFRAME Wiki](https://wiki.warframe.com) Incarnon Genesis pages, via the MediaWiki API | weekly |
| Current game build label | [warframe.com patch notes](https://www.warframe.com/en/patch-notes) | weekly |
| Game updates tab (patch notes, TL;DR, search) | [warframe.com patch notes](https://www.warframe.com/en/patch-notes), release dates from the WARFRAME Wiki when a page shows none (`scripts/scrape-patches.js`) | every 3 hours |
| Events tab (events, Baro, resets, cycles, DE news) | [warframestat.us](https://docs.warframestat.us/) community API (reads DE's public world state) | live, when the tab opens |
| Corrections where datasets lag | `data/overrides.json` (each entry names its official source; `set` for weapon fields, `attackSet` for one fire mode) | by hand |

- The app shows the game build, each source's version and fetch date ("Data sources and freshness" at the bottom),
  and a "Data note" on any weapon, enemy or frame where sources disagree or a value was corrected.
- Formulas: [Damage calculation](https://wiki.warframe.com/w/Damage_calculation), [Quantization](https://wiki.warframe.com/w/Quantization),
  [Critical Hit](https://wiki.warframe.com/w/Critical_Hit), [Status Effect](https://wiki.warframe.com/w/Status_Effect),
  [Damage over Time](https://wiki.warframe.com/w/Damage_over_Time), [Armor](https://wiki.warframe.com/w/Armor),
  [Weak Point](https://wiki.warframe.com/w/Weak_Point), [Damage/Overview Table](https://wiki.warframe.com/w/Damage/Overview_Table)
- Hand-maintained constants (factions, statuses, incompatible mods) live in `src/static.js` with a source link on each.
- Anything the sources do not state outright is tagged **ASSUMPTION** in the code and shown in the results notes.
- `test/test.js` includes in-game calibration checks (Torid arsenal numbers from Update 44.1).

## Features

- In-game arsenal layout: capacity bar, Config A-D per weapon (saved locally and to your account), 2x4 mod slots with
  weapon arcane and exilus, game-style stat panel (Fire Rate, Multishot, Damage, radial attacks, Incarnon form) with
  extra tabs for DPS/TTK, enemy, buffs, optimizer and builds. A "Classic view" toggle shows every panel at once.
- Phone layout: bottom tab bar (Mods / Stats / Enemy / More) and a full-screen mod browser
- Backgrounds: 44 images from the official Warframe Fansite Kit (Digital Extremes), with darken/blur controls and an
  optional random pick per visit. Listed in `assets/bg/manifest.json`; the "Fetch background art" workflow downloads
  and resizes them. Used under the Warframe Content Policy (non-commercial); images showing DE/Warframe logos are excluded.
- Weapon/Warframe/arcane/enemy browsers, drag-and-drop mod cards, mod ranks, slot polarities
- Mod value preview (what each equipped mod adds, what each mod in the browser would add), undo/redo (Ctrl+Z / Ctrl+Y, `/` focuses mod search)
- Capacity and forma checker (Orokin Catalyst, matching/mismatched polarity drain)
- Incarnon evolutions for 53 weapons, generated from the wiki (`scripts/scrape-web.js`, `src/incarnon.js`)
- Enemy units with level scaling and Steel Path (`src/enemy.js`), shields, Overguard, Magnetic, time to kill
- Build compare (pin A vs current), weapon leaderboard (optionally quick-optimized per weapon)
- Community builds (public share links, likes, reports), Discord link previews
- Riven tab: builder with each stat's real range for the weapon (wiki base values x disposition x stat-count multiplier), grader for
  your own riven, best stats for the current build, saved rivens (browser or account). The riven is a Riven Mod card in a real slot (`src/riven.js`, `ui/riven.js`)
- Plat prices (switched off: warframe.market's bot protection blocks requests from the Worker; turn on with `MARKET_ENABLED = "1"` and the toggle in index.html if that changes): equipped mods, weapon arcane and Prime weapon sets priced from the warframe.market public API (median of the 5 cheapest
  online sellers at that rank, PC) through the accounts API `/market/price`, cached 10 minutes, following warframe.market's API rules
- Ask Teshin: crit / status / hybrid lean for the current weapon (three optimizer runs, `src/teshin.js`), mods and arcanes from recent
  patch notes tried in your build, and weekly sleepers from `scripts/meta-scan.js` (own math, Steel Path L150 Heavy Gunner, `data/meta.json`)
- Beginner / Advanced modes (Advanced shows every setting), help tips with wiki links on stats and settings, "How this number is made"
  step-by-step on the DPS tab, and `learn.html` explaining the whole formula
- Simulacrum tab (`ui/sim.js`): switch mechanics on or off (conditional buffs, own statuses, falloff, regenerating ammo, range
  conditions, Archon Shards), set kill rate, target distance (default 10m, a starting point rather than game data) and fight length, and a first-minute DPS timeline
- Damage falloff from the wiki falloff data per attack, battery weapons (refill rate and delay from each weapon's wiki page,
  `data/overrides.json`), Archon Shards, melee heavy attacks (listed heavy damage x combo multiplier, wind-up) and stances
  (per-hit multipliers from the wiki's Module:Stances/data, scraped weekly by `scripts/scrape-web.js` with `scripts/lua-table.js`)
- What's new: Game updates (DE patch notes with a TL;DR from DE's own headings, full notes, search, calculator items highlighted),
  live Events (events, Baro Ki'Teer, Prime Resurgence, Nightwave, resets, open world cycles, DE news) and the changelog
- Installable web app with offline support (`sw.js`), light/dark toggle, feedback button, patch-change banner
- Desktop app: Discord sign-in, cloud sync, update notifications

## Accounts (website and desktop app)

Optional Discord sign-in syncs saved builds and the owned-mods list, and lets you create share links
(`https://warframe.hardn.net/#share=ID`). Without signing in, everything is stored in the browser.
The desktop app signs in through a Discord window and syncs the same way. Opening `index.html` from disk keeps using local storage.
- Optional Twitch link (account menu): shows the creator's channel and a Live badge on their public builds. Needs the repository
  secrets `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` from a Twitch app at https://dev.twitch.tv/console/apps with the OAuth
  Redirect URL `https://warframe-api.hardn.net/auth/twitch/callback`. Without them the Link Twitch button stays hidden.
- Moderation: set the optional repository secret `ADMIN_DISCORD_IDS` (comma-separated Discord user IDs) to use `/admin/reports` and remove builds.

- API: `api/` (Cloudflare Worker + D1) served at `https://warframe-api.hardn.net`. Deployed by `.github/workflows/deploy-api.yml`.
- Repository secrets it needs: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.
- Tests: `cd api && npm install && npm test` (runs the Worker locally with a mocked Discord).
- Privacy policy: `privacy.html`.

## Rebuilding the desktop app

Needs Node 18+. `npm install` then `npm start` (run in a window) or `npm run dist:win` (build the installer into `dist/`).
Building the Windows installer on Linux also needs Wine.

## Releasing

1. Bump `version` in `package.json`.
2. Add an entry at the top of `data/changelog.js` with the same version, the date, a one-line `tldr` and the changes. The site shows it in "What's new" and in a one-time banner for returning visitors. A test fails if the top entry does not match `package.json`.
3. Run `node scripts/changelog-md.js` to regenerate `CHANGELOG.md`, then `npm test`.
4. Bump `VERSION` in `sw.js` so browsers pick up the new files.

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
scripts/scrape-patches.js, scripts/patch-notes.js   Game updates feed (data/game-updates.json/.js)
data/                  Generated game data (game-data.json for CLI, game-data.js for UI), changelog.js
examples/, test/       Sample builds, wiki-based tests
```
