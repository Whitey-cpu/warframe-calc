/*
 * Build optimizer: searches mod (and arcane) combinations that maximize a chosen metric
 * under a scenario (enemy, buffs, conditions). Greedy fill + local search (replace and
 * reorder moves, reorder matters for element combos) + a few randomized restarts.
 * Mod capacity / forma is NOT modeled: it assumes you can fit the mods.
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

  function optimize(opts, data) {
    const weapon = typeof opts.weapon === 'object' ? opts.weapon : E.findWeapon(data, opts.weapon);
    if (!weapon) throw new Error(`Weapon not found: ${opts.weapon}`);
    const metric = opts.metric || 'sustainedTotal';
    const slots = opts.slots || 8;
    const useExilus = opts.exilus !== false;
    const excluded = new Set((opts.excluded || []).map(s => s.toLowerCase()));
    const locked = (opts.locked || []).filter(Boolean);
    const useArcane = opts.arcane !== false;

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

    const scen = {
      weapon, attack: opts.attack, enemy: opts.enemy, buffs: opts.buffs, customBuffs: opts.customBuffs,
      conditions: opts.conditions, riven: opts.riven, overrides: opts.overrides
    };
    let evals = 0;
    const cache = new Map();
    function score(state) {
      const key = state.mods.join('|') + '#' + (state.exilus || '') + '#' + (state.arcane || '');
      if (cache.has(key)) return cache.get(key);
      const names = state.mods.filter(Boolean).concat(state.exilus ? [state.exilus] : []);
      let s = -1;
      if (!conflicts(names)) {
        evals++;
        const res = E.calculate(Object.assign({}, scen, {
          mods: state.mods.concat(state.exilus ? [state.exilus] : []).filter(Boolean),
          arcanes: [].concat(opts.fixedArcanes || [], state.arcane ? [state.arcane] : [])
        }), data);
        s = metric === 'perShotVsEnemy' ? res.perShotVsEnemy : res.dps[metric];
      }
      cache.set(key, s);
      return s;
    }

    const lockedNames = locked.map(n => { const m = E.findMod(data, weapon, n); return m ? m.name : n; });
    const freeIdx = [];
    function initState() {
      const mods = new Array(slots).fill(null);
      lockedNames.slice(0, slots).forEach((n, i) => { mods[i] = n; });
      freeIdx.length = 0;
      for (let i = lockedNames.length; i < slots; i++) freeIdx.push(i);
      return { mods, exilus: null, arcane: null };
    }

    function greedy(state, rng) {
      for (const i of freeIdx) {
        let best = null, bestS = -Infinity;
        const cands = rng ? shuffle(pool.slice(), rng).slice(0, Math.max(10, Math.floor(pool.length * 0.7))) : pool;
        for (const m of cands) {
          if (state.mods.includes(m.name)) continue;
          state.mods[i] = m.name;
          const s = score(state);
          if (s > bestS) { bestS = s; best = m.name; }
        }
        state.mods[i] = best;
      }
      if (useExilus) {
        let best = null, bestS = score(state);
        for (const m of exilusPool) {
          if (state.mods.includes(m.name)) continue;
          state.exilus = m.name; const s = score(state);
          if (s > bestS) { bestS = s; best = m.name; }
        }
        state.exilus = best;
      }
      if (arcanePool.length) {
        let best = null, bestS = score(state);
        for (const a of arcanePool) { state.arcane = a.name; const s = score(state); if (s > bestS) { bestS = s; best = a.name; } }
        state.arcane = best;
      }
      return state;
    }

    function localSearch(state) {
      let cur = score(state);
      let improved = true, passes = 0;
      while (improved && passes < 20) {
        improved = false; passes++;
        // replace moves
        for (const i of freeIdx) {
          const orig = state.mods[i];
          let best = orig, bestS = cur;
          for (const m of pool) {
            if (m.name === orig || state.mods.includes(m.name) || state.exilus === m.name) continue;
            state.mods[i] = m.name; const s = score(state);
            if (s > bestS + 1e-9) { bestS = s; best = m.name; }
          }
          state.mods[i] = best;
          if (best !== orig) { cur = bestS; improved = true; }
        }
        // reorder moves (element combination order)
        for (let a = 0; a < freeIdx.length; a++) for (let b = a + 1; b < freeIdx.length; b++) {
          const i = freeIdx[a], j = freeIdx[b];
          [state.mods[i], state.mods[j]] = [state.mods[j], state.mods[i]];
          const s = score(state);
          if (s > cur + 1e-9) { cur = s; improved = true; } else [state.mods[i], state.mods[j]] = [state.mods[j], state.mods[i]];
        }
        if (useExilus) {
          const orig = state.exilus; let best = orig, bestS = cur;
          for (const m of exilusPool.concat([null])) {
            const n = m && m.name;
            if (n && state.mods.includes(n)) continue;
            state.exilus = n; const s = score(state);
            if (s > bestS + 1e-9) { bestS = s; best = n; }
          }
          state.exilus = best; if (best !== orig) { cur = bestS; improved = true; }
        }
        if (arcanePool.length) {
          const orig = state.arcane; let best = orig, bestS = cur;
          for (const a of arcanePool) { state.arcane = a.name; const s = score(state); if (s > bestS + 1e-9) { bestS = s; best = a.name; } }
          state.arcane = best; if (best !== orig) { cur = bestS; improved = true; }
        }
      }
      return cur;
    }

    let bestState = null, bestScore = -Infinity;
    const restarts = opts.restarts != null ? opts.restarts : 4;
    for (let r = 0; r <= restarts; r++) {
      const rng = r === 0 ? null : mulberry32(1234 + r);
      const st = greedy(initState(), rng);
      const s = localSearch(st);
      if (s > bestScore) { bestScore = s; bestState = JSON.parse(JSON.stringify(st)); }
    }

    const finalBuild = Object.assign({}, scen, {
      weapon: weapon.name,
      mods: bestState.mods.concat(bestState.exilus ? [bestState.exilus] : []).filter(Boolean),
      arcanes: [].concat(opts.fixedArcanes || [], bestState.arcane ? [bestState.arcane] : [])
    });
    const result = E.calculate(finalBuild, data);
    const drain = finalBuild.mods.reduce((t, n) => { const m = E.findMod(data, weapon, n); return t + (m ? m.drain + m.maxRank : 0); }, 0);
    return {
      metric, score: bestScore, mods: bestState.mods.filter(Boolean), exilus: bestState.exilus, arcane: bestState.arcane,
      maxRankDrain: drain, evaluations: evals, candidates: pool.length, build: finalBuild, result,
      notes: ['Mod capacity, polarities and forma are not modeled; total max-rank drain shown for reference.',
        'Incompatibility rules: same-mod variants plus the list in src/static.js. Check that the result can be equipped in game.']
    };
  }

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  WF.optimizer = { optimize, arcaneTypesFor };
})();
