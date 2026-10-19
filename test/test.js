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
r = E.calculate({ weapon: testWeapon({ impact: 100 }), mods: ['Serration'], arcanes: ['Primary Merciless'], conditions: { stacks: { 'Primary Merciless': 12 } } }, data);
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

// 22. Change log: newest entry matches package.json, every entry has a TL;DR
{
  global.window = global.window || {};
  require('../data/changelog.js');
  const log = global.window.WF_CHANGELOG;
  eq('Change log top version = package.json version', log[0].version === require('../package.json').version, true);
  eq('Every change log entry has a TL;DR and sections', log.every(e => e.tldr && e.tldr.length > 20 && e.sections.length), true);
}

// 23. Patch notes parser, on markup copied from the structure of warframe.com/en/patch-notes/pc/44-1-2 (trimmed)
{
  const PN = require('../scripts/patch-notes.js');
  const same = (name, got, want) => { if (got !== want) console.log(`   got:  ${got}\n   want: ${want}`); eq(name, got === want, true); };
  const idx = PN.parseIndex('<li><a href="https://www.warframe.com/en/patch-notes/pc/44-1-2">Iceblade of Narin: The Icebind: Hotfix 44.1.2 + 2.1</a></li><li><a href="https://www.warframe.com/en/patch-notes/pc/44-1-1">Iceblade of Narin: The Icebind: Hotfix 44.1.1</a></li><a href="/patch-notes/pc/44-1-0">READ</a>');
  same('Patch index: absolute links only, in order', idx.map(x => x.slug).join(), '44-1-2,44-1-1');
  const html = '<div class="record"><div class="folio"><date class="date">Oct 15, 2026</date></div><div class="content">\n<p>\r\n<span style="font-size:20px;"><strong>Iceblade of Narin: The Icebind: Hotfix 44.1.2.1</strong></span></p><p><strong>Fixes:</strong></p><ul><li>\r\nFixed crashing near the Torid&nbsp;cloud.\r\n</li></ul>' +
    '<p><span style="font-size:20px;"><strong>Iceblade of Narin: The Icebind: Hotfix 44.1.2</strong></span></p><p><img src="x.png"><span><em>Image Description: a Vessel.</em></span></p>' +
    '<p><span style="font-size:20px;"><strong>Tau Prologue Quest Series</strong></span>\r\n<br> New quests.</p><p><strong>Changes:</strong></p><ul><li>Reduced the Bronco Prime Barrel price.</li><li>Nurinarim changes:<ul><li>Sub point.</li></ul></li></ul>' +
    '<p><strong>The Icebind Changes &amp; Fixes:</strong></p><ul><li>Added SFX.</li><li>Fixed Secondary Enervate procs.</li></ul></div><div class="ButtonGroup detail-navigation"><a href="https://forums.warframe.com/topic/1528620-x/">Discuss</a></div>';
  const pg = PN.parsePage(html, 'T');
  same('Patch page: date, forum link, two hotfix parts', [pg.date, !!pg.forum, pg.parts.length].join(), '2026-10-15,true,2');
  same('Patch page: image descriptions dropped, sub-points kept with depth', JSON.stringify(pg.parts[1].sections[1].items), JSON.stringify(['Reduced the Bronco Prime Barrel price.', 'Nurinarim changes:', { t: 'Sub point.', d: 1 }]));
  const sum = PN.summarize(pg.parts);
  same('Patch TL;DR from DE headings and counts', sum.tldr, 'Tau Prologue Quest Series; The Icebind. 2 fixes, 3 other changes.');
  const names = PN.mentions(pg.parts, PN.buildMatcher(data)).map(m => m.name).join();
  same('Patch mentions: calculator items found by exact name', names, 'Bronco Prime,Secondary Enervate,Torid');
  same('Title case for DE capitals', PN.titleCase("NEW GAMEMODE: THE ICEBIND") + ' / ' + PN.titleCase('MEMETICA GLYPH PACK III'), 'New Gamemode: The Icebind / Memetica Glyph Pack III');
}

