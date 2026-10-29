# Change log

Newest first. The site shows the same list under "What's new". Game data refreshes are automatic and listed by the data banner.

## TL;DR

- **v0.16.0**: Valence Fusion helper, Dual Coda Torxica valence + spore vulnerability, compact AI damage data.
- **v0.15.1**: Quieter first view — collapsed mod browser, Weapon → Mods → Results path, thinner chrome.
- **v0.15.0**: Rivens follow Hotfix 44.1.3, with a new crafting suite and a build importer that reads screenshots.
- **v0.14.0**: The Windows app now updates itself.
- **v0.13.1**: More accurate critical headshots, Heat damage and armor, with a Critical headshots setting on the Enemy tab.

## v0.16.0 (2026-10-29)

**TL;DR:** Valence Fusion helper and Dual Coda support, Torxica spore vulnerability, and compact AI damage data.

### Added

- Valence Fusion helper on adversary weapons: plug in two percents and get the wiki result (`1.1 × max`, floor to 0.1%, ≥58% → 60%). Sources: [Valence Fusion](https://wiki.warframe.com/w/Valence_Fusion), [Kuva Weapons](https://wiki.warframe.com/w/Kuva_Weapons).
- Dual Coda Torxica counts as an adversary weapon for Valence (name check now includes the Dual prefix).
- Dual Coda Torxica Spore Damage Vulnerability (+50%, multiplicative with faction mods, double-dips status) under Conditional buffs. Source: [Dual Coda Torxica](https://wiki.warframe.com/w/Dual_Coda_Torxica).
- Progenitor element table and safer Valence percent parsing (25–60 or 0.25–0.60).
- Compact damage-calc views under `data/damage/` for agents (`formulas.json`, `constants.json`, slim/adversary weapons).

### Changed

- Valence UI shows the extra base damage on the current attack and links Fusion / Progenitor wiki pages.
- Service worker cache bumped to wfcalc-v29.

## v0.15.1 (2026-10-29)

**TL;DR:** The arsenal view shows less at once. Pick a weapon, open mods when you need them, then check results.

### Changed

- Desktop mod browser stays closed until you press Browse mods or click an empty slot (same idea as the phone sheet). Your choice is remembered.
- A short Weapon → Mods → Results path sits under the top bar and jumps to each step.
- Secondary top-bar actions (background, layout, feedback, download, data line) sit under More.
- Config undo / redo / clear sit under Edit; Ask Teshin stays visible.
- Arsenal stat list is behind a disclosure so the combat headline can lead.
- Incarnon evolutions stay collapsed until opened (auto-open if any perk is picked).
- Service worker cache bumped to wfcalc-v28.

## v0.15.0 (2026-10-22)

**TL;DR:** Rivens follow Hotfix 44.1.3, with a new crafting suite and a build importer that reads screenshots.

### Changed

- Riven dispositions are gone, as of Hotfix 44.1.3. Every riven now rolls with the same 1.2 multiplier, so riven ranges, grades and the roll scanner use 1.2 for every weapon. The Arsenal shows each weapon's old number for reference.
- Riven numbers from before October 22 can be converted in one click, in the editor, when importing a screenshot, and in your saved rivens. The old values come from DE's list in the patch notes.
- The Riven tab now uses the wiki's full riven formula, so lower riven ranks follow it exactly.

### Added

- Riven crafting suite (Riven tab): pick the traits you want and see your chance per cycle, the average cycles and Kuva, and when half or 90% of players would have it. Each trait on your riven also gets a row for locking it.
- Splicing planner: plays out "cycle, lock, splice, cycle" hundreds of times for each recipe and compares smart locking with never locking.
- Riven Splicing in the editor: splice buttons apply the recipe, keep the higher roll, and leave the new random trait for you to fill in.
- Build importer (Builds tab): read mods from a screenshot of the in-game mod screen or from single mod cards, or type a list like "Serration 10". You check each match, rank and slot before anything changes. Screenshots stay on your device.
- How the math works: a new section on riven math and crafting odds.

### Notes

- DE has not published the riven cycling odds. The suite uses community testing (each layout about 1 in 4, every trait equally likely), and you can change the layout odds.
- Ammo Efficiency is now capped at 75% (Hotfix 44.1.3). The calculator does not model ammo use, so damage numbers do not change.

## v0.14.0 (2026-10-19)

**TL;DR:** The Windows app now updates itself.

### Added

- Automatic updates for the Windows app: it checks for a new version when it starts and every few hours, downloads it in the background and installs it when you close the app. A "Restart to update" button installs it right away.

### Notes

- Apps on 0.13.1 or older need this version installed once by hand from the download page; after that, updates arrive on their own.

## v0.13.1 (2026-10-19)

**TL;DR:** More accurate critical headshots, Heat damage and armor, with a Critical headshots setting on the Enemy tab.

### Fixed

- Critical headshots now double the weapon's base crit multiplier with crit mods applied on top, and only on enemies whose heads take them. Corpus humanoids, most of The Murmur and Techrot do not.
- Heat stacks share one timer that every Heat proc resets, worked out from your proc rate instead of an on/off cutoff. The shot-by-shot sim follows the same rule.
- Armor above 2,700 now uses 300 / (armor + 300), and every damage type gets at least 1 damage through armor.

### Added

- Critical headshots setting on the Enemy tab (Auto, Yes, No), for targets like Corpus Ospreys that do take them.

## v0.13.0 (2026-10-18)

**TL;DR:** Shot-by-shot fights with a combat log, a Forma-aware optimizer, an automatic melee combo loop, and riven import from screenshots with a roll scanner.

### Added

- Shot by shot (DPS tab, Advanced): rolls every pellet's crit, headshot and status like the game, repeats the fight hundreds of times and shows worst, unlucky, median, lucky and best DPS with a spread chart and a combat log.
- Forma budget for the optimizer: only builds that fit your capacity with that many Forma count, and the slot polarities are set for you. Also "Only use" and "Never use" mod lists.
- Best melee loop: works out the combo from your stance, Heavy Attack Efficiency, Initial Combo and the combo timer, and finds the best mix of normal combos and heavy attacks. Heavy attacks use that combo automatically.
- Riven import from a screenshot: paste or pick an image of your riven and the stats fill in. It is read on your device.
- Roll scanner: pick stats a riven must have or never use, a specific negative, and roll quality from worst to perfect, with an option to re-optimize your mods around the top results.

### Changed

- Initial Combo, Combo Duration and Heavy Attack Efficiency mods now count.

## v0.12.0 (2026-10-18)

**TL;DR:** Beginner and Advanced modes, the new Simulacrum tab, step-by-step math with help tips, and modeling for falloff, regenerating ammo, Archon Shards, stances and heavy attacks.

### Added

- Beginner and Advanced modes. Beginner keeps the essentials; Advanced shows every setting. New visitors start in Beginner and your choice is remembered.
- Simulacrum tab: switch each mechanic on or off, set kill rate, target distance and fight length, and see how DPS ramps up over the first minute.
- "How this number is made" on the DPS tab walks through every step from base damage to sustained DPS with your numbers.
- Help tips on stats and settings, each with a wiki link, and a Learn page that explains the whole damage formula.
- Damage falloff by distance for every weapon that has it, plus area falloff from the blast centre.
- Regenerating ammo for Coda Bubonico, Bubonico, Fulmin, Cycron, Plinx and other battery weapons.
- Range conditions: Shotgun Vendetta and Range Advantage follow the target distance.
- Archon Shards: five slots with Crimson, Violet, Topaz and Emerald weapon bonuses and Tauforged shards.
- Melee stances with real per-hit combo data from the wiki, and heavy attacks with combo multiplier, wind-up and Killing Blow.

### Changed

- Kill rate, combo, fight length and the conditional buff switches moved from Buffs to the Simulacrum.
- Weapon data notes now sit on the Arsenal tab instead of under the weapon name.

## v0.11.0 (2026-10-18)

**TL;DR:** On Kill buffs now follow a kill rate setting, proc-based arcanes work, and Coda Bubonico uses shotgun mods like in game.

### Added

- Kill rate setting under Conditions: Horde, Steady, Boss or a custom kills per minute. On Kill buffs use the stacks you would actually hold, based on each buff's duration and how it loses stacks, so Primary Merciless falls off at lower kill rates while Galvanized mods stay close to full.
- Primary Frostbite, Primary Blight, Conjunction Voltage and Primary Crux now count, with stacks based on your own Cold, Toxin or Electricity procs and weak point hits.
- Empty conditional stack boxes show the stacks being used.

### Changed

- Galvanized Scope's headshot kill stacks follow your headshot rate instead of assuming full stacks.

### Fixed

- Coda Bubonico now uses shotgun mods (Galvanized Hell, Galvanized Savvy, Primed Point Blank and the rest). It was listed as a rifle.
- Coda Bubonico's Burst and Radial Attack no longer use the main fire's 7 pellets.

## v0.10.0 (2026-10-17)

**TL;DR:** Ask Teshin: find out whether a weapon wants a crit, status or hybrid build, try mods from the latest patches, and check this week's sleeper picks.

### Added

- Ask Teshin button next to Remove all.
- Build lean: compares the best build, a crit-only build and a status-only build for your current enemy and buffs, and calls it Crit, Status or Hybrid (one style needs a 15% lead). Any of the three builds can be applied in one click.
- Patch picks: mods and arcanes from recent patch notes that fit the weapon, tested in your build with the DPS change.
- Sleepers: a weekly scan of every weapon against a level 150 Steel Path Heavy Gunner, highlighting high-disposition weapons that still perform near the top.
- Quick links to the wiki, r/Warframe and Overframe for community builds.

## v0.9.1 (2026-10-17)

**TL;DR:** Plat prices are paused while I work out access with warframe.market.

### Changed

- Hid the plat price badges and toggle. warframe.market currently blocks requests from the calculator's server, so prices could not load.

## v0.9.0 (2026-10-17)

**TL;DR:** Plat prices from warframe.market for equipped mods and Prime weapon sets.

### Added

- Price badge on each equipped mod at its current rank, with a link to the listing.
- Prime weapon set price and a total cost for the build, skipping mods you own.
- Plat prices toggle under the mod slots.

## v0.8.0 (2026-10-17)

**TL;DR:** New Riven tab: build, grade and save rivens, and find the best stats for your build.

### Added

- Riven builder with the real roll range for every stat on the selected weapon, including Update 44.1 spliced traits.
- Riven grader: enter your riven's numbers to see where each roll landed and an overall grade.
- Best stats: ranks 2- and 3-stat combinations for your current build and enemy.
- Saved rivens per weapon, stored in your browser or on your account.

### Changed

- Rivens now sit in a real mod slot: they use capacity, follow slot order for elements, and the optimizer builds around them.
- Builds saved with the old riven fields are converted automatically.

## v0.7.0 (2026-10-16)

**TL;DR:** Link your Twitch channel and show a LIVE badge on your public builds.

### Added

- Link Twitch from the account menu (website and desktop app).
- Your channel appears on your public builds, with a LIVE badge and the game while you stream.
- Option to hide your channel, or unlink at any time.

### Notes

- Warframe loadouts are not imported from Twitch. DE does not offer that data to other sites.

## v0.6.0 (2026-10-16)

**TL;DR:** Game updates and live events, right inside What's new.

### Added

- Game updates tab: the latest Warframe patch notes with a summary, the full notes, search, and highlights for items you can build here.
- Events tab: current and upcoming events, Baro Ki'Teer, Prime Resurgence, Nightwave, resets, open world cycles and DE news, with live countdowns.

## v0.5.1 (2026-10-15)

**TL;DR:** Valence bonus for Kuva, Tenet and Coda weapons, the Coda Bassocyst Mercy Kill buff, and this change log.

### Added

- Valence bonus (element and 25-60%) for Kuva, Tenet and Coda weapons, applied as base damage like in game.
- Coda Bassocyst Mercy Kill buff, toggleable under Buffs > Conditional stacks.
- What's new: release notes with a short summary for every update.

### Fixed

- On Weak Point Kill buffs such as Primary Deadhead now count when conditional buffs are at max.

## v0.5.0 (2026-10-15)

**TL;DR:** Arsenal-style redesign with a proper phone layout, Config A-D and official backgrounds.

### Added

- Arsenal-style screen: capacity bar, Config A-D, 2x4 mod slots with weapon arcane and exilus, in-game style stat list.
- Stat panel tabs: Arsenal, DPS & TTK, Enemy, Buffs, Optimize and Builds.
- Phone layout with a bottom tab bar and a full-screen mod browser.
- Classic view toggle.
- Backgrounds from DE's official Warframe Fansite Kit.

### Fixed

- Exilus mods are recognized again.
- Returning visitors get new versions right away.

## v0.4.0 (2026-10-15)

**TL;DR:** Major damage math overhaul and game data updated to Hotfix 44.1.1.

### Changed

- Your own status effects now build up over the fight and feed back into damage.
- Time to kill and fight length are solved together, so DoTs and clouds stop when the target dies.
- Lingering damage fields, extra attacks per shot and group DPS.
- Faster optimizer.

### Data

- Enemy stats from DE's Public Export.
- Incarnon evolutions for 53 weapons.
- Weekly automatic data refresh.

## v0.3.0 (2026-10-15)

**TL;DR:** Mod value preview, ranks and polarities, undo/redo, enemy scaling, compare and community builds.

### Added

- Mod value preview, mod ranks, slot polarities and a capacity checker.
- Undo and redo, Incarnon presets.
- Enemy level scaling with Steel Path, shields, Overguard and time to kill.
- Build compare, weapon leaderboard and community builds.
- Installable web app and light/dark theme.

## v0.2.0 (2026-10-14)

**TL;DR:** Game art throughout, plus Discord sign-in for saved builds and share links.

### Added

- Weapon, Warframe and arcane browsers with in-game images and drag-and-drop mods.
- Discord sign-in, cloud builds, owned mods and share links.

## v0.1.0 (2026-10-14)

**TL;DR:** First release: damage calculator, build optimizer, web version and Windows app.

### Added

- Weapon damage calculator with mods, arcanes, Warframe buffs, armor and factions.
- Build optimizer.
- warframe.hardn.net and a Windows installer.
