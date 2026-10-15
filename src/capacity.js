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

  WF.capacity = { check, slotDrain, POLARITIES };
})();