// 24. Riven math (WARFRAME Wiki, Riven Mods: base x disposition x stat-count multiplier x roll 0.9-1.1)
{
  require('../src/riven.js');
  const R = ((global.window && global.window.WF && global.window.WF.riven) ? global.window.WF : global.WF).riven;
  const soma = E.findWeapon(data, 'Soma Prime');
  const d = soma.omega;
  const r = R.range('critChance', soma, 3, 1, false);
  eq('Riven range: rifle Critical Chance, 3 positive + 1 negative, average', r.avg, 149.99 * d * 0.9375, 1e-9);
  eq('Riven range: max roll is 1.1x the average', r.max / r.avg, 1.1, 1e-9);
  eq('Riven range: negative Zoom uses the 0.75 malus', R.range('zoom', soma, 3, 1, true).avg, 59.99 * d * 0.75, 1e-9);
  eq('Riven range: 2 positive, no negative uses 0.99', R.range('damage', soma, 2, 0, false).avg, 165 * d * 0.99, 1e-9);
  const hikou = E.findWeapon(data, 'Hikou');
  eq('Riven type: Hikou (secondary) uses pistol bases', R.range('damage', hikou, 2, 0, false).avg, 219.6 * hikou.omega * 0.99, 1e-9);
  const bad = R.validate({ stats: [{ key: 'heat', value: 50, neg: true }, { key: 'critChance', value: 100 }] }, soma);
  eq('Riven validate: Heat cannot be negative, needs 2 positives', bad.length, 2);
  eq('Riven validate: two spliced traits rejected', R.validate({ stats: [{ key: 'viral', value: 90 }, { key: 'blast', value: 90 }] }, soma).some(m => /spliced/.test(m)), true);
  const riv = { stats: [{ key: 'critChance', value: r.max }, { key: 'heat', value: 80 }, { key: 'cold', value: 80 }, { key: 'zoom', value: R.range('zoom', soma, 3, 1, true).min, neg: true }] };
  const g = R.grade(riv, soma);
  eq('Riven grade: max roll = 100%, smallest negative = 100%', g.rows[0].quality + g.rows[3].quality, 2, 1e-9);
  const fx = R.toEffects(riv);
  eq('Riven effects: elements listed bottom-up (Cold before Heat)', fx.filter(e => e.stat === 'element').map(e => e.element).join() === 'cold,heat', true);
  eq('Riven effects: rank 4 scales by 5/9', R.toEffects(riv, 4)[0].value / fx[0].value, 5 / 9, 1e-9);
  const tech = E.calculate({ weapon: 'Soma Prime', mods: [], riven: R.toEffects({ stats: [{ key: 'vsTechrot', value: 50 }, { key: 'damage', value: 100 }] }), enemy: { faction: 'Techrot', armor: 0 } }, data);
  eq('Riven faction: Damage vs. Techrot (spliced) applies to Techrot', tech.stats.factionMultiplier, 1.5, 1e-9);
  const jobs = [...R.bestStatsJobs(soma, { factionKey: 'vsGrineer' })];
  eq('Riven best stats: 2 and 3 positive combos, with and without a negative', jobs.length, 2 * (R.combos(R.candidateKeys(soma, { factionKey: 'vsGrineer' }).positives, 3).length + R.combos(R.candidateKeys(soma, { factionKey: 'vsGrineer' }).positives, 2).length));
}

// 25. Teshin build lean: crit-only build never uses status chance mods, status-only never uses crit mods
{
  // earlier tests created a fake window; point it at the same WF object so the browser-style modules find the engine
  if (global.window) { Object.assign(global.WF, global.window.WF || {}); global.window.WF = global.WF; }
  require('../src/optimizer.js');
  require('../src/teshin.js');
  const W = global.WF;
  const T = W.teshin;
  const r = T.lean({ weapon: 'Soma Prime', enemy: { faction: 'Grineer', armor: 300 } }, data, { beamWidth: 3 });
  const soma = E.findWeapon(data, 'Soma Prime');
  const items = o => o.mods.concat(o.exilus ? [o.exilus] : [], o.arcane ? [o.arcane] : []).map(n => E.findMod(data, soma, n) || E.findArcane(data, n)).filter(Boolean);
  const has = (o, stats) => items(o).some(it => it.effects.some(e => stats.includes(e.stat)));
  eq('Teshin: crit-only build has no status chance mods', has(r.crit, ['statusChance']), false);
  eq('Teshin: status-only build has no crit mods', has(r.status, ['critChance', 'critChanceFlat', 'critDamage', 'slashOnCrit']), false);
  eq('Teshin: best build is at least as strong as both', r.best.score >= Math.max(r.crit.score, r.status.score) - 1e-6, true);
  eq('Teshin: verdict is crit, status or hybrid', ['crit', 'status', 'hybrid'].includes(r.verdict), true);
}


