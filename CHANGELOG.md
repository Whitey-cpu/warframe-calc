# Change log

Newest first. The site shows the same list under "What's new". Game data refreshes are automatic and listed by the data banner.

## TL;DR

- **v0.5.1**: Kuva, Tenet and Coda weapons now get their Valence bonus, Coda Bassocyst gets its Mercy Kill buff, Deadhead-style buffs count properly, and this change log was added.
- **v0.5.0**: New in-game arsenal layout with a proper phone layout, Config A-D per weapon, and backgrounds from the official Warframe Fansite Kit.
- **v0.4.0**: Big math overhaul (status build-up, fight length, lingering clouds, group DPS, faster optimizer) and game data pulled from several public sources, current to Hotfix 44.1.1.

## v0.5.1 (2026-10-15)

**TL;DR:** Kuva, Tenet and Coda weapons now get their Valence bonus, Coda Bassocyst gets its Mercy Kill buff, Deadhead-style buffs count properly, and this change log was added.

### Math

- Valence bonus for Kuva, Tenet and Coda weapons: pick the element and 25-60% next to Attack. It is added as base damage, so elemental mods scale from it, as in game.
- Coda Bassocyst Mercy Kill buff (+100% damage and multishot for 20s) is modeled, and can be turned off in Buffs > Conditional stacks.
- On Weak Point Kill buffs (Primary Deadhead, Galvanized Scope stacks) now count when "Conditional buffs at max" is on. Weak point hit buffs still need a headshot rate.
- Checked against an Overframe Coda Bassocyst build: damage per shot now matches exactly (13,302.9).

### Site

- What's new: this change log, with a short summary for each update and a banner the first time you visit after one.

## v0.5.0 (2026-10-15)

**TL;DR:** New in-game arsenal layout with a proper phone layout, Config A-D per weapon, and backgrounds from the official Warframe Fansite Kit.

### Layout

- Arsenal-style screen: capacity bar, Config A-D tabs, 2x4 mod slots with weapon arcane and exilus, game-style stat list with radial attacks and Incarnon form.
- Stat panel tabs: Arsenal, DPS & TTK, Enemy, Buffs, Optimize, Builds. An "In combat" box keeps DPS and time to kill in view.
- Phone layout: bottom tab bar (Mods, Stats, Enemy, More) and a full-screen mod browser.
- Classic view toggle shows every panel at once.

### Configs

- Four configs per weapon, like the game. Saved in your browser and synced to your account when signed in. Double-click a tab to rename it.

### Backgrounds

- 44 backgrounds from DE's official Warframe Fansite Kit (Captura wallpapers, key art, skyboxes, scenes) with darken and blur sliders and an optional random pick per visit.

### Fixes

- Exilus mods are recognized again (the data source renamed the flag).
- After a site update, returning visitors now get the new version straight away instead of one visit later.

## v0.4.0 (2026-10-15)

**TL;DR:** Big math overhaul (status build-up, fight length, lingering clouds, group DPS, faster optimizer) and game data pulled from several public sources, current to Hotfix 44.1.1.

### Math

- Statuses you apply yourself (Viral, Corrosive, Heat, Magnetic, Puncture, Cold) build up over the fight and feed back into damage.
- Time to kill and fight length are solved together, so DoT ticks and cloud hits stop when the target dies.
- Lingering damage fields (Torid Poison Cloud: one hit per second for 10s), extra attacks per shot, and multi-target group DPS.
- Mod rules: "Fire Rate / Multishot cannot be modified" and the Incarnon rule for Semi-Auto Cannonade mods.
- Optimizer rewritten (beam search plus pair swaps), about 3x faster.
- Torid numbers checked against in-game arsenal screenshots.

### Game data

- Enemy health, shields and armor from DE's Public Export (139 old values corrected).
- Incarnon evolutions for 53 weapons generated from the wiki, with per-variant values.
- Current game build shown at the top, a "Data sources and freshness" list, and data notes where sources disagree.
- Weekly automatic data refresh from public sources only.

### Desktop app

- Pulls the full dataset from the site, and uses whichever copy (bundled or downloaded) is newest.

## v0.3.0 (2026-10-15)

**TL;DR:** Quality-of-life update: mod value preview, ranks and polarities, undo/redo, enemy scaling with time to kill, build compare, leaderboard and community builds.

### Building

- Mod value preview, mod ranks, slot polarities and a capacity/forma checker.
- Undo and redo (Ctrl+Z / Ctrl+Y), Incarnon presets.

### Results

- Enemy level scaling and Steel Path, shields, Overguard and time to kill.
- Pin-and-compare, weapon leaderboard.

### Sharing and app

- Community builds with likes, Discord link previews, installable web app, light/dark toggle, data update banner.
- Desktop app: Discord sign-in and update check.

## v0.2.0 (2026-10-14)

**TL;DR:** Arsenal-style look with game art, plus Discord sign-in to save builds, owned mods and share links.

### Look

- Weapon, Warframe and arcane browsers with game images, drag-and-drop mod cards, favicon and app icons.

### Accounts

- Discord sign-in, cloud builds, owned mods, share links and a privacy page. Account features hide if the service is unreachable.

## v0.1.0 (2026-10-14)

**TL;DR:** First release: damage calculator, build optimizer, Windows desktop app and the web version at warframe.hardn.net.

### Launch

- Weapon damage calculator with mods, arcanes, Warframe buffs and enemy armor and factions.
- Build optimizer.
- Windows installer and web version.
