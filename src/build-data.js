/*
 * Builds the slim calculator dataset from raw @wfcd/items JSON files.
 * Shared by scripts/sync-data.js (CLI) and the desktop app's "Update game data" button.
 * loadJson(fileName) must return the parsed contents of package/data/json/<fileName>.
 */
require('./static.js');
require('./parser.js');
const WF = global.WF;


function nonZero(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === 'number' && v > 0 && WF.STATIC.ALL_TYPES.includes(k)) o[k] = v;
  }
  return o;
}

function slimWeapon(w) {
  const attacks = (w.attacks || []).map(a => ({
    name: a.name,
    fireRate: a.speed,
    critChance: a.crit_chance != null ? a.crit_chance / 100 : w.criticalChance,
    critMult: a.crit_mult != null ? a.crit_mult : w.criticalMultiplier,
    statusChance: a.status_chance != null ? a.status_chance / 100 : w.procChance,
    chargeTime: a.charge_time || 0,
    shotType: a.shot_type || null,
    damage: nonZero(a.damage)
  })).filter(a => Object.keys(a.damage).length);
  if (!attacks.length) {
    attacks.push({
      name: 'Default', fireRate: w.fireRate, critChance: w.criticalChance, critMult: w.criticalMultiplier,
      statusChance: w.procChance, chargeTime: 0, shotType: null, damage: nonZero(w.damage)
    });
  }
  return {
    name: w.name,
    category: w.category,        // Primary / Secondary / Melee
    type: w.type,                // Rifle, Shotgun, Sniper, Bow, Launcher, Pistol, Melee...
    trigger: w.trigger || null,
    multishot: w.multishot || 1,
    fireRate: w.fireRate,
    magazine: w.magazineSize || 0,
    reload: w.reloadTime || 0,
    disposition: w.disposition || null,
    polarities: w.polarities || [],
    isPrime: !!w.isPrime,
    incarnon: (w.attacks || []).some(a => /incarnon/i.test(a.name || '')),
    mastery: w.masteryReq || 0,
    image: w.imageName || null,
    url: w.wikiaUrl || null,
    attacks
  };
}

function maxStats(item) {
  const ls = item.levelStats || [];
  return ls.length ? ls[ls.length - 1].stats : [];
}

function buildData(load, version) {

  const weapons = []
    .concat(load('Primary.json'), load('Secondary.json'), load('Melee.json'))
    .filter(w => w.category === 'Primary' || w.category === 'Secondary' || w.category === 'Melee')
    .filter(w => w.type !== 'Zaw Component')
    .map(slimWeapon)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Mods
  const MOD_TYPES = ['Primary Mod', 'Shotgun Mod', 'Secondary Mod', 'Melee Mod'];
  const rawMods = load('Mods.json').filter(m =>
    MOD_TYPES.includes(m.type) &&
    !/\/PvPMods\//.test(m.uniqueName) &&
    !/\/Beginner\/|\/Intermediate\//.test(m.uniqueName));
  const byKey = new Map();
  for (const m of rawMods) {
    const key = m.name.toLowerCase() + '|' + m.type + '|' + m.compatName;
    const isExpert = /\/Expert\//.test(m.uniqueName);
    const cur = byKey.get(key);
    // Prefer the standard (non-/Expert/) entry; /Expert/ is kept only when it is the only one (Primed mods).
    if (!cur || (cur._expert && !isExpert)) byKey.set(key, Object.assign({ _expert: isExpert }, m));
  }
  const mods = [...byKey.values()].map(m => {
    const stats = maxStats(m);
    const parsed = WF.parser.parseStats(stats, { name: m.name });
    return {
      name: m.name,
      type: m.type,
      compat: m.compatName,
      drain: m.baseDrain,
      maxRank: m.fusionLimit,
      polarity: m.polarity,
      rarity: m.rarity,
      exilus: !!m.isExilus,
      augment: !!m.isAugment,
      set: m.modSet || null,
      image: m.imageName || null,
      stats,
      effects: parsed.effects,
      unparsed: parsed.unparsed,
      url: m.wikiaUrl || null
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Arcanes
  const ARC_TYPES = ['Primary Arcane', 'Secondary Arcane', 'Melee Arcane', 'Shotgun Arcane', 'Bow Arcane', 'Warframe Arcane', 'Arcane'];
  const seenArc = new Set();
  const arcanes = load('Arcanes.json').filter(a => ARC_TYPES.includes(a.type)).filter(a => {
    if (seenArc.has(a.name)) return false; seenArc.add(a.name); return true;
  }).map(a => {
    const stats = maxStats(a);
    const parsed = WF.parser.parseStats(stats, { name: a.name });
    return { name: a.name, type: a.type, rarity: a.rarity, image: a.imageName || null, stats, effects: parsed.effects, unparsed: parsed.unparsed, url: a.wikiaUrl || null };
  }).filter(a => a.effects.length || a.type !== 'Warframe Arcane')
    .sort((a, b) => a.name.localeCompare(b.name));

  const frames = load('Warframes.json')
    .filter(f => f.productCategory === 'Suits')
    .map(f => ({
      name: f.name,
      image: f.imageName || null,
      isPrime: !!f.isPrime,
      health: f.health, shield: f.shield, armor: f.armor, energy: f.power,
      passive: f.passiveDescription ? WF.parser.clean(f.passiveDescription) : null,
      abilities: (f.abilities || []).map(a => ({ name: a.name, description: a.description || '', image: a.imageName || null })),
      url: f.wikiaUrl || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    meta: { source: '@wfcd/items', version, builtAt: new Date().toISOString() },
    weapons, mods, arcanes, frames
  };
}

module.exports = { buildData };
