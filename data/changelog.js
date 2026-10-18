/*
 * Release notes, newest first. Shown in What's new > Changelog and used for the update banner.
 * Add an entry at the top for every release: version (matches package.json), date (YYYY-MM-DD),
 * a one-line tldr, and short sections. Keep it in plain patch-note style.
 */
window.WF_CHANGELOG = [
  {
    version: '0.13.0', date: '2026-10-18',
    tldr: 'Shot-by-shot fights with a combat log, a Forma-aware optimizer, an automatic melee combo loop, and riven import from screenshots with a roll scanner.',
    sections: [
      { title: 'Added', items: [
        'Shot by shot (DPS tab, Advanced): rolls every pellet\'s crit, headshot and status like the game, repeats the fight hundreds of times and shows worst, unlucky, median, lucky and best DPS with a spread chart and a combat log.',
        'Forma budget for the optimizer: only builds that fit your capacity with that many Forma count, and the slot polarities are set for you. Also "Only use" and "Never use" mod lists.',
        'Best melee loop: works out the combo from your stance, Heavy Attack Efficiency, Initial Combo and the combo timer, and finds the best mix of normal combos and heavy attacks. Heavy attacks use that combo automatically.',
        'Riven import from a screenshot: paste or pick an image of your riven and the stats fill in. It is read on your device.',
        'Roll scanner: pick stats a riven must have or never use, a specific negative, and roll quality from worst to perfect, with an option to re-optimize your mods around the top results.'
      ] },
      { title: 'Changed', items: [
        'Initial Combo, Combo Duration and Heavy Attack Efficiency mods now count.'
      ] }
    ]
  },
  {
    version: '0.12.0', date: '2026-10-18',
    tldr: 'Beginner and Advanced modes, the new Simulacrum tab, step-by-step math with help tips, and modeling for falloff, regenerating ammo, Archon Shards, stances and heavy attacks.',
    sections: [
      { title: 'Added', items: [
        'Beginner and Advanced modes. Beginner keeps the essentials; Advanced shows every setting. New visitors start in Beginner and your choice is remembered.',
        'Simulacrum tab: switch each mechanic on or off, set kill rate, target distance and fight length, and see how DPS ramps up over the first minute.',
        '"How this number is made" on the DPS tab walks through every step from base damage to sustained DPS with your numbers.',
        'Help tips on stats and settings, each with a wiki link, and a Learn page that explains the whole damage formula.',
        'Damage falloff by distance for every weapon that has it, plus area falloff from the blast centre.',
        'Regenerating ammo for Coda Bubonico, Bubonico, Fulmin, Cycron, Plinx and other battery weapons.',
        'Range conditions: Shotgun Vendetta and Range Advantage follow the target distance.',
        'Archon Shards: five slots with Crimson, Violet, Topaz and Emerald weapon bonuses and Tauforged shards.',
        'Melee stances with real per-hit combo data from the wiki, and heavy attacks with combo multiplier, wind-up and Killing Blow.'
      ] },
      { title: 'Changed', items: [
        'Kill rate, combo, fight length and the conditional buff switches moved from Buffs to the Simulacrum.',
        'Weapon data notes now sit on the Arsenal tab instead of under the weapon name.'
      ] }
    ]
  },
  {
    version: '0.11.0', date: '2026-10-18',
    tldr: 'On Kill buffs now follow a kill rate setting, proc-based arcanes work, and Coda Bubonico uses shotgun mods like in game.',
    sections: [
      { title: 'Added', items: [
        'Kill rate setting under Conditions: Horde, Steady, Boss or a custom kills per minute. On Kill buffs use the stacks you would actually hold, based on each buff\'s duration and how it loses stacks, so Primary Merciless falls off at lower kill rates while Galvanized mods stay close to full.',
        'Primary Frostbite, Primary Blight, Conjunction Voltage and Primary Crux now count, with stacks based on your own Cold, Toxin or Electricity procs and weak point hits.',
        'Empty conditional stack boxes show the stacks being used.'
      ] },
      { title: 'Changed', items: [
        'Galvanized Scope\'s headshot kill stacks follow your headshot rate instead of assuming full stacks.'
      ] },
      { title: 'Fixed', items: [
        'Coda Bubonico now uses shotgun mods (Galvanized Hell, Galvanized Savvy, Primed Point Blank and the rest). It was listed as a rifle.',
        'Coda Bubonico\'s Burst and Radial Attack no longer use the main fire\'s 7 pellets.'
      ] }
    ]
  },
  {
    version: '0.10.0', date: '2026-10-17',
    tldr: 'Ask Teshin: find out whether a weapon wants a crit, status or hybrid build, try mods from the latest patches, and check this week\'s sleeper picks.',
    sections: [
      { title: 'Added', items: [
        'Ask Teshin button next to Remove all.',
        'Build lean: compares the best build, a crit-only build and a status-only build for your current enemy and buffs, and calls it Crit, Status or Hybrid (one style needs a 15% lead). Any of the three builds can be applied in one click.',
        'Patch picks: mods and arcanes from recent patch notes that fit the weapon, tested in your build with the DPS change.',
        'Sleepers: a weekly scan of every weapon against a level 150 Steel Path Heavy Gunner, highlighting high-disposition weapons that still perform near the top.',
        'Quick links to the wiki, r/Warframe and Overframe for community builds.'
      ] }
    ]
  },
  {
    version: '0.9.1', date: '2026-10-17',
    tldr: 'Plat prices are paused while I work out access with warframe.market.',
    sections: [
      { title: 'Changed', items: [
        'Hid the plat price badges and toggle. warframe.market currently blocks requests from the calculator\'s server, so prices could not load.'
      ] }
    ]
  },
  {
    version: '0.9.0', date: '2026-10-17',
    tldr: 'Plat prices from warframe.market for equipped mods and Prime weapon sets.',
    sections: [
      { title: 'Added', items: [
        'Price badge on each equipped mod at its current rank, with a link to the listing.',
        'Prime weapon set price and a total cost for the build, skipping mods you own.',
        'Plat prices toggle under the mod slots.'
      ] }
    ]
  },
  {
    version: '0.8.0', date: '2026-10-17',
    tldr: 'New Riven tab: build, grade and save rivens, and find the best stats for your build.',
    sections: [
      { title: 'Added', items: [
        'Riven builder with the real roll range for every stat on the selected weapon, including Update 44.1 spliced traits.',
        'Riven grader: enter your riven\'s numbers to see where each roll landed and an overall grade.',
        'Best stats: ranks 2- and 3-stat combinations for your current build and enemy.',
        'Saved rivens per weapon, stored in your browser or on your account.'
      ] },
      { title: 'Changed', items: [
        'Rivens now sit in a real mod slot: they use capacity, follow slot order for elements, and the optimizer builds around them.',
        'Builds saved with the old riven fields are converted automatically.'
      ] }
    ]
  },
  {
    version: '0.7.0', date: '2026-10-16',
    tldr: 'Link your Twitch channel and show a LIVE badge on your public builds.',
    sections: [
      { title: 'Added', items: [
        'Link Twitch from the account menu (website and desktop app).',
        'Your channel appears on your public builds, with a LIVE badge and the game while you stream.',
        'Option to hide your channel, or unlink at any time.'
      ] },
      { title: 'Notes', items: [
        'Warframe loadouts are not imported from Twitch. DE does not offer that data to other sites.'
      ] }
    ]
  },
  {
    version: '0.6.0', date: '2026-10-16',
    tldr: 'Game updates and live events, right inside What\'s new.',
    sections: [
      { title: 'Added', items: [
        'Game updates tab: the latest Warframe patch notes with a summary, the full notes, search, and highlights for items you can build here.',
        'Events tab: current and upcoming events, Baro Ki\'Teer, Prime Resurgence, Nightwave, resets, open world cycles and DE news, with live countdowns.'
      ] }
    ]
  },
  {
    version: '0.5.1', date: '2026-10-15',
    tldr: 'Valence bonus for Kuva, Tenet and Coda weapons, the Coda Bassocyst Mercy Kill buff, and this change log.',
    sections: [
      { title: 'Added', items: [
        'Valence bonus (element and 25-60%) for Kuva, Tenet and Coda weapons, applied as base damage like in game.',
        'Coda Bassocyst Mercy Kill buff, toggleable under Buffs > Conditional stacks.',
        'What\'s new: release notes with a short summary for every update.'
      ] },
      { title: 'Fixed', items: [
        'On Weak Point Kill buffs such as Primary Deadhead now count when conditional buffs are at max.'
      ] }
    ]
  },
  {
    version: '0.5.0', date: '2026-10-15',
    tldr: 'Arsenal-style redesign with a proper phone layout, Config A-D and official backgrounds.',
    sections: [
      { title: 'Added', items: [
        'Arsenal-style screen: capacity bar, Config A-D, 2x4 mod slots with weapon arcane and exilus, in-game style stat list.',
        'Stat panel tabs: Arsenal, DPS & TTK, Enemy, Buffs, Optimize and Builds.',
        'Phone layout with a bottom tab bar and a full-screen mod browser.',
        'Classic view toggle.',
        'Backgrounds from DE\'s official Warframe Fansite Kit.'
      ] },
      { title: 'Fixed', items: [
        'Exilus mods are recognized again.',
        'Returning visitors get new versions right away.'
      ] }
    ]
  },
  {
    version: '0.4.0', date: '2026-10-15',
    tldr: 'Major damage math overhaul and game data updated to Hotfix 44.1.1.',
    sections: [
      { title: 'Changed', items: [
        'Your own status effects now build up over the fight and feed back into damage.',
        'Time to kill and fight length are solved together, so DoTs and clouds stop when the target dies.',
        'Lingering damage fields, extra attacks per shot and group DPS.',
        'Faster optimizer.'
      ] },
      { title: 'Data', items: [
        'Enemy stats from DE\'s Public Export.',
        'Incarnon evolutions for 53 weapons.',
        'Weekly automatic data refresh.'
      ] }
    ]
  },
  {
    version: '0.3.0', date: '2026-10-15',
    tldr: 'Mod value preview, ranks and polarities, undo/redo, enemy scaling, compare and community builds.',
    sections: [
      { title: 'Added', items: [
        'Mod value preview, mod ranks, slot polarities and a capacity checker.',
        'Undo and redo, Incarnon presets.',
        'Enemy level scaling with Steel Path, shields, Overguard and time to kill.',
        'Build compare, weapon leaderboard and community builds.',
        'Installable web app and light/dark theme.'
      ] }
    ]
  },
  {
    version: '0.2.0', date: '2026-10-14',
    tldr: 'Game art throughout, plus Discord sign-in for saved builds and share links.',
    sections: [
      { title: 'Added', items: [
        'Weapon, Warframe and arcane browsers with in-game images and drag-and-drop mods.',
        'Discord sign-in, cloud builds, owned mods and share links.'
      ] }
    ]
  },
  {
    version: '0.1.0', date: '2026-10-14',
    tldr: 'First release: damage calculator, build optimizer, web version and Windows app.',
    sections: [
      { title: 'Added', items: [
        'Weapon damage calculator with mods, arcanes, Warframe buffs, armor and factions.',
        'Build optimizer.',
        'warframe.hardn.net and a Windows installer.'
      ] }
    ]
  }
];
