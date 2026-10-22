/*
 * "Ask Teshin" dialog: build lean (crit / status / hybrid) for the current weapon, ideas from recent patch notes,
 * this week's sleepers (data/meta.js, computed by scripts/meta-scan.js) and links to community discussion.
 * Fan-made: the name is a nod to the game's mentor character; nothing here comes from or is endorsed by DE.
 */
window.WFTeshin = function (UI) {
  const { $, esc, fmt, state, D, WF } = UI;
  const T = WF.teshin;
  const dlg = $('teshinDialog'), body = $('teshinBody');
  let run = 0, lastLean = null;

  const STYLE = { crit: ['Crit', 'Build for critical hits: Critical Chance, Critical Damage, raw damage and elements.'],
    status: ['Status', 'Build for status effects: Status Chance, elements that proc well here, and status damage.'],
    hybrid: ['Hybrid', 'Neither style wins clearly: mixing crit and status mods works about as well or better.'] };
  const metricName = () => (($('metric').selectedOptions || [])[0] || {}).textContent || 'Sustained DPS';
  const enemyText = b => {
    const e = b.enemy || {};
    if (e.unit) return `${e.unit}${e.level ? ' level ' + e.level : ''}${e.steelPath ? ' (Steel Path)' : ''}`;
    const fac = e.faction && !/^none/i.test(e.faction) ? e.faction : '';
    return fac || e.armor ? `${fac || 'an enemy'}${e.armor ? ' with ' + fmt(e.armor) + ' armor' : ''}` : 'a neutral target with no armor';
  };
  const loadScript = src => new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = () => res(true); s.onerror = () => { s.remove(); res(false); }; document.head.appendChild(s); });
  async function loadMeta() {
    if (window.WF_META) return window.WF_META;
    if (location.protocol === 'file:') await loadScript('https://warframe.hardn.net/data/meta.js');
    if (!window.WF_META) await loadScript('data/meta.js');
    return window.WF_META || null;
  }

  function open() {
    const w = state.weapon;
    if (!w) { UI.flashMsg('Choose a weapon first.'); return; }
    const b = UI.collect();
    const my = ++run;
    lastLean = null;
    body.innerHTML = `
      <section class="ts-sec"><h3>What does ${esc(w.name)} lean into?</h3>
        <p class="muted small">Best build vs. crit-only vs. status-only, against ${esc(enemyText(b))}, ranked by ${esc(metricName())}.</p>
        <div id="tsLean"><p class="ts-think">Working on the <span id="tsStep">best build</span>...</p></div></section>
      <section class="ts-sec"><h3>Patch picks</h3><div id="tsPatch"><p class="muted small">Loading...</p></div></section>
      <section class="ts-sec"><h3>Sleepers this week</h3><div id="tsSleep"><p class="muted small">Loading...</p></div></section>
      <section class="ts-sec"><h3>Community builds</h3>
        <p class="small">${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.name)} on the WARFRAME Wiki</a> &middot; ` : ''}
          <a href="https://www.reddit.com/r/Warframe/search/?q=${encodeURIComponent(w.name + ' build')}&sort=top&t=year" target="_blank" rel="noopener">r/Warframe: top "${esc(w.name)} build" posts this year</a> &middot;
          <a href="https://overframe.gg/" target="_blank" rel="noopener">Overframe (community builds and tier list)</a></p></section>
      <p class="muted small">Results follow the enemy and buffs you have set. Fan-made, not affiliated with Digital Extremes.</p>`;
    if (!dlg.open) dlg.showModal();
    // run the three optimizations one per tick so the page stays responsive
    let L;
    try { L = T.leanSteps(b, D, { metric: $('metric').value, slots: UI.rivenIndex() >= 0 ? UI.SLOT_COUNT - 1 : UI.SLOT_COUNT, fixedArcanes: [state.arcanes[1]].filter(Boolean) }); }
    catch (e) { $('tsLean').innerHTML = `<p class="warn-t">${esc(e.message)}</p>`; return; }
    const res = {};
    const order = ['best', 'crit', 'status'];
    const step = i => {
      if (my !== run) return;
      if (i >= order.length) { finish(L, res, b, my); return; }
      const el = $('tsStep'); if (el) el.textContent = { best: 'best build', crit: 'crit-only build', status: 'status-only build' }[order[i]] + ` (${i + 1} of 3)`;
      setTimeout(() => { try { res[order[i]] = L.steps[order[i]](); } catch (e) { res[order[i]] = { score: 0, mods: [], error: e.message }; } step(i + 1); }, 30);
    };
    step(0);
    renderSleepers(w);
  }

  function buildList(o) {
    return esc(o.mods.concat(o.exilus ? [o.exilus + ' (exilus)'] : []).join(', ')) + (o.arcane ? `; arcane: ${esc(o.arcane)}` : '');
  }
  function finish(L, res, b, my) {
    const v = T.leanVerdict(L.weapon, D, res.best, res.crit, res.status, b.attack);
    lastLean = v;
    const max = Math.max(v.best.score, v.crit.score, v.status.score) || 1;
    const bar = (label, o, key) => `<div class="ts-bar"><span>${label}</span><span class="track"><span class="fill ${key}" style="width:${(o.score / max * 100).toFixed(1)}%"></span></span>
      <b>${fmt(o.score)}</b><button type="button" class="btn ghost sm" data-apply="${key}">Use</button></div>`;
    let [title, desc] = STYLE[v.verdict];
    // hybrid because the mixed build wins, even though one style clearly out-damages the other
    if (v.verdict === 'hybrid' && v.ratio !== Infinity && Math.max(v.ratio, 1 / v.ratio) >= T.LEAN_RATIO)
      desc = `${v.ratio >= 1 ? 'Crit' : 'Status'} does most of the work, but adding ${v.ratio >= 1 ? 'status' : 'crit'} mods on top beats a pure ${v.ratio >= 1 ? 'crit' : 'status'} build.`;
    const ratioTxt = v.ratio === Infinity ? 'The status build does no damage here.' : v.ratio >= 1 ? `Crit build deals ${v.ratio.toFixed(2)}x the status build.` : `Status build deals ${(1 / v.ratio).toFixed(2)}x the crit build.`;
    $('tsLean').innerHTML = `
      <div class="ts-verdict v-${v.verdict}"><span class="ts-chip">${title}</span> <span>${esc(desc)}</span></div>
      <p class="small">${esc(ratioTxt)} <span class="muted">Crit or Status needs a ${Math.round((T.LEAN_RATIO - 1) * 100)}% lead. It also counts as Hybrid when a mixed build beats both by more than 10%.</span></p>
      ${bar('Best', v.best, 'best')}${bar('Crit only', v.crit, 'crit')}${bar('Status only', v.status, 'status')}
      <details class="small"><summary>Show the builds</summary>
        <p><b>Best:</b> ${buildList(v.best)}</p><p><b>Crit only:</b> ${buildList(v.crit)}</p><p><b>Status only:</b> ${buildList(v.status)}</p></details>
      <ul class="small ts-notes">${v.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
    // patch ideas need the game updates feed
    const patch = $('tsPatch');
    if (!(window.WFNews && WFNews.loadUpdates)) { patch.innerHTML = '<p class="muted small">Game updates feed not loaded.</p>'; return; }
    WFNews.loadUpdates().then(u => {
      if (my !== run) return;
      const base = Object.assign({}, b);
      let ideas = [];
      try { ideas = T.patchIdeas(base, D, u && u.releases, { metric: $('metric').value, slots: UI.rivenIndex() >= 0 ? UI.SLOT_COUNT - 1 : UI.SLOT_COUNT }); } catch (e) { /* ignore */ }
      patch.innerHTML = ideas.length ? `<p class="muted small">From recent patch notes, tested in your build.</p>
        <ul class="ts-ideas">${ideas.slice(0, 8).map(i => `<li><b>${esc(i.name)}</b> <span class="muted small">${esc(i.kind)}</span>
          <span class="${i.gain > 0.005 ? 'pos' : 'muted'}">${i.gain > 0.005 ? '+' + (i.gain * 100).toFixed(1) + '%' : 'no gain here'}</span>
          ${i.replaces ? `<span class="muted small">in place of ${esc(i.replaces)}</span>` : ''}
          <a class="small" href="${esc(i.url)}" target="_blank" rel="noopener">${esc((i.release.match(/(Hotfix|Update)\s+[\d.]+/) || [i.release])[0])}</a></li>`).join('')}</ul>`
        : `<p class="muted small">Nothing for this weapon type in recent patches.</p>`;
    });
  }

  async function renderSleepers(w) {
    const el = $('tsSleep');
    const m = await loadMeta();
    if (!m) { el.innerHTML = '<p class="muted small">Not available yet.</p>'; return; }
    const c = m.categories[w.category];
    if (!c) { el.innerHTML = '<p class="muted small">Not available for this weapon type.</p>'; return; }
    const s = m.scenario;
    const mine = c.top.find(r => r.name === w.name) || c.sleepers.find(r => r.name === w.name);
    const row = r => `<li><button type="button" class="linkbtn" data-open="${esc(r.name)}">${esc(r.name)}</button> <span class="muted small">#${r.rank} of ${c.count}${r.dispo ? `, old disposition ${r.dispo}` : ''}</span> <b>${fmt(r.dps)}</b></li>`;
    el.innerHTML = `<p class="muted small">Weapons DE rated as least used (1.3+ in its last riven disposition list, before dispositions were retired on 2026-10-22) that still rank high. ${esc(s.unit)}, level ${s.level}${s.steelPath ? ' Steel Path' : ''}, ${esc(s.metric)}, no riven or Warframe buffs. Updated ${esc(String(m.builtAt).slice(0, 10))}.</p>
      ${c.sleepers.length ? `<ol class="ts-list">${c.sleepers.slice(0, 8).map(row).join('')}</ol>` : '<p class="muted small">None this week.</p>'}
      <details class="small"><summary>Top ${esc(w.category.toLowerCase())} weapons</summary><ol class="ts-list">${c.top.slice(0, 15).map(row).join('')}</ol></details>
      ${mine ? '' : `<p class="muted small">${esc(w.name)} is outside the top 15.</p>`}`;
  }

  body.addEventListener('click', e => {
    const ap = e.target.closest('[data-apply]');
    if (ap && lastLean) {
      const o = lastLean[ap.dataset.apply];
      const b = UI.collect();
      const rIdx = UI.rivenIndex();
      const mods = o.mods.slice(0, rIdx >= 0 ? UI.SLOT_COUNT - 1 : UI.SLOT_COUNT);
      if (rIdx >= 0) mods.splice(rIdx, 0, UI.RIVEN);
      UI.apply(Object.assign({}, b, { mods: undefined, slotLayout: mods.concat(new Array(UI.SLOT_COUNT).fill(null)).slice(0, UI.SLOT_COUNT).concat([o.exilus || null]),
        slotRanks: [], arcaneSlots: [o.arcane || null, state.arcanes[1] || null] }));
      UI.flashMsg(`Applied the ${ap.dataset.apply === 'best' ? 'best' : ap.dataset.apply + '-only'} build.`);
      dlg.close();
      return;
    }
    const op = e.target.closest('[data-open]');
    if (op) {
      const m = window.WF_META; const w = D.weapons.find(x => x.name === op.dataset.open); if (!w || !m) return;
      const r = (m.categories[w.category].top.concat(m.categories[w.category].sleepers)).find(x => x.name === w.name);
      UI.apply({ weapon: w.name, mods: r ? r.mods.concat(r.exilus ? [r.exilus] : []) : [], arcanes: r && r.arcane ? [r.arcane] : [], enemy: UI.collect() ? UI.collect().enemy : undefined });
      UI.flashMsg(`Loaded ${w.name}.`);
      dlg.close();
    }
  });
  $('askTeshin').addEventListener('click', open);
  dlg.addEventListener('close', () => { run++; });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
};