// 26. Coda Bubonico uses shotgun mods (wiki), and matches the in-game arsenal (2026-10-17 screenshots, Primed Point Blank rank 9,
//     28.2% Radiation valence, conditionals off): crit 81%, crit dmg 4.8x, status 18.3%, fire rate 6.4, multishot 14.7, magazine 50;
//     Burst: status 109.8%, total 187.7; Radial Attack: status 102.6%, Viral 357.5.
{
  const bub = E.findWeapon(data, 'Coda Bubonico');
  eq('Coda Bubonico is a shotgun (uses Shotgun Mods)', bub.type === 'Shotgun' && E.modsFor(data, bub).some(m => m.name === 'Galvanized Hell'), true);
  const mods = ['Galvanized Hell', 'Galvanized Savvy', 'Critical Deceleration', 'Primed Ravage', 'Atomic Fallout', 'Magnetic Strafe', { name: 'Primed Point Blank', rank: 9 }, 'Charged Shell', 'Galvanized Acceleration'];
  const b = atk => E.calculate({ weapon: 'Coda Bubonico', attack: atk, mods, arcanes: ['Primary Crux'], valence: { element: 'radiation', pct: 0.282 }, conditions: { assumeMax: false, selfStatus: false } }, data);
  const a0 = b(0), a1 = b(1), a2 = b(2);
  eq('Coda Bubonico arsenal crit chance 81%', a0.stats.critChance, 0.81, 0.005);
  eq('Coda Bubonico arsenal crit damage 4.8x', a0.stats.critMultiplier, 4.8, 0.05);
  eq('Coda Bubonico arsenal status 18.3%', a0.stats.statusChance, 0.183, 0.0005);
  eq('Coda Bubonico arsenal fire rate 6.4', a0.stats.fireRate, 6.4, 0.005);
  eq('Coda Bubonico arsenal multishot 14.7', a0.stats.multishot, 14.7, 0.01);
  eq('Coda Bubonico arsenal magazine 50', a0.stats.magazine, 50);
  eq('Coda Bubonico Burst status 109.8%', a1.stats.statusChance, 1.098, 0.0005);
  eq('Coda Bubonico Burst total 187.7 (multishot 1 base, x2.1 modded)', a1.arsenal.total, 187.7, 0.15);
  eq('Coda Bubonico Radial status 102.6%', a2.stats.statusChance, 1.026, 0.0005);
  eq('Coda Bubonico Radial Viral 357.5', a2.arsenal.types.viral, 357.5, 0.1);
}

