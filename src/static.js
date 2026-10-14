/*
 * Hand-maintained game constants that are NOT in the @wfcd/items dataset.
 * Every value cites its source. If the game changes, edit here.
 * Values marked ASSUMPTION are not stated outright by the source and should
 * be checked in game when it matters.
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});

  const S = {};

  S.PHYSICAL = ['impact', 'puncture', 'slash'];
  S.PRIMARY_ELEMENTS = ['heat', 'cold', 'electricity', 'toxin'];
  S.SECONDARY_ELEMENTS = ['blast', 'radiation', 'gas', 'magnetic', 'viral', 'corrosive'];
  S.OTHER_TYPES = ['void', 'tau', 'true'];
  S.ALL_TYPES = [].concat(S.PHYSICAL, S.PRIMARY_ELEMENTS, S.SECONDARY_ELEMENTS, S.OTHER_TYPES);

  // Source: https://wiki.warframe.com/w/Elemental_Damage
  S.COMBOS = {
    'cold+heat': 'blast',
    'electricity+heat': 'radiation',
    'heat+toxin': 'gas',
    'cold+electricity': 'magnetic',
    'cold+toxin': 'viral',
    'electricity+toxin': 'corrosive'
  };
  S.combine = function (a, b) { return S.COMBOS[[a, b].sort().join('+')] || null; };
  // HCET order for weapons with two innate primaries. Same source.
  S.HCET = ['heat', 'cold', 'electricity', 'toxin'];

  // Faction vulnerabilities (x1.5) / resistances (x0.5), Update 36.0 model.
  // Source: https://wiki.warframe.com/w/Damage/Overview_Table (cross-checked Corpus row
  // against https://wiki.warframe.com/w/Damage/Corpus). Table was read from a flattened
  // page, so re-check a row in game if a result looks off.
  S.VULN = 1.5;
  S.RESIST = 0.5;
  S.FACTIONS = {
    'None (neutral)':  { vuln: [], resist: [], baneKey: null },
    'Grineer':         { vuln: ['impact', 'corrosive'], resist: [], baneKey: 'Grineer' },
    'Kuva Grineer':    { vuln: ['impact', 'corrosive'], resist: ['heat'], baneKey: 'Grineer' },
    'Corpus':          { vuln: ['puncture', 'magnetic'], resist: [], baneKey: 'Corpus' },
    'Corpus Amalgam':  { vuln: ['electricity', 'magnetic'], resist: ['blast'], baneKey: 'Corpus' },
    'Infested':        { vuln: ['heat'], resist: [], baneKey: 'Infested' },
    'Infested Deimos': { vuln: ['slash', 'blast', 'gas'], resist: ['viral'], baneKey: 'Infested' },
    'Orokin (Corrupted)': { vuln: ['puncture', 'viral'], resist: ['radiation'], baneKey: 'Corrupted' },
    'Sentient':        { vuln: ['cold', 'radiation'], resist: ['corrosive'], baneKey: 'Sentient' },
    'Narmer':          { vuln: ['slash', 'toxin'], resist: ['magnetic'], baneKey: null },
    'The Murmur':      { vuln: ['electricity', 'radiation'], resist: ['viral'], baneKey: 'Murmur' },
    'Zariman':         { vuln: ['void'], resist: [], baneKey: null },
    'Scaldra':         { vuln: ['impact', 'corrosive'], resist: ['gas'], baneKey: null },
    'Techrot':         { vuln: ['gas', 'magnetic'], resist: ['cold'], baneKey: null },
    'Anarchs':         { vuln: ['impact', 'electricity'], resist: ['radiation'], baneKey: null }
  };
  // Bane/Smite/etc. of Grineer/Corpus/Infested do NOT apply to Corrupted, Narmer or Techrot.
  // Source: https://wiki.warframe.com/w/Faction_Damage_Mods

  // Armor: enemy DR = 0.9 * sqrt(armor / 2700), armor clamped by level scaling to 200..2700.
  // Source: https://wiki.warframe.com/w/Armor , https://wiki.warframe.com/w/Damage_calculation
  S.ARMOR_CAP = 2700;
  S.ARMOR_DR_MAX = 0.9;

  // Weak points. Source: https://wiki.warframe.com/w/Weak_Point
  // Typical headshot multiplier 3.0 (Grineer, Corpus, Infested, Sentient, Anarchs, Narmer,
  // Corrupted); ~1.5 for Murmur and Techrot. Weak point bonuses add at 1.5x rate on heads.
  // Critical headshots: 2x applied to the crit multiplier.
  S.HEADSHOT_MULT_DEFAULT = 3.0;
  S.HEADSHOT_MULT_BY_FACTION = { 'The Murmur': 1.5, 'Techrot': 1.5 };
  S.HEADSHOT_CRIT_BONUS = 2.0;

  // Status DoTs. Source: https://wiki.warframe.com/w/Status_Effect and
  // https://wiki.warframe.com/w/Damage_over_Time
  // Total ticks = floor(tickRate * (duration - delay)) + 1
  S.DOT = {
    slash:       { pct: 0.35, duration: 6, delay: 1, bypassArmor: true },
    heat:        { pct: 0.50, duration: 6, delay: 1 },
    toxin:       { pct: 0.50, duration: 6, delay: 1 },
    electricity: { pct: 0.50, duration: 6, delay: 0 },
    gas:         { pct: 0.50, duration: 6, delay: 0 }
  };
  // Debuff statuses (per-stack). Same source.
  S.VIRAL = { first: 1.0, perExtra: 0.25, max: 10 };      // +100%, +25%/stack, max +325%
  S.CORROSIVE = { first: 0.26, perExtra: 0.06, max: 10 }; // -26%, -6%/stack, max -80%
  S.HEAT_STRIP_MAX = 0.5;                                  // heat strips up to 50% armor

  // Ability buffs. Values are max-rank at 100% strength.
  // kind:
  //   'baseDamage'  - adds to the Serration pool (additive)
  //   'faction'     - faction-type multiplier, applied again to status DoTs
  //   'separate'    - its own multiplier on total damage
  //   'voidExtra'   - extra Void instance equal to X of total damage
  S.ABILITIES = [
    { id: 'roar', frame: 'Rhino', name: 'Roar', kind: 'faction', value: 0.50, scalesWithStrength: true,
      source: 'https://wiki.warframe.com/w/Roar',
      note: 'Strength scaling is linear (ASSUMPTION: the wiki lists the 50% value but not the formula). Helminth version: 30%.' },
    { id: 'roar-helminth', frame: 'Helminth', name: 'Roar (Helminth)', kind: 'faction', value: 0.30, scalesWithStrength: true,
      source: 'https://wiki.warframe.com/w/Roar', note: 'Linear strength scaling is an ASSUMPTION.' },
    { id: 'eclipse', frame: 'Mirage', name: 'Eclipse (Solar)', kind: 'separate', value: 2.00, scalesWithStrength: true,
      source: 'https://wiki.warframe.com/w/Eclipse',
      note: 'Unique multiplier, applies once to direct and status damage. Linear strength scaling is an ASSUMPTION.' },
    { id: 'vex-armor', frame: 'Chroma', name: 'Vex Armor (Fury, max)', kind: 'baseDamage', value: 2.75, scalesWithStrength: true,
      source: 'https://wiki.warframe.com/w/Vex_Armor',
      note: 'Additive with Serration. Linear strength scaling is stated by the wiki.' },
    { id: 'xatas-whisper', frame: 'Xaku', name: "Xata's Whisper", kind: 'voidExtra', value: 0.26, scalesWithStrength: true,
      source: "https://wiki.warframe.com/w/Xata%27s_Whisper",
      note: 'Separate Void instance, double-dips faction and weak points. Linear strength scaling is an ASSUMPTION.' }
  ];

  // Mods that cannot be equipped together. Same-name variants (Primed / Amalgam / Flawed /
  // Spectral / Higasa X vs X) are handled automatically by name. These are the extra pairs
  // verified on the wiki infoboxes. Add more as you confirm them.
  S.INCOMPATIBLE = [
    ['Galvanized Chamber', 'Split Chamber'],      // https://wiki.warframe.com/w/Galvanized_Chamber
    ['Galvanized Chamber', 'Split Flights'],
    ['Galvanized Diffusion', 'Barrel Diffusion'], // https://wiki.warframe.com/w/Galvanized_Diffusion
    ['Galvanized Hell', "Hell's Chamber"]         // https://wiki.warframe.com/w/Galvanized_Hell
  ];
  S.VARIANT_PREFIXES = ['Primed ', 'Amalgam ', 'Flawed ', 'Spectral ', 'Higasa ', 'Archon '];

  S.SOURCES = {
    damageCalc: 'https://wiki.warframe.com/w/Damage_calculation',
    quantization: 'https://wiki.warframe.com/w/Quantization',
    crit: 'https://wiki.warframe.com/w/Critical_Hit',
    status: 'https://wiki.warframe.com/w/Status_Effect',
    dot: 'https://wiki.warframe.com/w/Damage_over_Time',
    data: 'https://www.npmjs.com/package/@wfcd/items'
  };

  WF.STATIC = S;
})();
