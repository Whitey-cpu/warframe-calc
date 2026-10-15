/*
 * Build optimizer.
 * 1. Beam search: builds mod sets slot by slot, keeping the best few partial builds at every step. This finds
 *    combinations a one-mod-at-a-time greedy search misses (two element mods that only pay off together).
 * 2. Local search on the best results: replace one mod, replace two mods at once, reorder slots (element order),
 *    swap exilus and weapon arcane, until nothing improves.
 * Metrics: sustainedTotal, burstTotal, burstDirect, perShotVsEnemy, groupSustained (area damage on several
 * enemies), ttk (time to kill, lower is better; needs enemy health).
 * Mod capacity / forma is NOT enforced: it assumes you can fit the mods (the UI shows capacity separately).
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});
  const S = WF.STATIC;
  const E = WF.engine;

  const RELEVANT = new Set(['damage', 'directDamage', 'element', 'critChance', 'critChanceFlat', 'critDamage', 'statusChance',
    'multishot', 'fireRate', 'magazine', 'reloadSpeed', 'statusDuration', 'statusDamage', 'headshot', 'weakPoint', 'faction', 'slashOnCrit']);

  function arcaneTypesFor(weapon) {
    if (weapon.category === 'Primary') {
      const t = ['Primary Arcane'];
      if (weapon.type === 'Shotgun') t.push('Shotgun Arcane');
      if (weapon.type === 'Bow') t.push('Bow Arcane');
      return t;
    }
    if (weapon.category === 'Secondary') return ['Secondary Arcane'];
    if (weapon.category === 'Melee') return ['Melee Arcane'];
    return [];
  }

  function conflicts(names) {
    const roots = new Set();
    for (const n of names) {
      const r = E.variantRoot(n);
      if (roots.has(r)) return true;
      roots.add(r);
    }
    for (const [a, b] of S.INCOMPATIBLE) if (names.includes(a) && names.includes(b)) return true;
    return false;
  }

  function scoreOf(res, metric) {
    if (metric === 'ttk') return res.ttk && res.ttk.seconds > 0 ? 1 / res.ttk.seconds : 0;
    if (metric === 'perShotVsEnemy') return res.perShotVsEnemy;
    return res.dps[metric] || 0;
  }

  function optimize(opts, data) {
    const weapon = typeof opts.weapon === 'object' ? opts.weapon : E.findWeapon(data, opts.weapon);
    if (!weapon) throw new Error(`Weapon not found: ${opts.weapon}`);
    let metric = opts.metric || 'sustainedTotal';
    if (metric === 'ttk' && !(opts.enemy && opts.enemy.health > 0)) metric = 'sustainedTotal';
    const slots = opts.slots || 8;
    const useExilus = opts.exilus !== false;
    const excluded = new Set((opts.excluded || []).map(s => s.toLowerCase()));
    const locked = (opts.locked || []).filter(Boolean);
    const useArcane = opts.arcane !== false;
    const beamWidth = opts.beamWidth || 8;

    let pool = E.modsFor(data, weapon).filter(m =>
      !excluded.has(m.name.toLowerCase()) &&
      !/Riven/.test(m.type) &&
      m.effects.some(e => RELEVANT.has(e.stat) && !(e.onlyFor && e.onlyFor !== weapon.category)));
    if (opts.ownedOnly && opts.owned) {
      const own = new Set(opts.owned.map(s => s.toLowerCase()));
      pool = pool.filter(m => own.has(m.name.toLowerCase()));
    }
    const exilusPool = pool.filter(m => m.exilus);
    const arcanePool = useArcane ? data.arcanes.filter(a => arcaneTypesFor(weapon).includes(a.type) && !excluded.has(a.name.toLowerCase())
      && a.effects.some(e => RELEVANT.has(e.stat))) : [];

    const baseCond = Object.assign({}, opts.conditions || {});
    const scen = {
      weapon, attack: opts.attack, extraAttacks: opts.extraAttacks, enemy: opts.enemy, buffs: opts.buffs, customBuffs: opts.customBuffs,
      riven: opts.riven, overrides: opts.overrides, incarnon: opts.incarnon
    };
    // Fast scoring evaluates every candidate at one shared fight length (refreshed from the current best build's
    // exact fight length as the search moves), which avoids solving TTK = fight for each candidate.
    const useFight = !baseCond.fightSeconds && opts.enemy && opts.enemy.health > 0;
    let fastFight = null;
    let fastCond = Object.assign({}, baseCond, { iterations: 2 });
    let evals = 0;
    let cache = new Map();
    function setFight(mods, exilus, arcane) {
      if (!useFight) return;
      const res = E.calculate(Object.assign({}, scen, { conditions: baseCond, mods: mods.filter(Boolean).concat(exilus ? [exilus] : []),
        arcanes: [].concat(opts.fixedArcanes || [], arcane ? [arcane] : []) }), data);
      evals++;
      const T = res.fightSeconds;
      if (T && (!fastFight || Math.abs(Math.log(T / fastFight)) > 0.05)) {
        fastFight = T; fastCond = Object.assign({}, baseCond, { iterations: 2, fightSeconds: T });
        for (const k of [...cache.keys()]) if (!k.endsWith('!')) cache.delete(k);
      }
    }
    function score(mods, exilus, arcane, exact) {
      const names = mods.filter(Boolean).concat(exilus ? [exilus] : []);
      const key = names.join('|') + '#' + (arcane || '') + (exact ? '!' : '');
      if (cache.has(key)) return cache.get(key);
      let s = -1;
      if (!conflicts(names)) {
        evals++;
        const res = E.calculate(Object.assign({}, scen, {
          conditions: exact ? baseCond : fastCond,
          mods: names,
          arcanes: [].concat(opts.fixedArcanes || [], arcane ? [arcane] : [])
        }), data);
        s = scoreOf(res, metric);
      }
      cache.set(key, s);
      return s;
    }

    const lockedNames = locked.map(n => { const m = E.findMod(data, weapon, n); return m ? m.name : n; }).slice(0, slots);
    const free = slots - lockedNames.length;

    // pick a starting arcane: best single arcane on the locked mods (re-checked during local search)
    let arcane = null;
    setFight(lockedNames, null, null);
    if (arcanePool.length) {
      let best = score(lockedNames, null, null);
      for (const a of arcanePool) { const s = score(lockedNames, null, a.name); if (s > best) { best = s; arcane = a.name; } }
    }

    // ---- 1. beam search ----
    let beam = [{ mods: lockedNames.slice(), s: score(lockedNames, null, arcane) }];
    for (let depth = 0; depth < free; depth++) {
      const next = new Map();
      for (const st of beam) {
        for (const m of pool) {
          if (st.mods.includes(m.name)) continue;
          const mods = st.mods.concat([m.name]);
          const key = mods.slice().sort().join('|');
          if (next.has(key)) continue;
          const s = score(mods, null, arcane);
          if (s >= 0) next.set(key, { mods, s });
        }
      }
      if (!next.size) break;
      beam = [...next.values()].sort((a, b) => b.s - a.s).slice(0, beamWidth);
      setFight(beam[0].mods, null, arcane);
    }

    // ---- 2. local search on the top few beam results ----
    const freeIdx = []; for (let i = lockedNames.length; i < slots; i++) freeIdx.push(i);
    function improve(start) {
      const st = { mods: start.mods.concat(new Array(Math.max(0, slots - start.mods.length)).fill(null)).slice(0, slots), exilus: null, arcane };
      let cur = score(st.mods, st.exilus, st.arcane);
      let improved = true, passes = 0;
      while (improved && passes < 12) {
        improved = false; passes++;
        setFight(st.mods, st.exilus, st.arcane); cur = score(st.mods, st.exilus, st.arcane);
        // single replace (also fills empty slots); remember the best candidates per slot for pair moves
        const shortlist = new Map();
        for (const i of freeIdx) {
          const orig = st.mods[i]; let best = orig, bestS = cur; const tried = [];
          for (const m of pool) {
            if (m.name === orig || st.mods.includes(m.name) || st.exilus === m.name) continue;
            st.mods[i] = m.name; const s = score(st.mods, st.exilus, st.arcane);
            tried.push([m.name, s]);
            if (s > bestS + 1e-9) { bestS = s; best = m.name; }
          }
          st.mods[i] = best;
          if (best !== orig) { cur = bestS; improved = true; }
          shortlist.set(i, tried.sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]));
        }
        // pair replace: two slots at once from each slot's shortlist (finds element pairs like Heat + Cold)
        const cands = [...new Set([].concat(...shortlist.values()))].slice(0, 14);
        for (let a = 0; a < freeIdx.length; a++) for (let b = a + 1; b < freeIdx.length; b++) {
          const i = freeIdx[a], j = freeIdx[b];
          const oi = st.mods[i], oj = st.mods[j];
          let bi = oi, bj = oj, bestS = cur;
          for (const x of cands) for (const y of cands) {
            if (x === y) continue;
            if ((x !== oi && x !== oj && st.mods.includes(x)) || (y !== oi && y !== oj && st.mods.includes(y))) continue;
            st.mods[i] = x; st.mods[j] = y;
            const s = score(st.mods, st.exilus, st.arcane);
            if (s > bestS + 1e-9) { bestS = s; bi = x; bj = y; }
          }
          st.mods[i] = bi; st.mods[j] = bj;
          if (bi !== oi || bj !== oj) { cur = bestS; improved = true; }
        }
        // reorder (element combination order)
        for (let a = 0; a < freeIdx.length; a++) for (let b = a + 1; b < freeIdx.length; b++) {
          const i = freeIdx[a], j = freeIdx[b];
          [st.mods[i], st.mods[j]] = [st.mods[j], st.mods[i]];
          const s = score(st.mods, st.exilus, st.arcane);
          if (s > cur + 1e-9) { cur = s; improved = true; } else [st.mods[i], st.mods[j]] = [st.mods[j], st.mods[i]];
        }
        if (useExilus) {
          const orig = st.exilus; let best = orig, bestS = cur;
          for (const m of exilusPool.concat([null])) {
            const n = m && m.name;
            if (n && st.mods.includes(n)) continue;
            const s = score(st.mods, n, st.arcane);
            if (s > bestS + 1e-9) { bestS = s; best = n; }
          }
          st.exilus = best; if (best !== orig) { cur = bestS; improved = true; }
        }
        if (arcanePool.length) {
          const orig = st.arcane; let best = orig, bestS = cur;
          for (const a of arcanePool) { const s = score(st.mods, st.exilus, a.name); if (s > bestS + 1e-9) { bestS = s; best = a.name; } }
          st.arcane = best; if (best !== orig) { cur = bestS; improved = true; }
        }
      }
      return { st, s: score(st.mods, st.exilus, st.arcane, true) };
    }
    const tops = beam.slice(0, opts.refine || 3);
    let bestOut = null;
    for (const t of tops) { const o = improve(t); if (!bestOut || o.s > bestOut.s) bestOut = o; }
    const bestState = bestOut.st;

    const finalBuild = Object.assign({}, scen, {
      weapon: weapon.name, conditions: baseCond,
      mods: bestState.mods.filter(Boolean).concat(bestState.exilus ? [bestState.exilus] : []),
      arcanes: [].concat(opts.fixedArcanes || [], bestState.arcane ? [bestState.arcane] : [])
    });
    const result = E.calculate(finalBuild, data);
    const drain = finalBuild.mods.reduce((t, n) => { const m = E.findMod(data, weapon, n); return t + (m ? m.drain + m.maxRank : 0); }, 0);
    const shown = metric === 'ttk' ? (result.ttk ? result.ttk.seconds : null) : scoreOf(result, metric);
    return {
      metric, score: shown, mods: bestState.mods.filter(Boolean), exilus: bestState.exilus, arcane: bestState.arcane,
      maxRankDrain: drain, evaluations: evals, candidates: pool.length, build: finalBuild, result,
      notes: ['Mod capacity, polarities and forma are not enforced; check the capacity bar.',
        'Incompatibility rules: same-mod variants plus the list in src/static.js. Check that the result can be equipped in game.']
    };
  }

  WF.optimizer = { optimize, arcaneTypesFor, scoreOf };
})();
