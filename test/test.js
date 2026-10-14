/*
 * Checks the engine against worked examples published on the WARFRAME Wiki.
 * Run: node test/test.js
 */
require('../src/static.js');
require('../src/parser.js');
require('../src/engine.js');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
