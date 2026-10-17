(function () {
  const WF = window.WF;
  const D = (window.wfApp && window.wfApp.data) || window.WF_DATA;
  const E = WF.engine;
  const S = WF.STATIC;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '-';
  const pct = n => (n * 100).toFixed(1) + '%';
  const IMG = name => name ? 'https://cdn.warframestat.us/img/' + encodeURIComponent(name) : '';
  const SLOT_COUNT = 8;
  const STORE_KEY = 'wfcalc.builds.v1';
  const LAST_KEY = 'wfcalc.last.v1';
  const OWNED_KEY = 'wfcalc.owned.v1';
  // Accounts API (Cloudflare Worker). Only used on the published site, where the session cookie works.
  const SITE_ORIGIN = 'https://warframe.hardn.net';
  let API = 'https://warframe-api.hardn.net';
  // Desktop app: API calls go through the main process (it holds the Discord session cookie)
  const DESKTOP = !!(window.wfApp && window.wfApp.isDesktop && window.wfApp.api);
  const ACCOUNTS = location.origin === SITE_ORIGIN || DESKTOP;
  let ACCOUNTS_UP = true;

  if (!D) { document.body.innerHTML = '<p style="padding:20px">No game data found. Run <code>node cli.js sync</code> in this folder, then reload.</p>'; return; }

  // Broken / offline images fall back to a placeholder (CSS shows .ph after img.broken)
  document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.classList.add('broken'); }, true);
  const img = (name, alt) => `<img loading="lazy" decoding="async" src="${esc(IMG(name))}" alt="${esc(alt || '')}">`;
  const initials = n => esc(String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 3));

  // ---------- header / desktop ----------
  const gb = D.meta.gameBuild;
  const buildLabel = gb ? (gb.latestHotfix ? `Hotfix ${gb.latestHotfix}` : `Update ${gb.latestUpdate.number}`) : null;
  $('dataInfo').textContent = `Data: ${buildLabel ? 'game ' + buildLabel + ', ' : ''}built ${D.meta.builtAt.slice(0, 10)}`;
  $('dataInfo').title = 'Where the numbers come from (opens the list at the bottom of the page)';
  $('dataInfo').onclick = () => { $('dataSources').open = true; };
  $('dataSourcesBody').innerHTML = `<p>${gb ? `Current game build when the data was built: <b>${esc(buildLabel)}</b>${gb.latestUpdate ? ` (${esc('Update ' + gb.latestUpdate.number + ' ' + gb.latestUpdate.name + ', ' + gb.latestUpdate.date)})` : ''}, from <a href="${esc(gb.source)}" target="_blank" rel="noopener">patch notes</a> checked ${esc(String(gb.checkedAt).slice(0, 10))}.` : 'Game build unknown.'}
    Dataset built ${esc(D.meta.builtAt.slice(0, 16).replace('T', ' '))} UTC.</p>
    <ul>${(D.meta.sources || [{ name: D.meta.source, version: D.meta.version }]).map(x => `<li><b>${x.url && /^https?:/.test(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : esc(x.name)}</b>
      ${x.version ? esc(x.version) : ''}${x.published ? ', published ' + esc(x.published.slice(0, 10)) : ''}${x.scrapedAt ? ', fetched ' + esc(x.scrapedAt.slice(0, 10)) : ''}: ${esc(x.role || '')}</li>`).join('')}</ul>
    <p>Items with a data note (a weapon, enemy or frame where sources disagree or a value was corrected) show it next to their stats. Nothing is read from the game client or any player account.</p>`;
  if (window.wfApp && window.wfApp.isDesktop) {
    const dl = $('downloadApp'); if (dl) dl.remove();
    const btn = $('updateData');
    btn.hidden = false;
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Checking...';
      try {
        const r = await window.wfApp.updateData();
        if (r.upToDate) { btn.textContent = `Up to date (${r.version})`; btn.disabled = false; }
        else { btn.textContent = `Updated to ${r.version}, reloading...`; setTimeout(() => location.reload(), 800); }
      } catch (e) {
        btn.textContent = 'Update failed'; btn.disabled = false;
        $('dataInfo').textContent += ` | Update error: ${e.message}`;
      }
    };
  }

  // ---------- state ----------
  const state = {
    weapon: null, frame: null, mods: new Array(SLOT_COUNT + 1).fill(null), locks: new Array(SLOT_COUNT).fill(false), arcanes: [null, null],
    ranks: new Array(SLOT_COUNT + 1).fill(null),   // null = max rank
    pols: new Array(SLOT_COUNT + 1).fill(null),    // slot polarity (forma)
    incarnon: {},                                  // { II: 'Perk name', ... }
    enemyUnit: null,                               // name from D.enemies, or null for manual
    riven: WF.riven.empty()                        // riven model (src/riven.js); equipped when RIVEN is in state.mods
  };
  const R = WF.riven;
  const RIVEN = R.NAME;
  const POL_CYCLE = [null, 'madurai', 'vazarin', 'naramon', 'zenurik', 'umbra'];
  const POL_ICON = { madurai: 'V', vazarin: 'D', naramon: '-', zenurik: '=', umbra: 'U', unairu: 'R', penjaga: 'Y' };
  let compatMods = [];

  $('faction').innerHTML = Object.keys(S.FACTIONS).map(f => `<option>${esc(f)}</option>`).join('');

  // ---------- helpers ----------
  const rarityClass = r => 'r-' + String(r || 'common').toLowerCase();
  const modFx = m => m.stats.map(WF.parser.clean).join(' / ').replace(/\n/g, ' ');
  const modDrain = (m, rank) => (m.drain || 0) + (rank != null ? rank : (m.maxRank || 0));
  const slotRank = (i, m) => state.ranks[i] != null ? Math.min(state.ranks[i], m.maxRank) : m.maxRank;
  const findModByName = n => (n === RIVEN ? (state.weapon ? R.synthMod(state.riven, state.weapon) : null) : (state.weapon && E.findMod(D, state.weapon, n))) || null;
  const rivenIndex = () => state.mods.indexOf(RIVEN);

  function modCard(m, opts = {}) {
    const fx = esc(modFx(m));
    return `<div class="mod ${rarityClass(m.rarity)}${m.riven ? ' riven' : ''} ${opts.cls || ''}" draggable="true" data-mod="${esc(m.name)}" title="${fx}${m.unparsed.length ? '\n(part of this mod is not modeled)' : ''}">
      <div class="mod-top"><span class="drain">${modDrain(m, opts.rank)}</span>${opts.own ? `<button type="button" class="own${owned.has(m.name) ? ' on' : ''}" data-own="${esc(m.name)}" aria-pressed="${owned.has(m.name)}" title="${owned.has(m.name) ? 'You own this mod' : 'Mark as owned'}">&#9733;</button>` : ''}${m.polarity ? `<span class="pol">${esc(m.polarity.slice(0, 3))}</span>` : ''}</div>
      <div class="mod-img">${img(m.image, m.name)}<span class="ph">${initials(m.name)}</span></div>
      <div class="mod-name">${esc(m.name)}</div>
      <div class="mod-fx">${fx}${m.unparsed.length ? ' <span class="nm">*</span>' : ''}</div>
      ${m.exilus ? '<span class="mod-tag">exilus</span>' : ''}
      ${opts.own ? `<span class="mod-delta" data-delta="${esc(m.name)}"></span>` : ''}
      ${opts.slotExtra || ''}
    </div>`;
  }

  // ---------- weapon ----------
  function setWeapon(w, keepMods) {
    state.weapon = w;
    if (!w) return;
    compatMods = E.modsFor(D, w);
    if (!keepMods) {
      // drop mods that do not fit the new weapon
      state.mods = state.mods.map(n => n && compatMods.some(m => m.name === n) ? n : null);   // a riven belongs to one weapon, so it is dropped too
      state.riven = R.empty();
      state.ranks = state.ranks.map((r, i) => state.mods[i] ? r : null);
      // ASSUMPTION: innate polarities are placed in the first slots (the data lists them without positions)
      state.pols = new Array(SLOT_COUNT + 1).fill(null);
      (w.polarities || []).slice(0, SLOT_COUNT).forEach((p, i) => { state.pols[i] = p; });
      state.pols[SLOT_COUNT] = w.exilusPolarity || null;
      state.incarnon = {};
      const arcTypes = WF.optimizer.arcaneTypesFor(w);
      const a0 = state.arcanes[0] && E.findArcane(D, state.arcanes[0]);
      if (a0 && !arcTypes.includes(a0.type)) state.arcanes[0] = null;
    }
    const att = $('attack');
    att.innerHTML = w.attacks.map((a, i) => `<option value="${i}">${esc(a.name)}</option>`).join('');
    // ASSUMPTION: area attacks (explosions, clouds) belong to the first attack and are added to it by default
    state.extraAttacks = keepMods && state.extraAttacks ? state.extraAttacks : w.attacks.map((a, i) => i).filter(i => i > 0 && w.attacks[i].shotType === 'AoE' && !/incarnon/i.test(w.attacks[i].name));
    renderExtraAttacks();
    renderWeapon();
    renderModBrowser();
  }
  function renderExtraAttacks() {
    const w = state.weapon; const el = $('extraAttacks');
    if (!w) { el.innerHTML = ''; return; }
    const main = parseInt($('attack').value, 10) || 0;
    const opts = w.attacks.map((a, i) => i).filter(i => i !== main);
    el.innerHTML = opts.length ? `<span class="muted small">Also count each shot:</span> ` + opts.map(i => `<label class="check small"><input type="checkbox" data-extra="${i}" ${(state.extraAttacks || []).includes(i) ? 'checked' : ''}> ${esc(w.attacks[i].name)}${w.attacks[i].shotType === 'AoE' ? ' (area)' : ''}</label>`).join('') : '';
  }
  $('extraAttacks').addEventListener('change', e => {
    const c = e.target.closest('[data-extra]'); if (!c) return;
    const i = +c.dataset.extra; const set = new Set(state.extraAttacks || []);
    c.checked ? set.add(i) : set.delete(i); state.extraAttacks = [...set].sort(); update();
  });
  function renderWeapon() {
    const w = state.weapon;
    const im = $('weaponImg');
    if (!w) { im.removeAttribute('src'); return; }
    im.classList.remove('broken'); im.src = IMG(w.image); im.alt = w.name;
    $('weaponPh').textContent = initials(w.name);
    $('weaponKicker').innerHTML = `${esc(w.category)} &middot; ${esc(w.type)} ${w.isPrime ? '<span class="badge prime">Prime</span>' : ''}${w.incarnon ? '<span class="badge inc">Incarnon</span>' : ''}`;
    $('weaponName').textContent = w.name;
    const a = w.attacks[$('attack').value] || w.attacks[0];
    const total = Object.values(a.damage).reduce((x, y) => x + y, 0);
    $('weaponStats').innerHTML = [
      ['Dmg', fmt(total)], ['Crit', pct(a.critChance) + ' x' + a.critMult], ['Status', pct(a.statusChance)],
      [w.category === 'Melee' ? 'Speed' : 'Rate', a.fireRate], w.category !== 'Melee' ? ['Multishot', w.multishot] : null,
      w.magazine ? ['Mag', w.magazine] : null, w.reload ? ['Reload', +(+w.reload).toFixed(2) + 's'] : null, ['MR', w.mastery],
      w.disposition ? ['Riven', '&#9679;'.repeat(Math.round(w.disposition)) + (w.omega ? ' ' + w.omega + 'x' : '')] : null
    ].filter(Boolean).map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
    $('valenceRow').hidden = !S.isAdversaryWeapon(w.name);
    const pas = S.WEAPON_PASSIVES[w.name];
    $('passiveNote').hidden = !pas;
    $('passiveNote').innerHTML = pas ? `Weapon passive: <b>${esc(pas.name)}</b>. ${esc(pas.text)} <a href="${esc(pas.source)}" target="_blank" rel="noopener">wiki</a>` : '';
    const wn = $('weaponNotes');
    wn.hidden = !(w.dataNotes && w.dataNotes.length);
    wn.innerHTML = wn.hidden ? '' : w.dataNotes.map(n => `<div>Data note: ${esc(n)}</div>`).join('');
  }

  // ---------- frame ----------
  const frameBase = f => f ? f.name.replace(/ Prime$| Umbra$/, '') : null;
  function setFrame(f) {
    state.frame = f;
    renderFrame();
  }
  function renderFrame() {
    const f = state.frame;
    const im = $('frameImg');
    if (!f) {
      im.removeAttribute('src'); $('frameName').textContent = 'Optional'; $('frameStats').textContent = 'For ability buffs';
      $('frameAbilities').innerHTML = '<p class="muted small">Pick a Warframe to see its abilities. Damage buffs below work with or without one (Helminth, squadmates).</p>';
    } else {
      im.classList.remove('broken'); im.src = IMG(f.image); im.alt = f.name;
      $('framePh').textContent = initials(f.name);
      $('frameName').textContent = f.name;
      $('frameStats').innerHTML = [['HP', f.health], ['Shield', f.shield], ['Armor', f.armor], ['Energy', f.energy]].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
      $('frameAbilities').innerHTML = `<h3>${esc(f.name)} abilities</h3><div class="abil-list">${f.abilities.map(a =>
        `<div class="abil">${img(a.image, a.name)}<div><b>${esc(a.name)}</b><span>${esc(a.description)}</span></div></div>`).join('')}</div>`;
    }
    // highlight + sort this frame's own buffs first
    const base = frameBase(f);
    document.querySelectorAll('#abilities .ab').forEach(row => row.classList.toggle('mine', !!base && row.dataset.frame === base));
    const box = $('abilities');
    [...box.children].sort((a, b) => (b.classList.contains('mine') - a.classList.contains('mine'))).forEach(c => box.appendChild(c));
  }
  $('abilities').innerHTML = S.ABILITIES.map(a => `<div class="ab" data-frame="${esc(a.frame)}">
    <label class="check" title="${esc(a.note || '')}"><input type="checkbox" data-ab="${a.id}"> ${esc(a.name)} <span class="muted small">${esc(a.frame)} &middot; ${Math.round(a.value * 100)}%</span></label>
    <label class="small">Str % <input type="number" data-abs="${a.id}" value="100" min="0"></label></div>`).join('');

  // ---------- arcanes ----------
  function renderArcanes() {
    document.querySelectorAll('.arc-slot').forEach(el => {
      const i = +el.dataset.arc;
      const a = state.arcanes[i] && E.findArcane(D, state.arcanes[i]);
      const label = i === 0 ? 'Weapon arcane' : 'Warframe arcane';
      el.classList.toggle('filled', !!a);
      el.innerHTML = a
        ? `<span class="thumb">${img(a.image, a.name)}<span class="ph">${initials(a.name)}</span></span><span class="t"><span class="muted small">${label}</span><b>${esc(a.name)}</b></span>`
        : `<span class="thumb muted">+</span><span class="t"><span class="muted small">${label}</span><b class="muted">Empty</b></span>`;
      el.title = a ? a.stats.map(WF.parser.clean).join(' / ') : '';
    });
  }

  // ---------- mod slots ----------
  function renderSlots() {
    const grid = $('slots');
    const names = state.mods.filter(Boolean);
    const warnings = new Set();
    names.forEach(n => {
      const r = E.variantRoot(n);
      if (names.filter(x => E.variantRoot(x) === r).length > 1) warnings.add(n);
      S.INCOMPATIBLE.forEach(([a, b]) => { if ((n === a && names.includes(b)) || (n === b && names.includes(a))) warnings.add(n); });
    });
    grid.innerHTML = state.mods.map((n, i) => {
      const ex = i === SLOT_COUNT;
      const m = n && findModByName(n);
      const tools = m ? `<div class="slot-tools">${ex ? '' : `<button type="button" data-lock="${i}" aria-pressed="${state.locks[i]}" title="Lock for optimizer">&#128274;</button>`}<button type="button" data-remove="${i}" title="Remove">&#10005;</button></div>` : '';
      const pol = state.pols[i];
      const polBtn = `<button type="button" class="slot-pol${pol ? ' set' : ''}${m && pol ? (pol === m.polarity ? ' match' : ' mismatch') : ''}" data-pol="${i}" title="Slot polarity: ${pol || 'none'} (click to change)">${pol ? POL_ICON[pol] || pol[0] : '&#9675;'}</button>`;
      const rank = m ? slotRank(i, m) : null;
      const rankCtl = m && m.maxRank > 0 ? `<div class="rank" data-rankslot="${i}"><button type="button" data-rank="-1" aria-label="Lower rank">&minus;</button><span>R${rank}/${m.maxRank}</span><button type="button" data-rank="1" aria-label="Raise rank">+</button></div>` : '';
      const extra = `${rankCtl}<span class="slot-val" data-val="${i}"></span>`;
      return `<div class="slot${ex ? ' exilus' : ''}${warnings.has(n) ? ' warn' : ''}" data-slot="${i}" tabindex="0" aria-label="${ex ? 'Exilus slot' : 'Mod slot ' + (i + 1)}">
        <span class="slot-n">${ex ? 'Exilus' : i + 1}</span>${polBtn}${tools}
        ${m ? modCard(m, { rank, slotExtra: extra }) : `<span>${ex ? 'Exilus slot' : 'Empty'}</span>`}</div>`;
    }).join('');
    const total = state.mods.reduce((t, n, i) => { const m = n && findModByName(n); return t + (m ? modDrain(m, slotRank(i, m)) : 0); }, 0);
    $('drainInfo').textContent = names.length ? `${names.length} mods, ${total} drain before polarity` : '';
    if (window.WFUI && WFUI.onSlots) WFUI.onSlots();
    renderStacks();
    markUsed();
  }

  function addMod(name, slot) {
    const m = findModByName(name);
    if (!m) return;
    const existing = state.mods.indexOf(m.name);
    if (slot == null) {
      if (existing >= 0) return;
      slot = state.mods.slice(0, SLOT_COUNT).indexOf(null);
      if (slot < 0 && m.exilus && !state.mods[SLOT_COUNT]) slot = SLOT_COUNT;
      if (slot < 0) return flash('All mod slots are full. Remove one first or drop onto a slot to replace.');
    }
    if (slot === SLOT_COUNT && !m.exilus) return flash(`${m.name} cannot go in the exilus slot.`);
    if (existing >= 0) state.mods[existing] = state.mods[slot]; // swap if moving
    state.mods[slot] = m.name;
    renderSlots(); update();
  }
  function flash(msg) {
    const el = $('modCount'); const prev = el.dataset.prev || el.textContent;
    el.dataset.prev = prev; el.textContent = msg; el.style.color = 'var(--warn)';
    clearTimeout(flash.t); flash.t = setTimeout(() => { el.textContent = el.dataset.prev; el.style.color = ''; delete el.dataset.prev; }, 2500);
  }

  // slot interactions
  $('slots').addEventListener('click', e => {
    if (e.target.closest('.mod.riven') && !e.target.closest('button') && window.WFUI && WFUI.openRiven) { WFUI.openRiven(); return; }
    const rk = e.target.closest('[data-rank]');
    if (rk) {
      e.stopPropagation();
      const i = +rk.closest('[data-rankslot]').dataset.rankslot; const m = findModByName(state.mods[i]); if (!m) return;
      const r = Math.max(0, Math.min(m.maxRank, slotRank(i, m) + (+rk.dataset.rank)));
      state.ranks[i] = r === m.maxRank ? null : r; renderSlots(); update(); return;
    }
    const pb = e.target.closest('[data-pol]');
    if (pb) {
      e.stopPropagation();
      const i = +pb.dataset.pol; const cur = POL_CYCLE.indexOf(state.pols[i]);
      state.pols[i] = POL_CYCLE[(cur + 1) % POL_CYCLE.length]; renderSlots(); update(); return;
    }
    const lock = e.target.closest('[data-lock]');
    if (lock) { const i = +lock.dataset.lock; state.locks[i] = !state.locks[i]; lock.setAttribute('aria-pressed', state.locks[i]); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) { const i = +rm.dataset.remove; state.mods[i] = null; state.ranks[i] = null; if (i < SLOT_COUNT) state.locks[i] = false; renderSlots(); update(); return; }
    const slot = e.target.closest('.slot');
    if (slot && !state.mods[+slot.dataset.slot] && !window.matchMedia('(max-width: 760px)').matches) { $('modSearch').focus(); $('modSearch').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  $('slots').addEventListener('contextmenu', e => {
    const slot = e.target.closest('.slot'); if (!slot) return;
    e.preventDefault(); const i = +slot.dataset.slot; state.mods[i] = null; if (i < SLOT_COUNT) state.locks[i] = false; renderSlots(); update();
  });
  $('slots').addEventListener('keydown', e => {
    const slot = e.target.closest('.slot'); if (!slot) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { const i = +slot.dataset.slot; state.mods[i] = null; renderSlots(); update(); }
  });

  // drag and drop (browser -> slot, slot -> slot)
  let dragName = null, dragFrom = null;
  document.addEventListener('dragstart', e => {
    const card = e.target.closest('.mod'); if (!card) return;
    dragName = card.dataset.mod;
    const slot = card.closest('.slot'); dragFrom = slot ? +slot.dataset.slot : null;
    e.dataTransfer.setData('text/plain', dragName); e.dataTransfer.effectAllowed = 'move';
  });
  $('slots').addEventListener('dragover', e => { const s = e.target.closest('.slot'); if (s && dragName) { e.preventDefault(); s.classList.add('over'); } });
  $('slots').addEventListener('dragleave', e => { const s = e.target.closest('.slot'); if (s) s.classList.remove('over'); });
  $('slots').addEventListener('drop', e => {
    const s = e.target.closest('.slot'); if (!s || !dragName) return;
    e.preventDefault(); s.classList.remove('over');
    const to = +s.dataset.slot;
    if (dragFrom != null) {
      if (to === SLOT_COUNT && !(findModByName(dragName) || {}).exilus) { flash(`${dragName} cannot go in the exilus slot.`); return; }
      if (dragFrom === SLOT_COUNT && state.mods[to] && !(findModByName(state.mods[to]) || {}).exilus) { flash('That mod cannot go in the exilus slot.'); return; }
      [state.mods[dragFrom], state.mods[to]] = [state.mods[to], state.mods[dragFrom]];
      if (dragFrom < SLOT_COUNT && to < SLOT_COUNT) [state.locks[dragFrom], state.locks[to]] = [state.locks[to], state.locks[dragFrom]];
      renderSlots(); update();
    } else addMod(dragName, to);
    dragName = dragFrom = null;
  });
  document.addEventListener('dragend', () => { dragName = dragFrom = null; document.querySelectorAll('.slot.over').forEach(s => s.classList.remove('over')); });
  $('clearMods').onclick = () => { state.mods.fill(null); state.locks.fill(false); renderSlots(); update(); };

  // ---------- mod browser ----------
  const CATS = [
    ['all', 'All'], ['damage', 'Damage'], ['crit', 'Crit'], ['status', 'Status'], ['multishot', 'Multishot'], ['element', 'Elements'],
    ['physical', 'IPS'], ['faction', 'Faction'], ['speed', 'Rate / Mag / Reload'], ['exilus', 'Exilus'], ['owned', 'Owned'], ['other', 'Not modeled']
  ];
  let modCat = 'all';
  function modInCat(m, c) {
    const st = new Set(m.effects.map(e => e.stat === 'element' ? (S.PHYSICAL.includes(e.element) ? 'physical' : 'element') : e.stat));
    switch (c) {
      case 'all': return true;
      case 'damage': return st.has('damage') || st.has('directDamage');
      case 'crit': return st.has('critChance') || st.has('critDamage') || st.has('critChanceFlat') || st.has('slashOnCrit');
      case 'status': return st.has('statusChance') || st.has('statusDuration') || st.has('statusDamage');
      case 'multishot': return st.has('multishot');
      case 'element': return st.has('element');
      case 'physical': return st.has('physical');
      case 'faction': return st.has('faction');
      case 'speed': return st.has('fireRate') || st.has('magazine') || st.has('reloadSpeed');
      case 'exilus': return m.exilus;
      case 'other': return !m.effects.length;
      case 'owned': return owned.has(m.name);
      default: return true;
    }
  }
  $('modChips').innerHTML = CATS.map(([k, l]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('');
  $('modChips').addEventListener('click', e => {
    const c = e.target.closest('[data-cat]'); if (!c) return;
    modCat = c.dataset.cat;
    $('modChips').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === c));
    renderModBrowser();
  });
  const RANK = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
  function renderModBrowser() {
    if (!state.weapon) { $('modGrid').innerHTML = ''; $('modCount').textContent = 'Choose a weapon to see mods that fit it.'; return; }
    const q = $('modSearch').value.trim().toLowerCase();
    const rar = $('modRarity').value;
    const sort = $('modSort').value;
    let list = compatMods.filter(m => modInCat(m, modCat) && (!rar || m.rarity === rar) &&
      (!q || m.name.toLowerCase().includes(q) || modFx(m).toLowerCase().includes(q)));
    list.sort((a, b) => sort === 'drain' ? modDrain(b) - modDrain(a) : sort === 'rarity' ? (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
    $('modCount').textContent = `${list.length} of ${compatMods.length} mods for ${state.weapon.name}. Click to add, or drag onto a slot.`;
    const showRiven = (modCat === 'all' || modCat === 'other') && (!q || 'riven mod'.includes(q) || q.includes('riven'));
    $('modGrid').innerHTML = (showRiven ? modCard(R.synthMod(state.riven, state.weapon), { cls: 'riven-pick' }) : '') + list.map(m => modCard(m, { own: true })).join('');
    markUsed();
  }
  function markUsed() {
    const used = new Set(state.mods.filter(Boolean));
    const roots = new Set([...used].map(E.variantRoot));
    document.querySelectorAll('#modGrid .mod').forEach(c => {
      const n = c.dataset.mod;
      c.classList.toggle('used', used.has(n));
      c.classList.toggle('blocked', !used.has(n) && (roots.has(E.variantRoot(n)) || S.INCOMPATIBLE.some(([a, b]) => (n === a && used.has(b)) || (n === b && used.has(a)))));
    });
  }
  $('modGrid').addEventListener('click', e => {
    const own = e.target.closest('[data-own]');
    if (own) { e.stopPropagation(); toggleOwned(own.dataset.own); return; }
    const c = e.target.closest('.mod'); if (c) addMod(c.dataset.mod);
  });
  ['modSearch', 'modRarity', 'modSort'].forEach(id => $(id).addEventListener('input', renderModBrowser));

  // ---------- picker dialog ----------
  const dlg = $('picker');
  let picker = null; // { kind, items, chips, chip, onPick, current }
  function openPicker(cfg) {
    picker = Object.assign({ chip: (cfg.chips && cfg.chips[0][0]) || null }, cfg);
    $('pickerTitle').textContent = cfg.title;
    $('pickerSearch').value = '';
    $('pickerChips').innerHTML = (cfg.chips || []).map(([k, l]) => `<button type="button" class="chip" data-pc="${esc(k)}" aria-pressed="${k === picker.chip}">${esc(l)}</button>`).join('');
    renderPicker();
    dlg.showModal();
    $('pickerSearch').focus();
  }
  function renderPicker() {
    const q = $('pickerSearch').value.trim().toLowerCase();
    const list = picker.items.filter(it => (!picker.filter || picker.filter(it, picker.chip)) && (!q || it.name.toLowerCase().includes(q) || (picker.text && picker.text(it).toLowerCase().includes(q))));
    $('pickerGrid').innerHTML = (picker.allowNone ? `<button type="button" class="card" data-pick=""><div class="cimg muted">None</div><div class="cname">Remove</div></button>` : '') +
      list.map(it => `<button type="button" class="card${picker.current === it.name ? ' sel' : ''}" data-pick="${esc(it.name)}" title="${esc(picker.text ? picker.text(it) : it.name)}">
        <div class="cimg">${img(it.image, it.name)}<span class="ph">${initials(it.name)}</span></div>
        <div class="cname">${esc(it.name)}</div><div class="cmeta">${picker.meta(it)}</div></button>`).join('') ||
      '<p class="muted">Nothing matches.</p>';
  }
  $('pickerSearch').addEventListener('input', renderPicker);
  $('pickerChips').addEventListener('click', e => {
    const c = e.target.closest('[data-pc]'); if (!c) return;
    picker.chip = c.dataset.pc;
    $('pickerChips').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === c));
    renderPicker();
  });
  $('pickerGrid').addEventListener('click', e => {
    const c = e.target.closest('[data-pick]'); if (!c) return;
    const name = c.dataset.pick;
    dlg.close();
    picker.onPick(name ? picker.items.find(i => i.name === name) : null);
  });

  $('pickWeapon').onclick = () => openPicker({
    title: 'Weapons', items: D.weapons, current: state.weapon && state.weapon.name,
    chips: [['all', 'All'], ['Primary', 'Primary'], ['Secondary', 'Secondary'], ['Melee', 'Melee'], ['prime', 'Prime'], ['inc', 'Incarnon']],
    filter: (w, c) => c === 'all' || w.category === c || (c === 'prime' && w.isPrime) || (c === 'inc' && w.incarnon),
    text: w => `${w.category} ${w.type}`,
    meta: w => { const a = w.attacks[0]; return `${esc(w.type)} &middot; ${pct(a.critChance)} / ${pct(a.statusChance)}${w.isPrime ? ' <span class="badge prime">P</span>' : ''}${w.incarnon ? ' <span class="badge inc">Inc</span>' : ''}`; },
    onPick: w => { if (w) { if (window.WFUI.onWeaponPicked && window.WFUI.onWeaponPicked(w)) return; setWeapon(w); renderSlots(); update(); } }
  });
  $('pickFrame').onclick = () => openPicker({
    title: 'Warframes', items: D.frames, current: state.frame && state.frame.name, allowNone: true,
    chips: [['all', 'All'], ['buff', 'Has damage buff'], ['prime', 'Prime']],
    filter: (f, c) => c === 'all' || (c === 'prime' && f.isPrime) || (c === 'buff' && S.ABILITIES.some(a => a.frame === frameBase(f))),
    text: f => f.abilities.map(a => a.name).join(' '),
    meta: f => `HP ${f.health} &middot; Sh ${f.shield} &middot; Ar ${f.armor}`,
    onPick: f => { setFrame(f); update(); }
  });
  document.querySelectorAll('.arc-slot').forEach(el => el.onclick = () => {
    const i = +el.dataset.arc;
    const types = i === 0 ? (state.weapon ? WF.optimizer.arcaneTypesFor(state.weapon) : ['Primary Arcane', 'Secondary Arcane', 'Melee Arcane', 'Shotgun Arcane', 'Bow Arcane']) : ['Warframe Arcane', 'Arcane'];
    openPicker({
      title: i === 0 ? 'Weapon arcanes' : 'Warframe arcanes', current: state.arcanes[i], allowNone: true,
      items: D.arcanes.filter(a => types.includes(a.type)),
      text: a => a.stats.map(WF.parser.clean).join(' '),
      meta: a => esc(a.stats.map(WF.parser.clean).join(' / ').replace(/\n/g, ' ').slice(0, 90)) + (a.unparsed.length && !a.effects.length ? ' <span class="nm">(not modeled)</span>' : ''),
      onPick: a => { state.arcanes[i] = a ? a.name : null; renderArcanes(); renderStacks(); update(); }
    });
  });

  // ---------- riven / custom rows ----------
  const CUSTOM_KINDS = [
    ['damage', 'Base damage (adds to Serration)'], ['separate', 'Separate multiplier'], ['faction', 'Faction-type (like Roar)'],
    ['critChance', 'Crit chance (adds to Point Strike)'], ['critChanceFlat', 'Crit chance (flat)'], ['critDamage', 'Crit damage'],
    ['multishot', 'Multishot'], ['fireRate', 'Fire rate'], ['statusChance', 'Status chance'],
    ...S.ALL_TYPES.filter(t => t !== 'true' && t !== 'tau').map(t => ['element:' + t, 'Element: ' + t])
  ];
  function addRow(container, kinds, values) {
    const d = document.createElement('div');
    d.className = 'line';
    d.innerHTML = `<select>${kinds.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <input type="text" placeholder="Label">
      <input type="number" step="any" placeholder="0.5">
      <button type="button" title="Remove">x</button>`;
    const [sel, lab, num, del] = d.children;
    if (values) { sel.value = values.kind; lab.value = values.label || ''; num.value = values.value; }
    del.onclick = () => { d.remove(); update(); };
    container.appendChild(d);
  }
  $('addCustom').onclick = () => addRow($('custom'), CUSTOM_KINDS);
  function readRows(container) {
    return [...container.children].map(d => {
      const [sel, lab, num] = d.children;
      const v = parseFloat(num.value);
      return isFinite(v) ? { kind: sel.value, label: lab.value, value: v } : null;
    }).filter(Boolean);
  }
  const toEffect = r => r.kind.startsWith('element:') ? { stat: 'element', element: r.kind.split(':')[1], value: r.value }
    : r.kind === 'faction' ? { stat: 'faction', faction: '*', value: r.value } : { stat: r.kind, value: r.value };

  // ---------- conditional stacks ----------
  function renderStacks() {
    const keep = {};
    document.querySelectorAll('[data-stack]').forEach(i => { if (i.value !== '') keep[i.dataset.stack] = i.value; });
    const items = [];
    const pas = state.weapon && S.WEAPON_PASSIVES[state.weapon.name];
    state.mods.filter(Boolean).map(findModByName).concat(state.arcanes.filter(Boolean).map(n => E.findArcane(D, n))).concat(pas ? [{ name: pas.name, effects: pas.effects }] : []).forEach(it => {
      if (!it) return;
      it.effects.forEach((eff, idx) => {
        if (!eff.cond || eff.cond.trigger === 'When Aiming') return;
        items.push({ key: `${it.name}#${idx}`, label: `${it.name}: ${eff.raw || eff.stat} (${eff.cond.trigger}${eff.cond.maxStacks ? ', max ' + eff.cond.maxStacks : ''}${eff.cond.chance ? ', ' + Math.round(eff.cond.chance * 100) + '% chance' : ''})`, max: eff.cond.maxStacks || 1 });
      });
    });
    $('stacks').innerHTML = items.length ? `<h3>Conditional stacks</h3><p class="muted small">Blank uses the checkbox above. 0 turns a buff off.</p>` +
      items.map(it => `<label class="small">${esc(it.label)} <input type="number" min="0" max="${it.max}" data-stack="${esc(it.key)}" value="${keep[it.key] != null ? esc(keep[it.key]) : (pendingStacks[it.key] != null ? esc(pendingStacks[it.key]) : '')}" placeholder="auto"></label>`).join('') : '';
  }
  let pendingStacks = {};

  // ---------- build <-> state ----------
  function collect() {
    if (!state.weapon) return null;
    const overrides = {};
    document.querySelectorAll('[data-ov]').forEach(i => { if (i.value !== '') overrides[i.dataset.ov] = parseFloat(i.value); });
    const stacks = {};
    document.querySelectorAll('[data-stack]').forEach(i => { if (i.value !== '') stacks[i.dataset.stack] = parseFloat(i.value); });
    const buffs = S.ABILITIES.filter(a => document.querySelector(`[data-ab="${a.id}"]`).checked)
      .map(a => ({ id: a.id, strength: (parseFloat(document.querySelector(`[data-abs="${a.id}"]`).value) || 100) / 100 }));
    const ev = id => parseFloat($(id).value) || 0;
    return {
      weapon: state.weapon.name,
      attack: parseInt($('attack').value, 10) || 0,
      mods: state.mods.map((n, i) => n && n !== RIVEN ? (state.ranks[i] != null ? { name: n, rank: state.ranks[i] } : n) : null).filter(Boolean),
      slotLayout: state.mods.slice(),
      slotLocks: state.locks.slice(),
      slotRanks: state.ranks.slice(),
      slotPolarities: state.pols.slice(),
      incarnon: Object.keys(state.incarnon).length ? Object.assign({}, state.incarnon) : undefined,
      valence: S.isAdversaryWeapon(state.weapon.name) && $('valenceEl').value ? { element: $('valenceEl').value, pct: Math.min(60, Math.max(25, parseFloat($('valencePct').value) || 60)) / 100 } : undefined,
      arcanes: state.arcanes.filter(Boolean),
      arcaneSlots: state.arcanes.slice(),
      // riven: effects at its slot position (between the mods around it, so element order matches the game)
      riven: rivenIndex() >= 0 ? R.toEffects(state.riven, state.ranks[rivenIndex()]) : [],
      rivenSlot: rivenIndex() >= 0 ? state.mods.slice(0, rivenIndex()).filter(n => n && n !== RIVEN).length - 0.5 : undefined,
      rivenMod: JSON.parse(JSON.stringify(state.riven)),
      frame: state.frame ? state.frame.name : undefined,
      buffs,
      customBuffs: readRows($('custom')).map(r => Object.assign(toEffect(r), { kind: r.kind.startsWith('element:') ? 'element' : r.kind, label: r.label || undefined })),
      extraAttacks: (state.extraAttacks || []).filter(i => i !== (parseInt($('attack').value, 10) || 0)),
      conditions: { assumeMax: $('assumeMax').checked, aiming: $('aiming').checked, combo: ev('combo') || 1, statusTypes: ev('statusTypes'), stacks,
        selfStatus: $('selfStatus').checked, fightSeconds: $('fightSeconds').value === '' ? undefined : ev('fightSeconds') },
      overrides,
      enemy: Object.assign({
        faction: $('faction').value, armor: ev('armor'), headshotRate: ev('headshotRate') / 100,
        magneticStacks: ev('magneticStacks'), targets: Math.max(1, ev('targets') || 1),
        weakPointMult: $('weakPointMult').value === '' ? undefined : ev('weakPointMult'),
        viralStacks: ev('viralStacks'), corrosiveStacks: ev('corrosiveStacks'), armorStripPct: ev('armorStripPct') / 100, heatStrip: $('heatStrip').checked
      }, enemyUnitStats())
    };
  }
  // Enemy unit picker: scales the unit's base stats to the chosen level (src/enemy.js)
  function enemyUnitStats() {
    if (!state.enemyUnit) { $('armor').disabled = false; return {}; }
    const u = D.enemies.find(x => x.name === state.enemyUnit);
    if (!u) return {};
    const sc = WF.enemy.scale({
      faction: $('faction').value, health: u.health, shield: u.shield, armor: u.armor,
      overguard: $('eximus').checked ? 12 : 0,
      level: parseFloat($('enemyLevel').value) || 1, baseLevel: parseFloat($('enemyBaseLevel').value) || undefined, steelPath: $('steelPath').checked
    });
    $('armor').value = sc.armor; $('armor').disabled = true;
    $('unitStats').innerHTML = `Level <b>${sc.level}</b>: Health <b>${fmt(sc.health)}</b> &middot; Shield <b>${fmt(sc.shield)}</b> &middot; Armor <b>${fmt(sc.armor)}</b>${sc.overguard ? ` &middot; Overguard <b>${fmt(sc.overguard)}</b>` : ''}`;
    return { armor: sc.armor, health: sc.health, shield: sc.shield, overguard: sc.overguard, unit: u.name, level: parseFloat($('enemyLevel').value) || 1,
      baseLevel: parseFloat($('enemyBaseLevel').value) || undefined, steelPath: $('steelPath').checked, eximus: $('eximus').checked };
  }

  function apply(b) {
    const w = E.findWeapon(D, b.weapon || '');
    state.mods = new Array(SLOT_COUNT + 1).fill(null);
    state.locks = (b.slotLocks || []).slice(0, SLOT_COUNT).concat(new Array(SLOT_COUNT).fill(false)).slice(0, SLOT_COUNT);
    if (w) setWeapon(w, true);
    if (b.attack != null) $('attack').value = b.attack;
    if (b.slotLayout && b.slotLayout.length) b.slotLayout.slice(0, SLOT_COUNT + 1).forEach((n, i) => { state.mods[i] = n || null; });
    else {
      const ms = (b.mods || []).map(m => typeof m === 'string' ? m : m.name);
      let k = 0;
      ms.forEach(n => {
        const m = findModByName(n);
        if (m && m.exilus && k >= SLOT_COUNT && !state.mods[SLOT_COUNT]) state.mods[SLOT_COUNT] = m.name;
        else if (k < SLOT_COUNT) state.mods[k++] = m ? m.name : n;
      });
    }
    state.ranks = new Array(SLOT_COUNT + 1).fill(null);
    if (b.slotRanks) b.slotRanks.slice(0, SLOT_COUNT + 1).forEach((r, i) => { state.ranks[i] = r; });
    else (b.mods || []).forEach(m => { if (typeof m === 'object' && m.rank != null) { const i = state.mods.indexOf(m.name); if (i >= 0) state.ranks[i] = m.rank; } });
    state.pols = new Array(SLOT_COUNT + 1).fill(null);
    if (b.slotPolarities) b.slotPolarities.slice(0, SLOT_COUNT + 1).forEach((p, i) => { state.pols[i] = p || null; });
    else if (w) { (w.polarities || []).slice(0, SLOT_COUNT).forEach((p, i) => { state.pols[i] = p; }); state.pols[SLOT_COUNT] = w.exilusPolarity || null; }
    state.incarnon = Object.assign({}, b.incarnon || {});
    $('valenceEl').value = (b.valence && b.valence.element) || ''; $('valencePct').value = b.valence && b.valence.pct ? Math.round(b.valence.pct * 1000) / 10 : 60;
    if (b.arcaneSlots) state.arcanes = [b.arcaneSlots[0] || null, b.arcaneSlots[1] || null];
    else {
      const arcs = (b.arcanes || []).map(n => E.findArcane(D, n)).filter(Boolean);
      const wt = w ? WF.optimizer.arcaneTypesFor(w) : [];
      state.arcanes = [(arcs.find(a => wt.includes(a.type)) || {}).name || null, (arcs.find(a => !wt.includes(a.type)) || {}).name || null];
    }
    setFrame(b.frame ? D.frames.find(f => f.name === b.frame) || null : null);
    if (b.rivenMod && Array.isArray(b.rivenMod.stats)) state.riven = Object.assign(R.empty(), JSON.parse(JSON.stringify(b.rivenMod)));
    else if (b.riven && b.riven.length) {
      // builds saved before the riven section: convert the old stat rows and put the riven in the first free slot
      state.riven = R.fromLegacy(b.riven, b.enemy && b.enemy.faction && (S.FACTIONS[b.enemy.faction] || {}).baneKey);
      if (rivenIndex() < 0) { const free = state.mods.slice(0, SLOT_COUNT).indexOf(null); if (free >= 0) state.mods[free] = RIVEN; }
    } else state.riven = R.empty();
    S.ABILITIES.forEach(a => {
      const on = (b.buffs || []).find(x => x.id === a.id);
      document.querySelector(`[data-ab="${a.id}"]`).checked = !!on;
      document.querySelector(`[data-abs="${a.id}"]`).value = on ? Math.round((on.strength || 1) * 100) : 100;
    });
    $('custom').innerHTML = '';
    (b.customBuffs || []).forEach(c => addRow($('custom'), CUSTOM_KINDS, { kind: c.kind === 'element' ? 'element:' + c.element : c.kind, value: c.value, label: c.label }));
    const c = b.conditions || {};
    $('assumeMax').checked = c.assumeMax !== false; $('aiming').checked = c.aiming !== false;
    $('combo').value = c.combo || 1; $('statusTypes').value = c.statusTypes || 0;
    $('selfStatus').checked = c.selfStatus !== false; $('fightSeconds').value = c.fightSeconds || '';
    $('targets').value = (b.enemy && b.enemy.targets) || 1;
    state.extraAttacks = Array.isArray(b.extraAttacks) ? b.extraAttacks.slice() : state.extraAttacks; renderExtraAttacks();
    document.querySelectorAll('[data-ov]').forEach(i => { i.value = (b.overrides && b.overrides[i.dataset.ov] != null) ? b.overrides[i.dataset.ov] : ''; });
    const e = b.enemy || {};
    $('faction').value = e.faction || 'None (neutral)'; $('armor').value = e.armor || 0;
    $('headshotRate').value = Math.round((e.headshotRate || 0) * 100); $('weakPointMult').value = e.weakPointMult != null ? e.weakPointMult : '';
    $('viralStacks').value = e.viralStacks || 0; $('corrosiveStacks').value = e.corrosiveStacks || 0;
    $('armorStripPct').value = Math.round((e.armorStripPct || 0) * 100); $('heatStrip').checked = !!e.heatStrip;
    $('magneticStacks').value = e.magneticStacks || 0;
    state.enemyUnit = e.unit || null;
    $('enemyLevel').value = e.level || 100; $('enemyBaseLevel').value = e.baseLevel || ''; $('steelPath').checked = !!e.steelPath; $('eximus').checked = !!e.eximus;
    if (window.WFUI && WFUI.renderEnemyUnit) WFUI.renderEnemyUnit();
    pendingStacks = c.stacks || {};
    document.querySelectorAll('[data-stack]').forEach(i => { i.value = ''; });
    renderWeapon(); renderArcanes(); renderSlots(); renderModBrowser();
    pendingStacks = {};
    update();
  }

  // ---------- results ----------
  const TYPE_COLORS = { impact: '#8fb0c9', puncture: '#d2bd8f', slash: '#e06c6c', heat: '#ff8a3d', cold: '#7cc7ff', electricity: '#b18cff', toxin: '#6fd36f',
    blast: '#ffb347', radiation: '#ffe066', gas: '#9bd18b', magnetic: '#6aa5ff', viral: '#4fd1a5', corrosive: '#c6d85a', void: '#e6e6ff', tau: '#ffd1f0', true: '#ffffff' };
  function render(r) {
    const s = r.stats;
    $('tiles').innerHTML = [
      ['Sustained DPS', r.dps.sustainedTotal, true], ['Burst DPS', r.dps.burstTotal], ['Avg per shot', r.perShotVsEnemy],
      ['Burst direct', r.dps.burstDirect], ['Burst DoT', r.dps.burstDot]
    ].concat((r.dps.groupSustained && Math.abs(r.dps.groupSustained - r.dps.sustainedTotal) > 0.5) ? [['Group DPS', r.dps.groupSustained]] : []).concat(r.ttk ? [['Time to kill', r.ttk.seconds < 100 ? r.ttk.seconds.toFixed(2) + 's' : fmt(r.ttk.seconds) + 's'], ['Shots to kill', Math.ceil(r.ttk.shots)]] : [])
      .map(([k, v, main]) => `<div class="tile${main ? ' main' : ''}"><div class="k">${k}</div><div class="v">${typeof v === 'string' ? v : fmt(v)}</div></div>`).join('');
    const types = Object.entries(r.damageTypes).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...types.map(t => t[1]));
    $('typeBars').innerHTML = `<div class="statline">
        <span>Crit <b>${pct(s.critChance)}</b> x<b>${fmt(s.critMultiplier)}</b></span><span>Status <b>${pct(s.statusChance)}</b></span>
        <span>Multishot <b>${fmt(s.multishot)}</b></span><span>Rate <b>${fmt(s.effectiveFireRate)}/s</b></span>
        ${s.magazine > 1 ? `<span>Mag <b>${s.magazine}</b></span><span>Reload <b>${fmt(s.reload)}s</b></span>` : ''}</div>
      <div class="bars">${types.map(([k, v]) => `<div class="bar"><span>${k}</span><span class="track"><span class="fill" style="width:${(v / max * 100).toFixed(1)}%;background:${TYPE_COLORS[k] || 'var(--accent)'}"></span></span><span class="num">${fmt(v)}</span></div>`).join('')}</div>
      ${r.notes.some(n => /cannot/i.test(n)) ? `<ul class="notes">${r.notes.filter(n => /cannot/i.test(n)).map(n => `<li class="warn">${esc(n)}</li>`).join('')}</ul>` : ''}`;
    const ss = r.selfStatus;
    $('selfStatusBox').innerHTML = ss && Object.keys(ss.stacks).length ? `<div class="statline"><span>Your statuses on target:</span>${Object.entries(ss.stacks).filter(([, v]) => v > 0.05).map(([k, v]) =>
      `<span title="${fmt(ss.procsPerSecond[k])} procs/s, active ${Math.round((ss.uptime[k] || 0) * 100)}% of the time">${esc(k)} <b>${v >= 10 || k === 'heat' || k === 'slash' || k === 'toxin' || k === 'electricity' ? fmt(v) : v.toFixed(1)}</b></span>`).join('')}<span>status types <b>${ss.statusTypes.toFixed(1)}</b></span>${r.fightSeconds && r.ttk ? `<span>fight <b>${r.fightSeconds.toFixed(1)}s</b></span>` : ''}</div>` : '';
    if (r.attackParts && r.attackParts.length > 1) $('selfStatusBox').innerHTML += `<div class="statline"><span>Per shot:</span>${r.attackParts.map(p =>
      `<span title="${p.hits !== 1 ? 'hits per shot over the cloud\'s life, cut short when the target dies' : 'direct hit'}">${esc(p.attack)}${p.hits !== 1 ? ` x${p.hits.toFixed(2)}` : ''} <b>${fmt(p.perShot + (p.dotPerShot || 0))}</b></span>`).join('')}</div>`;
    try {
      const b = collect();
      const ar = E.calculate(Object.assign({}, b, { buffs: [], customBuffs: b.customBuffs, enemy: { faction: 'None (neutral)', armor: 0 },
        extraAttacks: [], conditions: Object.assign({}, b.conditions, { assumeMax: false, selfStatus: false, fightSeconds: undefined, statusTypes: 0 }) }), D);
      const a = ar.stats;
      $('arsenalOut').innerHTML = `<table>${[
        ['Fire rate', fmt(a.fireRate)], ['Multishot', fmt(ar.arsenal.multishot != null ? ar.arsenal.multishot : a.multishot)], ['Magazine', a.magazine], ['Reload', a.reload.toFixed(2) + 's'],
        ['Critical chance', pct(a.critChance)], ['Critical damage', fmt(a.critMultiplier) + 'x'], ['Status', pct(a.statusChance)]
      ].concat(Object.entries(ar.arsenal.types).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), fmt(v)])).concat([['Total (x multishot)', fmt(ar.arsenal.total)]])
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</table>`;
    } catch (e) { $('arsenalOut').textContent = e.message; }
    const dots = Object.entries(r.dots).map(([k, d]) => `<tr><td>${k}</td><td>${fmt(d.procsPerShot)}</td><td>${fmt(d.tick)} x ${d.ticks}</td><td>${fmt(d.perProc)}</td></tr>`).join('');
    const rows = [
      ['Per hit, no crit', fmt(r.perHitNonCrit)], ['Elements', r.elements.join(', ') || 'none'],
      ['Avg crit mult (body)', 'x' + s.avgCritBody.toFixed(2)], ['Damage pool', '+' + pct(s.damagePool)],
      ['Faction multiplier', 'x' + fmt(s.factionMultiplier)], ['Separate multipliers', 'x' + fmt(s.separateMultiplier)],
      ['Headshot multiplier', 'x' + fmt(s.headshotMultiplier)], ['Armor after strip', fmt(s.armorAfterStrip)],
      ['Armor damage mult', 'x' + s.armorDamageMultiplier.toFixed(3)], ['Viral mult', 'x' + fmt(s.viralMultiplier)],
      ['Quantization scale', s.quantizationScale.toFixed(4)], ['Sustain factor', fmt(r.dps.sustainFactor)]
    ].map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('');
    const used = r.used.map(u => `<tr><td>${esc(u.source)}</td><td>${esc(u.stat)}${u.element ? ' (' + esc(u.element) + ')' : ''}</td><td>${(u.value * 100).toFixed(1)}%</td></tr>`).join('');
    $('breakdown').innerHTML = `<h3>Stats</h3><table>${rows}</table>
      <h3>Status DoTs</h3>${dots ? `<table><tr><th>Type</th><th>Procs/shot</th><th>Per tick</th><th>Per proc</th></tr>${dots}</table>` : '<p class="muted small">None</p>'}
      <h3>Bonuses applied</h3><table>${used || '<tr><td class="muted">None</td></tr>'}</table>
      ${r.unparsed.length ? `<h3>Not modeled</h3><ul class="notes">${r.unparsed.map(u => `<li class="warn">${esc(u)}</li>`).join('')}</ul>` : ''}
      ${r.notes.length ? `<h3>Notes</h3><ul class="notes">${r.notes.map(n => `<li class="${/cannot|not found/i.test(n) ? 'warn' : ''}">${esc(n)}</li>`).join('')}</ul>` : ''}`;
  }

  let timer = null;
  function update() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const b = collect();
      if (!b) { $('tiles').innerHTML = '<p class="muted">Choose a weapon to start.</p>'; $('typeBars').innerHTML = ''; $('breakdown').innerHTML = ''; return; }
      try {
        const result = E.calculate(b, D);
        render(result);
        try { localStorage.setItem(LAST_KEY, JSON.stringify(b)); } catch (e) { /* storage unavailable */ }
        if (window.WFUI) WFUI.hooks.forEach(fn => { try { fn(b, result); } catch (err) { console.error(err); } });
      } catch (e) { $('tiles').innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`; }
    }, 50);
  }

  // ---------- generic inputs ----------
  document.querySelector('.side').addEventListener('input', e => { if (!e.target.closest('#optPanel') && e.target.id !== 'buildName' && e.target.id !== 'jsonBox' && e.target.id !== 'excluded') update(); });
  document.querySelector('.attack-row').addEventListener('input', e => { if (e.target.id === 'attack') renderExtraAttacks(); renderWeapon(); update(); });

  // ---------- optimizer ----------
  $('runOpt').onclick = () => {
    const b = collect(); if (!b) return;
    $('optOut').textContent = 'Searching...';
    setTimeout(() => {
      const rIdx = rivenIndex() >= 0 && rivenIndex() < SLOT_COUNT ? rivenIndex() : -1;
      const locked = state.mods.slice(0, SLOT_COUNT).filter((n, i) => n && n !== RIVEN && state.locks[i]);
      const t0 = performance.now();
      const o = WF.optimizer.optimize(Object.assign({}, b, {
        slots: rIdx >= 0 ? SLOT_COUNT - 1 : SLOT_COUNT, rivenSlot: rIdx >= 0 ? rIdx - 0.5 : undefined,
        metric: $('metric').value, locked, exilus: $('optExilus').checked, arcane: $('optArcane').checked,
        fixedArcanes: $('optArcane').checked ? [state.arcanes[1]].filter(Boolean) : b.arcanes,
        ownedOnly: $('optOwned').checked, owned: [...owned],
        excluded: $('excluded').value.split(',').map(s => s.trim()).filter(Boolean)
      }), D);
      const ms = Math.round(performance.now() - t0);
      if ($('optOwned').checked && !owned.size) { $('optOut').textContent = 'Mark the mods you own first (star on each mod card), or untick "Only mods I own".'; return; }
      const picked = o.mods.slice(0, SLOT_COUNT);
      if (rIdx >= 0) picked.splice(rIdx, 0, RIVEN);
      state.mods = picked.concat(new Array(SLOT_COUNT).fill(null)).slice(0, SLOT_COUNT).concat([o.exilus || null]);
      const rankKeep = rIdx >= 0 ? state.ranks[rIdx] : null;
      state.ranks = new Array(SLOT_COUNT + 1).fill(null); if (rIdx >= 0) state.ranks[rIdx] = rankKeep;
      state.locks = state.mods.slice(0, SLOT_COUNT).map((n, i) => n !== RIVEN && picked.slice(0, i).filter(x => x !== RIVEN).length < locked.length);
      if ($('optArcane').checked) state.arcanes[0] = o.arcane || null;
      renderSlots(); renderArcanes(); update();
      $('optOut').innerHTML = `<p>Best: <b>${fmt(o.score)}</b> (${o.evaluations} builds in ${ms} ms). Drain at max rank ${o.maxRankDrain}.</p><ul class="notes">${o.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
    }, 20);
  };

  // ---------- account (Discord sign-in via the API) ----------
  let user = null;
  async function api(path, opts = {}) {
    if (DESKTOP) {
      const r = await window.wfApp.api(path, { method: opts.method || 'GET', body: opts.body });
      if (!r.ok) { const err = new Error((r.body && r.body.error) || `HTTP ${r.status}`); err.status = r.status; throw err; }
      return r.body;
    }
    const res = await fetch(API + path, Object.assign({ credentials: 'include' }, opts, {
      headers: Object.assign(opts.body ? { 'Content-Type': 'application/json' } : {}, opts.headers || {})
    }));
    let body = null; try { body = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) { const err = new Error((body && body.error) || `HTTP ${res.status}`); err.status = res.status; throw err; }
    return body;
  }
  function renderAccount() {
    const el = $('account');
    if (!ACCOUNTS || !ACCOUNTS_UP) { el.innerHTML = ''; $('shareBuild').hidden = true; $('sharePublic').parentElement.hidden = true; $('myShares').hidden = true; $('cloudNote').textContent = 'Builds are saved in this browser.'; return; }
    if (!user) {
      el.innerHTML = DESKTOP
        ? `<button type="button" class="btn discord sm" id="desktopLogin">Sign in with Discord</button>`
        : `<a class="btn discord sm" href="${API}/auth/discord/login?return=${encodeURIComponent(location.href.split('#')[0])}">Sign in with Discord</a>`;
      if (DESKTOP) $('desktopLogin').onclick = async () => {
        const ok = await window.wfApp.login();
        if (!ok) { flashMsg('Discord sign-in did not complete.'); return; }
        try { user = (await api('/me')).user; } catch (e) { user = null; }
        afterAuthChange();
      };
    } else {
      el.innerHTML = `<details class="acct"><summary>${user.avatarUrl ? `<img src="${esc(user.avatarUrl)}" alt="">` : ''}<span>${esc(user.displayName || user.username)}</span></summary>
        <div class="acct-menu"><div class="muted small">Signed in with Discord as ${esc(user.username)}</div>
        ${twitchBlock()}
        <button type="button" class="btn ghost sm" id="signOut">Sign out</button>
        <button type="button" class="btn ghost sm danger" id="deleteAcct">Delete account and data</button>
        <a class="small" href="privacy.html">Privacy</a></div></details>`;
      wireTwitch();
      $('signOut').onclick = async () => { try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch (e) { /* ignore */ } user = null; afterAuthChange(); };
      $('deleteAcct').onclick = async () => {
        const typed = prompt('This permanently deletes your account, cloud builds, owned-mods list and share links. Type DELETE to confirm.');
        if (typed !== 'DELETE') return;
        try { await api('/me', { method: 'DELETE' }); user = null; afterAuthChange(); flashMsg('Account deleted.'); } catch (e) { flashMsg('Delete failed: ' + e.message); }
      };
    }
    $('cloudNote').textContent = user ? 'Builds are saved to your account and sync across devices.' : (ACCOUNTS ? 'Builds are saved in this browser. Sign in with Discord to sync them.' : 'Builds are saved on this device.');
    $('shareBuild').hidden = !ACCOUNTS;
    $('sharePublic').parentElement.hidden = !user;
    $('myShares').hidden = !user;
  }
  // ---------- Twitch link (optional): Twitch name, avatar and live badge on your public builds ----------
  function twitchBlock() {
    const tw = user && user.twitch;
    if (!tw && user && user.twitchEnabled === false) return '';   // server has no Twitch app configured yet
    if (!tw) return `<div class="acct-twitch"><button type="button" class="btn twitch sm" id="twLink">Link Twitch</button>
      <span class="muted small">Shows your channel and a Live badge on your public builds. Twitch shares only your public profile.</span></div>`;
    return `<div class="acct-twitch">${tw.avatarUrl ? `<img src="${esc(tw.avatarUrl)}" alt="">` : ''}<span>Twitch: <a href="${esc(tw.url)}" target="_blank" rel="noopener">${esc(tw.displayName)}</a></span>
      <label class="small"><input type="checkbox" id="twPublic"${tw.public ? ' checked' : ''}> Show on my public builds</label>
      <button type="button" class="linkbtn small" id="twUnlink">Unlink Twitch</button></div>`;
  }
  function wireTwitch() {
    const link = $('twLink');
    if (link) link.onclick = async () => {
      if (DESKTOP) {
        const ok = window.wfApp.linkTwitch ? await window.wfApp.linkTwitch() : false;
        if (!ok) { flashMsg('Twitch link did not complete.'); return; }
        try { user = (await api('/me')).user; } catch (e) { /* keep */ }
        renderAccount(); flashMsg('Twitch linked.');
      } else location.href = `${API}/auth/twitch/link?return=${encodeURIComponent(location.href.split('#')[0])}`;
    };
    const pub = $('twPublic');
    if (pub) pub.onchange = async () => {
      try { await api('/me/twitch', { method: 'PATCH', body: JSON.stringify({ public: pub.checked }) }); user.twitch.public = pub.checked; if (window.WFUI && WFUI.loadPublic) WFUI.loadPublic(); }
      catch (e) { pub.checked = !pub.checked; flashMsg('Could not save: ' + e.message); }
    };
    const un = $('twUnlink');
    if (un) un.onclick = async () => {
      try { await api('/me/twitch', { method: 'DELETE' }); user.twitch = null; renderAccount(); flashMsg('Twitch unlinked. You can also remove the app in Twitch under Settings > Connections.'); if (window.WFUI && WFUI.loadPublic) WFUI.loadPublic(); }
      catch (e) { flashMsg('Unlink failed: ' + e.message); }
    };
  }
  function flashMsg(t) { $('buildMsg').textContent = t; clearTimeout(flashMsg.t); flashMsg.t = setTimeout(() => { $('buildMsg').textContent = ''; }, 4000); }
  async function afterAuthChange() {
    renderAccount();
    await refreshSaved();
    if (user) await syncOwnedFromServer();
    renderModBrowser();
    if (user) refreshShares();
    if (window.WFUI && WFUI.loadPublic) WFUI.loadPublic();
  }

  // ---------- builds: local storage or account ----------
  let cloudBuilds = {};
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; } }
  function saveStore(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  async function refreshSaved() {
    let names;
    if (user) {
      try { const r = await api('/builds'); cloudBuilds = {}; r.builds.forEach(b => { cloudBuilds[b.name] = b.data; }); } catch (e) { flashMsg('Could not load cloud builds: ' + e.message); }
      names = Object.keys(cloudBuilds).filter(n => !(window.WFUI.isConfigBuild && window.WFUI.isConfigBuild(n)));
      if (window.WFUI.onCloudBuilds) window.WFUI.onCloudBuilds(cloudBuilds);
    } else names = Object.keys(loadStore());
    $('savedBuilds').innerHTML = '<option value="">Load saved...</option>' + names.sort().map(k => `<option>${esc(k)}</option>`).join('');
    const local = Object.keys(loadStore());
    $('uploadLocal').hidden = !(user && local.length);
    $('uploadLocal').textContent = `Copy ${local.length} browser build${local.length === 1 ? '' : 's'} to account`;
  }
  const getSaved = name => user ? cloudBuilds[name] : loadStore()[name];
  $('saveBuild').onclick = async () => {
    const b = collect(); if (!b) return;
    const name = $('buildName').value.trim() || `${b.weapon} ${new Date().toLocaleString()}`;
    if (user) {
      try { await api('/builds/' + encodeURIComponent(name), { method: 'PUT', body: JSON.stringify({ data: b }) }); flashMsg('Saved to your account.'); }
      catch (e) { flashMsg('Save failed: ' + e.message); return; }
    } else {
      const s = loadStore(); s[name] = b;
      if (!saveStore(s)) { $('jsonBox').value = 'Browser storage is unavailable here. Copy the JSON instead:\n' + JSON.stringify(b, null, 2); return; }
      flashMsg('Saved in this browser.');
    }
    await refreshSaved(); $('savedBuilds').value = name;
  };
  $('savedBuilds').onchange = () => { const n = $('savedBuilds').value; const b = getSaved(n); if (b) { $('buildName').value = n; apply(b); } };
  $('deleteBuild').onclick = async () => {
    const n = $('savedBuilds').value; if (!n) return;
    if (user) { try { await api('/builds/' + encodeURIComponent(n), { method: 'DELETE' }); } catch (e) { flashMsg('Delete failed: ' + e.message); return; } }
    else { const s = loadStore(); delete s[n]; saveStore(s); }
    await refreshSaved(); flashMsg('Deleted.');
  };
  $('uploadLocal').onclick = async () => {
    const local = loadStore(); let n = 0;
    for (const [name, b] of Object.entries(local)) {
      try { await api('/builds/' + encodeURIComponent(name), { method: 'PUT', body: JSON.stringify({ data: b }) }); n++; } catch (e) { flashMsg(`Stopped after ${n}: ${e.message}`); break; }
    }
    await refreshSaved(); if (n) flashMsg(`Copied ${n} build${n === 1 ? '' : 's'} to your account. They are still in this browser too.`);
  };

  // ---------- owned mods ----------
  let owned = new Set();
  try { owned = new Set(JSON.parse(localStorage.getItem(OWNED_KEY) || '[]')); } catch (e) { owned = new Set(); }
  let ownedTimer = null;
  function persistOwned() {
    try { localStorage.setItem(OWNED_KEY, JSON.stringify([...owned])); } catch (e) { /* ignore */ }
    if (user) {
      clearTimeout(ownedTimer);
      ownedTimer = setTimeout(() => api('/owned', { method: 'PUT', body: JSON.stringify({ mods: [...owned] }) }).catch(e => flashMsg('Owned list sync failed: ' + e.message)), 800);
    }
    $('ownedCount').textContent = owned.size ? `${owned.size} owned` : '';
  }
  function toggleOwned(name) {
    owned.has(name) ? owned.delete(name) : owned.add(name);
    persistOwned();
    document.querySelectorAll(`#modGrid [data-own="${CSS.escape(name)}"]`).forEach(b => { b.classList.toggle('on', owned.has(name)); b.setAttribute('aria-pressed', owned.has(name)); });
    if (modCat === 'owned') renderModBrowser();
  }
  async function syncOwnedFromServer() {
    try {
      const r = await api('/owned');
      const before = owned.size;
      r.mods.forEach(n => owned.add(n)); // merge: never lose marks made before signing in
      if (owned.size !== r.mods.length) persistOwned(); else { try { localStorage.setItem(OWNED_KEY, JSON.stringify([...owned])); } catch (e) { /* ignore */ } }
      $('ownedCount').textContent = owned.size ? `${owned.size} owned` : '';
      void before;
    } catch (e) { flashMsg('Could not load owned mods: ' + e.message); }
  }
  $('ownedCount').textContent = owned.size ? `${owned.size} owned` : '';

  // ---------- share links ----------
  // Share links go through the API so Discord and other apps get a preview card; it redirects to the site.
  function shareUrl(id) { return `${API}/s/${id}`; }
  $('shareBuild').onclick = async () => {
    const b = collect(); if (!b) return;
    if (!user) { flashMsg('Sign in with Discord to create share links.'); return; }
    try {
      const out = Object.assign({}, b);
      const res = E.calculate(b, D);
      const top = (b.mods || []).slice(0, 4).map(m => typeof m === 'string' ? m : m.name).join(', ');
      const r = await api('/shares', { method: 'POST', body: JSON.stringify({
        data: out,
        public: $('sharePublic').checked,
        title: ($('buildName').value.trim() || `${b.weapon} build`).slice(0, 60),
        meta: { image: state.weapon && state.weapon.image, dps: Math.round(res.dps.sustainedTotal), summary: top }
      }) });
      if ($('sharePublic').checked && WFUI.loadPublic) WFUI.loadPublic();
      const link = shareUrl(r.id);
      $('jsonBox').value = link;
      try { await navigator.clipboard.writeText(link); flashMsg('Share link copied: ' + link); } catch (e) { flashMsg('Share link: ' + link); }
      refreshShares();
    } catch (e) { flashMsg('Could not create link: ' + e.message); }
  };
  async function refreshShares() {
    if (!user) return;
    try {
      const r = await api('/shares');
      $('shareList').innerHTML = r.shares.length ? r.shares.map(s => `<li><a href="${shareUrl(s.id)}">${esc(s.weapon)}</a> <span class="muted">${new Date(s.createdAt * 1000).toLocaleDateString()}</span> <button type="button" class="linkbtn" data-delshare="${esc(s.id)}">delete</button></li>`).join('') : '<li class="muted">No share links yet.</li>';
    } catch (e) { $('shareList').innerHTML = `<li class="muted">${esc(e.message)}</li>`; }
  }
  $('shareList').addEventListener('click', async e => {
    const b = e.target.closest('[data-delshare]'); if (!b) return;
    try { await api('/shares/' + b.dataset.delshare, { method: 'DELETE' }); refreshShares(); } catch (err) { flashMsg(err.message); }
  });
  async function openShareFromHash() {
    const m = location.hash.match(/share=([A-Za-z0-9]{6,16})/);
    if (!m) return false;
    try {
      let j;
      try { j = await api(`/shares/${m[1]}`); }
      catch (err) { throw new Error(err.status === 404 ? 'This share link does not exist (it may have been deleted).' : err.message); }
      apply(j.data);
      flashMsg('Loaded a shared build. Save it to keep your own copy.');
      return true;
    } catch (e) { flashMsg('Could not open share link: ' + e.message); return false; }
  }
  window.addEventListener('hashchange', openShareFromHash);

  $('copyJson').onclick = async () => {
    const b = collect(); if (!b) return;
    const out = Object.assign({}, b); delete out.slotLayout; delete out.slotLocks; delete out.arcaneSlots;
    const txt = JSON.stringify(out, null, 2);
    $('jsonBox').value = txt;
    try { await navigator.clipboard.writeText(txt); $('copyJson').textContent = 'Copied'; setTimeout(() => { $('copyJson').textContent = 'Copy build JSON'; }, 1500); } catch (e) { $('jsonBox').select(); }
  };
  $('pasteJson').onclick = () => { try { apply(JSON.parse($('jsonBox').value)); } catch (e) { $('jsonBox').value = 'Could not read JSON: ' + e.message + '\n\n' + $('jsonBox').value; } };

  // ---------- shared hooks for ui/features.js ----------
  window.WFUI = {
    D, E, S, WF, state, SLOT_COUNT, $, esc, fmt, pct, img, IMG, initials, modCard, modFx,
    collect, apply, update, renderSlots, renderModBrowser, renderWeapon, findModByName, openPicker,
    getCompatMods: () => compatMods, flashMsg: m => flashMsg(m), getUser: () => user, api: (p, o) => api(p, o), RIVEN, rivenIndex, addMod: (n, s) => addMod(n, s),
    accountsEnabled: () => ACCOUNTS && ACCOUNTS_UP, SITE_ORIGIN, API,
    hooks: [], onSlots: null, renderEnemyUnit: null
  };
  if (window.WFFeatures) window.WFFeatures(window.WFUI);
  if (window.WFLayout) window.WFLayout(window.WFUI);
  if (window.WFRiven) window.WFRiven(window.WFUI);

  // ---------- start ----------
  renderFrame(); renderArcanes(); renderSlots(); renderModBrowser();
  renderAccount();
  refreshSaved();
  (async () => {
    const err = location.hash.match(/login-error=([\w-]+)/);
    if (err) { flashMsg('Discord sign-in did not complete (' + err[1] + '). Please try again.'); history.replaceState(null, '', location.pathname); }
    const twErr = location.hash.match(/twitch-error=([\w-]+)/);
    if (twErr) {
      const why = { signin: 'sign in with Discord first', 'not-configured': 'Twitch linking is not set up on the server yet', access_denied: 'cancelled on Twitch' }[twErr[1]] || twErr[1];
      flashMsg('Twitch link did not complete (' + why + ').'); history.replaceState(null, '', location.pathname);
    } else if (/twitch-linked/.test(location.hash)) { flashMsg('Twitch linked.'); history.replaceState(null, '', location.pathname); }
    const shared = await openShareFromHash();
    if (!shared) {
      let last = null;
      try { last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { last = null; }
      if (last && last.weapon) apply(last); else update();
    }
    if (DESKTOP) {
      try { API = (await window.wfApp.config()).api || API; WFUI.API = API; } catch (e) { /* keep default */ }
      window.wfApp.checkAppUpdate().then(u => {
        if (!u || !u.available) return;
        const el = $('patchBanner');
        el.innerHTML = `<b>Update available:</b> version ${esc(u.latest)} (you have ${esc(u.current)}). <button type="button" class="btn sm" id="getUpdate">Download</button> <button type="button" class="btn ghost sm" id="skipUpdate">Later</button>`;
        el.hidden = false;
        $('getUpdate').onclick = () => window.wfApp.openExternal(u.url);
        $('skipUpdate').onclick = () => { el.hidden = true; };
      }).catch(() => { /* offline */ });
    }
    if (ACCOUNTS) {
      let apiUp = true;
      try { user = (await api('/me')).user; } catch (e) { user = null; if (e.status !== 401) apiUp = false; }
      if (!apiUp) { ACCOUNTS_UP = false; } // API not reachable (not deployed yet or offline): hide account features
      if (user) afterAuthChange(); else renderAccount();
    }
  })();
})();
