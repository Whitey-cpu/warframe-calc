#!/usr/bin/env node
/*
 * Warframe damage calculator CLI.
 *
 *   node cli.js calc <build.json | inline-json>      Calculate a build
 *   node cli.js optimize <scenario.json | inline>    Find the best build for a scenario
 *   node cli.js weapon <name>                        Show weapon stats and attacks
 *   node cli.js mods <weapon> [filter]               List mods that fit a weapon (with parsed effects)
 *   node cli.js arcanes [filter]                     List arcanes
 *   node cli.js search <text>                        Search weapons, mods, arcanes
 *   node cli.js factions | abilities                 Reference lists
 *   node cli.js sync                                 Download latest game data
 * Add --json to any command for machine-readable output.
 */
const fs = require('fs');
const path = require('path');
require('./src/static.js');
require('./src/parser.js');
require('./src/engine.js');
require('./src/optimizer.js');
const WF = global.WF;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const pos = args.filter(a => a !== '--json');
const cmd = pos[0];

function loadData() {
  const p = path.join(__dirname, 'data', 'game-data.json');
  if (!fs.existsSync(p)) { console.error('No game data yet. Run: node cli.js sync'); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function readInput(s) {
  if (!s) { console.error('Missing build/scenario argument'); process.exit(1); }
  if (fs.existsSync(s)) return JSON.parse(fs.readFileSync(s, 'utf8'));
  return JSON.parse(s);
}
const fmt = n => (typeof n === 'number') ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(n);
const pct = n => (n * 100).toFixed(1) + '%';
const out = o => console.log(JSON.stringify(o, null, 2));

function printResult(r) {
  console.log(`\n${r.weapon} - ${r.attack} (${r.category}/${r.type})`);
  console.log(`  Elements:        ${r.elements.join(', ') || 'none'}`);
  console.log(`  Damage types:    ${Object.entries(r.damageTypes).map(([k, v]) => `${k} ${fmt(v)}`).join(' | ')}`);
  console.log(`  Per hit (no crit): ${fmt(r.perHitNonCrit)}`);
  const s = r.stats;
  console.log(`  Crit ${pct(s.critChance)} x${fmt(s.critMultiplier)} | Status ${pct(s.statusChance)} | Multishot ${fmt(s.multishot)} | Fire rate ${fmt(s.effectiveFireRate)}/s | Mag ${s.magazine} | Reload ${fmt(s.reload)}s`);
  console.log(`  Faction x${fmt(s.factionMultiplier)} | Armor after strip ${fmt(s.armorAfterStrip)} (dmg x${fmt(s.armorDamageMultiplier)}) | Viral x${fmt(s.viralMultiplier)}`);
  console.log(`  Avg per shot vs enemy (incl. crit, multishot): ${fmt(r.perShotVsEnemy)}`);
  for (const [t, d] of Object.entries(r.dots)) console.log(`  ${t} DoT: ${fmt(d.procsPerShot)} procs/shot, ${fmt(d.tick)}/tick x${d.ticks} = ${fmt(d.perProc)}/proc`);
  console.log(`  DPS burst: direct ${fmt(r.dps.burstDirect)} + DoT ${fmt(r.dps.burstDot)} = ${fmt(r.dps.burstTotal)}`);
  console.log(`  DPS sustained (with reloads): ${fmt(r.dps.sustainedTotal)}`);
  if (r.unparsed.length) console.log(`  Not modeled (text the parser skipped):\n    - ${r.unparsed.join('\n    - ')}`);
  if (r.notes.length) console.log(`  Notes:\n    - ${r.notes.join('\n    - ')}`);
}

function main() {
  if (cmd === 'sync') { const { execFileSync } = require('child_process'); execFileSync(process.execPath, [path.join(__dirname, 'scripts', 'sync-data.js')], { stdio: 'inherit' }); return; }
  const data = loadData();
  const E = WF.engine;
  switch (cmd) {
    case 'calc': {
      const r = E.calculate(readInput(pos[1]), data);
      return asJson ? out(r) : printResult(r);
    }
    case 'optimize': {
      const o = WF.optimizer.optimize(readInput(pos[1]), data);
      if (asJson) return out(o);
      console.log(`\nBest build for ${o.result.weapon} by ${o.metric} (${o.evaluations} builds evaluated, ${o.candidates} candidate mods)`);
      o.mods.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
      if (o.exilus) console.log(`  Exilus: ${o.exilus}`);
      if (o.arcane) console.log(`  Arcane: ${o.arcane}`);
      console.log(`  Max-rank drain total: ${o.maxRankDrain}`);
      printResult(o.result);
      o.notes.forEach(n => console.log(`  * ${n}`));
      return;
    }
    case 'weapon': {
      const w = E.findWeapon(data, pos.slice(1).join(' '));
      if (!w) { console.error('Weapon not found'); process.exit(1); }
      return asJson ? out(w) : (console.log(`${w.name} (${w.category}/${w.type}) trigger ${w.trigger} multishot ${w.multishot} mag ${w.magazine} reload ${w.reload}s disposition ${w.disposition}`),
        w.attacks.forEach((a, i) => console.log(`  [${i}] ${a.name}: ${Object.entries(a.damage).map(([k, v]) => `${k} ${v}`).join(', ')} | crit ${pct(a.critChance)} x${a.critMult} | status ${pct(a.statusChance)} | ${a.fireRate}/s${a.chargeTime ? ` | charge ${a.chargeTime}s` : ''}`)));
    }
    case 'mods': {
      const w = E.findWeapon(data, pos[1]);
      if (!w) { console.error('Weapon not found'); process.exit(1); }
      const f = (pos[2] || '').toLowerCase();
      const list = E.modsFor(data, w).filter(m => !f || m.name.toLowerCase().includes(f) || m.stats.join(' ').toLowerCase().includes(f));
      if (asJson) return out(list);
      list.forEach(m => console.log(`${m.name}${m.exilus ? ' [exilus]' : ''}: ${m.stats.map(s => WF.parser.clean(s).replace(/\n/g, ' ')).join(' / ')}${m.unparsed.length ? '  (partly not modeled)' : ''}`));
      return;
    }
    case 'arcanes': {
      const f = (pos[1] || '').toLowerCase();
      const list = data.arcanes.filter(a => !f || a.name.toLowerCase().includes(f) || a.type.toLowerCase().includes(f));
      if (asJson) return out(list);
      list.forEach(a => console.log(`${a.name} (${a.type}): ${a.stats.map(s => WF.parser.clean(s).replace(/\n/g, ' ')).join(' / ')}`));
      return;
    }
    case 'search': {
      const q = pos.slice(1).join(' ').toLowerCase();
      const r = {
        weapons: data.weapons.filter(w => w.name.toLowerCase().includes(q)).map(w => w.name),
        mods: data.mods.filter(m => m.name.toLowerCase().includes(q)).map(m => `${m.name} (${m.compat})`),
        arcanes: data.arcanes.filter(a => a.name.toLowerCase().includes(q)).map(a => a.name)
      };
      return asJson ? out(r) : Object.entries(r).forEach(([k, v]) => console.log(`${k}: ${v.join(', ') || '-'}`));
    }
    case 'factions': return out(WF.STATIC.FACTIONS);
    case 'abilities': return out(WF.STATIC.ABILITIES);
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
  }
}
main();
