# Change log

Newest first. The site shows the same list under "What's new". Game data refreshes are automatic and listed by the data banner.

## TL;DR

- **v0.9.0**: Plat prices from warframe.market: each mod in your slots shows its going price at that rank, plus the Prime weapon set price and what the build would cost to buy.
- **v0.8.0**: New Riven tab: build a riven with its real stat ranges, grade your own riven, find the best stats for your build, and save your rivens. The riven now takes a real mod slot.
- **v0.7.0**: Link your Twitch channel to your account: your public builds show your channel with a Live badge while you stream.

## v0.9.0 (2026-10-17)

**TL;DR:** Plat prices from warframe.market: each mod in your slots shows its going price at that rank, plus the Prime weapon set price and what the build would cost to buy.

### Prices

- Each equipped mod shows "~Np": the median of the 5 cheapest sell orders from players online or in game on warframe.market (PC), at the mod's rank. If nobody sells that rank it shows the unranked price, marked R0. Click it to open the item on warframe.market.
- Prime weapons show their set price, and a line under the mods adds up what the mods and weapon arcane would cost to buy, leaving out mods you marked as owned.
- Turn it off with "Plat prices" under the mod slots.

### How it gets them

- Our server reads warframe.market's public API and caches each item for 10 minutes (the items list for a day), with a named User-Agent and under their 3 requests per second limit, as their API rules ask. Only items on screen are looked up, and nothing about you is sent.

## v0.8.0 (2026-10-17)

**TL;DR:** New Riven tab: build a riven with its real stat ranges, grade your own riven, find the best stats for your build, and save your rivens. The riven now takes a real mod slot.

### Riven builder

- Pick up to 3 positive stats and 1 negative; each shows the range it can roll for this weapon (wiki base value x disposition x stat-count multiplier x 0.9 to 1.1), with a slider and a box for the exact number.
- Includes the Update 44.1 spliced traits (Weak Point Damage, Viral, Damage vs. Techrot and the rest) and shows which of your stats a Riven Splicer can combine.
- The riven is a Riven Mod card that sits in a mod slot: it uses capacity (drain and polarity editable), counts its slot position for element order, and the optimizer works around it.

### Grader

- Type the numbers from your riven card: each stat shows where it landed in its range, an overall grade (this site's own S to D scale), and a warning if a value cannot roll for that weapon.

### Best stats and saved rivens

- Find best stats tries every 2 and 3 positive-stat combination at an average roll for your current build and enemy, and one click puts the winner on your riven.
- Save rivens per weapon, in this browser or on your account when signed in, and load them back with one click.
- Builds saved with the old riven stat rows are converted automatically.

### Assumptions

- Riven values below rank 8 scale like other mods, (rank + 1) / 9, and the default drain is 18 at rank 8. The wiki does not state either, so both are marked in the app and the drain can be changed.

## v0.7.0 (2026-10-16)

**TL;DR:** Link your Twitch channel to your account: your public builds show your channel with a Live badge while you stream.

### Accounts

- Link Twitch from the account menu (after signing in with Discord). Twitch is asked for no permissions beyond your public profile, and its sign-in token is revoked right after reading it.
- Your Twitch name and channel link show on your public community builds, with a LIVE badge and the game while you are streaming (checked at most every 2 minutes). Untick "Show on my public builds" to hide it, or unlink any time.
- Works in the desktop app too.

### Not included

- Warframe loadouts are not imported from Twitch. DE's Warframe Arsenal Twitch extension shows opted-in loadouts on Twitch, but DE does not offer that data to other sites.

## v0.6.0 (2026-10-16)

**TL;DR:** What's new now has Game updates (DE's official patch notes with a TL;DR and search) and live Events (Baro, events, resets, open world cycles, DE news).

### Game updates

- The last 15 Warframe updates and hotfixes from DE's official patch notes, refreshed every 3 hours.
- Each one has a TL;DR built from DE's own section headings and a count of fixes and other changes, the full notes, and links to the official page and forum thread.
- Weapons, Warframes, mods and arcanes from the calculator are highlighted where the notes mention them.
- Search box to find every line about a weapon or mod across those releases.
- A patch posted in the last few hours shows as "Just released" with a link, until its summary is added.

### Events

- Live world state: current and upcoming events, Baro Ki'Teer, Prime Resurgence, Nightwave, daily and weekly resets, open world cycles and DE's latest news and devstreams, with countdowns.
- Read from the public warframestat.us API when you open the tab. Nothing is read from anyone's game account.

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