// 27. Stack model: kill rate and proc rate (wiki: Galvanized and Merciless lose one stack per timeout; Galvanized Scope tracks
//     each stack; Primary Frostbite loses all stacks when its refreshed 12s timer runs out)
{
  const S2 = E.expectedStacks;
  eq('No kills: no stacks', S2(0, 20, 4, 'one'), 0);
  eq('Galvanized Hell at 60 kills/min: full 4 stacks', S2(1, 20, 4, 'one'), 4, 1e-3);
  eq('Galvanized Hell at 12 kills/min: still about 4 stacks', S2(0.2, 20, 4, 'one') > 3.9, true);
  eq('Primary Merciless (4s) at 12 kills/min drops well below 12', S2(0.2, 4, 12, 'one') < 10, true);
  eq('Single buff uptime = 1 - e^(-rate x duration)', S2(0.3, 10, 1, 'one'), 1 - Math.exp(-3), 1e-9);
  eq('Separate timers: truncated Poisson mean', S2(1, 12, 5, 'each') > 4 && S2(1, 12, 5, 'each') < 5, true);
  const hell = c => E.calculate({ weapon: 'Kuva Hek', mods: ['Galvanized Hell'], conditions: Object.assign({ selfStatus: false }, c) }, data).stats.multishot;
  const base = E.calculate({ weapon: 'Kuva Hek', mods: ['Galvanized Hell'], conditions: { assumeMax: false, selfStatus: false } }, data).stats.multishot;
  eq('Boss kill rate: Galvanized Hell gives only its base multishot', hell({ killRate: 'boss' }), base, 1e-9);
  eq('Horde kill rate: Galvanized Hell adds 4 x 30% multishot', hell({ killRate: 'horde' }) / base, (1 + 1.1 + 1.2) / 2.1, 1e-6);
  const scope = hs => E.calculate({ weapon: 'Soma Prime', mods: ['Galvanized Scope'], enemy: { headshotRate: hs }, conditions: { selfStatus: false } }, data).stats.critChance;
  eq('Galvanized Scope gives nothing with 0% headshots', scope(0), E.calculate({ weapon: 'Soma Prime', mods: [], conditions: { selfStatus: false } }, data).stats.critChance, 1e-9);
  eq('Galvanized Scope builds with 30% headshots', scope(0.3) > scope(0), true);
  const fb = E.findArcane(data, 'Primary Frostbite');
  eq('Primary Frostbite parses into crit damage and multishot, 12s, 40 stacks', fb.effects.length === 2 && fb.effects.every(e => e.cond.duration === 12 && e.cond.maxStacks === 40), true);
  const cold = E.calculate({ weapon: 'Soma Prime', mods: ['Cryo Rounds'], arcanes: ['Primary Frostbite'], conditions: { selfStatus: false } }, data);
  const noCold = E.calculate({ weapon: 'Soma Prime', mods: ['Serration'], arcanes: ['Primary Frostbite'], conditions: { selfStatus: false } }, data);
  eq('Primary Frostbite stacks with Cold procs', cold.stackModel.find(x => x.source === 'Primary Frostbite').stacks > 39, true);
  eq('Primary Frostbite gives nothing without Cold procs', noCold.stackModel.find(x => x.source === 'Primary Frostbite').stacks, 0);
}


