/*
 * Extra UI features layered on top of ui/app.js through window.WFUI:
 * theme toggle, feedback link, undo/redo, patch banner, mod value preview, capacity/forma,
 * Incarnon evolutions, enemy unit picker, build compare, weapon leaderboard, community builds, PWA.
 */
window.WFFeatures = function (UI) {
  const { D, E, S, WF, state, SLOT_COUNT, $, esc, fmt, pct, img } = UI;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  const metricOf = (r, m) => m === 'perShotVsEnemy' ? r.perShotVsEnemy : r.dps[m];
  const typing = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

  // ---------------- theme ----------------
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(store.get('wfcalc.theme', null));
  $('themeToggle').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next); store.set('wfcalc.theme', next);
  };

  // ---------------- feedback link (prefilled GitHub issue) ----------------
  $('feedbackLink').addEventListener('click', () => {
    const b = UI.collect();
    const body = `**What happened / what looks wrong?**\n\n\n**Expected (and source, e.g. wiki link):**\n\n\n<details><summary>Build</summary>\n\n\`\`\`json\n${b ? JSON.stringify({ weapon: b.weapon, attack: b.attack, mods: b.mods, arcanes: b.arcanes, incarnon: b.incarnon, buffs: b.buffs, enemy: b.enemy }, null, 1) : 'none'}\n\`\`\`\n</details>\n\nData: ${D.meta.version}`;
    const url = 'https://github.com/Whitey-cpu/warframe-calc/issues/new?title=' + encodeURIComponent('Feedback: ' + (b ? b.weapon : 'site')) + '&body=' + encodeURIComponent(body.slice(0, 6000));
    $('feedbackLink').href = url;
  });

  // ---------------- undo / redo ----------------
  const hist = { stack: [], idx: -1, applying: false };
  function snapshot(b) {
    if (hist.applying || !b) return;
    const j = JSON.stringify(b);
    if (hist.stack[hist.idx] === j) return;
    hist.stack = hist.stack.slice(0, hist.idx + 1);
    hist.stack.push(j);
    if (hist.stack.length > 100) hist.stack.shift();
    hist.idx = hist.stack.length - 1;
    syncHistButtons();
  }
  function syncHistButtons() { $('undoBtn').disabled = hist.idx <= 0; $('redoBtn').disabled = hist.idx >= hist.stack.length - 1; }
  function go(delta) {
    const i = hist.idx + delta;
    if (i < 0 || i >= hist.stack.length) return;
    hist.idx = i; hist.applying = true;
    UI.apply(JSON.parse(hist.stack[i]));
    setTimeout(() => { hist.applying = false; syncHistButtons(); }, 120);
  }
  $('undoBtn').onclick = () => go(-1);
  $('redoBtn').onclick = () => go(1);
  document.addEventListener('keydown', e => {
    if (typing(document.activeElement) || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); go(-1); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); go(1); }
    else if (e.key === '/' && !mod) { e.preventDefault(); $('modSearch').focus(); }
  });
  let snapTimer = null;
  UI.hooks.push(b => { clearTimeout(snapTimer); snapTimer = setTimeout(() => snapshot(b), 350); });

  // ---------------- patch banner ----------------
  (function banner() {
    const ch = D.meta.changes;
    const seen = store.get('wfcalc.seenData', null);
    if (!ch || seen === D.meta.version) return;
    const list = (arr, n = 8) => arr.length ? arr.slice(0, n).map(esc).join(', ') + (arr.length > n ? ` and ${arr.length - n} more` : '') : '';
    const parts = [
      ch.weaponsAdded.length && `New weapons: ${list(ch.weaponsAdded)}`,
      ch.weaponsChanged.length && `Changed weapons: ${list(ch.weaponsChanged)}`,
      ch.modsAdded.length && `New mods: ${list(ch.modsAdded)}`,
      ch.modsChanged.length && `Changed mods: ${list(ch.modsChanged)}`
    ].filter(Boolean);
    if (!parts.length) return;
    const el = $('patchBanner');
    el.innerHTML = `<b>Game data updated</b> to ${esc(D.meta.version)} (from ${esc(D.meta.previousVersion || '?')}). ${parts.join(' &middot; ')}
      <a href="https://www.warframe.com/en/patch-notes" target="_blank" rel="noopener">Patch notes</a>
      <button type="button" class="btn ghost sm" id="bannerClose">Dismiss</button>`;
    el.hidden = false;
    $('bannerClose').onclick = () => { el.hidden = true; store.set('wfcalc.seenData', D.meta.version); };
  })();

  // ---------------- mod value preview ----------------
  let deltaTimer = null;
  function computeDeltas(b, result) {
    if (!$('showDelta').checked) { document.querySelectorAll('.mod-delta, .slot-val').forEach(x => { x.textContent = ''; }); return; }
    const metric = $('metric').value || 'sustainedTotal';
    const base = metricOf(result, metric);
    if (!(base > 0)) return;
    // contribution of each equipped mod: how much worse the build is without it
    state.mods.forEach((n, i) => {
      const el = document.querySelector(`.slot-val[data-val="${i}"]`);
      if (!el || !n) return;
      const mods = b.mods.filter(m => (typeof m === 'string' ? m : m.name) !== n);
      const without = metricOf(E.calculate(Object.assign({}, b, { mods }), D), metric);
      const gain = without > 0 ? (base / without - 1) * 100 : 0;
      el.textContent = (gain >= 0 ? '+' : '') + gain.toFixed(gain >= 10 || gain <= -10 ? 0 : 1) + '%';
      el.className = 'slot-val ' + (gain > 0.05 ? 'pos' : gain < -0.05 ? 'neg' : 'zero');
      el.title = `Removing this mod changes ${metric === 'perShotVsEnemy' ? 'damage per shot' : 'DPS'} from ${fmt(base)} to ${fmt(without)}`;
    });
    // value of adding each visible browser mod to the first empty slot (or the exilus slot for exilus mods)
    const emptyNormal = state.mods.slice(0, SLOT_COUNT).indexOf(null) >= 0;
    const emptyEx = !state.mods[SLOT_COUNT];
    const equipped = new Set(state.mods.filter(Boolean));
    const roots = new Set([...equipped].map(E.variantRoot));
    document.querySelectorAll('#modGrid .mod-delta').forEach(el => {
      const n = el.dataset.delta;
      const m = UI.findModByName(n);
      if (!m || equipped.has(n) || roots.has(E.variantRoot(n)) || (!emptyNormal && !(m.exilus && emptyEx))) { el.textContent = ''; return; }
      const withIt = metricOf(E.calculate(Object.assign({}, b, { mods: b.mods.concat([n]) }), D), metric);
      const gain = (withIt / base - 1) * 100;
      if (Math.abs(gain) < 0.05) { el.textContent = '+0%'; el.className = 'mod-delta zero'; return; }
      el.textContent = (gain >= 0 ? '+' : '') + gain.toFixed(gain >= 10 || gain <= -10 ? 0 : 1) + '%';
      el.className = 'mod-delta ' + (gain > 0 ? 'pos' : 'neg');
      el.title = `Adding ${n}: ${fmt(base)} -> ${fmt(withIt)}`;
    });
  }
  UI.hooks.push((b, r) => { clearTimeout(deltaTimer); deltaTimer = setTimeout(() => computeDeltas(b, r), 120); });
  $('showDelta').addEventListener('change', () => UI.update());
  $('metric').addEventListener('change', () => UI.update());
  // re-run deltas when the browser list changes (search/filter)
  new MutationObserver(() => { const b = UI.collect(); if (b) { clearTimeout(deltaTimer); deltaTimer = setTimeout(() => computeDeltas(b, E.calculate(b, D)), 150); } })
    .observe($('modGrid'), { childList: true });

  // ---------------- capacity / forma ----------------
  function renderCapacity() {
    if (!state.weapon) { $('capInfo').innerHTML = ''; return; }
    const rows = state.mods.map((n, i) => ({ mod: n ? UI.findModByName(n) : null, rank: state.ranks[i], slotPolarity: state.pols[i] }));
    const innate = (state.weapon.polarities || []).slice();
    const c = WF.capacity.check({ mods: rows, catalyst: $('catalyst').checked, innate: innate.concat(state.weapon.exilusPolarity ? [state.weapon.exilusPolarity] : []) });
    const pctUsed = Math.min(100, c.used / c.capacity * 100);
    $('capInfo').innerHTML = `<div class="cap-bar${c.fits ? '' : ' over'}"><span style="width:${pctUsed.toFixed(1)}%"></span></div>
      <span class="small"><b class="${c.fits ? '' : 'warn-t'}">${c.used}/${c.capacity}</b> capacity${c.fits ? '' : ` (over by ${c.used - c.capacity})`} &middot; ${c.forma} forma vs. innate polarities</span>`;
    $('capInfo').title = 'Click a slot\'s polarity circle to set forma polarities. Matching halves drain (rounded up), mismatched adds 25%. Source: wiki Mod Capacity. Innate polarities are assumed to be in the first slots.';
  }
  UI.onSlots = renderCapacity;
  $('catalyst').addEventListener('change', renderCapacity);

  // ---------------- Incarnon evolutions ----------------
  let incWeapon = null;
  function renderIncarnon() {
    const panel = $('incarnonPanel');
    const preset = state.weapon && WF.incarnonFor(state.weapon.name);
    if (!preset) { panel.hidden = true; panel.innerHTML = ''; incWeapon = state.weapon && state.weapon.name; return; }
    panel.hidden = false;
    panel.innerHTML = `<div class="sec-head"><h2>Incarnon evolutions</h2><span class="muted small">Source: <a href="${esc(preset.source)}" target="_blank" rel="noopener">wiki</a></span></div>
      <div class="inc-tiers">${preset.tiers.map(t => `<fieldset class="inc-tier"><legend>Tier ${esc(t.tier)}</legend>
        <label class="check small"><input type="radio" name="inc-${esc(t.tier)}" value="" ${!state.incarnon[t.tier] ? 'checked' : ''}> None</label>
        ${t.perks.map(p => `<label class="check small${p.modeled === false ? ' muted' : ''}" title="${esc(p.text)}${p.attack ? ' (applies to ' + esc(p.attack) + ' attack)' : ''}${p.modeled === false ? ' (no damage effect modeled)' : ''}">
          <input type="radio" name="inc-${esc(t.tier)}" value="${esc(p.name)}" ${state.incarnon[t.tier] === p.name ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}
      </fieldset>`).join('')}</div>`;
    incWeapon = state.weapon.name;
  }
  $('incarnonPanel').addEventListener('change', e => {
    const r = e.target.closest('input[type=radio]'); if (!r) return;
    const tier = r.name.replace('inc-', '');
    if (r.value) state.incarnon[tier] = r.value; else delete state.incarnon[tier];
    UI.update();
  });
  UI.hooks.push(b => {
    const want = JSON.stringify(state.incarnon);
    if (!state.weapon || incWeapon !== state.weapon.name || $('incarnonPanel').dataset.sel !== want) { renderIncarnon(); $('incarnonPanel').dataset.sel = want; }
  });

  // ---------------- enemy unit picker ----------------
  function renderEnemyUnit() {
    const u = state.enemyUnit && D.enemies.find(x => x.name === state.enemyUnit);
    $('enemyName').innerHTML = u ? `<b>${esc(u.name)}</b> <span class="muted">base HP ${u.health} &middot; shield ${u.shield} &middot; armor ${u.armor}</span>` : 'Manual armor (no unit)';
    $('clearEnemy').hidden = !u;
    $('unitFields').classList.toggle('dim', !u);
    if (!u) { $('unitStats').textContent = ''; $('armor').disabled = false; }
  }
  UI.renderEnemyUnit = renderEnemyUnit;
  const FACTION_CHIPS = [['all', 'All'], ['Grineer', 'Grineer'], ['Corpus', 'Corpus'], ['Infested', 'Infested'], ['Orokin (Corrupted)', 'Corrupted'], ['Sentient', 'Sentient']];
  $('pickEnemy').onclick = () => UI.openPicker({
    title: 'Enemies', items: D.enemies, current: state.enemyUnit,
    chips: FACTION_CHIPS,
    filter: (u, c) => c === 'all' || u.faction === c,
    text: u => u.faction || '',
    meta: u => `HP ${u.health} &middot; Sh ${u.shield} &middot; Ar ${u.armor}${u.faction ? ' &middot; ' + esc(u.faction) : ''}`,
    onPick: u => {
      state.enemyUnit = u ? u.name : null;
      if (u && u.faction && S.FACTIONS[u.faction]) $('faction').value = u.faction;
      renderEnemyUnit(); UI.update();
    }
  });
  $('clearEnemy').onclick = () => { state.enemyUnit = null; renderEnemyUnit(); UI.update(); };
  renderEnemyUnit();

  // ---------------- compare ----------------
  let A = null;
  $('pinA').onclick = () => {
    const b = UI.collect(); if (!b) return;
    A = { build: b, result: E.calculate(b, D), label: `${b.weapon} (${b.mods.length} mods)` };
    $('swapAB').hidden = false; $('clearA').hidden = false;
    UI.update();
  };
  $('clearA').onclick = () => { A = null; $('compareOut').innerHTML = ''; $('swapAB').hidden = true; $('clearA').hidden = true; };
  $('swapAB').onclick = () => {
    if (!A) return;
    const cur = UI.collect();
    const old = A.build;
    A = cur ? { build: cur, result: E.calculate(cur, D), label: `${cur.weapon} (${cur.mods.length} mods)` } : null;
    UI.apply(old);
  };
  UI.hooks.push((b, r) => {
    if (!A) return;
    const rowsDef = [
      ['Sustained DPS', x => x.dps.sustainedTotal, true], ['Burst DPS', x => x.dps.burstTotal, true], ['Avg per shot', x => x.perShotVsEnemy, true],
      ['Crit chance', x => x.stats.critChance, true, v => pct(v)], ['Crit mult', x => x.stats.critMultiplier, true, v => 'x' + fmt(v)],
      ['Status chance', x => x.stats.statusChance, true, v => pct(v)], ['Multishot', x => x.stats.multishot, true],
      ['Fire rate', x => x.stats.effectiveFireRate, true], ['Time to kill', x => x.ttk ? x.ttk.seconds : null, false, v => v == null ? '-' : v.toFixed(2) + 's']
    ];
    const cell = (v, f) => f ? f(v) : fmt(v);
    const rows = rowsDef.map(([k, get, higherBetter, f]) => {
      const a = get(A.result), c = get(r);
      let d = '';
      if (a != null && c != null && a !== 0) {
        const pctd = (c / a - 1) * 100;
        const good = higherBetter ? pctd > 0 : pctd < 0;
        d = Math.abs(pctd) < 0.05 ? '<span class="muted">same</span>' : `<span class="${good ? 'pos' : 'neg'}">${pctd > 0 ? '+' : ''}${pctd.toFixed(1)}%</span>`;
      }
      return `<tr><td>${k}</td><td>${cell(a, f)}</td><td>${cell(c, f)}</td><td>${d}</td></tr>`;
    }).join('');
    const names = x => x.mods.map(m => typeof m === 'string' ? m : m.name);
    const an = names(A.build), bn = names(b);
    const removed = an.filter(n => !bn.includes(n)), added = bn.filter(n => !an.includes(n));
    $('compareOut').innerHTML = `<table><tr><th></th><th>A</th><th>Current</th><th>Diff</th></tr>${rows}</table>
      ${A.build.weapon !== b.weapon ? `<p class="small">Weapon: ${esc(A.build.weapon)} &rarr; ${esc(b.weapon)}</p>` : ''}
      ${added.length || removed.length ? `<p class="small">${added.length ? `<span class="pos">+ ${added.map(esc).join(', ')}</span>` : ''}${added.length && removed.length ? '<br>' : ''}${removed.length ? `<span class="neg">&minus; ${removed.map(esc).join(', ')}</span>` : ''}</p>` : '<p class="small muted">Same mods.</p>'}`;
  });

  // ---------------- weapon leaderboard ----------------
  let lbStop = false;
  $('lbStop').onclick = () => { lbStop = true; };
  $('lbRun').onclick = async () => {
    const b = UI.collect() || { enemy: { faction: $('faction').value, armor: +$('armor').value || 0 }, buffs: [], conditions: {} };
    const cat = $('lbCat').value, metric = $('lbMetric').value, quick = $('lbOpt').checked, primeOnly = $('lbPrimeOnly').checked;
    const list = D.weapons.filter(w => w.category === cat && (!primeOnly || w.isPrime || w.incarnon));
    lbStop = false; $('lbRun').disabled = true; $('lbStop').hidden = false;
    const results = [];
    const t0 = performance.now();
    for (let i = 0; i < list.length && !lbStop; i++) {
      const w = list[i];
      try {
        const scen = { weapon: w, enemy: b.enemy, buffs: b.buffs, customBuffs: b.customBuffs, conditions: b.conditions };
        if (quick) {
          const o = WF.optimizer.optimize(Object.assign({}, scen, { metric, restarts: 0, arcane: true, exilus: true }), D);
          results.push({ w, score: o.score, build: Object.assign({}, o.build, { weapon: w.name }) });
        } else {
          const r = E.calculate(scen, D);
          results.push({ w, score: metricOf(r, metric), build: Object.assign({}, scen, { weapon: w.name, mods: [] }) });
        }
      } catch (e) { /* skip weapons the engine cannot handle */ }
      if (i % 3 === 0) {
        $('lbProgress').textContent = `Ranking ${i + 1} of ${list.length}: ${w.name}`;
        await new Promise(res => setTimeout(res, 0));
      }
    }
    $('lbRun').disabled = false; $('lbStop').hidden = true;
    results.sort((a, c) => c.score - a.score);
    $('lbProgress').textContent = `${results.length} weapons ranked in ${((performance.now() - t0) / 1000).toFixed(1)}s${lbStop ? ' (stopped early)' : ''}. Uses your enemy and buff settings.`;
    window.__lb = results;
    $('lbOut').innerHTML = `<table class="lb-table"><tr><th>#</th><th></th><th>Weapon</th><th>${esc($('lbMetric').selectedOptions[0].textContent)}</th><th></th></tr>${results.slice(0, 40).map((x, i) => `
      <tr><td>${i + 1}</td><td class="lb-img">${img(x.w.image, x.w.name)}</td><td>${esc(x.w.name)} <span class="muted small">${esc(x.w.type)}</span></td><td>${fmt(x.score)}</td>
      <td><button type="button" class="btn ghost sm" data-lb="${i}">Load</button></td></tr>`).join('')}</table>`;
  };
  $('lbOut').addEventListener('click', e => {
    const btn = e.target.closest('[data-lb]'); if (!btn) return;
    const x = window.__lb[+btn.dataset.lb];
    if (x) { const cur = UI.collect() || {}; UI.apply(Object.assign({}, cur, x.build, { slotLayout: undefined, slotRanks: undefined, slotPolarities: undefined, arcaneSlots: undefined, incarnon: undefined })); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  // ---------------- community builds ----------------
  async function loadPublic() {
    if (!UI.accountsEnabled()) { $('publicPanel').hidden = true; return; }
    $('publicPanel').hidden = false;
    const q = $('pubSearch').value.trim();
    try {
      const j = await UI.api(`/public?sort=${encodeURIComponent($('pubSort').value)}${q ? '&weapon=' + encodeURIComponent(q) : ''}`);
      $('pubList').innerHTML = j.builds.length ? j.builds.map(x => `<div class="pub">
          <span class="pub-img">${img(x.image, x.weapon)}</span>
          <span class="pub-t"><b>${esc(x.title || x.weapon)}</b><span class="muted small">${esc(x.weapon)}${x.dps ? ' &middot; ' + fmt(x.dps) + ' DPS' : ''}</span></span>
          <button type="button" class="btn ghost sm${x.liked ? ' liked' : ''}" data-like="${esc(x.id)}" title="${UI.getUser() ? 'Like' : 'Sign in to like'}">&#9829; ${x.likes}</button>
          <button type="button" class="btn ghost sm" data-open="${esc(x.id)}">Open</button>
          <button type="button" class="linkbtn" data-report="${esc(x.id)}" title="Report this build">report</button>
        </div>`).join('') : '<p class="muted small">No public builds yet.</p>';
    } catch (e) { $('pubList').innerHTML = `<p class="muted small">Could not load community builds (${esc(e.message)}).</p>`; }
  }
  $('pubSearch').addEventListener('input', () => { clearTimeout(loadPublic.t); loadPublic.t = setTimeout(loadPublic, 300); });
  $('pubSort').addEventListener('change', loadPublic);
  $('pubList').addEventListener('click', async e => {
    const open = e.target.closest('[data-open]');
    if (open) { location.hash = 'share=' + open.dataset.open; return; }
    const like = e.target.closest('[data-like]');
    if (like) {
      if (!UI.getUser()) { UI.flashMsg('Sign in with Discord to like builds.'); return; }
      try { await UI.api(`/shares/${like.dataset.like}/like`, { method: 'POST', body: '{}' }); loadPublic(); } catch (err) { UI.flashMsg(err.message); }
      return;
    }
    const rep = e.target.closest('[data-report]');
    if (rep) {
      if (!UI.getUser()) { UI.flashMsg('Sign in with Discord to report builds.'); return; }
      if (!confirm('Report this build as inappropriate or spam?')) return;
      try { await UI.api(`/shares/${rep.dataset.report}/report`, { method: 'POST', body: '{}' }); UI.flashMsg('Reported. Thanks.'); loadPublic(); } catch (err) { UI.flashMsg(err.message); }
    }
  });
  UI.loadPublic = loadPublic;
  setTimeout(loadPublic, 1500);

  // ---------------- installable app (PWA) ----------------
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window.wfApp && window.wfApp.isDesktop)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ }); });
  }
};
