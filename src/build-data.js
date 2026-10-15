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
    uid: w.uniqueName,
    omega: w.omegaAttenuation != null ? Math.round(w.omegaAttenuation * 1000) / 1000 : null,
    category: w.category,        // Primary / Secondary / Melee
    type: w.type,                // Rifle, Shotgun, Sniper, Bow, Launcher, Pistol, Melee...
    trigger: w.trigger || null,
    multishot: w.multishot || 1,
    fireRate: w.fireRate,
    magazine: w.magazineSize || 0,
    reload: w.reloadTime || 0,
    disposition: w.disposition || null,
    polarities: w.polarities || [],
    exilusPolarity: w.exilusPolarity || null,
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

function buildData(load, version, extras) {

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
    const desc = m.description ? WF.parser.clean(m.description) : '';
    // rules that live in the mod description, e.g. Semi-Rifle Cannonade
    const descSentences = desc.split(/\.\s*/).map(x => x.trim()).filter(Boolean);
    const parsed = WF.parser.parseStats(stats.concat(descSentences.filter(x => /cannot be modified/i.test(x)).map(x => x + '.')), { name: m.name });
    const trig = desc.match(/Only compatible with ([\w-]+) Trigger/i);
    return {
      requiresTrigger: trig ? trig[1].replace(/-Auto$/i, '').replace(/^Semi$/i, 'Semi') : null,
      name: m.name,
      type: m.type,
      compat: m.compatName,
      drain: m.baseDrain,
      maxRank: m.fusionLimit,
      polarity: m.polarity,
      rarity: m.rarity,
      exilus: !!(m.isExilus || m.isUtility),
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
      uid: f.uniqueName,
      image: f.imageName || null,
      isPrime: !!f.isPrime,
      health: f.health, shield: f.shield, armor: f.armor, energy: f.power,
      passive: f.passiveDescription ? WF.parser.clean(f.passiveDescription) : null,
      abilities: (f.abilities || []).map(a => ({ name: a.name, description: a.description || '', image: a.imageName || null })),
      url: f.wikiaUrl || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Enemies: base stats for the enemy picker (level scaling happens in src/enemy.js)
  const FACTION_GUESS = { Grineer: 'Grineer', Corpus: 'Corpus', Infestation: 'Infested', Orokin: 'Orokin (Corrupted)', Sentient: 'Sentient' };
  const seenEn = new Set();
  const enemies = load('Enemy.json')
    .filter(e => e.health > 0 && e.name && !/^\[|<|Specter|Warframe/.test(e.name))
    .filter(e => { const k = e.name.toLowerCase(); if (seenEn.has(k)) return false; seenEn.add(k); return true; })
    .map(e => {
      const res = (e.resistances || []).map(r => r.type);
      return {
        name: e.name, uid: e.uniqueName, health: e.health, shield: e.shield || 0, armor: e.armor || 0,
        faction: FACTION_GUESS[e.type] || (res.some(t => /Shield/.test(t)) && e.shield ? 'Corpus' : null),
        image: e.imageName || null
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const data = {
    meta: { source: '@wfcd/items', version, builtAt: new Date().toISOString(), sources: [
      { name: '@wfcd/items', version, url: 'https://www.npmjs.com/package/@wfcd/items', role: 'Base data: weapons, mods, arcanes, frames, enemy list (built from DE Public Export plus wiki attack breakdowns)' }
    ] },
    weapons, mods, arcanes, frames, enemies
  };
  if (extras) applyExtras(data, extras);
  return data;
}

// ---------- enrichment from other public sources ----------
// extras = { pep: { weapons, enemies, warframes, version, published }, web: data/web-data.json, overrides: data/overrides.json }
const PEP_FACTION = { Grineer: 'Grineer', Corpus: 'Corpus', Infestation: 'Infested', Orokin: 'Orokin (Corrupted)', Sentient: 'Sentient', Narmer: 'Narmer', Murmur: 'The Murmur', Scaldra: 'Scaldra', Techrot: 'Techrot', Anarch: 'Anarchs' };
function addNote(item, text) { (item.dataNotes = item.dataNotes || []).push(text); }
function applyExtras(data, x) {
  const pep = x.pep, web = x.web, ov = x.overrides;
  if (pep) {
    data.meta.sources.push({ name: 'warframe-public-export-plus', version: pep.version, published: pep.published, url: 'https://www.npmjs.com/package/warframe-public-export-plus',
      role: 'DE Public Export repackaged: enemy health/shield/armor/faction, cross-check of weapon and frame stats' });
    // Enemies: DE export values replace @wfcd/items values (the wfcd enemy table is older, e.g. Crewman 60/150 vs 90/120 since the Corpus rework)
    let fixed = 0;
    for (const e of data.enemies) {
      const a = pep.enemies.avatars[e.uid];
      if (!a) { e.src = '@wfcd/items'; continue; }
      const dc = pep.enemies.damageControllers[a.damageController] || {};
      const before = [e.health, e.shield, e.armor].join('/');
      if (a.health != null) e.health = a.health;
      if (dc.shield != null) e.shield = dc.shield;
      if (dc.armor != null) e.armor = dc.armor;
      if (a.faction && PEP_FACTION[a.faction]) e.faction = PEP_FACTION[a.faction];
      e.src = 'DE Public Export';
      if (before !== [e.health, e.shield, e.armor].join('/')) { fixed++; addNote(e, `Base stats updated from DE Public Export (was ${before} in @wfcd/items).`); }
    }
    data.meta.enemiesUpdatedFromDE = fixed;
    // Weapons: flag where the per-attack numbers (wiki) differ from the weapon-level numbers (DE export)
    for (const w of data.weapons) {
      const d = pep.weapons[w.uid];
      if (!d || !w.attacks.length) continue;
      const a = w.attacks[0], diffs = [];
      const pct = v => Math.round(v * 1000) / 10 + '%';
      if (d.criticalChance != null && Math.abs(a.critChance - d.criticalChance) > 0.005) diffs.push(`crit ${pct(a.critChance)} vs ${pct(d.criticalChance)}`);
      if (d.criticalMultiplier != null && Math.abs(a.critMult - d.criticalMultiplier) > 0.01) diffs.push(`crit multiplier ${a.critMult}x vs ${Math.round(d.criticalMultiplier * 100) / 100}x`);
      if (d.procChance != null && Math.abs(a.statusChance - d.procChance) > 0.005) diffs.push(`status ${pct(a.statusChance)} vs ${pct(d.procChance)}`);
      if (diffs.length) addNote(w, `"${a.name}" stats (wiki, per attack) differ from the DE Public Export weapon value: ${diffs.join(', ')}. Often the export value is for a different fire mode or per pellet; check in the arsenal.`);
    }
    for (const f of data.frames) {
      const p = pep.warframes[f.uid];
      if (!p) continue;
      const a = [f.health, f.shield, f.armor].join('/'), b = [p.health, p.shield, p.armor].join('/');
      if (a !== b) addNote(f, `Health/shield/armor differ between sources: ${a} (@wfcd/items) vs ${b} (DE Public Export). Not used by weapon math.`);
    }
  }
  if (web && web.incarnon) {
    data.meta.sources.push({ name: 'WARFRAME Wiki (Incarnon evolutions)', scrapedAt: web.scrapedAt, url: 'https://wiki.warframe.com/w/Incarnon',
      role: `Incarnon evolution perks for ${web.incarnon.weapons.length} weapons, each with its page and last edit time` });
    data.incarnon = web.incarnon.weapons;
  }
  if (web && web.build && (web.build.latestHotfix || web.build.latestUpdate)) data.meta.gameBuild = web.build;
  if (ov) {
    data.meta.sources.push({ name: 'Manual corrections', url: 'data/overrides.json', role: 'Official values checked by hand where the datasets lag (each entry lists its source)' });
    if (!data.meta.gameBuild && ov.gameBuild) data.meta.gameBuild = ov.gameBuild;
    for (const o of ov.weapons || []) {
      for (const w of data.weapons.filter(x => x.name === o.name || (o.variants && o.variants.includes(x.name)))) {
        for (const [k, v] of Object.entries(o.set || {})) { const old = w[k]; w[k] = v; addNote(w, `${k} ${old} -> ${v} (${o.source})`); }
      }
    }
  }
}

function diffData(prev, next) {
  const key = w => JSON.stringify([w.attacks, w.multishot, w.magazine, w.reload, w.disposition]);
  const pw = new Map(prev.weapons.map(w => [w.name, w]));
  const nw = new Map(next.weapons.map(w => [w.name, w]));
  const pm = new Map(prev.mods.map(m => [m.name + '|' + m.type, m]));
  const nm = new Map(next.mods.map(m => [m.name + '|' + m.type, m]));
  const out = {
    weaponsAdded: [...nw.keys()].filter(n => !pw.has(n)),
    weaponsRemoved: [...pw.keys()].filter(n => !nw.has(n)),
    weaponsChanged: [...nw.keys()].filter(n => pw.has(n) && key(pw.get(n)) !== key(nw.get(n))),
    modsAdded: [...nm.values()].filter(m => !pm.has(m.name + '|' + m.type)).map(m => m.name),
    modsChanged: [...nm.values()].filter(m => pm.has(m.name + '|' + m.type) && JSON.stringify(pm.get(m.name + '|' + m.type).stats) !== JSON.stringify(m.stats)).map(m => m.name)
  };
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 200);
  return out;
}

module.exports = { buildData, diffData };