// 28. Falloff (wiki Damage_Falloff; Hek page: 100% to 10m, 20% from 20m), battery refill (wiki Battery_Weapon / Coda Bubonico),
//     range conditions, Archon Shards (wiki Archon_Shard / Violet example), melee heavy attacks and stances, timeline
{
  const hek = d => E.calculate({ weapon: 'Hek', mods: [], conditions: { distance: d, selfStatus: false } }, data).perShotVsEnemy;
  eq('Hek falloff: 15m = 60% of point blank', hek(15) / hek(5), 0.6, 1e-6);
  eq('Hek falloff: 30m = 20%', hek(30) / hek(5), 0.2, 1e-6);
  eq('Falloff off: 30m = 100%', E.calculate({ weapon: 'Hek', mods: [], conditions: { distance: 30, selfStatus: false, model: { falloff: false } } }, data).perShotVsEnemy / hek(5), 1, 1e-9);
  const bub = E.calculate({ weapon: 'Coda Bubonico', mods: [], conditions: { selfStatus: false } }, data);
  eq('Coda Bubonico refill: 0.1s empty delay + 36 / 9 per s = 4.1s', bub.stats.reload, 4.1, 1e-6);
  const vend = d => E.calculate({ weapon: 'Kuva Hek', mods: [], arcanes: ['Shotgun Vendetta'], conditions: { distance: d, selfStatus: false } }, data).stats.multishot;
  eq('Shotgun Vendetta counts within 5m', vend(3) > vend(10), true);
  const ra = E.findMod(data, E.findWeapon(data, 'Akjagara'), 'Range Advantage');
  eq('Range Advantage parses with its distance condition', !!ra && ra.effects[0].cond.trigger === 'If no enemies are within 10m', true);
  const sh = E.calculate({ weapon: 'Soma Prime', mods: [], conditions: { selfStatus: false },
    shards: [{ color: 'violet', bonus: 'primaryElectricity', tau: true }, { color: 'violet', bonus: 'primaryElectricity', tau: true }, { color: 'crimson', bonus: 'other' }, { color: 'azure', bonus: 'other' }, { color: 'violet', bonus: 'other' }] }, data);
  eq('Violet shards: 2 Tauforged + 3 others = +240% Electricity (wiki example)', sh.used.filter(u => u.source === 'Archon Shards').reduce((a, u) => a + u.value, 0), 2.4, 1e-9);
  const cs = E.calculate({ weapon: 'Soma Prime', mods: [], conditions: { selfStatus: false }, shards: [{ color: 'crimson', bonus: 'primaryStatus' }] }, data);
  eq('Crimson shard: +25% primary status chance', cs.stats.statusChance / E.calculate({ weapon: 'Soma Prime', mods: [], conditions: { selfStatus: false } }, data).stats.statusChance, 1.25, 1e-9);
  const frag = E.findWeapon(data, 'Fragor');
  const hi = frag.attacks.findIndex(a => a.heavy);
  eq('Fragor heavy attack = 1,200 (wiki)', E.calculate({ weapon: 'Fragor', attack: hi, mods: [], conditions: { selfStatus: false } }, data).perHitNonCrit, 1200, 1e-6);
  eq('Heavy attack x combo x Killing Blow: 1,200 x 4 x 2.2', E.calculate({ weapon: 'Fragor', attack: hi, mods: ['Killing Blow'], conditions: { combo: 4, selfStatus: false } }, data).perHitNonCrit, 10560, 1e-6);
  eq('Normal melee swings ignore the combo multiplier', E.calculate({ weapon: 'Fragor', mods: [], conditions: { combo: 6, selfStatus: false } }, data).perHitNonCrit, 200, 1e-6);
  const st = E.calculate({ weapon: 'Skana', mods: [], stance: { name: 'Crimson Dervish', combo: 'Neutral' }, conditions: { selfStatus: false } }, data);
  const sk = E.findWeapon(data, 'Skana');
  eq('Crimson Dervish Neutral: 5 hits in 2.0s at attack speed 1.0', st.stats.effectiveFireRate, 5 / (2 / sk.attacks[0].fireRate), 1e-9);
  eq('Stance data loaded for 80+ stances', Object.keys(data.stances || {}).length >= 80, true);
  const tl = E.timeline({ weapon: 'Coda Bubonico', mods: ['Galvanized Hell'], arcanes: ['Primary Merciless'] }, data, { seconds: 30, step: 5 });
  eq('Timeline starts below and ends at the long-run DPS', tl.points[0].dps < tl.steady && Math.abs(tl.points[tl.points.length - 1].dps - tl.steady) / tl.steady < 0.01, true);
}


