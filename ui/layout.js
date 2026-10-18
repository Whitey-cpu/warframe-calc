/*
 * Arsenal-style layout: stat panel tabs, in-game style stat list, combat headline, Config A-D per weapon,
 * phone bottom bar with a full-screen mod browser sheet, and the classic-layout toggle.
 * The layout parts that need no game state run immediately; the rest starts from window.WFLayout(UI).
 */
(function () {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const mobileMq = window.matchMedia('(max-width: 760px)');
  const isMobile = () => mobileMq.matches && root.dataset.layout !== 'classic';

  // ---------------- layout toggle ----------------
  function setLayout(l) {
    root.dataset.layout = l;
    try { localStorage.setItem('wfcalc.layout', l); } catch (e) { /* ignore */ }
    $('layoutToggle').textContent = l === 'classic' ? 'Arsenal view' : 'Classic view';
    applyMobileView();
  }
  $('layoutToggle').addEventListener('click', () => setLayout(root.dataset.layout === 'classic' ? 'arsenal' : 'classic'));

  // ---------------- stat panel tabs (WAI-ARIA tabs pattern) ----------------
  const tabs = [...document.querySelectorAll('#statTabs [role=tab]')];
  function selectTab(name, focus) {
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll('#statPanel [role=tabpanel]').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
    store.set('wfcalc.tab', name);
  }
  $('statTabs').addEventListener('click', e => { const t = e.target.closest('[role=tab]'); if (t) selectTab(t.dataset.tab); });
  $('statTabs').addEventListener('keydown', e => {
    const visible = tabs.filter(t => t.offsetParent !== null);
    const i = visible.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % visible.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = visible.length - 1;
    if (j == null) return;
    e.preventDefault();
    selectTab(visible[j].dataset.tab, true);
  });
  selectTab(store.get('wfcalc.tab', 'arsenal'));
  window.WFSelectTab = selectTab;

  // ---------------- phone: bottom bar views + mod browser sheet ----------------
  let mview = 'mods';
  const GROUP_FIRST = { stats: 'arsenal', enemy: 'enemy', more: 'optimize' };
  function applyMobileView() {
    const mobile = isMobile();
    if (mobile) root.dataset.mv = mview; else delete root.dataset.mv;
    document.querySelectorAll('[data-mview]').forEach(el => el.classList.toggle('mv-hide', mobile && !el.dataset.mview.split(' ').includes(mview)));
    tabs.forEach(t => t.classList.toggle('mg-off', mobile && t.dataset.mgroup !== mview));
    document.querySelectorAll('#bottomBar [data-mv]').forEach(b => { if (b.dataset.mv === mview) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (mobile && GROUP_FIRST[mview]) {
      const cur = tabs.find(t => t.getAttribute('aria-selected') === 'true');
      if (!cur || cur.dataset.mgroup !== mview) selectTab(GROUP_FIRST[mview]);
    }
    if (!mobile) closeSheet(true);
  }
  $('bottomBar').addEventListener('click', e => {
    const b = e.target.closest('[data-mv]'); if (!b) return;
    mview = b.dataset.mv;
    applyMobileView();
    window.scrollTo({ top: 0 });
  });
  mobileMq.addEventListener('change', applyMobileView);
  // open a stat tab from elsewhere (e.g. the Riven Mod card): on phones switch to that tab's bottom-bar view first
  window.WFOpenTab = name => {
    const t = tabs.find(x => x.dataset.tab === name);
    if (t && isMobile() && t.dataset.mgroup !== mview) { mview = t.dataset.mgroup; applyMobileView(); }
    selectTab(name, true);
  };

  const appMain = $('appMain');
  function openSheet() {
    if (!isMobile() || document.body.classList.contains('sheet-open')) return;
    document.body.classList.add('sheet-open');
    $('browser').setAttribute('role', 'dialog');
    $('browser').setAttribute('aria-modal', 'true');
    [...appMain.children].forEach(el => { if (el.id !== 'browser') el.inert = true; });
    $('bottomBar').inert = true;
    history.pushState({ wfSheet: 1 }, '');
    $('modSearch').focus({ preventScroll: true });
  }
  function closeSheet(silent) {
    if (!document.body.classList.contains('sheet-open')) return;
    document.body.classList.remove('sheet-open');
    $('browser').removeAttribute('role');
    $('browser').removeAttribute('aria-modal');
    [...appMain.children].forEach(el => { el.inert = false; });
    $('bottomBar').inert = false;
    if (!silent && history.state && history.state.wfSheet) history.back();
    if (!silent) $('openBrowser').focus({ preventScroll: true });
  }
  $('openBrowser').addEventListener('click', openSheet);
  $('closeBrowser').addEventListener('click', () => closeSheet());
  window.addEventListener('popstate', () => closeSheet(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) closeSheet(); });
  // tapping an empty slot on a phone opens the browser
  $('slots').addEventListener('click', e => {
    const slot = e.target.closest('.slot');
    if (slot && !slot.querySelector('.mod') && !e.target.closest('button')) openSheet();
  });

  setLayout(root.dataset.layout === 'classic' ? 'classic' : 'arsenal');

  // ======================================================================
  // Parts that need the calculator state
  // ======================================================================
  window.WFLayout = function (UI) {
    const { D, E, S, state, esc, fmt, pct } = UI;
    const COMBO = { blast: 'heat + cold', corrosive: 'electricity + toxin', gas: 'heat + toxin', magnetic: 'cold + electricity', radiation: 'heat + electricity', viral: 'cold + toxin' };
    const COLORS = { impact: '#8fb0c9', puncture: '#d2bd8f', slash: '#e06c6c', heat: '#ff8a3d', cold: '#7cc7ff', electricity: '#b18cff', toxin: '#6fd36f',
      blast: '#ffb347', radiation: '#ffe066', gas: '#9bd18b', magnetic: '#6aa5ff', viral: '#4fd1a5', corrosive: '#c6d85a', void: '#e6e6ff', tau: '#ffd1f0', true: '#ffffff' };
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const n2 = v => (Math.round(v * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const n1 = v => (Math.round(v * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
    const pc = v => n1(v * 100) + '%';

    // ---------------- in-game style stat list ----------------
    // Numbers are "arsenal" numbers: no enemy, no ability buffs, no On Kill stacks, like the in-game Upgrade screen.
    // Values that differ from the same weapon with no mods are coloured (up / down).
    function arsenalCalc(b, attack, noMods) {
      return E.calculate(Object.assign({}, b, {
        attack, extraAttacks: [], buffs: [], enemy: { faction: 'None (neutral)', armor: 0 },
        mods: noMods ? [] : b.mods, arcanes: noMods ? [] : b.arcanes, riven: noMods ? [] : b.riven, customBuffs: noMods ? [] : b.customBuffs,
        conditions: Object.assign({}, b.conditions, { assumeMax: false, selfStatus: false, fightSeconds: undefined, statusTypes: 0, stacks: {} })
      }), D);
    }
    function row(label, val, baseVal, text, extraCls) {
      let cls = '';
      if (typeof val === 'number' && typeof baseVal === 'number' && baseVal > 0) {
        if (val > baseVal * 1.0005) cls = 'up'; else if (val < baseVal * 0.9995) cls = 'down';
      }
      return `<div class="gs-row${extraCls ? ' ' + extraCls : ''}"><span class="gs-k">${label}</span><span class="gs-v ${cls}">${text != null ? text : fmt(val)}</span></div>`;
    }
    function damageRows(ar, base) {
      const t = ar.arsenal.types, bt = (base && base.arsenal.types) || {};
      return Object.entries(t).filter(([, v]) => v > 0).map(([k, v]) =>
        row(`<i class="dot" style="background:${COLORS[k] || 'var(--accent)'}"></i>${cap(k)}${COMBO[k] ? ` <span class="muted">(${COMBO[k]})</span>` : ''}`, v, bt[k], n1(v)))
        .join('') + row('Total', ar.arsenal.total, base && base.arsenal.total, n1(ar.arsenal.total), 'gs-total');
    }
    function attackBlock(title, ar, base, w, opts) {
      const s = ar.stats, bs = base ? base.stats : {};
      const rows = [];
      if (!opts.damageOnly) {
        rows.push(row(w.category === 'Melee' ? 'Attack Speed' : 'Fire Rate', s.fireRate, bs.fireRate, n2(s.fireRate)));
        if (w.category !== 'Melee') rows.push(row('Multishot', ar.arsenal.multishot, base && base.arsenal.multishot, n2(ar.arsenal.multishot)));
        if (opts.main && s.magazine > 1) rows.push(row('Magazine', s.magazine, bs.magazine, String(s.magazine)));
        if (opts.main && s.reload) rows.push(row('Reload', bs.reload ? 1 / s.reload : 0, bs.reload ? 1 / bs.reload : 0, n2(s.reload) + 's'));
        if (opts.main && s.chargeTime) rows.push(row('Charge Time', s.chargeTime, bs.chargeTime, n2(s.chargeTime) + 's'));
        if (opts.main && w.trigger) rows.push(row('Trigger', null, null, esc(String(w.trigger).toUpperCase())));
        if (opts.main && w.disposition) rows.push(row('Riven Disposition', null, null, `<span class="dispo">${'&#9679;'.repeat(Math.round(w.disposition))}${'&#9675;'.repeat(5 - Math.round(w.disposition))}</span>${w.omega ? ' ' + w.omega + 'x' : ''}`));
      }
      const dmg = [
        row('Critical Chance', s.critChance, bs.critChance, pc(s.critChance)),
        row('Critical Damage', s.critMultiplier, bs.critMultiplier, n1(s.critMultiplier) + 'x'),
        row('Status', s.statusChance, bs.statusChance, pc(s.statusChance))
      ].join('') + damageRows(ar, base);
      return `<div class="gs-sec">${opts.main ? rows.join('') + '<h4>Damage</h4>' : `<h4>${esc(title)}</h4>${rows.join('')}`}${dmg}${opts.extraNote ? `<p class="gs-note">${opts.extraNote}</p>` : ''}</div>`;
    }
    function renderGameStats(b, r) {
      const w = state.weapon; if (!w) { $('gameStats').innerHTML = ''; return; }
      try {
        const mainIdx = b.attack || 0;
        const blocks = [];
        const ar = arsenalCalc(b, mainIdx), base = arsenalCalc(b, mainIdx, true);
        blocks.push(attackBlock(w.attacks[mainIdx].name, ar, base, w, { main: true }));
        w.attacks.forEach((a, i) => {
          if (i === mainIdx) return;
          const isExtra = (b.extraAttacks || []).includes(i);
          const part = r && r.attackParts && r.attackParts.find(p => p.attack === a.name);
          const title = /incarnon/i.test(a.name) ? 'Incarnon Form' : a.shotType === 'AoE' ? `Radial attack: ${a.name}` : a.name;
          const note = isExtra ? `Counted with each shot${part && part.hits !== 1 ? `, about ${part.hits.toFixed(2)} hits per shot in this fight` : ''}.` : (/incarnon/i.test(a.name) ? 'Pick it under Attack to see its DPS.' : '');
          blocks.push(attackBlock(title, arsenalCalc(b, i), arsenalCalc(b, i, true), w, { main: false, extraNote: note }));
        });
        $('gameStats').innerHTML = blocks.join('');
      } catch (e) { $('gameStats').innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
    }

    // ---------------- combat headline (always visible on the Arsenal tab) ----------------
    function renderCombat(b, r) {
      if (!r) { $('combatHead').innerHTML = ''; return; }
      const e = b.enemy || {};
      const who = e.unit ? `${esc(e.unit)} lvl ${e.level}${e.steelPath ? ' (Steel Path)' : ''}` : `${esc(e.faction || 'No faction')}, armor ${fmt(e.armor || 0)}`;
      const ttk = r.ttk ? (r.ttk.seconds < 100 ? r.ttk.seconds.toFixed(2) : fmt(r.ttk.seconds)) + 's' : null;
      const cells = [
        ['Burst DPS', fmt(r.dps.burstTotal)], ['Per shot', fmt(r.perShotVsEnemy)],
        ttk ? ['Time to kill', ttk] : null, r.ttk ? ['Shots to kill', String(Math.ceil(r.ttk.shots))] : null,
        (e.targets > 1 && r.dps.groupSustained) ? [`Group DPS (${e.targets})`, fmt(r.dps.groupSustained)] : null
      ].filter(Boolean);
      $('combatHead').innerHTML = `<h4>In combat <span class="muted">vs ${who}</span></h4>
        <div class="ch-main"><span class="ch-k">Sustained DPS</span><span class="ch-v">${fmt(r.dps.sustainedTotal)}</span></div>
        <div class="ch-grid">${cells.map(([k, v]) => `<div><span class="ch-k">${k}</span><b>${v}</b></div>`).join('')}</div>
        <button type="button" class="btn ghost sm" data-goto="dps">Full breakdown</button> <button type="button" class="btn ghost sm" data-goto="enemy">Change enemy</button>`;
    }
    $('combatHead').addEventListener('click', e => {
      const g = e.target.closest('[data-goto]'); if (!g) return;
      if (isMobile()) { mview = g.dataset.goto === 'enemy' ? 'enemy' : 'stats'; applyMobileView(); }
      selectTab(g.dataset.goto, true);
    });

    // ---------------- game-style capacity header ----------------
    function renderCapHead() {
      const el = $('capHead');
      if (!state.weapon) { el.innerHTML = '<span>Capacity</span><b>-</b>'; return; }
      const rows = state.mods.map((n, i) => ({ mod: n ? UI.findModByName(n) : null, rank: state.ranks[i], slotPolarity: state.pols[i] }));
      const innate = (state.weapon.polarities || []).concat(state.weapon.exilusPolarity ? [state.weapon.exilusPolarity] : []);
      const c = WF.capacity.check({ mods: rows, catalyst: $('catalyst').checked, innate });
      const left = c.capacity - c.used;
      el.innerHTML = `<span>Capacity</span><b class="${left < 0 ? 'warn-t' : ''}">${left}/${c.capacity}</b>
        <div class="cap-line${left < 0 ? ' over' : ''}"><span style="width:${Math.min(100, Math.max(0, c.used / c.capacity * 100)).toFixed(1)}%"></span></div>
        <span class="muted small">${c.forma} forma</span>`;
    }
    const prevOnSlots = UI.onSlots;
    UI.onSlots = () => { if (prevOnSlots) prevOnSlots(); renderCapHead(); };
    $('catalyst').addEventListener('change', renderCapHead);

    // ---------------- Config A-D per weapon ----------------
    // Each weapon keeps four configs (mods, ranks, polarities, weapon arcane, Incarnon, Riven, attack). Enemy, buffs,
    // Warframe and conditions stay shared, like the in-game arsenal. Saved in this browser and, when signed in, to the account.
    const CFG_KEY = 'wfcalc.configs.v1';
    const SLOTS = ['A', 'B', 'C', 'D'];
    let cfgs = store.get(CFG_KEY, {});
    let suppress = 0;
    const WEAPON_FIELDS = ['attack', 'mods', 'slotLayout', 'slotLocks', 'slotRanks', 'slotPolarities', 'incarnon', 'valence', 'riven', 'rivenSlot', 'rivenMod', 'extraAttacks', 'overrides', 'stance'];
    function pick(b) {
      const o = {};
      WEAPON_FIELDS.forEach(k => { if (b[k] !== undefined) o[k] = JSON.parse(JSON.stringify(b[k])); });
      o.weaponArcane = (b.arcaneSlots || [])[0] || null;
      return o;
    }
    function merged(cur, data, weaponName) {
      const b = Object.assign({}, cur, { weapon: weaponName });
      WEAPON_FIELDS.forEach(k => { delete b[k]; });
      Object.assign(b, data ? JSON.parse(JSON.stringify(data)) : { mods: [], slotLayout: [], slotLocks: [], slotRanks: [], incarnon: {}, riven: [], overrides: {} });
      b.arcaneSlots = [data ? data.weaponArcane || null : null, (cur.arcaneSlots || [])[1] || null];
      delete b.weaponArcane;
      delete b.arcanes;
      return b;
    }
    const entry = w => (cfgs[w] = cfgs[w] || { active: 'A', names: {} });
    function renderCfgTabs() {
      const w = state.weapon && state.weapon.name;
      const box = $('cfgTabs');
      if (!w) { box.innerHTML = ''; return; }
      const en = entry(w);
      box.innerHTML = SLOTS.map(k => `<button type="button" role="tab" class="cfg-tab${en[k] ? ' saved' : ''}" data-cfg="${k}" aria-selected="${en.active === k}"
        title="${en[k] ? 'Saved config' : 'Empty config'}${en.active === k ? ' (double-click to rename)' : ''}">${en.names && en.names[k] ? esc(en.names[k]) : `<span class="cfg-pre">Config </span>${k}`}</button>`).join('');
    }
    function saveActive(b) {
      const w = b.weapon; const en = entry(w);
      en[en.active] = Object.assign(pick(b), { t: Date.now() });
      en.t = Date.now();
      store.set(CFG_KEY, cfgs);
      scheduleCloud(w);
    }
    UI.hooks.push(b => {
      if (suppress > 0) { suppress--; renderCfgTabs(); return; }
      if (b && b.weapon) saveActive(b);
      renderCfgTabs();
    });
    function switchTo(k) {
      const b = UI.collect(); if (!b) return;
      const w = b.weapon; const en = entry(w);
      if (en.active === k) return;
      saveActive(b);
      en.active = k; store.set(CFG_KEY, cfgs);
      UI.apply(merged(b, en[k], w));
    }
    $('cfgTabs').addEventListener('click', e => { const t = e.target.closest('[data-cfg]'); if (t) switchTo(t.dataset.cfg); });
    $('cfgTabs').addEventListener('dblclick', e => {
      const t = e.target.closest('[data-cfg]'); if (!t || !state.weapon) return;
      const en = entry(state.weapon.name); const k = t.dataset.cfg;
      const name = window.prompt(`Name for ${state.weapon.name} config ${k}`, (en.names && en.names[k]) || '');
      if (name == null) return;
      en.names = en.names || {}; if (name.trim()) en.names[k] = name.trim().slice(0, 24); else delete en.names[k];
      en.t = Date.now(); store.set(CFG_KEY, cfgs); scheduleCloud(state.weapon.name); renderCfgTabs();
    });
    $('cfgTabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = [...$('cfgTabs').querySelectorAll('[data-cfg]')]; const i = all.indexOf(document.activeElement); if (i < 0) return;
      const n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; n.focus(); switchTo(n.dataset.cfg);
    });
    // Picking a weapon in the picker opens that weapon's active config when it has one.
    UI.onWeaponPicked = w => {
      const en = cfgs[w.name];
      const data = en && en[en.active];
      if (!data) return false;
      const cur = UI.collect() || { conditions: {}, enemy: {}, buffs: [], arcaneSlots: [null, state.arcanes[1]] };
      UI.apply(merged(cur, data, w.name));
      return true;
    };

    // cloud sync: one account build per weapon named "[cfg] <weapon>", holding all four configs
    const CLOUD_PREFIX = '[cfg] ';
    const cloudTimers = {};
    function scheduleCloud(w) {
      if (!UI.getUser || !UI.getUser()) return;
      clearTimeout(cloudTimers[w]);
      cloudTimers[w] = setTimeout(() => {
        UI.api('/builds/' + encodeURIComponent(CLOUD_PREFIX + w), { method: 'PUT', body: JSON.stringify({ data: cfgs[w] }) })
          .catch(err => UI.flashMsg('Config sync failed: ' + err.message));
      }, 2500);
    }
    UI.onCloudBuilds = all => {
      let changed = false;
      Object.entries(all || {}).forEach(([name, data]) => {
        if (!name.startsWith(CLOUD_PREFIX) || !data) return;
        const w = name.slice(CLOUD_PREFIX.length);
        if (!cfgs[w] || (data.t || 0) > (cfgs[w].t || 0)) { cfgs[w] = data; changed = true; }
        else if ((cfgs[w].t || 0) > (data.t || 0)) scheduleCloud(w);
      });
      // local configs the account does not have yet
      Object.keys(cfgs).forEach(w => { if (!all || !all[CLOUD_PREFIX + w]) scheduleCloud(w); });
      if (changed) {
        store.set(CFG_KEY, cfgs);
        const w = state.weapon && state.weapon.name;
        const en = w && cfgs[w];
        if (en && en[en.active]) { suppress = 1; UI.apply(merged(UI.collect(), en[en.active], w)); }
        renderCfgTabs();
      }
    };
    UI.isConfigBuild = name => name.startsWith(CLOUD_PREFIX);

    // ---------------- hook into results ----------------
    UI.hooks.push((b, r) => { renderGameStats(b, r); renderCombat(b, r); });
    renderCfgTabs();
    renderCapHead();
    applyMobileView();
  };
})();
