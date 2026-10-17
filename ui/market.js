/*
 * Plat prices from warframe.market for the mods in your slots, the weapon arcane and Prime weapon sets.
 * Fetched through the accounts API (/market/price), which caches warframe.market's public order data
 * (the browser cannot call warframe.market directly). Only items on screen are requested, at most every
 * 10 minutes per item, following warframe.market's API rules. "~Np" = median of the 5 cheapest sell orders
 * from players who are online or in game, at that mod rank (PC).
 */
window.WFMarket = function (UI) {
  const { $, esc, fmt, state } = UI;
  const KEY = 'wfcalc.prices.v1';
  const TTL = 10 * 60 * 1000;
  const cache = new Map();   // key -> { at, data }
  let lastAt = null, busy = false, timer = 0, lastErr = null, retryAt = 0;
  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* ignore */ }
  const box = $('showPrices');
  if (box) box.checked = on;

  const available = () => UI.accountsEnabled();

  function wanted() {
    const w = state.weapon; if (!w) return { names: [], refs: [] };
    const names = state.mods.filter(n => n && n !== UI.RIVEN);
    if (state.arcanes[0]) names.push(state.arcanes[0]);
    const refs = w.isPrime && w.uid ? [w.uid] : [];
    return { names: [...new Set(names)], refs };
  }
  const fresh = k => { const c = cache.get(k); return c && Date.now() - c.at < TTL; };

  async function load() {
    if (!on || !available() || busy || Date.now() < retryAt) { render(); return; }
    const { names, refs } = wanted();
    const needN = names.filter(n => !fresh(n)), needR = refs.filter(r => !fresh(r));
    if (!needN.length && !needR.length) { render(); return; }
    busy = true;
    try {
      for (let i = 0; i < Math.max(needN.length, 1); i += 12) {
        const n = needN.slice(i, i + 12), r = i === 0 ? needR : [];
        if (!n.length && !r.length) break;
        const q = (n.length ? 'names=' + encodeURIComponent(n.join(',')) : '') + (r.length ? (n.length ? '&' : '') + 'refs=' + encodeURIComponent(r.join(',')) : '');
        const j = await UI.api('/market/price?' + q);
        const now = Date.now();
        Object.entries(j.prices || {}).forEach(([k, v]) => cache.set(k, { at: now, data: v }));
        lastAt = new Date(); lastErr = null;
      }
    } catch (e) { lastErr = e.message; retryAt = Date.now() + 10 * 60 * 1000; }   // back off after a failure
    busy = false;
    render();
  }

  // price at a mod rank: exact rank if anyone sells it, otherwise unranked (rank 0), otherwise the nearest rank listed
  function priceAt(p, rank) {
    const s = p && p.sell || {};
    if (s.any) return { v: s.any.typical, min: s.any.min, n: s.any.n, r: null };
    if (rank != null && s[rank]) return { v: s[rank].typical, min: s[rank].min, n: s[rank].n, r: rank };
    if (s['0']) return { v: s['0'].typical, min: s['0'].min, n: s['0'].n, r: 0 };
    const ks = Object.keys(s).map(Number).filter(Number.isFinite).sort((a, b) => Math.abs(a - rank) - Math.abs(b - rank));
    return ks.length ? { v: s[ks[0]].typical, min: s[ks[0]].min, n: s[ks[0]].n, r: ks[0] } : null;
  }
  const rankOf = i => { const n = state.mods[i]; const m = n && UI.findModByName(n); return m ? (state.ranks[i] != null ? Math.min(state.ranks[i], m.maxRank) : m.maxRank) : null; };

  function render() {
    document.querySelectorAll('.slot-price').forEach(el => el.remove());
    const line = $('marketLine');
    if (!line) return;
    if (!on || !available() || !state.weapon) { line.innerHTML = !available() && on ? '' : ''; return; }
    let total = 0, counted = 0, ownedSkip = 0, unknown = 0;
    state.mods.forEach((n, i) => {
      if (!n || n === UI.RIVEN) return;
      const c = cache.get(n); if (!c) return;
      const slot = document.querySelector(`.slot[data-slot="${i}"]`);
      const p = c.data;
      if (p.missing) { unknown++; if (slot) slot.insertAdjacentHTML('beforeend', '<span class="slot-price muted" title="Not listed on warframe.market (untradable or a different name)">no market</span>'); return; }
      const rank = rankOf(i);
      const pr = priceAt(p, rank);
      if (slot && pr) slot.insertAdjacentHTML('beforeend', `<a class="slot-price" href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(`${p.name} on warframe.market (PC): typical ${pr.v}p, cheapest ${pr.min}p, ${pr.n} online seller${pr.n === 1 ? '' : 's'}${pr.r != null ? ' at rank ' + pr.r : ''}${pr.r != null && pr.r !== rank ? ' (nobody online sells rank ' + rank + ')' : ''}`)}">~${pr.v}p${pr.r != null && pr.r !== rank ? ` <span class="muted">R${pr.r}</span>` : ''}</a>`);
      else if (slot && !pr) slot.insertAdjacentHTML('beforeend', '<span class="slot-price muted" title="No online sellers right now">no sellers</span>');
      if (pr) { if (UI.isOwned && UI.isOwned(n)) ownedSkip++; else { total += pr.v; counted++; } }
    });
    const arc = state.arcanes[0] && cache.get(state.arcanes[0]);
    const arcP = arc && !arc.data.missing ? priceAt(arc.data, null) : null;
    if (arcP && !(UI.isOwned && UI.isOwned(state.arcanes[0]))) { total += arcP.v; counted++; }
    const w = state.weapon;
    const set = w.isPrime && w.uid && cache.get(w.uid);
    const setP = set && !set.data.missing ? priceAt(set.data, null) : null;
    const parts = [];
    if (setP) parts.push(`<a href="${esc(set.data.url)}" target="_blank" rel="noopener">${esc(set.data.name)}</a> <b>~${setP.v}p</b>`);
    if (counted) parts.push(`Mods${arcP ? ' + arcane' : ''} to buy <b>~${fmt(total)}p</b>${ownedSkip ? ` <span class="muted">(${ownedSkip} you own not counted)</span>` : ''}`);
    if (unknown) parts.push(`<span class="muted">${unknown} not on the market</span>`);
    if (lastErr && !parts.length) {
      line.innerHTML = `<span class="muted small">Plat prices are unavailable right now: ${esc(lastErr)}. Trying again in a few minutes. <a href="https://warframe.market" target="_blank" rel="noopener">warframe.market</a></span>`;
      return;
    }
    line.innerHTML = (parts.length ? parts.join(' &middot; ') + ' &middot; ' : (busy ? 'Loading prices... ' : '')) +
      `<span class="muted small">Prices: <a href="https://warframe.market" target="_blank" rel="noopener">warframe.market</a> (PC), median of the 5 cheapest online sellers${lastAt ? ', checked ' + esc(lastAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : ''}${lastErr ? ` <span class="warn-t">(${esc(lastErr)})</span>` : ''}</span>`;
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(load, 600); }
  const prevOnSlots = UI.onSlots;
  UI.onSlots = () => { if (prevOnSlots) prevOnSlots(); render(); schedule(); };
  UI.hooks.push(() => schedule());
  if (box) box.addEventListener('change', () => {
    on = box.checked;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    render(); if (on) load();
  });
  UI.marketPriceAt = priceAt;
  schedule();
};
