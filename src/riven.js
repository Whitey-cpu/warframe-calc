/*
 * Riven mods: stat ranges, grading, splicing and engine effects.
 * Source for every number here: https://wiki.warframe.com/w/Riven_Mods (Attribute Value Formula, Base Values,
 * Spliced Values, Splicing, Trait Locking), read 2026-10-22, plus DE's patch notes: Update 44.0 (Trait Locking),
 * Update 44.1 (Riven Splicing recipes) and Hotfix 44.1.3 (Riven Dispositions removed).
 *
 *   value = b x 10 x (rank + 1) x 1.2 x L x W        (wiki "Detailed Explanation of Attribute Value Formula")
 *   b: base coefficient per stat and weapon class. The tables below store b x 90, the rank 8 value at 1.0.
 *   1.2: since Hotfix 44.1.3 (2026-10-22) every riven uses this one multiplier. Before it, each weapon had its own
 *        Disposition (0.5 to 1.55). data/old-dispositions.json keeps the old numbers so old card values can be converted.
 *   L: 2 bonus 0 malus 0.99 | 2 bonus 1 malus 1.2375 / -0.495 | 3 bonus 0 malus 0.75 | 3 bonus 1 malus 0.9375 / -0.75
 *   W: 0.9 + 0.2u, where u (0 to 1) is the trait's roll quality.
 *
 * ASSUMPTION: riven capacity drain is 18 at rank 8 unless the user enters another number (riven cards differ).
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});

  const TYPES = ['rifle', 'shotgun', 'pistol', 'archgun', 'melee'];
  const TYPE_LABEL = { rifle: 'Rifle', shotgun: 'Shotgun', pistol: 'Pistol', archgun: 'Archgun', melee: 'Melee / Zaw' };
  const ALL = v => [v, v, v, v, v];
  const RANGED = v => [v, v, v, v, null];
  const MELEE = v => [null, null, null, null, v];

  // unit: '%' percent, 'x' faction multiplier (stored as percent: 45 = x1.45), 'm' metres, 's' seconds, '' flat
  // fx: how the engine uses it. null = not modeled for damage (still shown, graded and saved).
  const STATS = [
    { key: 'comboChance', label: 'Additional Combo Count Chance', unit: '%', base: MELEE(58.77), posOnly: true, fx: null },
    { key: 'gainCombo', label: 'Chance to Gain Combo Count', unit: '%', base: MELEE(104.85), negOnly: true, fx: null },
    { key: 'ammoMax', label: 'Ammo Maximum', unit: '%', base: [49.95, 90, 90, 99.9, null], fx: null },
    { key: 'vsCorpus', label: 'Damage vs. Corpus', unit: 'x', base: ALL(45), fx: { stat: 'faction', faction: 'Corpus' } },
    { key: 'vsGrineer', label: 'Damage vs. Grineer', unit: 'x', base: ALL(45), fx: { stat: 'faction', faction: 'Grineer' } },
    { key: 'vsInfested', label: 'Damage vs. Infested', unit: 'x', base: ALL(45), fx: { stat: 'faction', faction: 'Infested' } },
    { key: 'cold', label: 'Cold Damage', unit: '%', base: [90, 90, 90, 119.7, 90], posOnly: true, fx: { stat: 'element', element: 'cold' } },
    { key: 'comboDuration', label: 'Combo Duration', unit: 's', base: MELEE(8.1), fx: null },
    { key: 'critChance', label: 'Critical Chance', unit: '%', base: [149.99, 90, 149.99, 99.9, 180], fx: { stat: 'critChance' } },
    { key: 'slideCrit', label: 'Critical Chance for Slide Attack', unit: '%', base: MELEE(120), fx: null },
    { key: 'critDamage', label: 'Critical Damage', unit: '%', base: [119.997, 90, 90, 80.1, 90], fx: { stat: 'critDamage' } },
    { key: 'damage', label: 'Damage', meleeLabel: 'Melee Damage', unit: '%', base: [165, 164.7, 219.6, 99.9, 164.7], fx: { stat: 'damage' } },
    { key: 'electricity', label: 'Electricity Damage', unit: '%', base: [90, 90, 90, 119.7, 90], posOnly: true, fx: { stat: 'element', element: 'electricity' } },
    { key: 'heat', label: 'Heat Damage', unit: '%', base: [90, 90, 90, 119.7, 90], posOnly: true, fx: { stat: 'element', element: 'heat' } },
    { key: 'finisher', label: 'Finisher Damage', unit: '%', base: MELEE(119.7), fx: null },
    { key: 'fireRate', label: 'Fire Rate', meleeLabel: 'Attack Speed', unit: '%', base: [60.03, 90, 74.7, 60.03, 54.9], fx: { stat: 'fireRate' } },
    { key: 'projSpeed', label: 'Projectile Speed', unit: '%', base: [90, 90, 90, null, null], fx: null },
    { key: 'initialCombo', label: 'Initial Combo', unit: '', base: MELEE(24.5), fx: null },
    { key: 'impact', label: 'Impact', unit: '%', base: [119.97, 119.97, 119.97, 90, 119.7], physical: true, fx: { stat: 'element', element: 'impact' } },
    { key: 'magazine', label: 'Magazine Capacity', unit: '%', base: [49.995, 49.995, 49.995, 60.3, null], fx: { stat: 'magazine' } },
    { key: 'heavyEff', label: 'Heavy Attack Efficiency', unit: '%', base: MELEE(73.44), fx: null },
    { key: 'multishot', label: 'Multishot', unit: '%', base: [90, 119.7, 119.7, 60.3, null], fx: { stat: 'multishot' } },
    { key: 'toxin', label: 'Toxin Damage', unit: '%', base: [90, 90, 90, 119.7, 90], posOnly: true, fx: { stat: 'element', element: 'toxin' } },
    { key: 'punchThrough', label: 'Punch Through', unit: 'm', base: RANGED(2.7), posOnly: true, fx: null },
    { key: 'puncture', label: 'Puncture', unit: '%', base: [119.997, 119.997, 119.997, 90, 119.997], physical: true, fx: { stat: 'element', element: 'puncture' } },
    { key: 'reload', label: 'Reload Speed', unit: '%', base: [49.995, 49.995, 49.995, 99.9, null], fx: { stat: 'reloadSpeed' } },
    { key: 'range', label: 'Range', unit: 'm', base: MELEE(1.94), fx: null },
    { key: 'slash', label: 'Slash', unit: '%', base: [119.97, 119.97, 119.97, 90, 119.7], physical: true, fx: { stat: 'element', element: 'slash' } },
    { key: 'statusChance', label: 'Status Chance', unit: '%', base: [90, 90, 90, 60.3, 90], fx: { stat: 'statusChance' } },
    { key: 'statusDuration', label: 'Status Duration', unit: '%', base: ALL(99.99), fx: { stat: 'statusDuration' } },
    { key: 'recoil', label: 'Weapon Recoil', unit: '%', base: RANGED(90), fx: null, note: 'a positive roll reduces recoil' },
    { key: 'zoom', label: 'Zoom', unit: '%', base: [59.99, 41.994, 80.1, 59.99, null], fx: null }
  ];
  // Spliced traits (Riven Splicer): always positive, one per riven, value comes from the consumed traits' roll.
  const SPLICED = [
    { key: 'ammoEff', label: 'Ammo Efficiency', unit: '%', base: RANGED(45), fx: null, note: 'capped at 75% from all sources since Hotfix 44.1.3' },
    { key: 'blast', label: 'Blast Damage', unit: '%', base: ALL(90), fx: { stat: 'element', element: 'blast' } },
    { key: 'corrosive', label: 'Corrosive Damage', unit: '%', base: ALL(90), fx: { stat: 'element', element: 'corrosive' } },
    { key: 'vsOrokin', label: 'Damage vs. Orokin', unit: 'x', base: ALL(45), fx: { stat: 'faction', faction: 'Orokin' } },
    { key: 'vsScaldra', label: 'Damage vs. Scaldra', unit: 'x', base: ALL(45), fx: { stat: 'faction', faction: 'Scaldra' } },
    { key: 'vsTechrot', label: 'Damage vs. Techrot', unit: 'x', base: ALL(45), fx: { stat: 'faction', faction: 'Techrot' } },
    { key: 'gas', label: 'Gas Damage', unit: '%', base: ALL(90), fx: { stat: 'element', element: 'gas' } },
    { key: 'heavyWindup', label: 'Heavy Attack Wind Up Speed', unit: '%', base: MELEE(119.7), fx: null },
    { key: 'magnetic', label: 'Magnetic Damage', unit: '%', base: ALL(90), fx: { stat: 'element', element: 'magnetic' } },
    { key: 'heavyDamage', label: 'Melee Damage On Heavy Attack', unit: '%', base: MELEE(119.7), fx: null },
    { key: 'parryAngle', label: 'Parry Angle', unit: '%', base: MELEE(81), fx: null },
    { key: 'radiation', label: 'Radiation Damage', unit: '%', base: ALL(90), fx: { stat: 'element', element: 'radiation' } },
    { key: 'reloadHolstered', label: 'Reload While Holstered', unit: '%', base: [90, 90, 90, null, null], fx: null },
    { key: 'slam', label: 'Slam Attack Damage', unit: '%', base: MELEE(119.7), fx: null },
    { key: 'statusDamage', label: 'Status Damage', unit: '%', base: ALL(90), fx: { stat: 'statusDamage' } },
    { key: 'viral', label: 'Viral Damage', unit: '%', base: ALL(90), fx: { stat: 'element', element: 'viral' } },
    { key: 'weakPoint', label: 'Weak Point Damage', unit: '%', base: RANGED(225), fx: { stat: 'weakPoint' } },
    { key: 'weakPointCrit', label: 'Weak Point Critical Chance', unit: '%', base: RANGED(247.5), fx: { stat: 'weakPointCrit' } }
  ].map(s => Object.assign(s, { spliced: true, posOnly: true }));
  const BY_KEY = Object.fromEntries(STATS.concat(SPLICED).map(s => [s.key, s]));

  // Splice recipes (Update 44.1 patch notes; WARFRAME Wiki "Splicing")
  const RECIPES = {
    ranged: [['weakPoint', 'damage', 'zoom'], ['weakPoint', 'damage', 'multishot'], ['weakPointCrit', 'critChance', 'zoom'], ['weakPointCrit', 'critChance', 'multishot'],
      ['ammoEff', 'magazine', 'reload'], ['ammoEff', 'recoil', 'ammoMax'], ['reloadHolstered', 'ammoMax', 'reload'], ['reloadHolstered', 'ammoMax', 'magazine'], ['statusDamage', 'damage', 'statusChance']],
    melee: [['heavyDamage', 'heavyEff', 'comboChance'], ['heavyWindup', 'heavyEff', 'comboDuration'], ['parryAngle', 'fireRate', 'range'], ['slam', 'damage', 'fireRate'], ['statusDamage', 'damage', 'statusChance']],
    all: [['gas', 'toxin', 'heat'], ['corrosive', 'toxin', 'electricity'], ['viral', 'toxin', 'cold'], ['radiation', 'heat', 'electricity'], ['blast', 'heat', 'cold'],
      ['magnetic', 'electricity', 'cold'], ['vsOrokin', 'vsCorpus', 'vsGrineer'], ['vsTechrot', 'vsCorpus', 'vsInfested'], ['vsScaldra', 'vsInfested', 'vsGrineer']]
  };

  const MULT = { 2: { 0: [0.99, 0], 1: [1.2375, -0.495] }, 3: { 0: [0.75, 0], 1: [0.9375, -0.75] } };
  // Hotfix 44.1.3 (2026-10-22): "All Rivens now use the same multiplier for their possible value ranges, the equivalent
  // of 1.2 Disposition in the old system." https://www.warframe.com/en/patch-notes/pc/44-1-3
  const DISPOSITION = 1.2;
  const DISPO_RETIRED = '2026-10-22';
  // Hotfix 44.1.3 caps Ammo Efficiency at 75% from all sources combined
  const AMMO_EFF_CAP = 75;
  const ROLL_MIN = 0.9, ROLL_MAX = 1.1;
  const DEFAULT_DRAIN = 18;   // ASSUMPTION (see header)
  const MAX_RANK = 8;
  const NAME = 'Riven Mod';   // the slot / mod-card name used by the UI

  function typeFor(w) {
    if (!w) return 'rifle';
    const c = String(w.category || '').toLowerCase();
    if (/arch/.test(c) || /arch-?gun/i.test(w.type || '')) return 'archgun';
    if (c === 'melee') return 'melee';
    if (c === 'secondary') return 'pistol';
    if (/shotgun/i.test(w.type || '')) return 'shotgun';
    return 'rifle';
  }
  const ti = t => TYPES.indexOf(t);
  const statDef = key => BY_KEY[key] || null;
  const labelFor = (def, type) => (type === 'melee' && def.meleeLabel) || def.label;
  const baseFor = (def, type) => def ? def.base[ti(type)] : null;
  const available = (def, type) => baseFor(def, type) != null;
  const isBow = w => !!w && /bow/i.test(w.type || '');
  const rankScale = rank => (Math.max(0, Math.min(MAX_RANK, rank == null ? MAX_RANK : rank)) + 1) / (MAX_RANK + 1);

  function counts(riven) {
    const st = (riven && riven.stats || []).filter(s => s && statDef(s.key));
    const pos = st.filter(s => !s.neg).length, neg = st.filter(s => s.neg).length;
    // right after a splice one row waits for the random trait the game added; the layout itself did not change
    const lay = riven && riven.pending && riven.pending.layout;
    return lay ? { pos: Math.max(pos, lay.pos), neg: Math.max(neg, lay.neg), list: st, pending: true } : { pos, neg, list: st };
  }
  function multipliers(nPos, nNeg) {
    const p = Math.min(3, Math.max(2, nPos || 2));
    return MULT[p][nNeg ? 1 : 0];
  }
  // [min, max] magnitude of one stat (always positive numbers; negatives are shown with a minus sign)
  function range(key, weapon, nPos, nNeg, neg, rank) {
    const def = statDef(key);
    const type = typeFor(weapon);
    const b = baseFor(def, type);
    if (b == null) return null;
    const dispo = DISPOSITION;
    const [mp, mn] = multipliers(nPos, nNeg);
    const m = neg ? Math.abs(mn) : mp;
    if (!m) return null;
    const bow = key === 'fireRate' && isBow(weapon) ? 2 : 1;   // wiki: "Fire Rate (x2 for Bows)"
    const center = b * dispo * m * bow * rankScale(rank);
    return { min: center * ROLL_MIN, max: center * ROLL_MAX, avg: center };
  }
  const valueAt = (r, pos01) => r.min + (r.max - r.min) * Math.max(0, Math.min(1, pos01));

  // ----- the old per-weapon Disposition (before Hotfix 44.1.3), for converting old card values -----
  // old: the parsed data/old-dispositions.json. Names in DE's list sometimes carry the weapon class in brackets
  // ("Catchmoon (primary)") or differ slightly from the data names, so a few spellings are tried.
  const OLD_ALIASES = { 'dual kamas prime': 'dual kama prime', 'korumm': 'korrum', 'vinquibus': 'vinquibus (rifle)' };
  function oldDisposition(weapon, old) {
    if (!weapon) return null;
    const flat = {};
    if (old && old.categories) for (const c in old.categories) for (const n in old.categories[c]) flat[n.toLowerCase()] = old.categories[c][n];
    const n = String(weapon.name || '').toLowerCase();
    const cls = weapon.category === 'Secondary' ? 'secondary' : weapon.category === 'Melee' ? 'melee' : 'primary';
    for (const k of [n, `${n} (${cls})`, `${n} (rifle)`, OLD_ALIASES[n]]) if (k && flat[k] != null) return { value: flat[k], from: 'patch notes' };
    // not in DE's list: fall back to the weapon data's own number (also from before the hotfix)
    return weapon.omega ? { value: weapon.omega, from: 'weapon data' } : null;
  }
  // A value read from a riven card before Hotfix 44.1.3 -> the same roll today
  const convertOld = (value, oldDispo) => oldDispo > 0 ? value * DISPOSITION / oldDispo : value;
  function convertRiven(riven, oldDispo) {
    const r = JSON.parse(JSON.stringify(riven || empty()));
    r.stats = (r.stats || []).map(s => Object.assign(s, { value: +convertOld(Math.abs(+s.value || 0), oldDispo).toFixed(2) }));
    r.era = 'v44.1.3';
    return r;
  }

  // ----- Riven Splicing (wiki "Splicing", Update 44.1) -----
  function recipesFor(weapon) {
    const type = typeFor(weapon);
    return RECIPES.all.concat(type === 'melee' ? RECIPES.melee : RECIPES.ranged).filter(([out, a, b]) => available(statDef(out), type) && available(statDef(a), type) && available(statDef(b), type));
  }
  // Recipes this riven can use now: both ingredients on it (either may be the negative), no spliced trait yet
  function spliceOptions(riven, weapon) {
    const c = counts(riven);
    if (c.list.some(s => statDef(s.key).spliced)) return [];
    return recipesFor(weapon).filter(([, a, b]) => c.list.some(s => s.key === a) && c.list.some(s => s.key === b));
  }
  // Apply a splice. The wiki: both traits are consumed, the spliced trait is always positive and "inherits the higher
  // random value out of the consumed stats" (the true roll, also for a negative), and a random trait takes the freed
  // place with the same polarity as the consumed traits. The random trait is unknown here, so its row is left empty
  // (pending: true) for the user to fill in with what the game gave.
  function splice(riven, weapon, recipe) {
    const [out, a, b] = recipe;
    const c = counts(riven);
    const g = grade(riven, weapon, MAX_RANK).rows;
    const u = Math.max(...[a, b].map(k => { const r = g.find(x => x.key === k && x.ok); return r ? r.pos : 0.5; }));
    const consumed = c.list.filter(s => s.key === a || s.key === b);
    const negConsumed = consumed.some(s => s.neg);
    const keep = c.list.filter(s => s.key !== a && s.key !== b);
    const rr = range(out, weapon, c.pos, c.neg, false, MAX_RANK);
    const spliced = { key: out, value: rr ? +valueAt(rr, u).toFixed(2) : 0, neg: false };
    const r = Object.assign({}, riven, { stats: [spliced].concat(keep) });
    r.pending = { neg: negConsumed, layout: { pos: c.pos, neg: c.neg } };
    return { riven: r, roll: u, pendingNegative: negConsumed };
  }

  // Problems with the current stat layout (empty array = valid)
  function validate(riven, weapon) {
    const type = typeFor(weapon);
    const c = counts(riven);
    const out = [];
    if (c.pending) out.push('Fill in the trait the splice added (empty row).');
    else if (c.pos < 2) out.push('A riven has 2 or 3 positive stats.');
    if (c.pos > 3) out.push('A riven has at most 3 positive stats.');
    if (c.neg > 1) out.push('A riven has at most 1 negative stat.');
    const seen = new Set();
    let spliced = 0;
    c.list.forEach(s => {
      const def = statDef(s.key);
      if (seen.has(s.key)) out.push(`${def.label} appears twice.`);
      seen.add(s.key);
      if (!available(def, type)) out.push(`${labelFor(def, type)} does not roll on ${TYPE_LABEL[type]} rivens.`);
      if (s.neg && def.posOnly) out.push(`${labelFor(def, type)} cannot be a negative stat.`);
      if (!s.neg && def.negOnly) out.push(`${labelFor(def, type)} can only be a negative stat.`);
      if (def.spliced) spliced++;
    });
    if (spliced > 1) out.push('Only one spliced trait fits on a riven.');
    return out;
  }

  // Where each entered value sits in its possible range: roll 0.9-1.1, pos 0-1, quality 0-1 (1 = best for you)
  function grade(riven, weapon, rank) {
    const c = counts(riven);
    const rows = c.list.map(s => {
      const r = range(s.key, weapon, c.pos, c.neg, s.neg, rank);
      if (!r) return { key: s.key, ok: false };
      const mag = Math.abs(+s.value || 0);
      const roll = mag / r.avg;
      const pos = (roll - ROLL_MIN) / (ROLL_MAX - ROLL_MIN);
      const outside = roll < ROLL_MIN - 0.004 || roll > ROLL_MAX + 0.004;
      const p = Math.max(0, Math.min(1, pos));
      return { key: s.key, neg: !!s.neg, ok: true, roll, pos: p, quality: s.neg ? 1 - p : p, outside, range: r };
    });
    const good = rows.filter(r => r.ok);
    const overall = good.length ? good.reduce((t, r) => t + r.quality, 0) / good.length : null;
    return { rows, overall, letter: overall == null ? '-' : letter(overall) };
  }
  // This site's own scale (not an official or community standard)
  function letter(q) { return q >= 0.9 ? 'S' : q >= 0.75 ? 'A' : q >= 0.5 ? 'B' : q >= 0.25 ? 'C' : 'D'; }

  // Engine effects for the build. Values on the card are rank 8; a lower slot rank scales them (ASSUMPTION above).
  // Elements are listed bottom-up, as the wiki notes say riven elements combine in that order.
  function toEffects(riven, rank) {
    const sc = rankScale(rank) / rankScale(MAX_RANK);
    const out = [], elems = [];
    counts(riven).list.forEach(s => {
      const def = statDef(s.key);
      if (!def.fx) return;
      const v = (s.neg ? -1 : 1) * Math.abs(+s.value || 0) * sc;
      const e = Object.assign({}, def.fx, { value: def.unit === '%' || def.unit === 'x' ? v / 100 : v, source: 'riven' });
      (e.stat === 'element' ? elems : out).push(e);
    });
    return out.concat(elems.reverse());
  }
  function notModeled(riven) {
    return counts(riven).list.filter(s => !statDef(s.key).fx).map(s => s.key);
  }

  function fmtValue(def, v, neg) {
    const n = Math.abs(+v || 0);
    if (def.unit === 'x') return 'x' + (neg ? (1 - n / 100) : (1 + n / 100)).toFixed(2);
    const num = n >= 100 ? n.toFixed(1) : n.toFixed(n >= 10 ? 1 : 2);
    return (neg ? '-' : '+') + num + (def.unit === '%' ? '%' : def.unit);
  }
  function lines(riven, weapon) {
    const type = typeFor(weapon);
    return counts(riven).list.map(s => { const d = statDef(s.key); return `${fmtValue(d, s.value, s.neg)} ${labelFor(d, type)}`; });
  }
  // Mod-card stand-in used by the slot grid, browser and capacity checker
  function synthMod(riven, weapon) {
    const drainMax = riven && riven.drain != null ? +riven.drain : DEFAULT_DRAIN;
    const ls = lines(riven, weapon);
    return { name: NAME, riven: true, rarity: 'Riven', maxRank: MAX_RANK, drain: Math.max(0, drainMax - MAX_RANK), polarity: (riven && riven.polarity) || 'madurai',
      stats: ls.length ? ls : ['No stats yet: open the Riven tab'], effects: [], unparsed: [], exilus: false, image: null, type: 'Riven Mod' };
  }
  const empty = () => ({ stats: [], drain: DEFAULT_DRAIN, polarity: 'madurai' });

  // Old builds stored the riven as raw effect rows; turn them into a riven model where the stat is known
  function fromLegacy(rows, enemyFaction) {
    const r = empty();
    const map = { damage: 'damage', critChance: 'critChance', critDamage: 'critDamage', statusChance: 'statusChance', multishot: 'multishot', fireRate: 'fireRate',
      magazine: 'magazine', reloadSpeed: 'reload', statusDuration: 'statusDuration', weakPoint: 'weakPoint', weakPointCrit: 'weakPointCrit', statusDamage: 'statusDamage' };
    const fac = { Grineer: 'vsGrineer', Corpus: 'vsCorpus', Infested: 'vsInfested', Orokin: 'vsOrokin', Corrupted: 'vsOrokin', Scaldra: 'vsScaldra', Techrot: 'vsTechrot' };
    (rows || []).forEach(e => {
      let key = e.stat === 'element' ? e.element : map[e.stat];
      if (e.stat === 'faction') key = fac[e.faction] || fac[enemyFaction] || null;
      if (!key || !statDef(key)) return;
      r.stats.push({ key, value: Math.abs(e.value) * 100, neg: e.value < 0 });
    });
    return r;
  }

  // ----- best stats for the current build -----
  // Every combination of 2 or 3 positive stats (average roll), with no negative or with one negative that does not
  // change damage in this model. Scored by the caller's score function.
  function candidateKeys(weapon, opts = {}) {
    const type = typeFor(weapon);
    const atk = weapon.attacks && weapon.attacks[opts.attack || 0] || (weapon.attacks || [])[0] || { damage: {} };
    const total = Object.values(atk.damage || {}).reduce((a, b) => a + b, 0) || 1;
    const fac = opts.factionKey;   // e.g. 'vsGrineer' for the current enemy
    const pool = STATS.concat(opts.spliced ? SPLICED : []).filter(d => available(d, type) && d.fx && !d.negOnly && (!d.physical || (atk.damage[d.key] || 0) / total > 0.25)) // ASSUMPTION: physical needs >25% of the hit
      .filter(d => d.fx.stat !== 'faction' || d.key === fac)
      .filter(d => !(opts.noAmmo && (d.key === 'magazine' || d.key === 'reload')));
    // harmless negatives: not modeled for damage, or a faction other than the current enemy's
    const harmless = STATS.filter(d => available(d, type) && !d.posOnly && (!d.fx || (d.fx.stat === 'faction' && d.key !== fac))).map(d => d.key);
    return { positives: pool.map(d => d.key), harmless };
  }
  function combos(keys, k) {
    const out = [];
    const rec = (start, acc) => { if (acc.length === k) { out.push(acc.slice()); return; } for (let i = start; i < keys.length; i++) { acc.push(keys[i]); rec(i + 1, acc); acc.pop(); } };
    rec(0, []);
    return out;
  }
  // roll: where in the 0.9 to 1.1 random range every stat lands (1 = average); a negative rolls the same way
  function averageRiven(keys, negKey, weapon, roll) {
    const q = roll || 1;
    const nPos = keys.length, nNeg = negKey ? 1 : 0;
    const stats = keys.map(k => ({ key: k, value: range(k, weapon, nPos, nNeg, false).avg * q, neg: false }));
    if (negKey) stats.push({ key: negKey, value: range(negKey, weapon, nPos, nNeg, true).avg * q, neg: true });
    return { stats };
  }
  // Roll scanner jobs. opts.forced: stats every combination must have; opts.excluded: stats to skip;
  // opts.negative: undefined = none or the first harmless one, null = never, or a stat key to always use.
  function* bestStatsJobs(weapon, opts = {}) {
    const { positives, harmless } = candidateKeys(weapon, opts);
    const forced = (opts.forced || []).filter(k => positives.includes(k));
    const pool = positives.filter(k => !(opts.excluded || []).includes(k) && !forced.includes(k));
    let neg;
    if (opts.allowNegative === false || opts.negative === null) neg = [null];
    else if (opts.negative) neg = [opts.negative];
    else neg = harmless.length ? [null, harmless[0]] : [null];
    for (const k of [3, 2]) {
      if (forced.length > k) continue;
      for (const c0 of combos(pool, k - forced.length)) {
        const c = forced.concat(c0);
        if (opts.spliced && c.filter(x => statDef(x).spliced).length > 1) continue;
        for (const n of neg) { if (n && c.includes(n)) continue; yield { keys: c, neg: n }; }
      }
    }
  }

  // ---------- reading a riven card (text from a screenshot) ----------
  // Lines look like "+123.4% Critical Chance", "-45.2% Zoom", "x1.24 Damage to Grineer" or "+2.1m Punch Through".
  // Returns the stats it recognised, the weapon named on the card (longest weapon name found) and lines it could not use.
  const ALIASES = { 'damage to grineer': 'vsGrineer', 'damage to corpus': 'vsCorpus', 'damage to infested': 'vsInfested', 'damage to orokin': 'vsOrokin',
    'damage to scaldra': 'vsScaldra', 'damage to techrot': 'vsTechrot', 'attack speed': 'fireRate', 'melee damage': 'damage', 'heat': 'heat', 'cold': 'cold',
    'toxin': 'toxin', 'electricity': 'electricity', 'recoil': 'recoil', 'magazine': 'magazine', 'status chance': 'statusChance' };
  const norm = t => String(t).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function matchStat(words, type) {
    const w = norm(words).replace(/^(to|vs) /, '');
    if (!w) return null;
    const defs = STATS.concat(SPLICED).filter(d => available(d, type));
    let best = null, bestScore = 0;
    for (const d of defs) {
      for (const lab of [d.label, d.meleeLabel].filter(Boolean)) {
        const L = norm(lab).replace(/ vs /, ' to ');
        if (w === L) return d.key;
        const a = new Set(w.split(' ')), b = L.split(' ');
        const hit = b.filter(x => a.has(x)).length;
        const sc = hit / Math.max(b.length, a.size);
        if (sc > bestScore) { bestScore = sc; best = d.key; }
      }
    }
    for (const [k, v] of Object.entries(ALIASES)) if (w === k || w.endsWith(' ' + k)) return available(statDef(v), type) ? v : null;
    return bestScore >= 0.6 ? best : null;
  }
  function parseCardText(text, weapons, currentWeapon) {
    const clean = String(text || '').replace(/[\u2212\u2013\u2014]/g, '-').replace(/,(?=\d)/g, '.');
    const all = (weapons || []).map(w => w.name).sort((a, b) => b.length - a.length);
    const flat = norm(clean);
    const named = all.find(n => (' ' + flat + ' ').includes(' ' + norm(n) + ' ')) || null;
    const weapon = (weapons || []).find(w => w.name === named) || currentWeapon || null;
    const type = typeFor(weapon);
    const stats = [], unmatched = [];
    for (const raw of clean.split(/\n+/)) {
      const line = raw.trim();
      const m = line.match(/([+\-]?)\s*(x)?\s*(\d+(?:\.\d+)?)\s*(%|m|s)?\s+([A-Za-z][A-Za-z .'-]{2,})/);
      if (!m) { if (/\d/.test(line)) unmatched.push(line); continue; }
      const key = matchStat(m[5], type);
      if (!key) { unmatched.push(line); continue; }
      const def = statDef(key);
      let v = parseFloat(m[3]), neg = m[1] === '-';
      if (m[2] || def.unit === 'x') {             // x1.24 -> +24, x0.86 -> 14 negative
        if (m[2]) { neg = v < 1; v = Math.abs(v - 1) * 100; }
      }
      if (stats.some(x => x.key === key)) continue;
      stats.push({ key, value: Math.round(v * 100) / 100, neg });
    }
    // a riven has at most one negative; with four stats and no minus sign, Weapon Recoil is the usual malus
    if (stats.length === 4 && !stats.some(x => x.neg)) { const rc = stats.find(x => x.key === 'recoil'); if (rc) rc.neg = true; }
    return { weaponName: named, stats: stats.slice(0, 4), unmatched };
  }

  WF.riven = { TYPES, TYPE_LABEL, STATS, SPLICED, RECIPES, MULT, NAME, MAX_RANK, DEFAULT_DRAIN, DISPOSITION, DISPO_RETIRED, AMMO_EFF_CAP,
    oldDisposition, convertOld, convertRiven, recipesFor, spliceOptions, splice, typeFor, statDef, labelFor, baseFor, available, range, valueAt,
    counts, multipliers, validate, grade, letter, toEffects, notModeled, fmtValue, lines, synthMod, empty, fromLegacy, candidateKeys, combos, averageRiven, bestStatsJobs, rankScale,
    parseCardText, matchStat };
})();