// 29. Shot-by-shot sim, Forma planner and budget, melee loop, riven card reader and roll scanner
{
  if (global.window) { Object.assign(global.WF, global.window.WF || {}); global.window.WF = global.WF; }
  require('../src/capacity.js'); require('../src/sim.js'); require('../src/optimizer.js');
  const W = global.WF;
  const r = E.calculate({ weapon: 'Soma Prime', mods: ['Serration', 'Split Chamber', 'Point Strike', 'Vital Sense'], enemy: { faction: 'Grineer', armor: 500, headshotRate: 0.3 }, conditions: { selfStatus: false } }, data);
  const sm = W.sim.simulate(r, { seconds: 120, runs: 150, seed: 7 });
  eq('Sim: long-run average matches the formula within 3%', Math.abs(sm.mean / r.dps.sustainedTotal - 1) < 0.03, true);
  eq('Sim: min <= median <= max', sm.min <= sm.median && sm.median <= sm.max, true);
  eq('Sim: same seed gives the same result', W.sim.simulate(r, { seconds: 20, runs: 20, seed: 3 }).median, W.sim.simulate(r, { seconds: 20, runs: 20, seed: 3 }).median, 1e-9);
  const soma = E.findWeapon(data, 'Soma Prime');
  const info = n => { const m = E.findMod(data, soma, n); return { name: m.name, drain: m.drain, rank: m.maxRank, polarity: m.polarity }; };
  const eight = ['Serration', 'Split Chamber', 'Point Strike', 'Vital Sense', 'Hammer Shot', 'Primed Cryo Rounds', 'Infected Clip', 'High Voltage'].map(info);
  const plan = W.capacity.formaPlan({ mods: eight, innate: soma.polarities, exilusInnate: soma.exilusPolarity, cap: 60 });
  eq('Forma plan: fits 60 capacity', plan.fits && plan.drain <= 60, true);
  eq('Forma plan: one fewer Forma does not fit', (() => { const p2 = W.capacity.formaPlan({ mods: eight, innate: soma.polarities, cap: 60 }); return p2.forma; })() >= 1, true);
  eq('Forma plan: capacity 30 cannot fit eight big mods', W.capacity.formaPlan({ mods: eight, innate: soma.polarities, cap: 30 }).fits, false);
  const o0 = W.optimizer.optimize({ weapon: 'Soma Prime', formaBudget: 0, conditions: { selfStatus: false }, enemy: { faction: 'Grineer', armor: 500 } }, data);
  eq('Optimizer: 0 Forma budget gives a build that fits without Forma', o0.plan.fits && o0.plan.forma === 0, true);
  const oA = W.optimizer.optimize({ weapon: 'Soma Prime', allowed: ['Serration', 'Split Chamber', 'Point Strike'], conditions: { selfStatus: false } }, data);
  eq('Optimizer: allow list limits the mods', oA.mods.every(m => ['Serration', 'Split Chamber', 'Point Strike'].includes(m)), true);
  const rot = E.meleeRotation({ weapon: 'Fragor', mods: ['Killing Blow', 'Corrupt Charge', 'Reflex Coil'], stance: { name: 'Crushing Ruin', combo: 'Neutral' }, enemy: { targets: 3 }, conditions: { selfStatus: false } }, data);
  eq('Melee loop: 5 hits at 300% = 15 combo per stance combo per enemy', rot.pointsPerCombo, 45, 1e-9);
  eq('Melee loop: best loop beats spamming heavies here', rot.best.dps >= rot.heavySpam.dps, true);
  eq('Melee combo tiers: 19 -> 1x, 20 -> 2x, 220+ -> 12x', [E.comboMult(19), E.comboMult(20), E.comboMult(300)].join() === '1,2,12', true);
  const R2 = W.riven;
  const card = R2.parseCardText('SOMA PRIME CRITATIS\n+142.3% Critical Chance\n+98.7% Critical Damage\n+110.2% Multishot\n-40.1% Zoom', data.weapons);
  eq('Riven card: weapon and four stats read', card.weaponName === 'Soma Prime' && card.stats.map(x => x.key).join() === 'critChance,critDamage,multishot,zoom' && card.stats[3].neg, true);
  eq('Riven card: x1.24 faction = +24', R2.parseCardText('x1.24 Damage to Grineer', data.weapons, soma).stats[0].value, 24, 1e-9);
  const jobs = [...R2.bestStatsJobs(soma, { forced: ['critChance'], excluded: ['multishot'], negative: null })];
  eq('Roll scanner: forced and excluded stats respected', jobs.length > 0 && jobs.every(j => j.keys.includes('critChance') && !j.keys.includes('multishot') && !j.neg), true);
  const avg = R2.averageRiven(['critChance'], null, soma).stats[0].value, top = R2.averageRiven(['critChance'], null, soma, 1.1).stats[0].value;
  eq('Roll scanner: perfect roll = 1.1 x average', top / avg, 1.1, 1e-9);
}

