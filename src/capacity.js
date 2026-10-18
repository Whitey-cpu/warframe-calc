/*
 * Mod capacity and polarity checker.
 * Source: https://wiki.warframe.com/w/Mod_Capacity
 *  - Matching polarity halves drain, rounded up (Serration 14 -> 7).
 *  - Mismatched polarity adds a quarter, rounded to nearest (2-5 -> +1, 6-9 -> +2, 10-13 -> +3, 14-16 -> +4).
 *  - Orokin Catalyst (weapons) doubles capacity.
 *  - Drain at a rank = base drain + rank (matches the wiki's Serration example: 4 + 10 = 14).
 * ASSUMPTION: weapon capacity = weapon rank (30 at max), 60 with a Catalyst. The wiki says capacity "correlates to rank".
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});

  const POLARITIES = ['madurai', 'vazarin', 'naramon', 'zenurik', 'unairu', 'penjaga', 'umbra'];

  function slotDrain(baseDrain, rank, modPol, slotPol) {
    const d = baseDrain + rank;
    if (!slotPol) return d;
    if (modPol && (slotPol === modPol || slotPol === 'any')) return Math.ceil(d / 2);
    return d + Math.round(d / 4);
  }

  /**
   * @param {object} o { mods: [{mod, rank, slotPolarity}], catalyst: bool, rank: number (default 30), innate: [polarities], exilusInnate }
   */
  function check(o) {
    const cap = (o.rank != null ? o.rank : 30) * (o.catalyst === false ? 1 : 2);
    let used = 0;
    const rows = o.mods.map(r => {
      if (!r.mod) return null;
      const rank = r.rank != null ? r.rank : r.mod.maxRank;
      const d = slotDrain(r.mod.drain || 0, rank, r.mod.polarity, r.slotPolarity);
      used += d;
      return { name: r.mod.name, drain: d, match: !!r.slotPolarity && r.slotPolarity === r.mod.polarity, mismatch: !!r.slotPolarity && r.slotPolarity !== r.mod.polarity };
    });
    // forma = slots whose polarity differs from the weapon's innate set (count each added/changed polarity once)
    const innate = (o.innate || []).slice();
    let forma = 0;
    o.mods.forEach(r => {
      if (!r.slotPolarity) return;
      const i = innate.indexOf(r.slotPolarity);
      if (i >= 0) innate.splice(i, 1); else forma++;
    });
    return { capacity: cap, used, remaining: cap - used, fits: used <= cap, forma, rows };
  }

  /**
   * Fewest Forma that make a mod set fit, and where the polarities go.
   * mods: [{ name, drain (base), rank, polarity }] for the normal slots (in slot order); exilus: same or null.
   * innate: the weapon's polarities; exilusInnate: its exilus polarity; cap: capacity; slots: normal slot count (8).
   * Each Forma sets one slot (normal or exilus) to any polarity. Matching halves drain (rounded up), mismatching adds
   * a quarter, a blank slot costs full drain (https://wiki.warframe.com/w/Mod_Capacity, https://wiki.warframe.com/w/Forma).
   * ASSUMPTION: the data lists a weapon's innate polarities but not which slot they sit on, so innate polarities are
   * treated as free to line up with any mod (the same rule the capacity checker uses to count Forma).
   * Returns { fits, forma, drain, cap, polarities: [slot polarity per mod], exilusPolarity, free: [unused innate] }.
   */
  function formaPlan(o) {
    const cap = o.cap != null ? o.cap : 60;
    const mods = (o.mods || []).filter(Boolean).map(m => ({ name: m.name, d: (m.drain || 0) + (m.rank != null ? m.rank : (m.maxRank || 0)), pol: m.polarity || null }));
    const nSlots = o.slots || 8;
    const innate = (o.innate || []).filter(Boolean).slice(0, nSlots);
    const pols = [...new Set(innate)];
    const startCounts = pols.map(p => innate.filter(x => x === p).length);
    const blanks0 = nSlots - innate.length;
    const half = d => Math.ceil(d / 2), worse = d => d + Math.round(d / 4);
    const memo = new Map();
    // best (drain, choice) for mods[i..] with innate counts, blank slots left and Forma left
    function rec(i, counts, blanks, f) {
      if (i === mods.length) return { d: 0 };
      const key = i + '|' + counts.join(',') + '|' + blanks + '|' + f;
      if (memo.has(key)) return memo.get(key);
      const m = mods[i];
      let best = { d: Infinity };
      const tryOpt = (cost, c2, b2, f2, choice) => {
        if (b2 < 0 || f2 < 0) return;
        const r = rec(i + 1, c2, b2, f2);
        if (cost + r.d < best.d) best = { d: cost + r.d, choice, next: [c2, b2, f2] };
      };
      const k = pols.indexOf(m.pol);
      if (m.pol && k >= 0 && counts[k] > 0) { const c2 = counts.slice(); c2[k]--; tryOpt(half(m.d), c2, blanks, f, { pol: m.pol, forma: false }); }
      if (m.pol) {
        tryOpt(half(m.d), counts, blanks - 1, f - 1, { pol: m.pol, forma: true });                       // Forma a blank slot
        counts.forEach((c, j) => { if (c > 0) { const c2 = counts.slice(); c2[j]--; tryOpt(half(m.d), c2, blanks, f - 1, { pol: m.pol, forma: true }); } }); // re-Forma an innate slot
      }
      tryOpt(m.d, counts, blanks - 1, f, { pol: null, forma: false });                                    // blank slot
      counts.forEach((c, j) => { if (c > 0) { const c2 = counts.slice(); c2[j]--; tryOpt(m.pol === pols[j] ? half(m.d) : worse(m.d), c2, blanks, f, { pol: pols[j], forma: false }); } });
      memo.set(key, best);
      return best;
    }
    const ex = o.exilus ? { d: (o.exilus.drain || 0) + (o.exilus.rank != null ? o.exilus.rank : (o.exilus.maxRank || 0)), pol: o.exilus.polarity || null } : null;
    const exOpts = !ex ? [{ f: 0, d: 0, pol: o.exilusInnate || null }] : [
      { f: 0, d: !o.exilusInnate ? ex.d : (ex.pol === o.exilusInnate ? half(ex.d) : worse(ex.d)), pol: o.exilusInnate || null },
      ex.pol ? { f: 1, d: half(ex.d), pol: ex.pol } : null
    ].filter(Boolean);
    const maxF = mods.length + 1;
    for (let F = 0; F <= maxF; F++) {
      let best = null;
      for (const e of exOpts) {
        if (e.f > F) continue;
        const r = rec(0, startCounts, blanks0, F - e.f);
        if (r.d + e.d <= cap && (!best || r.d + e.d < best.d)) best = { d: r.d + e.d, e };
      }
      if (best) {
        // walk the choices back
        const out = []; let counts = startCounts, blanks = blanks0, f = F - best.e.f;
        for (let i = 0; i < mods.length; i++) { const r = rec(i, counts, blanks, f); out.push(r.choice.pol); [counts, blanks, f] = r.next; }
        const free = []; pols.forEach((p, j) => { for (let n = 0; n < counts[j]; n++) free.push(p); });
        return { fits: true, forma: F, drain: best.d, cap, polarities: out, exilusPolarity: best.e.pol, free };
      }
    }
    const r = rec(0, startCounts, blanks0, maxF);
    return { fits: false, forma: null, drain: r.d, cap, polarities: [], exilusPolarity: null, free: [] };
  }

  WF.capacity = { check, slotDrain, formaPlan, POLARITIES };
})();
