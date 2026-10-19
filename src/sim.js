/*
 * Shot-by-shot simulation and combat log.
 * Rolls every random part of the fight the way the game does (pellet count from fractional multishot, crit tier per
 * pellet, headshots at your headshot rate, status procs per pellet and which status, Slash from Hunter Munitions-style
 * crits), using the per-hit numbers the main calculation already worked out. Runs it many times and reports the
 * spread: min, 10th percentile, median, 90th percentile, max.
 * ASSUMPTION: enemy statuses (Viral, Corrosive...) and buff stacks use the long-run average from the main calculation,
 * so the spread shows luck, not ramp-up (the Simulacrum timeline shows ramp-up). DoT ticks from procs land after the
 * window ends are not counted. Heat stacks share one timer that every proc resets, as in the engine (heatTicksPerProc).
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});

  // small seeded generator so a run can be repeated (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const roll = (rand, x) => Math.floor(x) + (rand() < x - Math.floor(x) ? 1 : 0);

  function runOnce(r, o, rand, log) {
    const s = r.stats;
    const T = o.seconds;
    const fr = s.effectiveFireRate;
    if (!(fr > 0)) return { total: 0, events: [], perSecond: [] };
    const isMelee = o.melee;
    const mag = s.magazine >= 1 && s.reload > 0 && !isMelee ? s.magazine : Infinity;
    const critAvg = s.critAvg || 1;
    const weights = Object.entries(r.procWeights || {}).filter(([, w]) => w > 0);
    const wSum = weights.reduce((a, [, w]) => a + w, 0) || 1;
    const pickType = () => { let x = rand() * wSum; for (const [k, w] of weights) { x -= w; if (x <= 0) return k; } return weights.length ? weights[weights.length - 1][0] : null; };
    const dots = r.dots || {};
    const perSecond = new Array(Math.ceil(T)).fill(0);
    const ticks = []; // [time, damage]
    const heatProcs = []; // Heat procs, resolved into stacks after the fight (they share one timer)
    const events = [];
    let t = 0, left = mag, total = 0, shot = 0;
    const add = (time, dmg) => { if (time < T) { total += dmg; perSecond[Math.min(perSecond.length - 1, Math.floor(time))] += dmg; } };
    while (t < T) {
      shot++;
      const pellets = Math.max(1, roll(rand, s.multishot));
      let dmg = 0, crits = [0, 0, 0, 0], heads = 0; const procs = {};
      for (let p = 0; p < pellets; p++) {
        const head = s.headshotRate > 0 && rand() < s.headshotRate;
        if (head) heads++;
        const cc = head ? (s.critChanceHead != null ? s.critChanceHead : s.critChance) : s.critChance;
        const tier = roll(rand, Math.max(0, cc));
        crits[Math.min(3, tier)]++;
        // a critical headshot uses the headcrit multiplier (base crit x2) only when that enemy's head has the flag
        const cdUse = head ? (s.critMultiplierHead != null ? s.critMultiplierHead : s.critMultiplier) : s.critMultiplier;
        let mult = 1 + tier * (cdUse - 1);
        if (head) mult *= s.headshotMultiplier;
        const hit = s.vsNonCrit * mult;
        dmg += hit;
        // status procs on this pellet; DoT ticks inherit this pellet's crit (scaled from the average-crit tick)
        let n = roll(rand, Math.max(0, s.statusChance));
        const list = [];
        for (let k = 0; k < n; k++) { const ty = pickType(); if (ty) list.push(ty); }
        if (tier >= 1 && s.slashOnCrit > 0 && rand() < Math.min(1, s.slashOnCrit)) list.push('slash');
        for (const ty of list) {
          procs[ty] = (procs[ty] || 0) + 1;
          const d = dots[ty];
          if (d && d.tick > 0) {
            const tickDmg = d.tick * mult / critAvg;
            if (ty === 'heat') heatProcs.push({ t, tickDmg, delay: d.delay || 0, dur: d.duration || 6 });
            else for (let k = 0; k < (d.fullTicks || 0); k++) ticks.push([t + (d.delay || 0) + k, tickDmg]);
          }
        }
      }
      add(t, dmg);
      if (log && events.length < o.logLimit) events.push({ t, kind: 'shot', n: shot, pellets, crits, heads, procs, dmg });
      left--;
      if (left <= 0 && mag !== Infinity) {
        if (log && events.length < o.logLimit) events.push({ t: t + 1 / fr, kind: 'reload', dur: s.reload });
        t += 1 / fr + s.reload; left = mag;
      } else t += 1 / fr;
    }
    for (const [time, dmg] of ticks) add(time, dmg);
    // Heat: every proc resets the one timer that all Heat stacks share (wiki: Damage/Heat Damage). Procs less than one
    // duration apart belong to the same episode; each stack ticks once a second until the episode's last proc + duration.
    let heatDot = 0;
    heatProcs.sort((x, y) => x.t - y.t);
    for (let i = 0; i < heatProcs.length;) {
      let j = i;
      while (j + 1 < heatProcs.length && heatProcs[j + 1].t - heatProcs[j].t < heatProcs[j].dur) j++;
      const death = heatProcs[j].t + heatProcs[j].dur;
      for (let q = i; q <= j; q++) {
        const hp = heatProcs[q];
        for (let x = hp.t + hp.delay; x <= death + 1e-9; x += 1) { add(x, hp.tickDmg); if (x < T) heatDot += hp.tickDmg; }
      }
      i = j + 1;
    }
    const dotTotal = ticks.filter(x => x[0] < T).reduce((a, x) => a + x[1], 0) + heatDot;
    return { total, dps: total / T, events, perSecond, dotTotal };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  /**
   * @param r  a result from WF.engine.calculate
   * @param o  { seconds: 20, runs: 300, seed, melee, logLimit: 80 }
   */
  function simulate(r, o) {
    o = Object.assign({ seconds: 20, runs: 300, seed: 12345, melee: false, logLimit: 80 }, o || {});
    const rand = rng(o.seed);
    const dps = [];
    let first = null;
    for (let i = 0; i < o.runs; i++) {
      const one = runOnce(r, o, rand, i === 0);
      if (i === 0) first = one;
      dps.push(one.dps);
    }
    const sorted = dps.slice().sort((a, b) => a - b);
    const mean = dps.reduce((a, b) => a + b, 0) / (dps.length || 1);
    return {
      seconds: o.seconds, runs: o.runs,
      min: sorted[0] || 0, p10: quantile(sorted, 0.1), median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), max: sorted[sorted.length - 1] || 0, mean,
      all: sorted, log: first.events, perSecond: first.perSecond, firstDps: first.dps
    };
  }

  WF.sim = { simulate, rng };
})();
