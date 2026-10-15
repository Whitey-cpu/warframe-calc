/*
 * Checks the engine against worked examples published on the WARFRAME Wiki.
 * Run: node test/test.js
 */
require('../src/static.js');
require('../src/parser.js');
require('../src/engine.js');
require('../src/enemy.js');
require('../src/capacity.js');
require('../src/incarnon.js');
const WF = global.WF;
const E = WF.engine;
const data = require('../data/game-data.json');

let pass = 0, fail = 0;
function eq(name, got, want, tol = 1e-3) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got}, want ${want}`);
}

function testWeapon(damage, extra = {}) {
  return Object.assign({
    name: 'Test', category: 'Primary', type: 'Rifle', trigger: 'Auto', multishot: 1, fireRate: 1, magazine: 0, reload: 0,
    attacks: [{ name: 'Test', fireRate: 1, critChance: 0, critMult: 1, statusChance: 0, chargeTime: 0, damage }]
  }, extra);
}

// 1. Quantization example (https://wiki.warframe.com/w/Quantization)
let r = E.calculate({ weapon: testWeapon({ impact: 30, puncture: 30, slash: 40 }) }, data);
eq('Quantization impact', r.damageTypes.impact, 31.25);
eq('Quantization slash', r.damageTypes.slash, 40.625);
r = E.calculate({ weapon: testWeapon({ impact: 30, puncture: 30, slash: 40 }), enemy: { faction: 'Infested Deimos' } }, data);
// Wiki Charger example: 31.25 + 31.25 + 40.625 x 1.5 = 123.4375 (Deimos Infested are Slash-vulnerable)
eq('Quantization vs Slash-vulnerable', r.perShotVsEnemy, 123.4375);
r = E.calculate({ weapon: testWeapon({ impact: 30, puncture: 30, slash: 40 }), riven: [{ stat: 'element', element: 'slash', value: 1.2 }] }, data);
eq('Maim +120% Slash', r.damageTypes.slash, 87.5);

// 2. Nagantaka Prime example (https://wiki.warframe.com/w/Damage_calculation)
r = E.calculate({
  weapon: 'Nagantaka Prime',
  riven: [
    { stat: 'element', element: 'cold', value: 0.9 },
    { stat: 'element', element: 'toxin', value: 0.6 },
    { stat: 'element', element: 'heat', value: 0.9 },
    { stat: 'element', element: 'gas', value: 2.0 },
    { stat: 'element', element: 'puncture', value: 1.2 }
  ]
}, data);
eq('Nagantaka impact rounds to 0', r.damageTypes.impact || 0, 0);
eq('Nagantaka puncture', r.damageTypes.puncture, 32.4375);
eq('Nagantaka slash', r.damageTypes.slash, 156.78125);
eq('Nagantaka viral', r.damageTypes.viral, 259.5);
eq('Nagantaka heat', r.damageTypes.heat, 156.78125);
eq('Nagantaka gas', r.damageTypes.gas, 346);
eq('Nagantaka total', r.perHitNonCrit, 951.5);

// 3. Crit chance examples (https://wiki.warframe.com/w/Critical_Hit)
const braton = testWeapon({ impact: 10 }, {});
braton.attacks[0].critChance = 0.12; braton.attacks[0].critMult = 2;
r = E.calculate({ weapon: braton, riven: [{ stat: 'critChance', value: 1.5 }, { stat: 'critChance', value: 1.35 }] }, data);
eq('Point Strike + Argon Scope', r.stats.critChance, 0.462);
r = E.calculate({ weapon: braton, riven: [{ stat: 'critChance', value: 1.5 }], arcanes: ['Arcane Avenger'] }, data);
eq('Point Strike + Arcane Avenger (flat)', r.stats.critChance, 0.75);

// 4. Bleed example (https://wiki.warframe.com/w/Damage_over_Time): 100 x 2.65 x 0.35 x 1.3^2 x 1.9 = 297.8202
const bleedW = testWeapon({ slash: 100 });
bleedW.attacks[0].statusChance = 1;
r = E.calculate({ weapon: bleedW, riven: [{ stat: 'damage', value: 1.65 }, { stat: 'statusDamage', value: 0.9 }],
  customBuffs: [{ kind: 'faction', value: 0.3 }] }, data);
eq('Bleed tick', r.dots.slash.tick, 297.8202, 1e-3);
eq('Bleed ticks', r.dots.slash.ticks, 6);

// 5. Weak point example (https://wiki.warframe.com/w/Weak_Point): (3 + 1.5 x 4.25) x 1.7 = 15.9375
r = E.calculate({ weapon: testWeapon({ impact: 100 }), riven: [{ stat: 'weakPoint', value: 4.25 }, { stat: 'headshot', value: 0.7 }],
  enemy: { weakPointMult: 3, headshotRate: 1 } }, data);
eq('Headshot multiplier', r.stats.headshotMultiplier, 15.9375);

// 6. Armor (https://wiki.warframe.com/w/Armor)
r = E.calculate({ weapon: testWeapon({ impact: 100 }), enemy: { armor: 2700 } }, data);
eq('2700 armor = 90% DR', r.stats.armorDamageMultiplier, 0.1);
r = E.calculate({ weapon: testWeapon({ impact: 100 }), enemy: { armor: 300 } }, data);
eq('300 armor', r.stats.armorDamageMultiplier, 0.7);

// 7. Roar at 130% strength (https://wiki.warframe.com/w/Roar): 100 x (1 + 0.5 x 1.3) = 165
r = E.calculate({ weapon: testWeapon({ impact: 100 }), buffs: [{ id: 'roar', strength: 1.3 }] }, data);
eq('Roar 130% strength', r.perShotVsEnemy, 165);

// 8. Primary Merciless is additive with Serration (https://wiki.warframe.com/w/Primary_Merciless)
r = E.calculate({ weapon: testWeapon({ impact: 100 }), mods: ['Serration'], arcanes: ['Primary Merciless'] }, data);
eq('Serration + 12x Merciless', r.perHitNonCrit, 100 * (1 + 1.65 + 3.6));

// 9. Galvanized Chamber full stacks: +80% + 5 x 30% = +230% (https://wiki.warframe.com/w/Galvanized_Chamber)
r = E.calculate({ weapon: testWeapon({ impact: 100 }), mods: ['Galvanized Chamber'] }, data);
eq('Galvanized Chamber multishot', r.stats.multishot, 3.3);

// 10. Average crit formula 1 + CC x (CD - 1)
r = E.calculate({ weapon: braton, riven: [{ stat: 'critChance', value: 1.5 }] }, data);
eq('Average crit multiplier', r.stats.avgCritBody, 1 + 0.3 * 1);

// 11. Element ordering: Prova example (innate Electricity; Cold, Toxin, Heat in slots 1-3 -> Viral + Radiation)
const elecW = testWeapon({ electricity: 50, impact: 50 });
r = E.calculate({ weapon: elecW, mods: [], riven: [
  { stat: 'element', element: 'cold', value: 0.6 }, { stat: 'element', element: 'toxin', value: 0.6 }, { stat: 'element', element: 'heat', value: 0.6 }] }, data);
eq('Prova example -> Viral present', r.elements.includes('viral') ? 1 : 0, 1);
eq('Prova example -> Radiation present', r.elements.includes('radiation') ? 1 : 0, 1);

// 12. Enemy level scaling (https://wiki.warframe.com/w/Enemy_Level_Scaling worked example: armor 100, base level 1)
eq('Armor scale lvl 50', WF.enemy.scale({ faction: 'Grineer', health: 100, armor: 100, level: 50, baseLevel: 1 }).armor, 554, 1);
eq('Armor scale lvl 75 (blend)', WF.enemy.scale({ faction: 'Grineer', health: 100, armor: 100, level: 75, baseLevel: 1 }).armor, 1060, 2);
eq('Armor cap 2700', WF.enemy.scale({ faction: 'Grineer', health: 100, armor: 500, level: 300, baseLevel: 1 }).armor, 2700);
eq('Steel Path health x2.5 and +100 levels', WF.enemy.scale({ faction: 'Grineer', health: 100, level: 1, baseLevel: 1, steelPath: true }).health,
  Math.round(Math.fround(100 * WF.enemy.multiplier([0.015, 2.12, 10.7332, 0.72], 100, 70, 80)) * 2.5), 1);
eq('Steel Path leaves armor unscaled by SP multiplier', WF.enemy.scale({ faction: 'Grineer', health: 100, armor: 100, level: 50, baseLevel: 1, steelPath: true }).armor,
  WF.enemy.scale({ faction: 'Grineer', health: 100, armor: 100, level: 150, baseLevel: 1 }).armor);

// 13. Capacity (https://wiki.warframe.com/w/Mod_Capacity): Serration 14, matching 7, mismatched 14 + 4 = 18
eq('Drain matching polarity', WF.capacity.slotDrain(4, 10, 'madurai', 'madurai'), 7);
eq('Drain mismatched polarity', WF.capacity.slotDrain(4, 10, 'madurai', 'naramon'), 18);
eq('Drain no polarity', WF.capacity.slotDrain(4, 10, 'madurai', null), 14);

// 14. Incarnon: Soma Zeroed In adds +0.6 base crit multiplier
const somaNoInc = E.calculate({ weapon: 'Soma Prime', attack: 'Incarnon Form' }, data);
const somaInc = E.calculate({ weapon: 'Soma Prime', attack: 'Incarnon Form', incarnon: { IV: 'Zeroed In' } }, data);
eq('Incarnon Zeroed In +0.6 crit mult', somaInc.stats.critMultiplier - somaNoInc.stats.critMultiplier, 0.6);
const somaFs = E.calculate({ weapon: 'Soma Prime', attack: 'Incarnon Form', incarnon: { II: 'Fortress Salvo' } }, data);
eq('Incarnon Fortress Salvo +12 base per pellet', somaFs.stats.baseTotal - somaNoInc.stats.baseTotal, 12);

// 15. Shields: Toxin skips shields, armor ignored on shields
const shW = testWeapon({ impact: 100 });
r = E.calculate({ weapon: shW, enemy: { armor: 2700 } }, data);
eq('Shield damage ignores armor', r.perShotVsShield, 100);
eq('Health damage uses armor', r.perShotVsEnemy, 10);
r = E.calculate({ weapon: testWeapon({ toxin: 100 }) }, data);
eq('Toxin does no shield damage', r.perShotVsShield, 0);
r = E.calculate({ weapon: testWeapon({ impact: 100 }), enemy: { health: 1000, shield: 500 } }, data);
eq('TTK shots (500 shield + 1000 health at 100/shot)', r.ttk.shots, 15);

// 16. Semi-Auto-only Cannonades: Incarnon weapons need Semi-Auto in both modes (wiki Semi-Rifle/Shotgun Cannonade notes)
const cannon = w => E.modsFor(data, E.findWeapon(data, w)).some(m => m.requiresTrigger);
eq('Torid (Incarnon, Held beam) cannot use a Cannonade', cannon('Torid'), false);
eq('Latron Prime can use Semi-Rifle Cannonade', cannon('Latron Prime'), true);
eq('Strun Wraith can use Semi-Shotgun Cannonade', cannon('Strun Wraith'), true);

// 17. Lingering cloud: Torid Poison Cloud hits 1/s for 10 s (first hit at 1 s), so 10 hits per shot with no fight limit
r = E.calculate({ weapon: 'Torid', attack: 0, extraAttacks: [1], conditions: { selfStatus: false } }, data);
eq('Torid cloud hits per shot (open-ended)', r.attackParts[1].hits, 10);
r = E.calculate({ weapon: 'Torid', attack: 0, extraAttacks: [1], conditions: { selfStatus: false, fightSeconds: 4 } }, data);
eq('Torid cloud hits per shot in a 4 s fight (shots in each second get 3, 2, 1, 0 hits)', Math.round(r.attackParts[1].hits * 100) / 100, 1.5);

// 18. Fight length solver is self-consistent: TTK equals the fight length it assumed
r = E.calculate({ weapon: 'Torid', attack: 0, extraAttacks: [1], mods: ['Serration', 'Hellfire', 'Infected Clip'], enemy: { faction: 'Grineer', health: 100000, armor: 1000 } }, data);
eq('Fight length = TTK (within 1%)', Math.abs(r.fightSeconds / r.ttk.seconds - 1) < 0.01, true);

// 19. In-game calibration (Ethan's Torid, Update 44.1, arsenal screenshots 2026-10-14):
//     Final Fusillade + Swift Deliverance + Survivor's Edge, Galvanized Chamber / Vital Sense / Critical Delay / Serration /
//     Thermite Rounds / Primed Cryo Rounds / High Voltage / Vile Acceleration. Normal-mode arsenal: Blast 511.9, Corrosive 364
//     (matches the Poison Cloud attack); Incarnon Form: Blast 573.8, Corrosive 408, crit 132%, crit dmg 6.8x, status 118.8%, FR 13.6.
{
  const inc = { II: 'Final Fusillade', III: 'Swift Deliverance', IV: "Survivor's Edge" };
  const mods = ['Galvanized Chamber', 'Vital Sense', 'Critical Delay', 'Serration', 'Thermite Rounds', 'Primed Cryo Rounds', 'High Voltage', 'Vile Acceleration', 'Vigilante Supplies'];
  const c = { assumeMax: false, selfStatus: false };
  const cloud = E.calculate({ weapon: 'Torid', attack: 1, mods, arcanes: ['Primary Merciless'], incarnon: inc, conditions: c }, data);
  eq('Torid cloud arsenal Blast (in-game 511.9)', Math.round(cloud.arsenal.types.blast * 10) / 10, 511.9);
  eq('Torid cloud arsenal Corrosive (in-game 364)', Math.round(cloud.arsenal.types.corrosive), 364);
  const beam = E.calculate({ weapon: 'Torid', attack: 2, mods, arcanes: ['Primary Merciless'], incarnon: inc, conditions: c }, data);
  eq('Torid Incarnon Blast (in-game 573.8)', Math.round(beam.arsenal.types.blast * 10) / 10, 573.8);
  eq('Torid Incarnon crit chance (in-game 132%)', Math.round(beam.stats.critChance * 1000) / 10, 132);
  eq('Torid Incarnon status (in-game 118.8%)', Math.round(beam.stats.statusChance * 1000) / 10, 118.8);
  eq('Torid Incarnon fire rate (in-game 13.6)', Math.round(beam.stats.fireRate * 10) / 10, 13.6);
}

// 20. Generated Incarnon presets pick the variant's own column (wiki Braton Incarnon Genesis: Braton Prime X = 4)
if (data.incarnon) {
  const bp = WF.incarnonFor('Braton Prime', data);
  eq('Braton Prime Daring Reverie base damage (wiki X = 4)', bp.tiers[0].perks[0].effects[0].value, 4);
}

// 21. Valence bonus is base damage (wiki Kuva Weapons): Coda Bassocyst 808 base + 60% Electricity = 1292.8 base,
//     elemental mods scale from it. Overframe build 815939 shows 13,302.9 total per shot (x2.1 multishot) with conditionals off.
{
  const of = ['Primed Charged Shell', 'Primed Chilling Grasp', 'Toxic Barrage', 'Shotgun Barrage', 'Primed Ravage', 'Critical Deceleration', 'Galvanized Savvy', 'Galvanized Hell', 'Galvanized Acceleration'];
  const r = E.calculate({ weapon: 'Coda Bassocyst', mods: of, valence: { element: 'electricity', pct: 0.6 }, conditions: { assumeMax: false, selfStatus: false } }, data);
  eq('Coda Bassocyst + 60% Electricity arsenal total (Overframe 13,302.9)', Math.round(r.arsenal.total * 10) / 10, 13302.9);
  const noDh = E.calculate({ weapon: 'Coda Bassocyst', mods: of, arcanes: [] }, data);
  const dh = E.calculate({ weapon: 'Coda Bassocyst', mods: of, arcanes: ['Primary Deadhead'] }, data);
  eq('Primary Deadhead On Weak Point Kill stacks count with conditionals on (0% headshots)', dh.stats.damagePool - noDh.stats.damagePool > 3.5, true);
  const merc = E.calculate({ weapon: 'Coda Bassocyst', mods: [], conditions: { assumeMax: true, selfStatus: false } }, data);
  eq('Coda Bassocyst Mercy Kill buff: +100% multishot', merc.stats.multishot, 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
