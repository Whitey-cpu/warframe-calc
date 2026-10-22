/*
 * Riven crafting odds: chance per cycle, Kuva cost, Trait Locking and Riven Splicing plans.
 *
 * Game facts (sources):
 * - Kuva per cycle: 900, 1000, 1200, 1400, 1700, 2000, 2350, 2750, 3150, then 3500 from the 10th cycle on, counted per riven.
 *   A locked trait doubles the cost. Both: https://wiki.warframe.com/w/Riven_Mods (Cycling, Trait Locking)
 * - One trait can be locked while cycling. It keeps its value, and the riven keeps its number of positive and negative
 *   traits while a lock is on (Update 44.0 patch notes, https://www.warframe.com/en/patch-notes/pc/44-0-0).
 * - Riven Splicing: two listed traits become one spliced trait (always positive, keeps the higher roll of the two),
 *   a random trait of the same polarity fills the freed place, the layout is then fixed, and the spliced trait does not
 *   double the Kuva cost (wiki "Splicing", Update 44.1).
 * - After a cycle the game shows the old and the new version and you keep either one (wiki "Cycling").
 * - A riven never has the same trait as a positive and a negative (Hotfixes 44.0.1 and 44.0.2 removed those rolls).
 *
 * NOT PUBLISHED BY DE, used as defaults and labeled in the UI:
 * - COMMUNITY DATA: each layout (2 positive, 2 positive + 1 negative, 3 positive, 3 positive + 1 negative) comes up about
 *   1 time in 4 (forum math thread "Calculating Riven RNG Math", https://forums.warframe.com/topic/1526364-calculating-riven-rng-math/).
 *   The UI lets people change these numbers.
 * - COMMUNITY DATA: every trait the weapon can roll is equally likely, drawn without repeats (same thread).
 * - ASSUMPTION: a trait's roll quality u is uniform between 0 and 1 (the wiki gives W = 0.9 + 0.2u but no distribution).
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});
  const R = () => WF.riven;

  const COST = [900, 1000, 1200, 1400, 1700, 2000, 2350, 2750, 3150, 3500];
  const LAYOUTS = ['2-0', '2-1', '3-0', '3-1'];
  const LAYOUT_LABEL = { '2-0': '2 positive', '2-1': '2 positive, 1 negative', '3-0': '3 positive', '3-1': '3 positive, 1 negative' };
  const DEFAULT_LAYOUT_ODDS = { '2-0': 0.25, '2-1': 0.25, '3-0': 0.25, '3-1': 0.25 };   // COMMUNITY DATA (see header)

  // Kuva for cycle number n (1 = the first cycle of this riven)
  const cycleCost = (n, locked) => COST[Math.min(COST.length, Math.max(1, n)) - 1] * (locked ? 2 : 1);
  const layoutKey = (p, n) => `${p}-${n}`;
  const parseLayout = k => { const [p, n] = String(k).split('-').map(Number); return { pos: p, neg: n }; };
  function normLayoutOdds(o) {
    const src = Object.assign({}, DEFAULT_LAYOUT_ODDS, o || {});
    const sum = LAYOUTS.reduce((t, k) => t + Math.max(0, +src[k] || 0), 0);
    return Object.fromEntries(LAYOUTS.map(k => [k, sum > 0 ? Math.max(0, +src[k] || 0) / sum : 0.25]));
  }

  // Regular (not spliced) traits this weapon can roll. Physical traits need more than 25% of the hit (wiki footnote 2:
  // "usually", with exceptions), so opts.add / opts.remove let the user correct the pool.
  function pools(weapon, opts = {}) {
    const rv = R(); const type = rv.typeFor(weapon);
    const atk = (weapon && weapon.attacks && weapon.attacks[opts.attack || 0]) || (weapon && weapon.attacks || [])[0] || { damage: {} };
    const total = Object.values(atk.damage || {}).reduce((a, b) => a + b, 0) || 1;
    const physOk = d => !d.physical || (atk.damage[d.key] || 0) / total > 0.25;
    const add = new Set(opts.add || []), remove = new Set(opts.remove || []);
    const ok = d => rv.available(d, type) && !remove.has(d.key) && (physOk(d) || add.has(d.key));
    return {
      pos: rv.STATS.filter(d => ok(d) && !d.negOnly).map(d => d.key),
      neg: rv.STATS.filter(d => ok(d) && !d.posOnly).map(d => d.key)
    };
  }

  function combos(arr, k) {
    const out = [];
    if (k <= 0) return [[]];
    const rec = (s, acc) => { if (acc.length === k) { out.push(acc.slice()); return; } for (let i = s; i <= arr.length - (k - acc.length); i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); } };
    rec(0, []);
    return out;
  }
  function choose(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }

  /*
   * goal = {
   *   need: [keys]           positives the riven must have (spliced keys allowed)
   *   okPos: [keys] | null   what the other positive slots may hold (null = anything)
   *   neg: 'none' | 'any' | 'list',  negList: [keys],  negOptional: true = a riven with no negative is fine too
   *   layouts: ['2-0', ...]  layouts you accept (empty = all)
   *   minRoll: 0..1          lowest roll quality accepted for the needed traits
   * }
   */
  function normGoal(g) {
    g = Object.assign({ need: [], okPos: null, neg: 'any', negList: [], negOptional: true, layouts: LAYOUTS.slice(), minRoll: 0 }, g || {});
    if (!g.layouts || !g.layouts.length) g.layouts = LAYOUTS.slice();
    g.minRoll = Math.max(0, Math.min(1, +g.minRoll || 0));
    return g;
  }
  function negAccept(g, key) {
    if (key == null) return g.neg === 'none' || g.neg === 'any' || (g.neg === 'list' && g.negOptional);
    if (g.neg === 'any') return true;
    if (g.neg === 'list') return g.negList.includes(key);
    return false;
  }

  /*
   * Exact chance that one cycle gives a riven meeting the goal.
   * st = { layoutOdds, pools, locked: {key, neg, u} | null, spliced: {key, u} | null, layout: '3-1' (needed when a lock
   *        or a spliced trait fixes it) }
   * Returns { p, byLayout }.
   */
  function cycleChance(weapon, goal, st = {}) {
    const g = normGoal(goal);
    const pl = st.pools || pools(weapon);
    const fixed = st.locked || st.spliced;
    const odds = fixed ? { [st.layout]: 1 } : normLayoutOdds(st.layoutOdds);
    const lk = st.locked, sp = st.spliced;
    const byLayout = {};
    let p = 0;
    for (const [lay, w] of Object.entries(odds)) {
      if (!(w > 0)) continue;
      const L = parseLayout(lay);
      if (!g.layouts.includes(lay)) { byLayout[lay] = 0; continue; }
      const keptPos = [], keptU = {};
      if (lk && !lk.neg) { keptPos.push(lk.key); keptU[lk.key] = lk.u; }
      if (sp) { keptPos.push(sp.key); keptU[sp.key] = sp.u; }
      const slotsPos = L.pos - keptPos.length;
      const lockedNeg = lk && lk.neg ? lk : null;
      const slotsNeg = L.neg - (lockedNeg ? 1 : 0);
      if (slotsPos < 0 || slotsNeg < 0) { byLayout[lay] = 0; continue; }
      const posPool = pl.pos.filter(k => !keptPos.includes(k) && !(lockedNeg && lockedNeg.key === k));
      const cs = combos(posPool, slotsPos);
      let sum = 0;
      for (const c of cs) {
        const all = keptPos.concat(c);
        if (!g.need.every(k => all.includes(k))) continue;
        if (g.okPos && !all.every(k => g.need.includes(k) || g.okPos.includes(k) || keptPos.includes(k))) continue;
        let q = 1;
        for (const k of g.need) q *= keptU[k] != null ? (keptU[k] >= g.minRoll ? 1 : 0) : (1 - g.minRoll);
        if (!q) continue;
        let pn;
        if (lockedNeg) pn = negAccept(g, lockedNeg.key) ? 1 : 0;
        else if (slotsNeg === 0) pn = negAccept(g, null) ? 1 : 0;
        else {
          const np = pl.neg.filter(k => !all.includes(k));
          pn = np.length ? np.filter(k => negAccept(g, k)).length / np.length : 0;
        }
        sum += q * pn;
      }
      const pLay = cs.length ? sum / cs.length : 0;
      byLayout[lay] = pLay;
      p += w * pLay;
    }
    return { p, byLayout };
  }

  // Cycles and Kuva for a per-cycle chance p, starting after `done` cycles already made on this riven
  function expected(p, done = 0, locked = false) {
    if (!(p > 0)) return { p: 0, impossible: true };
    if (p >= 1) return { p: 1, mean: 1, kuvaMean: cycleCost(done + 1, locked), n50: 1, n90: 1, kuva50: cycleCost(done + 1, locked), kuva90: cycleCost(done + 1, locked) };
    const kuvaFor = n => { let t = 0; for (let i = 1; i <= n; i++) t += cycleCost(done + i, locked); return t; };
    const nFor = q => Math.max(1, Math.ceil(Math.log(1 - q) / Math.log(1 - p)));
    // expected Kuva: sum over cycles of P(still going) x cost; the cost is flat from cycle 10 on
    let kuvaMean = 0, alive = 1, i = 1;
    for (; done + i < COST.length && i < 100000; i++) { kuvaMean += alive * cycleCost(done + i, locked); alive *= 1 - p; }
    kuvaMean += alive * cycleCost(COST.length, locked) / p;
    const n50 = nFor(0.5), n90 = nFor(0.9);
    return { p, mean: 1 / p, kuvaMean, n50, n90, kuva50: n50 < 2e6 ? kuvaFor(n50) : n50 * cycleCost(COST.length, locked), kuva90: n90 < 2e6 ? kuvaFor(n90) : n90 * cycleCost(COST.length, locked) };
  }

  // ---------------- Monte Carlo plan: cycle, lock, splice, keep the better version ----------------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pickLayout(rand, odds) { let x = rand(); for (const k of LAYOUTS) { x -= odds[k]; if (x <= 0) return parseLayout(k); } return parseLayout('3-1'); }
  function drawDistinct(rand, pool, n, exclude) {
    const opts = pool.filter(k => !exclude.has(k)); const out = [];
    for (let i = 0; i < n && opts.length; i++) { const j = Math.floor(rand() * opts.length); out.push(opts[j]); opts.splice(j, 1); }
    return out;
  }
  // traits: [{key, neg, u, spliced?}]
  function rollTraits(rand, pl, layout, kept) {
    const have = new Set(kept.map(t => t.key));
    const keptPos = kept.filter(t => !t.neg).length, keptNeg = kept.filter(t => t.neg).length;
    const pos = drawDistinct(rand, pl.pos, layout.pos - keptPos, have).map(k => ({ key: k, neg: false, u: rand() }));
    pos.forEach(t => have.add(t.key));
    const neg = drawDistinct(rand, pl.neg, layout.neg - keptNeg, have).map(k => ({ key: k, neg: true, u: rand() }));
    return kept.concat(pos, neg);
  }
  function meets(g, traits, layout) {
    if (!g.layouts.includes(layoutKey(layout.pos, layout.neg))) return false;
    const pos = traits.filter(t => !t.neg), neg = traits.find(t => t.neg);
    for (const k of g.need) { const t = pos.find(x => x.key === k); if (!t || t.u < g.minRoll) return false; }
    if (g.okPos && !pos.every(t => g.need.includes(t.key) || g.okPos.includes(t.key))) return false;
    return negAccept(g, neg ? neg.key : null);
  }

  /*
   * plan = { goal, splice: [out, a, b] | null, lock: 'never' | 'smart', start: { traits, layout, cycles } | null,
   *          layoutOdds, pools, runs, maxCycles, seed }
   * 'smart' lock: once the layout is one the goal accepts, lock the most useful wanted trait on the riven (an ingredient
   * before splicing, a needed trait after). The better of the old and new version is kept after every cycle.
   */
  function simulatePlan(weapon, plan) {
    const g = normGoal(plan.goal);
    const pl = plan.pools || pools(weapon);
    const odds = normLayoutOdds(plan.layoutOdds);
    const runs = Math.max(1, plan.runs || 400), maxCycles = Math.max(10, plan.maxCycles || 3000);
    const rand = rng(plan.seed || 7);
    const sp = plan.splice || null;
    const res = [];
    let fails = 0;
    // a layout worth fixing (by a lock or a splice): accepted by the goal and with room for every needed positive
    const needCount = g.need.length + (sp && !g.need.includes(sp[0]) ? 1 : 0);
    const fits = lay => g.layouts.includes(layoutKey(lay.pos, lay.neg)) && lay.pos >= needCount &&
      !(lay.neg === 0 && g.neg === 'list' && !g.negOptional) && !(lay.neg === 1 && g.neg === 'none');
    // no layout can hold the goal (more than 3 positives, or the accepted layouts are too small): stop at once
    if (!LAYOUTS.some(k => fits(parseLayout(k)))) return Object.assign(summarize([], runs, runs, maxCycles), { impossible: true });
    // the spliced trait keeps the higher roll of its two ingredients, so that roll must clear minRoll if it is needed
    const rollOk = u => !(sp && g.need.includes(sp[0])) || u >= g.minRoll;
    // how far along a version is; after a cycle the better one is kept (ties take the new one).
    // Before the splice only the two ingredients matter (the other traits reroll after it anyway).
    const score = (traits, spliced, lay) => {
      const n = traits.find(t => t.neg);
      const negOk = negAccept(g, n ? n.key : null);
      const needOk = g.need.filter(k => traits.some(x => !x.neg && x.key === k && x.u >= g.minRoll)).length;
      if (sp && !spliced) {
        const ta = traits.find(t => t.key === sp[1]), tb = traits.find(t => t.key === sp[2]);
        const best = Math.max(ta ? ta.u : 0, tb ? tb.u : 0);
        return (ta ? 10 : 0) + (tb ? 10 : 0) + (ta && tb && fits(lay) && rollOk(best) ? 20 : 0) + (fits(lay) ? 5 : 0) + (rollOk(best) ? 3 : 0) + needOk + (negOk ? 0.5 : 0);
      }
      return (spliced ? 100 : 0) + (fits(lay) ? 12 : 0) + needOk * 15 + (negOk ? 2 : 0);
    };
    for (let r = 0; r < runs; r++) {
      let layout, traits, cycles = plan.start ? plan.start.cycles || 0 : 0;
      if (plan.start && plan.start.traits && plan.start.traits.length) { layout = plan.start.layout; traits = plan.start.traits.map(t => Object.assign({}, t)); }
      else { layout = pickLayout(rand, odds); traits = rollTraits(rand, pl, layout, []); }
      let spliced = traits.some(t => t.spliced), kuva = 0, splicers = 0, made = 0, ok = false;
      while (made <= maxCycles) {
        if (meets(g, traits, layout)) { ok = true; break; }
        // splice when both ingredients are on and the layout is acceptable (splicing fixes it)
        if (sp && !spliced && fits(layout)) {
          const ta = traits.find(t => t.key === sp[1]), tb = traits.find(t => t.key === sp[2]);
          if (ta && tb && rollOk(Math.max(ta.u, tb.u))) {
            const negC = ta.neg || tb.neg;
            const rest = traits.filter(t => t !== ta && t !== tb);
            const st = { key: sp[0], neg: false, u: Math.max(ta.u, tb.u), spliced: true };
            const have = new Set(rest.map(t => t.key).concat(sp[0]));
            const fill = drawDistinct(rand, negC ? pl.neg : pl.pos, 1, have).map(k => ({ key: k, neg: negC, u: rand() }));
            traits = [st].concat(rest, fill); spliced = true; splicers++;
            continue;
          }
        }
        // choose a lock for this cycle
        let lock = null;
        if (plan.lock === 'smart' && fits(layout)) {
          // ingredients may be either polarity; a needed trait only helps as a positive with a good enough roll
          const ingr = sp && !spliced ? [sp[1], sp[2]] : [];
          const cand = ingr.map(k => traits.find(x => x.key === k))
            .concat(g.need.map(k => traits.find(x => x.key === k && !x.neg && !x.spliced && x.u >= g.minRoll)));
          lock = cand.find(Boolean) || null;
        }
        const fixed = lock || spliced;
        made++; cycles++;
        kuva += cycleCost(cycles, !!lock);
        const newLayout = fixed ? layout : pickLayout(rand, odds);
        const kept = traits.filter(t => t === lock || t.spliced);
        const next = rollTraits(rand, pl, newLayout, kept);
        if (score(next, spliced, newLayout) >= score(traits, spliced, layout)) { traits = next; layout = newLayout; }
      }
      if (ok) res.push({ cycles: made, kuva, splicers }); else fails++;
    }
    return summarize(res, runs, fails, maxCycles);
  }
  function summarize(res, runs, fails, maxCycles) {
    const q = (arr, f) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 0.5))]; };
    const cyc = res.map(x => x.cycles), kv = res.map(x => x.kuva);
    const avg = a => a.length ? a.reduce((t, x) => t + x, 0) / a.length : null;
    return { runs, done: res.length, fails, maxCycles, cycles: { mean: avg(cyc), p50: q(cyc, 0.5), p90: q(cyc, 0.9) }, kuva: { mean: avg(kv), p50: q(kv, 0.5), p90: q(kv, 0.9) },
      splicers: avg(res.map(x => x.splicers)), raw: res };
  }

  // The riven in the editor as plan traits: u from the grader (true roll, also for a negative)
  function fromRiven(riven, weapon) {
    const rv = R();
    const c = rv.counts(riven);
    const g = rv.grade(riven, weapon, rv.MAX_RANK).rows;
    const traits = c.list.map(s => { const r = g.find(x => x.key === s.key && x.ok); return { key: s.key, neg: !!s.neg, u: r ? r.pos : 0.5, spliced: !!rv.statDef(s.key).spliced }; });
    return { traits, layout: { pos: c.pos, neg: c.neg }, layoutKey: layoutKey(c.pos, c.neg) };
  }

  WF.rivenOdds = { summarize, COST, LAYOUTS, LAYOUT_LABEL, DEFAULT_LAYOUT_ODDS, cycleCost, normLayoutOdds, pools, cycleChance, expected, simulatePlan, fromRiven, normGoal, choose, layoutKey, parseLayout };
})();
