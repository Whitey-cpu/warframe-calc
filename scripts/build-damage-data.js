#!/usr/bin/env node
/*
 * Builds token-efficient damage-calc views under data/damage/ from game-data.json
 * and the hand-maintained constants in src/static.js.
 *
 * Run: node scripts/build-damage-data.js
 * Sources for formulas: WARFRAME Wiki pages listed in each JSON "sources" field.
 * Do not invent numbers — only project fields the engine already uses.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src/static.js'));
const S = global.WF.STATIC;
const game = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/game-data.json'), 'utf8'));

const OUT = path.join(ROOT, 'data/damage');
fs.mkdirSync(OUT, { recursive: true });

const SOURCES = {
  damageCalc: 'https://wiki.warframe.com/w/Damage_calculation',
  quantization: 'https://wiki.warframe.com/w/Quantization',
  crit: 'https://wiki.warframe.com/w/Critical_Hit',
  status: 'https://wiki.warframe.com/w/Status_Effect',
  dot: 'https://wiki.warframe.com/w/Damage_over_Time',
  armor: 'https://wiki.warframe.com/w/Armor',
  valenceFusion: 'https://wiki.warframe.com/w/Valence_Fusion',
  kuvaWeapons: 'https://wiki.warframe.com/w/Kuva_Weapons',
  progenitor: 'https://wiki.warframe.com/w/Progenitor',
  dualCodaTorxica: 'https://wiki.warframe.com/w/Dual_Coda_Torxica',
  elemental: 'https://wiki.warframe.com/w/Elemental_Damage'
};

function write(name, obj, { pretty = true } = {}) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, (pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj)) + '\n');
  console.log('wrote', path.relative(ROOT, p), `(${fs.statSync(p).size} bytes)`);
}

// ---- formulas (explicit, cited) ----
write('formulas.json', {
  meta: {
    purpose: 'Damage-calc formulas only. Every entry cites a wiki/DE source. Engine: src/engine.js.',
    gameDataVersion: game.meta && game.meta.version,
    sources: SOURCES
  },
  quantization: {
    source: SOURCES.quantization,
    note: 'Update 40.0 changed scale from 1/16 to 1/32 of unmodded base (including Valence).',
    scale: 'baseTotal / 32',
    quantize: 'sign(x) * floor(|x| / scale + 0.5) * scale',
    damageMods: 'Multiply final quantized values; they do not change scale (wiki Damage/Calculation).'
  },
  arsenalTotal: {
    source: SOURCES.damageCalc,
    formula: 'base * (1 + elemental% + physDist_i * physBonus_i) * (1 + damage%) * multishot',
    note: 'Arsenal screen omits faction, falloff, and quantization.'
  },
  crit: {
    source: SOURCES.crit,
    expectedMultiplier: ' (1 - f) * (1 + t*(CD-1)) + f * (1 + (t+1)*(CD-1)) where t=floor(CC), f=CC-t',
    headcrit: 'Doubles weapon base crit multiplier; relative crit-damage bonuses still apply. Flat crit-damage bonuses are not doubled.',
    headcritFlag: 'Not every head: Corpus humanoids, most Murmur/Techrot default off (Enemy_Body_Parts).'
  },
  armor: {
    source: SOURCES.armor,
    atOrBelow2700: 'damageTaken = 1 - 0.9 * sqrt(armor / 2700)',
    above2700: 'damageTaken = 300 / (armor + 300)',
    minPerType: 1
  },
  factionAndDots: {
    source: [SOURCES.damageCalc, SOURCES.dot, SOURCES.status],
    direct: 'hit * (1 + faction) * viral * vulnerability',
    statusDot: 'tick * (1 + faction)^2 * vulnerability^2 * (1 + statusDamage) * elementFactor',
    note: 'Vulnerability (Torxica spores) is multiplicative with Bane/Roar, not additive (Dual_Coda_Torxica).'
  },
  elements: {
    source: [SOURCES.elemental, SOURCES.dualCodaTorxica],
    combos: S.COMBOS,
    order: 'Mod slots top-left→bottom-right, then innate/Valence primaries in HCET: heat, cold, electricity, toxin',
    hcet: S.HCET
  },
  valence: {
    source: [SOURCES.kuvaWeapons, SOURCES.valenceFusion, SOURCES.progenitor, SOURCES.dualCodaTorxica],
    types: S.VALENCE_TYPES,
    range: [S.VALENCE_MIN, S.VALENCE_MAX],
    appliesAs: 'base damage (raises baseTotal before elemental % and quantization scale)',
    fusion: 'min(1.1 * max(a,b), 60%), floor to 0.1 percent points, then >=58% → 60%',
    nameMatch: '^(?:Dual )?Coda |^Kuva |^Tenet '
  }
});

// ---- constants snapshot from static.js ----
write('constants.json', {
  meta: { purpose: 'Hand-maintained combat constants used by the engine. Edit src/static.js; rebuild this file.', sources: S.SOURCES },
  physical: S.PHYSICAL,
  primaryElements: S.PRIMARY_ELEMENTS,
  secondaryElements: S.SECONDARY_ELEMENTS,
  combos: S.COMBOS,
  hcet: S.HCET,
  vuln: S.VULN,
  resist: S.RESIST,
  factions: S.FACTIONS,
  armor: { cap: S.ARMOR_CAP, drMax: S.ARMOR_DR_MAX, overCapK: S.ARMOR_OVER_CAP_K, minPerType: S.ARMOR_MIN_DAMAGE_PER_TYPE },
  headshotDefault: S.HEADSHOT_MULT_DEFAULT,
  headshotByFaction: S.HEADSHOT_MULT_BY_FACTION,
  headcritByFaction: S.HEADCRIT_BY_FACTION,
  headcritBonus: S.HEADSHOT_CRIT_BONUS,
  dot: S.DOT,
  status: S.STATUS,
  viral: S.VIRAL,
  corrosive: S.CORROSIVE,
  heatStripMax: S.HEAT_STRIP_MAX,
  blastBurst: S.BLAST_BURST,
  coldCd: S.COLD_CD,
  punctureCc: S.PUNCTURE_CC,
  valence: {
    types: S.VALENCE_TYPES,
    min: S.VALENCE_MIN,
    max: S.VALENCE_MAX,
    fuseMult: S.VALENCE_FUSE_MULT,
    snapFrom: S.VALENCE_SNAP_TO_MAX,
    progenitors: S.PROGENITOR_ELEMENTS
  },
  abilities: S.ABILITIES.map(a => ({ id: a.id, kind: a.kind, value: a.value, source: a.source }))
});

write('valence.json', {
  meta: {
    purpose: 'Adversary Valence / progenitor bonus reference for agents.',
    sources: [SOURCES.kuvaWeapons, SOURCES.valenceFusion, SOURCES.progenitor, SOURCES.dualCodaTorxica]
  },
  types: S.VALENCE_TYPES,
  percentRange: { min: 25, max: 60, unit: 'percent of unmodded attack base' },
  fusion: {
    formula: 'min(1.1 * max(bonusA, bonusB), 60)',
    floorTo: '0.1 percent points',
    snap: 'if floored result >= 58 then 60',
    exampleWiki: { a: 40, b: 52, result: 57.2 },
    perfectFrom: 52.8
  },
  progenitors: S.PROGENITOR_ELEMENTS,
  adversaryNameTest: '/^(?:Dual )?Coda |^Kuva |^Tenet /',
  weapons: game.weapons.filter(w => S.isAdversaryWeapon(w.name)).map(w => w.name).sort()
});

// ---- slim weapons: only fields the damage engine needs for hit math ----
function slimAttack(a) {
  const o = {
    name: a.name,
    fireRate: a.fireRate,
    critChance: a.critChance,
    critMult: a.critMult,
    statusChance: a.statusChance,
    damage: a.damage
  };
  if (a.chargeTime) o.chargeTime = a.chargeTime;
  if (a.shotType) o.shotType = a.shotType;
  if (a.heavy) o.heavy = true;
  if (a.falloff) o.falloff = a.falloff;
  return o;
}
function slimWeapon(w) {
  const o = {
    name: w.name,
    category: w.category,
    type: w.type,
    trigger: w.trigger,
    multishot: w.multishot,
    fireRate: w.fireRate,
    magazine: w.magazine,
    reload: w.reload,
    attacks: (w.attacks || []).map(slimAttack)
  };
  if (w.incarnon) o.incarnon = true;
  if (S.isAdversaryWeapon(w.name)) o.adversary = true;
  if (w.battery) o.battery = w.battery;
  return o;
}
const slimWeapons = game.weapons.map(slimWeapon);
const adversaryWeapons = slimWeapons.filter(w => w.adversary);
write('weapons-slim.json', {
  meta: {
    purpose: 'Weapons stripped to damage-calc fields (compact JSON). Prefer over data/game-data.json for math agents.',
    count: slimWeapons.length,
    droppedFields: ['image', 'url', 'uid', 'omega', 'disposition', 'dataNotes', 'isPrime', 'polarities', 'exilusPolarity', 'mastery'],
    gameDataVersion: game.meta && game.meta.version
  },
  weapons: slimWeapons
}, { pretty: false });
write('weapons-adversary.json', {
  meta: {
    purpose: 'Adversary (Kuva/Tenet/Coda/Dual Coda) weapons only — valence-capable set.',
    count: adversaryWeapons.length,
    sources: [SOURCES.kuvaWeapons, SOURCES.dualCodaTorxica]
  },
  weapons: adversaryWeapons
});
write('weapon-index.json', {
  meta: { purpose: 'Name → category/type/adversary/incarnon lookup without attack payloads.', count: slimWeapons.length },
  weapons: slimWeapons.map(w => ({
    name: w.name,
    category: w.category,
    type: w.type,
    adversary: w.adversary || undefined,
    incarnon: w.incarnon || undefined,
    attacks: w.attacks.length
  }))
}, { pretty: false });

// ---- schema for build JSON the engine accepts ----
write('build-schema.json', {
  meta: {
    purpose: 'Minimal schema for CLI/UI build objects passed to WF.engine.calculate.',
    engine: 'src/engine.js'
  },
  required: ['weapon'],
  properties: {
    weapon: { oneOf: [{ type: 'string', description: 'Weapon name' }, { type: 'object', description: 'Inline weapon' }] },
    attack: { description: 'Attack index or name' },
    mods: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'object', properties: { name: { type: 'string' }, rank: { type: 'number' } } }] } },
    arcanes: { type: 'array', items: { type: 'string' } },
    valence: {
      type: 'object',
      properties: {
        element: { enum: S.VALENCE_TYPES },
        pct: { description: '0.25–0.60 or 25–60; engine normalizes' }
      }
    },
    incarnon: { type: 'object', description: '{ II, III, IV: perk name }' },
    buffs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, strength: { type: 'number' } } } },
    customBuffs: { type: 'array' },
    riven: { type: 'array', description: 'Effect objects {stat,value,element?}' },
    enemy: { type: 'object' },
    conditions: { type: 'object' },
    overrides: { type: 'object' },
    stance: { type: 'object' },
    shards: { type: 'array' },
    weaponPassive: { type: 'boolean', description: 'false disables WEAPON_PASSIVES for this weapon' },
    extraAttacks: { type: 'array', items: { type: 'number' } }
  }
});

write('README.md', `# Damage-calc data (agent-oriented)

Token-efficient views for damage math. **Runtime app still loads \`data/game-data.js\`.**

| File | ~Size | Load when |
|---|---|---|
| \`formulas.json\` | tiny | Cited formulas (quantization, crit, armor, valence, HCET) |
| \`constants.json\` | tiny | Faction/DoT/status/armor/valence constants |
| \`valence.json\` | tiny | Fusion math, progenitor table, adversary name list |
| \`build-schema.json\` | tiny | Shape of a \`calculate()\` build object |
| \`weapons-adversary.json\` | small | Only Kuva/Tenet/Coda weapons (valence set) |
| \`weapon-index.json\` | small | Name → category/type flags, no attack payloads |
| \`weapons-slim.json\` | medium | All weapons, damage fields only (compact JSON) |

Load order for a typical calc agent: \`formulas.json\` + \`constants.json\` → one weapon from \`weapons-slim.json\` or \`weapons-adversary.json\` → \`build-schema.json\`.

Regenerate after \`node scripts/sync-data.js\` or \`src/static.js\` edits:

\`\`\`
node scripts/build-damage-data.js
\`\`\`

Do not invent formulas. Prefer wiki links in each file's \`sources\` / \`meta.sources\`.
`);

console.log('done');
