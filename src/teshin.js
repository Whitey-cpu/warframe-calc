/*
 * Teshin: build advisor (fan-made; uses this site's damage engine and optimizer, nothing from DE or other sites).
 *  - lean(): does a weapon lean into crit, status or a hybrid? Runs the optimizer three times on the same scenario:
 *    best overall, crit-only (no status chance mods/arcanes) and status-only (no crit mods/arcanes), and compares.
 *  - patchIdeas(): mods/arcanes named in recent patch notes that fit this weapon, with what each adds to the build.
 *  - baseNotes(): plain facts about the weapon's base stats that explain the result.
 * The crit/status/hybrid thresholds are this site's own choice (opinion), stated in LEAN_RATIO.
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});
  const LEAN_RATIO = 1.15;   // one style must beat the other by 15% to be called crit or status; otherwise hybrid
  const CRIT_STATS = new Set(['critChance', 'critChanceFlat', 'critDamage', 'slashOnCrit']);
  const STATUS_STATS = new Set(['statusChance']);

  const hasStat = (it, set) => (it.effects || []).some(e => set.has(e.stat));
  function exclusions(data, weapon) {
    const E = WF.engine;
    const mods = E.modsFor(data, weapon);
    const pool = mods.concat(data.arcanes || []);
    return {
      critOnly: pool.filter(it => hasStat(it, STATUS_STATS)).map(it => it.name),   // crit build: no status chance
      statusOnly: pool.filter(it => hasStat(it, CRIT_STATS)).map(it => it.name)    // status build: no crit
    };
  }

  // scenario fields copied from a calculator build
  function scenario(build) {
    const keep = ['weapon', 'attack', 'enemy', 'buffs', 'customBuffs', 'conditions', 'riven', 'rivenSlot', 'incarnon', 'valence', 'weaponPassive', 'extraAttacks', 'overrides'];
    const s = {};
    keep.forEach(k => { if (build[k] !== undefined) s[k] = build[k]; });
    return s;
  }

  // Three optimizer runs (best, crit-only, status-only) as separate steps, so a page can run them one per tick
  function leanSteps(build, data, opts = {}) {
    const O = WF.optimizer, E = WF.engine;
    const weapon = typeof build.weapon === 'object' ? build.weapon : E.findWeapon(data, build.weapon);
    if (!weapon) throw new Error('Weapon not found');
    const ex = exclusions(data, weapon);
    const base = Object.assign(scenario(build), { metric: opts.metric || 'sustainedTotal', slots: opts.slots || 8, exilus: true, arcane: true,
      fixedArcanes: opts.fixedArcanes || [], beamWidth: opts.beamWidth || 6, locked: [] });
    const run = excluded => () => O.optimize(Object.assign({}, base, { excluded: (opts.excluded || []).concat(excluded) }), data);
    return { weapon, metric: base.metric, steps: { best: run([]), crit: run(ex.critOnly), status: run(ex.statusOnly) } };
  }
  function leanVerdict(weapon, data, best, crit, status, attack) {
    const E = WF.engine;
    const ratio = status.score > 0 ? crit.score / status.score : Infinity;
    const used = o => o.mods.concat(o.exilus ? [o.exilus] : [], o.arcane ? [o.arcane] : []).map(n => E.findMod(data, weapon, n) || E.findArcane(data, n)).filter(Boolean);
    const bestCrit = used(best).filter(it => hasStat(it, CRIT_STATS)).length;
    const bestStatus = used(best).filter(it => hasStat(it, STATUS_STATS)).length;
    let verdict = ratio >= LEAN_RATIO ? 'crit' : ratio <= 1 / LEAN_RATIO ? 'status' : 'hybrid';
    // the best build mixing both styles and clearly beating both single-style builds also reads as hybrid
    if (verdict !== 'hybrid' && bestCrit && bestStatus && best.score > Math.max(crit.score, status.score) * 1.1) verdict = 'hybrid';
    return { weapon: weapon.name, verdict, ratio, best, crit, status, bestCrit, bestStatus, notes: baseNotes(weapon, attack || 0) };
  }
  function lean(build, data, opts = {}) {
    const L = leanSteps(build, data, opts);
    return Object.assign(leanVerdict(L.weapon, data, L.steps.best(), L.steps.crit(), L.steps.status(), build.attack), { metric: L.metric });
  }

  // facts from the weapon's own numbers (no judgement beyond simple comparisons, labelled in the UI)
  function baseNotes(weapon, attackIdx) {
    const a = weapon.attacks[attackIdx] || weapon.attacks[0];
    const out = [];
    const cc = a.critChance, cd = a.critMult, sc = a.statusChance;
    const total = Object.values(a.damage || {}).reduce((x, y) => x + y, 0) || 1;
    const top = Object.entries(a.damage || {}).sort((x, y) => y[1] - x[1])[0];
    out.push(`Base critical chance ${(cc * 100).toFixed(0)}%, critical multiplier x${cd}, status chance ${(sc * 100).toFixed(0)}%.`);
    if (weapon.multishot > 1) out.push(`Fires ${weapon.multishot} pellets per shot; status chance is per pellet, so each shot rolls ${weapon.multishot} times.`);
    if (top) out.push(`Damage is ${Math.round(top[1] / total * 100)}% ${top[0]}${top[0] === 'slash' ? ' (Slash procs bypass armor)' : ''}.`);
    if (a.fireRate) out.push(`${weapon.category === 'Melee' ? 'Attack speed' : 'Fire rate'} ${a.fireRate}.`);
    return out;
  }

  // Mods and arcanes mentioned in recent patch notes that fit this weapon, scored on the current build:
  // the best result from putting each into an empty slot or in place of one current mod.
  function patchIdeas(build, data, releases, opts = {}) {
    const E = WF.engine;
    const weapon = typeof build.weapon === 'object' ? build.weapon : E.findWeapon(data, build.weapon);
    if (!weapon || !releases) return [];
    const metric = opts.metric || 'sustainedTotal';
    const score = b => { const r = E.calculate(b, data); return metric === 'perShotVsEnemy' ? r.perShotVsEnemy : (r.dps[metric] || 0); };
    const base = score(build);
    const fits = new Set(E.modsFor(data, weapon).map(m => m.name));
    const arcTypes = WF.optimizer.arcaneTypesFor(weapon);
    const seen = new Set();
    const out = [];
    for (const rel of releases.slice(0, opts.releases || 8)) {
      for (const m of rel.mentions || []) {
        if (seen.has(m.name)) continue;
        if (m.kind === 'Mod' && fits.has(m.name)) {
          seen.add(m.name);
          if ((build.mods || []).some(x => (typeof x === 'string' ? x : x.name) === m.name)) continue;
          const mods = (build.mods || []).slice();
          let bestGain = -Infinity, swap = null;
          const tries = mods.length < (opts.slots || 8) ? [null].concat(mods.map((_, i) => i)) : mods.map((_, i) => i);
          for (const i of tries) {
            const ms = mods.slice(); if (i == null) ms.push(m.name); else ms[i] = m.name;
            const g = score(Object.assign({}, build, { mods: ms })) / base - 1;
            if (g > bestGain) { bestGain = g; swap = i == null ? null : (typeof mods[i] === 'string' ? mods[i] : mods[i].name); }
          }
          out.push({ name: m.name, kind: 'Mod', gain: bestGain, replaces: swap, release: rel.title, url: rel.url, date: rel.date });
        } else if (m.kind === 'Arcane') {
          const a = E.findArcane(data, m.name);
          if (!a || !arcTypes.includes(a.type)) continue;
          seen.add(m.name);
          const arcs = (build.arcanes || []).filter(n => { const x = E.findArcane(data, n); return x && !arcTypes.includes(x.type); });
          const g = score(Object.assign({}, build, { arcanes: arcs.concat([m.name]) })) / base - 1;
          out.push({ name: m.name, kind: 'Arcane', gain: g, replaces: (build.arcanes || []).find(n => { const x = E.findArcane(data, n); return x && arcTypes.includes(x.type); }) || null, release: rel.title, url: rel.url, date: rel.date });
        }
      }
    }
    return out.sort((x, y) => y.gain - x.gain);
  }

  WF.teshin = { lean, leanSteps, leanVerdict, patchIdeas, baseNotes, exclusions, scenario, LEAN_RATIO };
})();
