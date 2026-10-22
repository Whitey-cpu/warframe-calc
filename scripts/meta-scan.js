#!/usr/bin/env node
/*
 * Weekly "meta" scan with this site's own math (no other site's data):
 * every primary, secondary and melee weapon gets a quick optimized build against one fixed Steel Path target,
 * then data/meta.json lists the top weapons per category and the "sleepers": weapons DE rated 1.3+ in its last riven
 * disposition list (high dispositions went to the least-used weapons, per the WARFRAME Wiki) that still rank high here.
 * Dispositions were retired in Hotfix 44.1.3 (2026-10-22); data/old-dispositions.json keeps that last list.
 * Usage: node scripts/meta-scan.js [--limit N]   (writes data/meta.json and data/meta.js)
 */
const fs = require('fs');
const path = require('path');
for (const f of ['static', 'parser', 'engine', 'optimizer', 'enemy', 'incarnon', 'riven']) require(`../src/${f}.js`);
const WF = global.WF;
const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'game-data.json'), 'utf8'));
const OLD_DISPO = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'old-dispositions.json'), 'utf8'));
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? +process.argv[limitArg + 1] : Infinity;

const UNIT = 'Heavy Gunner', FACTION = 'Grineer', LEVEL = 150, STEEL = true;
const unit = data.enemies.find(e => e.name === UNIT && e.faction === FACTION);
if (!unit) throw new Error(`${UNIT} not in the data`);
const sc = WF.enemy.scale({ faction: FACTION, health: unit.health, shield: unit.shield, armor: unit.armor, level: LEVEL, steelPath: STEEL });
const enemy = { faction: FACTION, armor: sc.armor, health: sc.health, shield: sc.shield, unit: UNIT, level: LEVEL, steelPath: STEEL };

const cats = ['Primary', 'Secondary', 'Melee'];
// not normal arsenal weapons (the Drifter's Duviri sidearm), so they do not belong in an arsenal ranking
const SKIP = new Set(['Sirocco']);
const rows = [];
let n = 0;
const t0 = Date.now();
for (const w of data.weapons) {
  if (!cats.includes(w.category) || n >= LIMIT || SKIP.has(w.name)) continue;
  n++;
  try {
    const o = WF.optimizer.optimize({ weapon: w, enemy, metric: 'sustainedTotal', beamWidth: 4, exilus: true, arcane: true }, data);
    if (!(o.score > 0)) continue;
    const od = WF.riven.oldDisposition(w, OLD_DISPO);
    rows.push({ name: w.name, category: w.category, type: w.type, dps: Math.round(o.score), dispo: od ? od.value : null, mods: o.mods, exilus: o.exilus || null, arcane: o.arcane || null,
      ttk: o.result && o.result.ttk ? +o.result.ttk.seconds.toFixed(2) : null, incarnon: !!w.incarnon });
  } catch (e) { /* weapons the engine cannot handle are skipped */ }
}
const out = {
  builtAt: new Date().toISOString(), dataVersion: data.meta.version, gameBuild: data.meta.gameBuild || null,
  scenario: { unit: UNIT, faction: FACTION, level: LEVEL, steelPath: STEEL, health: Math.round(sc.health), armor: Math.round(sc.armor), shield: Math.round(sc.shield || 0),
    metric: 'Sustained DPS', mods: 'quick optimizer (beam 4), no riven, no Warframe buffs' },
  note: 'Ranked only by the damage math here. Sleepers = weapons DE rated 1.3 or higher in its last riven disposition list before retiring dispositions in Hotfix 44.1.3 (2026-10-22). DE gave high dispositions to the least-used weapons, per the WARFRAME Wiki, so these were rarely used yet still rank high here.',
  categories: {}
};
for (const c of cats) {
  const list = rows.filter(r => r.category === c).sort((a, b) => b.dps - a.dps);
  list.forEach((r, i) => { r.rank = i + 1; });
  out.categories[c] = { count: list.length, top: list.slice(0, 15), sleepers: list.filter(r => r.dispo >= 1.3).slice(0, 10) };
}
fs.writeFileSync(path.join(ROOT, 'data', 'meta.json'), JSON.stringify(out, null, 1) + '\n');
fs.writeFileSync(path.join(ROOT, 'data', 'meta.js'), 'window.WF_META = ' + JSON.stringify(out) + ';\n');
console.log(`Scanned ${rows.length} weapons in ${Math.round((Date.now() - t0) / 1000)}s.`);
for (const c of cats) console.log(c, out.categories[c].top.slice(0, 3).map(r => r.name).join(', '), '| sleepers:', out.categories[c].sleepers.slice(0, 3).map(r => `${r.name} (#${r.rank})`).join(', '));
