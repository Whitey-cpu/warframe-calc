/*
 * "What's new" > Game updates and Events.
 *  - Game updates: DE's official patch notes, parsed every 3 hours by scripts/scrape-patches.js into data/game-updates.js
 *    (loaded only when the tab opens). The TL;DR is DE's own section headings plus item counts.
 *  - Events: live world state from api.warframestat.us (the WFCD community API, which reads DE's public world state).
 *    Read when the tab opens, refreshed at most every 2 minutes. Nothing here touches anyone's game account.
 */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return null; [...x.searchParams.keys()].filter(k => /^utm_/.test(k)).forEach(k => x.searchParams.delete(k)); return x.href; } catch (e) { return null; } };
  const link = (u, text, cls) => { const h = safeUrl(u); return h ? `<a href="${esc(h)}" target="_blank" rel="noopener"${cls ? ` class="${cls}"` : ''}>${esc(text)}</a>` : esc(text); };
  const fmtDay = iso => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
  const fmtWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  function left(iso, now) {
    let s = Math.round((new Date(iso) - now) / 1000);
    if (!Number.isFinite(s)) return '';
    const neg = s < 0; s = Math.abs(s);
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    const t = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
    return neg ? `${t} ago` : t;
  }

  // ---------------- data loading ----------------
  let updatesPromise = null;
  function loadScript(src) {
    return new Promise(resolve => { const s = document.createElement('script'); s.src = src; s.onload = () => resolve(true); s.onerror = () => { s.remove(); resolve(false); }; document.head.appendChild(s); });
  }
  function loadUpdates() {
    if (window.WF_GAME_UPDATES) return Promise.resolve(window.WF_GAME_UPDATES);
    if (!updatesPromise) {
      updatesPromise = (async () => {
        // desktop app (file://): prefer the site's copy, which is refreshed every 3 hours; fall back to the bundled one
        if (location.protocol === 'file:') await loadScript('https://warframe.hardn.net/data/game-updates.js');
        if (!window.WF_GAME_UPDATES) await loadScript('data/game-updates.js');
        return window.WF_GAME_UPDATES || null;
      })();
    }
    return updatesPromise;
  }

  const WS_URL = 'https://api.warframestat.us/pc/?language=en';
  let ws = null, wsAt = 0, wsErr = null, wsPromise = null;
  function loadWorldState(force) {
    if (!force && ws && Date.now() - wsAt < 120000) return Promise.resolve(ws);
    if (!wsPromise) {
      wsPromise = fetch(WS_URL, { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(j => { ws = j; wsAt = Date.now(); wsErr = null; return j; })
        .catch(e => { wsErr = e; return ws; })
        .finally(() => { wsPromise = null; });
    }
    return wsPromise;
  }

  // ---------------- Game updates ----------------
  const pnLabel = r => { const m = /(Hotfix|Update)\s+[\d.]+(\s*\+\s*[\d.]+)?/i.exec(r.title || ''); return m ? m[0] : r.title; };
  const showNum = r => (r.title.match(/\d+\.\d+(\.\d+)?(\s*\+\s*[\d.]+)?/) || [r.version])[0];

  function itemHtml(it, re) {
    const t = typeof it === 'string' ? it : it.p || it.t;
    let h = esc(t);
    if (re) h = h.replace(re, m => `<mark>${m}</mark>`);
    if (typeof it === 'string') return `<li>${h}</li>`;
    if (it.p) return `<li class="pn-p">${h}</li>`;
    return `<li class="pn-sub" style="--d:${Math.min(it.d, 3)}">${h}</li>`;
  }
  function releaseBody(r, mentionRe) {
    const ment = (r.mentions || []).length ? `<p class="pn-ment"><span class="muted">In the calculator:</span> ${r.mentions.map(m => `<span class="pn-chip" title="${esc(m.kind)}, mentioned ${m.n}x">${esc(m.name)}</span>`).join(' ')}</p>` : '';
    const links = `<p class="pn-links">${link(r.url, 'Official patch notes')}${r.forum ? ' · ' + link(r.forum, 'Forum thread') : ''}</p>`;
    const parts = r.parts.map(p => `${r.parts.length > 1 || !/^(Update|Hotfix)/i.test(p.title) && p.title !== r.title ? `<h4 class="pn-part">${esc(p.title)}</h4>` : ''}` +
      p.sections.map(s => `${s.title ? `<h5>${esc(s.title)}</h5>` : ''}<ul>${s.items.map(it => itemHtml(it, mentionRe)).join('')}</ul>`).join('')).join('');
    return ment + links + parts;
  }
  function mentionRegex(r) {
    const names = (r.mentions || []).map(m => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return names.length ? new RegExp(`(?<![\\w'])(${names.map(esc).join('|')})(?![\\w])`, 'g') : null;
  }

  async function renderGame(pane) {
    pane.innerHTML = '<p class="muted small">Loading patch notes...</p>';
    const [data, live] = await Promise.all([loadUpdates(), loadWorldState(false)]);
    if (!data || !data.releases || !data.releases.length) {
      pane.innerHTML = `<p class="muted">The game updates feed is not available right now. Read the ${link('https://www.warframe.com/en/patch-notes', 'official patch notes')} instead.</p>`;
      return;
    }
    const R = data.releases;
    const known = new Set(R.map(r => r.url));
    // patch posts in the live news that the 3-hourly feed has not picked up yet
    const fresh = live && (live.news || []).filter(n => n.update && n.link && /patch-notes/.test(n.link) && !known.has(safeUrl(n.link)) && new Date(n.date) > new Date(R[0].date || 0)) || [];
    pane.innerHTML = `
      <p class="pn-head small muted">Current game build: <b>${esc(pnLabel(fresh[0] ? { title: fresh[0].message } : R[0]))}</b>${fresh[0] ? '' : R[0].date ? ` (${esc(fmtDay(R[0].date))})` : ''}.
        From DE's ${link(data.source, 'official patch notes')}, checked ${esc(fmtWhen(data.checkedAt))}. The TL;DR lists DE's own section headings and counts the bullet points.</p>
      ${fresh.map(n => `<div class="pn-fresh"><b>Just released:</b> ${link(n.link, n.message)} <span class="muted">(${esc(fmtWhen(n.date))}). Summary added within a few hours.</span></div>`).join('')}
      <div class="cl-tldr-all"><h3>TL;DR</h3><ul>${R.slice(0, 3).map(r => `<li><b>${esc(pnLabel(r))}</b>${r.date ? ` <span class="muted">${esc(fmtDay(r.date))}</span>` : ''}: ${esc(r.tldr || 'No summary.')}</li>`).join('')}</ul></div>
      <label class="pn-search"><span class="sr-only">Search the patch notes</span><input type="search" id="pnSearch" placeholder="Search these patch notes (e.g. a weapon or mod name)" autocomplete="off"></label>
      <div id="pnList"></div>`;
    const list = pane.querySelector('#pnList');
    const renderList = () => {
      list.innerHTML = R.map((r, i) => `<details class="cl-entry pn-entry" data-i="${i}" ${i === 0 ? 'open' : ''}>
        <summary><span class="cl-ver">${esc(showNum(r))}</span><span class="pn-kind ${r.kind}">${r.kind === 'hotfix' ? 'Hotfix' : 'Update'}</span><span class="cl-date">${esc(fmtDay(r.date))}</span>
          <span class="cl-sum"><span class="pn-title">${esc(r.title)}</span><br>${esc(r.tldr)}</span></summary><div class="pn-body"></div></details>`).join('');
      const fill = d => { const b = d.querySelector('.pn-body'); if (!b.dataset.done) { const r = R[+d.dataset.i]; b.innerHTML = releaseBody(r, mentionRegex(r)); b.dataset.done = '1'; } };
      list.querySelectorAll('details').forEach(d => { if (d.open) fill(d); d.addEventListener('toggle', () => d.open && fill(d)); });
    };
    renderList();
    let timer = 0;
    pane.querySelector('#pnSearch').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = e.target.value.trim();
        if (q.length < 2) { renderList(); return; }
        const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const qq = q.toLowerCase();
        let total = 0;
        const html = R.map(r => {
          const rows = [];
          for (const p of r.parts) for (const s of p.sections) for (const it of s.items) {
            const t = typeof it === 'string' ? it : it.p || it.t;
            if (t.toLowerCase().includes(qq)) rows.push(itemHtml(it, re).replace('<li', `<li title="${esc(s.title)}"`));
          }
          total += rows.length;
          return rows.length ? `<div class="pn-hit"><h4>${link(r.url, pnLabel(r))} <span class="muted small">${[fmtDay(r.date), `${rows.length} match${rows.length === 1 ? '' : 'es'}`].filter(Boolean).map(esc).join(', ')}</span></h4><ul>${rows.slice(0, 40).join('')}</ul>${rows.length > 40 ? '<p class="muted small">First 40 shown.</p>' : ''}</div>` : '';
        }).join('');
        list.innerHTML = total ? html : `<p class="muted">No lines mention "${esc(q)}" in the last ${R.length} releases.</p>`;
      }, 200);
    });
  }

  // ---------------- Events ----------------
  const CYCLES = [
    ['cetusCycle', 'Plains of Eidolon', s => s], ['vallisCycle', 'Orb Vallis', s => s], ['cambionCycle', 'Cambion Drift', s => s],
    ['zarimanCycle', 'Zariman', s => `${s} control`], ['duviriCycle', 'Duviri', s => `${s} mood`], ['earthCycle', 'Earth', s => s]
  ];
  const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());
  // the API sometimes passes DE's untranslated key through, e.g. "Road To Tau Event Name"
  const evName = d => String(d || 'Event').replace(/\s+Event Name$/i, '');
  const row = (title, sub, iso, verb, now) => `<li class="ev-row"><div><b>${title}</b>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>
    <div class="ev-time" data-at="${esc(iso)}" data-verb="${esc(verb)}" title="${esc(fmtWhen(iso))}">${esc(verb)} ${esc(left(iso, now))}</div></li>`;

  let tick = 0;
  async function renderEvents(pane, force) {
    if (!ws || force) pane.innerHTML = '<p class="muted small">Reading the live world state...</p>';
    const j = await loadWorldState(force);
    if (!j) {
      pane.innerHTML = `<p class="muted">Could not reach the live world state (${esc(wsErr && wsErr.message || 'offline')}). Try again later, or see ${link('https://www.warframe.com/news', "DE's news page")}.</p>
        <button type="button" class="btn ghost sm" id="evRetry">Try again</button>`;
      pane.querySelector('#evRetry').onclick = () => renderEvents(pane, true);
      return;
    }
    const now = new Date();
    const active = [], upcoming = [];
    for (const e of j.events || []) {
      if (e.expiry && new Date(e.expiry) < now) continue;
      const sub = [e.node, e.tooltip && e.tooltip !== e.description ? e.tooltip : ''].filter(Boolean).map(esc).join(' · ');
      if (e.activation && new Date(e.activation) > now) upcoming.push(row(esc(evName(e.description)), sub, e.activation, 'starts in', now));
      else active.push(row(esc(evName(e.description)), sub, e.expiry, 'ends in', now));
    }
    const vt = j.voidTrader;
    if (vt) {
      const loc = esc(vt.location || '');
      if (vt.active) active.push(row("Baro Ki'Teer is here", `${loc}${(vt.inventory || []).length ? ` · ${vt.inventory.length} items` : ''}`, vt.expiry, 'leaves in', now));
      else upcoming.push(row("Baro Ki'Teer arrives", loc, vt.activation, 'in', now));
    }
    const vault = j.vaultTrader;
    if (vault && vault.expiry && new Date(vault.expiry) > now) active.push(row('Prime Resurgence', `${(vault.inventory || []).length} items with Varzia`, vault.expiry, 'rotates in', now));
    const nw = j.nightwave;
    if (nw && nw.expiry) active.push(row(`Nightwave${nw.season != null ? ` season ${esc(nw.season)}` : ''}`, `${(nw.activeChallenges || []).length} active acts`, nw.expiry, 'ends in', now));
    for (const a of j.alerts || []) if (a.expiry && new Date(a.expiry) > now) active.push(row(esc(a.mission && a.mission.description || 'Alert'), esc([a.mission && a.mission.node, a.mission && a.mission.reward && a.mission.reward.asString].filter(Boolean).join(' · ')), a.expiry, 'ends in', now));

    const resets = [];
    if (j.sortie && j.sortie.expiry) resets.push(row('Daily Sortie', esc(j.sortie.boss ? `${j.sortie.boss} (${j.sortie.faction || ''})` : ''), j.sortie.expiry, 'resets in', now));
    if (j.archonHunt && j.archonHunt.expiry) resets.push(row('Weekly Archon Hunt', esc(j.archonHunt.boss || ''), j.archonHunt.expiry, 'resets in', now));
    if (j.steelPath && j.steelPath.expiry) resets.push(row('Steel Path Honors rotation', esc(j.steelPath.currentReward ? `Now: ${j.steelPath.currentReward.name} (${j.steelPath.currentReward.cost} Steel Essence)` : ''), j.steelPath.expiry, 'changes in', now));
    if (j.arbitration && j.arbitration.expiry && j.arbitration.node && !/sol node/i.test(j.arbitration.node)) resets.push(row('Arbitration', esc([j.arbitration.type, j.arbitration.node].filter(Boolean).join(' · ')), j.arbitration.expiry, 'changes in', now));

    const cycles = CYCLES.filter(([k]) => j[k] && j[k].expiry).map(([k, name, f]) => row(esc(name), esc(cap(f(j[k].state || ''))), j[k].expiry, 'changes in', now));

    const news = (j.news || []).filter(n => n.date && new Date(n.date).getFullYear() > 2000).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10)
      .map(n => `<li class="ev-news">${n.update ? '<span class="pn-kind hotfix">Update</span>' : n.stream ? '<span class="pn-kind stream">Stream</span>' : n.primeAccess ? '<span class="pn-kind prime">Prime</span>' : ''}
        ${link(n.link, n.message)} <span class="muted small">${esc(fmtDay(n.date))}</span></li>`);

    const sec = (title, rows, empty) => `<h3 class="ev-h">${title}</h3>${rows.length ? `<ul class="ev-list">${rows.join('')}</ul>` : `<p class="muted small">${empty}</p>`}`;
    pane.innerHTML = `
      <p class="small muted">Live from the ${link('https://docs.warframestat.us/', 'warframestat.us')} community API, which reads DE's public world state (PC). Updated ${esc(fmtWhen(wsAt))}.
        <button type="button" class="btn ghost sm" id="evRefresh">Refresh</button></p>
      ${wsErr ? `<p class="small" style="color:var(--warn,#e0a040)">Refresh failed (${esc(wsErr.message)}); showing the last data read.</p>` : ''}
      ${sec('Happening now', active, 'No timed events right now.')}
      ${sec('Coming up', upcoming, 'Nothing scheduled in the world state yet. Upcoming content is usually announced in the news and devstreams below.')}
      ${sec('News and devstreams from DE', news, 'No news items.')}
      ${sec('Resets and rotations', resets, 'Not available.')}
      ${sec('Open world cycles', cycles, 'Not available.')}`;
    pane.querySelector('#evRefresh').onclick = () => renderEvents(pane, true);
    startTick(pane);
  }
  function startTick(pane) {
    clearInterval(tick);
    tick = setInterval(() => {
      if (!pane.isConnected || pane.hidden || !pane.closest('dialog[open]')) { clearInterval(tick); return; }
      const now = new Date();
      let expired = false;
      pane.querySelectorAll('.ev-time').forEach(el => { el.textContent = `${el.dataset.verb} ${left(el.dataset.at, now)}`; if (new Date(el.dataset.at) < now) expired = true; });
      if (expired && Date.now() - wsAt > 60000) renderEvents(pane, true);
    }, 30000);
  }

  window.WFNews = { renderGame, renderEvents, loadUpdates, loadWorldState, _left: left, _evName: evName };
})();