// 30. Critical headshots, armor above 2700 and the 1-damage floor per type (wiki Critical_Hit, Enemy_Body_Parts, Armor),
//     Heat stacks that share one timer (wiki Damage/Heat_Damage) checked against the shot-by-shot simulation
{
  const crit = (faction, extra = {}) => {
    const w = testWeapon({ impact: 100 });
    w.attacks[0].critChance = 2; w.attacks[0].critMult = 2;
    return E.calculate(Object.assign({ weapon: w, riven: [{ stat: 'critDamage', value: 1.2 }], enemy: { faction, headshotRate: 1 } }, extra), data);
  };
  // Critical_Hit wiki: headcrit tier 2 = 1 + 2 x (2 x 2.0 x (1 + 1.2) - 1) = 16.6, times the 3.0 headshot multiplier
  const grineer = crit('Grineer');
  eq('Headcrit tier 2: 1 + 2 x (2 x 2.0 x 2.2 - 1) = 16.6 (wiki)', grineer.stats.avgCritHead, 16.6, 1e-9);
  eq('Headcrit x 3.0 headshot = 49.8 (wiki)', grineer.stats.avgCritHead * grineer.stats.headshotMultiplier, 49.8, 1e-9);
  // Corpus humanoid heads do not take the headcrit bonus (Enemy_Body_Parts): tier 2 = 1 + 2 x 3.4 = 7.8
  eq('Corpus head: no headcrit, tier 2 = 7.8', crit('Corpus').stats.avgCritHead, 7.8, 1e-9);
  eq('Corpus head flag can be overridden on the enemy', crit('Corpus', { enemy: { faction: 'Corpus', headshotRate: 1, headcrit: true } }).stats.avgCritHead, 16.6, 1e-9);

  // Armor above 2700 (Armor wiki, exceptional conditions): damage multiplier = 300 / (armor + 300)
  eq('Armor 3000: 300 / 3300 damage taken', E.calculate({ weapon: testWeapon({ impact: 100 }), enemy: { armor: 3000 } }, data).stats.armorDamageMultiplier, 300 / 3300, 1e-9);
  eq('Armor 2700 is still 90% DR (continuous at the cap)', E.calculate({ weapon: testWeapon({ impact: 100 }), enemy: { armor: 2700 } }, data).stats.armorDamageMultiplier, 0.1, 1e-9);
  // Each damage type takes at least 1 through armor (Armor wiki: "minimum damage of 1")
  eq('Three 1-damage types vs 2700 armor deal 3 (1 each)', E.calculate({ weapon: testWeapon({ impact: 1, puncture: 1, slash: 1 }), enemy: { armor: 2700 } }, data).perShotVsEnemy, 3, 1e-6);
  eq('The 1-damage floor does not apply without armor (3 x 1.03125 quantized)', E.calculate({ weapon: testWeapon({ impact: 1, puncture: 1, slash: 1 }) }, data).perShotVsEnemy, 3 * 1.03125, 1e-3);

  // Heat: with almost no procs each one ticks the usual 6 times (1 s delay, 6 s duration)
  const heatW = (sc, fr) => { const w = testWeapon({ heat: 100 }); w.fireRate = fr; w.attacks[0].fireRate = fr; w.attacks[0].statusChance = sc; return w; };
  eq('Heat with almost no procs: 6 ticks per proc (no fight length, steady state)', E.calculate({ weapon: heatW(0.00001, 1), conditions: { selfStatus: false } }, data).dots.heat.ticks, 6, 1e-3);
  // In a 60 s fight the procs are spread over it, so ticks near the end are cut: average = sum of (60 - x) / 60 over x = 1..6 = 5.65
  eq('Heat with almost no procs in a 60 s fight: 5.65 ticks per proc', E.calculate({ weapon: heatW(0.00001, 1), conditions: { selfStatus: false, fightSeconds: 60 } }, data).dots.heat.ticks, 5.65, 1e-2);
  // Heat ticks grow smoothly as procs refresh the shared timer (no jump at 3 procs per duration)
  const ht = sc => E.calculate({ weapon: heatW(sc, 10), conditions: { selfStatus: false } }, data).dots.heat.ticks;
  eq('Heat tick count is continuous across 3 procs per duration (3.0 vs 2.98)', Math.abs(ht(0.05) - ht(0.0497)) / ht(0.05) < 0.02, true);
  eq('Heat refresh: more ticks per proc than the 6 base ticks', ht(0.05) > 6, true);
  eq('Heat without a fight length: a refreshed stack counts for at most 20 s (20 ticks)', ht(1) <= 20 + 1e-9 && ht(1) > 19, true);
  // Shot-by-shot simulation (procs per pellet, Heat stacks refreshed by later procs) against the formula, 60 s fight
  const hw = E.calculate({ weapon: heatW(0.05, 10), conditions: { selfStatus: false, fightSeconds: 60 } }, data);
  const hs = global.WF.sim.simulate(hw, { seconds: 60, runs: 300, seed: 11 });
  eq('Heat sim matches the formula within 3% (refresh regime, 60 s)', Math.abs(hs.mean / hw.dps.sustainedTotal - 1) < 0.03, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
