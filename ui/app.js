(function () {
  const WF = window.WF;
  const D = (window.wfApp && window.wfApp.data) || window.WF_DATA;
  const E = WF.engine;
  const S = WF.STATIC;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '-';
  const pct = n => (n * 100).toFixed(1) + '%';
  const SLOT_COUNT = 8;
  const STORE_KEY = 'wfcalc.builds.v1';
  const LAST_KEY = 'wfcalc.last.v1';

  if (!D) { document.body.innerHTML = '<p style="padding:20px">No game data found. Run <code>node cli.js sync</code> in this folder (or ask Claude to), then reload.</p>'; return; }
  $('dataInfo').textContent = `Data: ${D.meta.source} ${D.meta.version}, built ${D.meta.builtAt.slice(0, 10)}`;
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

  // ---------- static lists ----------
  $('weaponList').innerHTML = D.weapons.map(w => `<option value="${esc(w.name)}">${esc(w.category)} ${esc(w.type)}</option>`).join('');
  $('frameList').innerHTML = D.frames.map(f => `<option value="${esc(f.name)}">`).join('');
  $('faction').innerHTML = Object.keys(S.FACTIONS).map(f => `<option>${esc(f)}</option>`).join('');

  const STAT_OPTIONS = [
    ['damage', 'Damage'], ['critChance', 'Critical Chance'], ['critDamage', 'Critical Damage'], ['statusChance', 'Status Chance'],
    ['multishot', 'Multishot'], ['fireRate', 'Fire Rate / Attack Speed'], ['magazine', 'Magazine'], ['reloadSpeed', 'Reload Speed'],
    ['statusDuration', 'Status Duration'], ['faction', 'Faction Damage (current enemy)'],
    ...S.ALL_TYPES.filter(t => t !== 'true' && t !== 'tau').map(t => ['element:' + t, t[0].toUpperCase() + t.slice(1)])
  ];
  const CUSTOM_KINDS = [
    ['damage', 'Base damage (adds to Serration)'], ['separate', 'Separate multiplier'], ['faction', 'Faction-type (like Roar)'],
    ['critChance', 'Crit chance (adds to Point Strike)'], ['critChanceFlat', 'Crit chance (flat, after mods)'], ['critDamage', 'Crit damage'],
    ['multishot', 'Multishot'], ['fireRate', 'Fire rate'], ['statusChance', 'Status chance'],
    ...S.ALL_TYPES.filter(t => t !== 'true' && t !== 'tau').map(t => ['element:' + t, 'Element: ' + t])
  ];

  // ---------- slots ----------
  const slotsEl = $('slots');
  for (let i = 0; i <= SLOT_COUNT; i++) {
    const exilus = i === SLOT_COUNT;
    const d = document.createElement('div');
    d.className = 'slot';
    d.innerHTML = `<span class="n">${exilus ? 'Ex' : i + 1}</span>
      <input data-slot="${i}" list="${exilus ? 'exilusList' : 'modList'}" autocomplete="off" placeholder="${exilus ? 'Exilus' : 'Mod ' + (i + 1)}">
      <label class="check small" title="Keep this mod when optimizing"><input type="checkbox" data-lock="${i}"> lock</label>
      <div class="fx" data-fx="${i}"></div>`;
    slotsEl.appendChild(d);
  }
  const slotInputs = [...document.querySelectorAll('[data-slot]')];

  // ---------- abilities ----------
  $('abilities').innerHTML = S.ABILITIES.map(a => `<div class="ab">
    <label class="check" title="${esc(a.note || '')}"><input type="checkbox" data-ab="${a.id}"> ${esc(a.name)} <span class="muted small">(${esc(a.frame)}, ${a.kind}, ${Math.round(a.value * 100)}%)</span></label>
    <label class="small">Strength % <input type="number" data-abs="${a.id}" value="100" min="0"></label></div>`).join('');

  // ---------- dynamic rows ----------
  function addRow(container, kinds, values) {
    const d = document.createElement('div');
    d.className = 'line';
    d.innerHTML = `<select>${kinds.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <input type="text" placeholder="Label (optional)">
      <input type="number" step="any" placeholder="0.5 = 50%">
      <button type="button" class="ghost" title="Remove">x</button>`;
    const [sel, lab, num, del] = d.children;
    if (values) { sel.value = values.kind; lab.value = values.label || ''; num.value = values.value; }
    del.onclick = () => { d.remove(); update(); };
    d.addEventListener('input', update);
    container.appendChild(d);
  }
  $('addRiven').onclick = () => { addRow($('riven'), STAT_OPTIONS); };
  $('addCustom').onclick = () => { addRow($('custom'), CUSTOM_KINDS); };

  function readRows(container) {
    return [...container.children].map(d => {
      const [sel, lab, num] = d.children;
      const v = parseFloat(num.value);
      if (!isFinite(v)) return null;
      return { kind: sel.value, label: lab.value, value: v };
    }).filter(Boolean);
  }
  const toEffect = r => r.kind.startsWith('element:') ? { stat: 'element', element: r.kind.split(':')[1], value: r.value }
    : r.kind === 'faction' ? { stat: 'faction', faction: '*', value: r.value } : { stat: r.kind, value: r.value };

  // ---------- weapon ----------
  let weapon = null;
  function setWeapon(name, keepAttack) {
    weapon = E.findWeapon(D, name);
    const att = $('attack');
    if (!weapon) { att.innerHTML = ''; $('weaponInfo').textContent = ''; return; }
    const prev = att.value;
    att.innerHTML = weapon.attacks.map((a, i) => `<option value="${i}">${esc(a.name)}</option>`).join('');
    if (keepAttack && prev && weapon.attacks[prev]) att.value = prev;
    const mods = E.modsFor(D, weapon);
    $('modList').innerHTML = mods.map(m => `<option value="${esc(m.name)}">${esc(m.stats.map(WF.parser.clean).join(' / ').replace(/\n/g, ' ').slice(0, 90))}</option>`).join('');
    $('exilusList').innerHTML = mods.filter(m => m.exilus).map(m => `<option value="${esc(m.name)}">`).join('');
    const arcTypes = WF.optimizer.arcaneTypesFor(weapon).concat(['Warframe Arcane', 'Arcane']);
    $('arcaneList').innerHTML = D.arcanes.filter(a => arcTypes.includes(a.type)).map(a => `<option value="${esc(a.name)}">${esc(a.type)}</option>`).join('');
    showWeaponInfo();
  }
  function showWeaponInfo() {
    if (!weapon) return;
    const a = weapon.attacks[$('attack').value] || weapon.attacks[0];
    $('weaponInfo').innerHTML = `${esc(weapon.category)} / ${esc(weapon.type)} | ${Object.entries(a.damage).map(([k, v]) => `${k} ${v}`).join(', ')} | crit ${pct(a.critChance)} x${a.critMult} | status ${pct(a.statusChance)} | ${a.fireRate}/s | multishot ${weapon.multishot} | mag ${weapon.magazine} | reload ${weapon.reload}s${weapon.url ? ` | <a href="${esc(weapon.url)}" target="_blank" rel="noopener">wiki</a>` : ''}`;
  }

  // ---------- build <-> form ----------
  function collect() {
    if (!weapon) return null;
    const overrides = {};
    document.querySelectorAll('[data-ov]').forEach(i => { if (i.value !== '') overrides[i.dataset.ov] = parseFloat(i.value); });
    const stacks = {};
    document.querySelectorAll('[data-stack]').forEach(i => { if (i.value !== '') stacks[i.dataset.stack] = parseFloat(i.value); });
    const buffs = S.ABILITIES.filter(a => document.querySelector(`[data-ab="${a.id}"]`).checked)
      .map(a => ({ id: a.id, strength: (parseFloat(document.querySelector(`[data-abs="${a.id}"]`).value) || 100) / 100 }));
    const ev = id => parseFloat($(id).value) || 0;
    return {
      weapon: weapon.name,
      attack: parseInt($('attack').value, 10) || 0,
      mods: slotInputs.map(i => i.value.trim()).filter(Boolean),
      arcanes: [$('arcane1').value.trim(), $('arcane2').value.trim()].filter(Boolean),
      riven: readRows($('riven')).map(toEffect),
      frame: $('frame').value.trim() || undefined,
      buffs,
      customBuffs: readRows($('custom')).map(r => Object.assign(toEffect(r), { kind: r.kind.startsWith('element:') ? 'element' : r.kind, label: r.label || undefined })),
      conditions: { assumeMax: $('assumeMax').checked, aiming: $('aiming').checked, combo: ev('combo') || 1, statusTypes: ev('statusTypes'), stacks },
      overrides,
      enemy: {
        faction: $('faction').value, armor: ev('armor'), headshotRate: ev('headshotRate') / 100,
        weakPointMult: $('weakPointMult').value === '' ? undefined : ev('weakPointMult'),
        viralStacks: ev('viralStacks'), corrosiveStacks: ev('corrosiveStacks'), armorStripPct: ev('armorStripPct') / 100, heatStrip: $('heatStrip').checked
      }
    };
  }

  function apply(b) {
    $('weapon').value = b.weapon || '';
    setWeapon(b.weapon);
    if (b.attack != null) $('attack').value = b.attack;
    slotInputs.forEach((i, idx) => { i.value = (b.mods && b.mods[idx]) ? (typeof b.mods[idx] === 'string' ? b.mods[idx] : b.mods[idx].name) : ''; });
    $('arcane1').value = (b.arcanes && b.arcanes[0]) || '';
    $('arcane2').value = (b.arcanes && b.arcanes[1]) || '';
    $('riven').innerHTML = '';
    (b.riven || []).forEach(e => addRow($('riven'), STAT_OPTIONS, { kind: e.stat === 'element' ? 'element:' + e.element : e.stat, value: e.value }));
    $('frame').value = b.frame || '';
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
    document.querySelectorAll('[data-ov]').forEach(i => { i.value = (b.overrides && b.overrides[i.dataset.ov] != null) ? b.overrides[i.dataset.ov] : ''; });
    const e = b.enemy || {};
    $('faction').value = e.faction || 'None (neutral)'; $('armor').value = e.armor || 0;
    $('headshotRate').value = Math.round((e.headshotRate || 0) * 100); $('weakPointMult').value = e.weakPointMult != null ? e.weakPointMult : '';
    $('viralStacks').value = e.viralStacks || 0; $('corrosiveStacks').value = e.corrosiveStacks || 0;
    $('armorStripPct').value = Math.round((e.armorStripPct || 0) * 100); $('heatStrip').checked = !!e.heatStrip;
    renderStacks(c.stacks || {});
    update();
  }

  // conditional stack inputs for the current mods/arcanes
  function renderStacks(existing) {
    const keep = existing || {};
    document.querySelectorAll('[data-stack]').forEach(i => { if (i.value !== '') keep[i.dataset.stack] = i.value; });
    const items = [];
    const names = slotInputs.map(i => i.value.trim()).concat([$('arcane1').value.trim(), $('arcane2').value.trim()]).filter(Boolean);
    names.forEach(n => {
      const it = (weapon && E.findMod(D, weapon, n)) || E.findArcane(D, n);
      if (!it) return;
      it.effects.forEach((eff, idx) => {
        if (!eff.cond || eff.cond.trigger === 'When Aiming') return;
        items.push({ key: `${it.name}#${idx}`, label: `${it.name}: ${eff.raw || eff.stat} (${eff.cond.trigger}${eff.cond.maxStacks ? ', max ' + eff.cond.maxStacks : ''}${eff.cond.chance ? ', ' + Math.round(eff.cond.chance * 100) + '% chance' : ''})`, max: eff.cond.maxStacks || 1 });
      });
    });
    $('stacks').innerHTML = items.length ? `<h3>Conditional stacks</h3><p class="muted small">Blank = use the checkbox above (max or 0). 0 turns a buff off.</p>` +
      items.map(it => `<label class="small">${esc(it.label)} <input type="number" min="0" max="${it.max}" data-stack="${esc(it.key)}" value="${keep[it.key] != null ? esc(keep[it.key]) : ''}" placeholder="auto"></label>`).join('') : '';
  }

  // ---------- render results ----------
  function render(r) {
    const s = r.stats;
    $('tiles').innerHTML = [
      ['Sustained DPS', r.dps.sustainedTotal, true], ['Burst DPS', r.dps.burstTotal], ['Burst direct', r.dps.burstDirect], ['Burst DoT', r.dps.burstDot],
      ['Avg per shot vs enemy', r.perShotVsEnemy], ['Per hit, no crit', r.perHitNonCrit]
    ].map(([k, v, main]) => `<div class="tile${main ? ' main' : ''}"><div class="k">${k}</div><div class="v">${fmt(v)}</div></div>`).join('');
    const dt = Object.entries(r.damageTypes).map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join('');
    const dots = Object.entries(r.dots).map(([k, d]) => `<tr><td>${k}</td><td>${fmt(d.procsPerShot)}</td><td>${fmt(d.tick)} x ${d.ticks}</td><td>${fmt(d.perProc)}</td></tr>`).join('');
    const statsRows = [
      ['Crit chance', pct(s.critChance)], ['Crit multiplier', 'x' + fmt(s.critMultiplier)], ['Avg crit multiplier (body)', 'x' + s.avgCritBody.toFixed(2)],
      ['Status chance', pct(s.statusChance)], ['Multishot', fmt(s.multishot)], ['Fire rate', fmt(s.fireRate) + '/s'], ['Effective fire rate', fmt(s.effectiveFireRate) + '/s'],
      ['Magazine', s.magazine], ['Reload', fmt(s.reload) + 's'], ['Damage pool (Serration etc.)', '+' + pct(s.damagePool)],
      ['Faction multiplier', 'x' + fmt(s.factionMultiplier)], ['Separate multipliers', 'x' + fmt(s.separateMultiplier)],
      ['Headshot multiplier', 'x' + fmt(s.headshotMultiplier)], ['Armor after strip', fmt(s.armorAfterStrip)],
      ['Armor damage multiplier', 'x' + s.armorDamageMultiplier.toFixed(3)], ['Viral multiplier', 'x' + fmt(s.viralMultiplier)],
      ['Quantization scale', s.quantizationScale.toFixed(4)], ['Sustain factor', fmt(r.dps.sustainFactor)]
    ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    const used = r.used.map(u => `<tr><td>${esc(u.source)}</td><td>${esc(u.stat)}${u.element ? ' (' + esc(u.element) + ')' : ''}</td><td>${(u.value * 100).toFixed(1)}%</td></tr>`).join('');
    $('breakdown').innerHTML = `<div class="cols">
      <div><h3>Damage per hit by type</h3><p class="muted small">Elements: ${esc(r.elements.join(', ') || 'none')}</p><table>${dt}</table>
        <h3>Status DoTs</h3>${dots ? `<table><tr><th>Type</th><th>Procs/shot</th><th>Per tick</th><th>Per proc</th></tr>${dots}</table>` : '<p class="muted small">None</p>'}</div>
      <div><h3>Final stats</h3><table>${statsRows}</table></div>
      <div><h3>Bonuses applied</h3><table>${used || '<tr><td class="muted">None</td></tr>'}</table>
        ${r.unparsed.length ? `<h3>Not modeled</h3><ul class="notes">${r.unparsed.map(u => `<li class="warn">${esc(u)}</li>`).join('')}</ul>` : ''}
        ${r.notes.length ? `<h3>Notes</h3><ul class="notes">${r.notes.map(n => `<li class="${/cannot|not found/i.test(n) ? 'warn' : ''}">${esc(n)}</li>`).join('')}</ul>` : ''}</div>
    </div>`;
  }

  function slotEffects() {
    slotInputs.forEach((inp, i) => {
      const fx = document.querySelector(`[data-fx="${i}"]`);
      const n = inp.value.trim();
      if (!n || !weapon) { fx.textContent = ''; fx.className = 'fx'; return; }
      const m = E.findMod(D, weapon, n);
      if (!m) { fx.textContent = 'Not found for this weapon'; fx.className = 'fx warn'; return; }
      fx.textContent = m.stats.map(WF.parser.clean).join(' / ').replace(/\n/g, ' ') + (m.unparsed.length ? '  (part not modeled)' : '');
      fx.className = 'fx' + (m.unparsed.length ? ' warn' : '');
    });
  }

  let timer = null;
  function update() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      slotEffects();
      const b = collect();
      if (!b) { $('tiles').innerHTML = '<p class="muted">Pick a weapon to start.</p>'; $('breakdown').innerHTML = ''; return; }
      try {
        render(E.calculate(b, D));
        try { localStorage.setItem(LAST_KEY, JSON.stringify(b)); } catch (e) { /* storage unavailable */ }
      } catch (e) {
        $('tiles').innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    }, 60);
  }

  // ---------- events ----------
  $('weapon').addEventListener('change', () => { setWeapon($('weapon').value); renderStacks(); update(); });
  $('attack').addEventListener('change', () => { showWeaponInfo(); update(); });
  document.querySelector('main').addEventListener('input', e => {
    if (e.target.matches('[data-slot], #arcane1, #arcane2')) renderStacks();
    if (!e.target.closest('#savePanel') && !e.target.closest('#optPanel')) update();
  });
  $('frame').addEventListener('change', () => {
    const f = D.frames.find(x => x.name.toLowerCase() === $('frame').value.toLowerCase());
    $('frameAbilities').textContent = f ? 'Abilities: ' + f.abilities.join(', ') : '';
  });

  $('runOpt').onclick = () => {
    const b = collect();
    if (!b) return;
    $('optOut').textContent = 'Searching...';
    setTimeout(() => {
      const locked = slotInputs.slice(0, SLOT_COUNT).filter((inp, i) => document.querySelector(`[data-lock="${i}"]`).checked && inp.value.trim()).map(i => i.value.trim());
      const t0 = performance.now();
      const o = WF.optimizer.optimize(Object.assign({}, b, {
        metric: $('metric').value, locked, exilus: $('optExilus').checked, arcane: $('optArcane').checked,
        fixedArcanes: $('optArcane').checked ? [$('arcane2').value.trim()].filter(Boolean) : b.arcanes,
        excluded: $('excluded').value.split(',').map(s => s.trim()).filter(Boolean)
      }), D);
      const ms = Math.round(performance.now() - t0);
      // put locked first, then the rest
      slotInputs.slice(0, SLOT_COUNT).forEach((inp, i) => { inp.value = o.mods[i] || ''; document.querySelector(`[data-lock="${i}"]`).checked = i < locked.length; });
      slotInputs[SLOT_COUNT].value = o.exilus || '';
      if ($('optArcane').checked) $('arcane1').value = o.arcane || '';
      renderStacks();
      update();
      $('optOut').innerHTML = `<p>Best ${esc($('metric').selectedOptions[0].textContent)}: <b>${fmt(o.score)}</b> (${o.evaluations} builds in ${ms} ms). Max-rank drain ${o.maxRankDrain}.</p><ul class="notes">${o.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
    }, 20);
  };

  // ---------- save / load ----------
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; } }
  function saveStore(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function refreshSaved() {
    const s = loadStore();
    $('savedBuilds').innerHTML = '<option value="">Load saved...</option>' + Object.keys(s).sort().map(k => `<option>${esc(k)}</option>`).join('');
  }
  $('saveBuild').onclick = () => {
    const b = collect(); if (!b) return;
    const name = $('buildName').value.trim() || `${b.weapon} ${new Date().toLocaleString()}`;
    const s = loadStore(); s[name] = b;
    if (!saveStore(s)) $('jsonBox').value = 'Browser storage is unavailable here. Copy the JSON instead:\n' + JSON.stringify(b, null, 2);
    refreshSaved(); $('savedBuilds').value = name;
  };
  $('savedBuilds').onchange = () => { const s = loadStore(); const b = s[$('savedBuilds').value]; if (b) { $('buildName').value = $('savedBuilds').value; apply(b); } };
  $('deleteBuild').onclick = () => { const s = loadStore(); delete s[$('savedBuilds').value]; saveStore(s); refreshSaved(); };
  $('copyJson').onclick = async () => {
    const b = collect(); if (!b) return;
    const txt = JSON.stringify(b, null, 2);
    $('jsonBox').value = txt;
    try { await navigator.clipboard.writeText(txt); $('copyJson').textContent = 'Copied'; setTimeout(() => { $('copyJson').textContent = 'Copy build JSON (for Claude / CLI)'; }, 1500); } catch (e) { $('jsonBox').select(); }
  };
  $('pasteJson').onclick = () => { try { apply(JSON.parse($('jsonBox').value)); } catch (e) { $('jsonBox').value = 'Could not read JSON: ' + e.message + '\n\n' + $('jsonBox').value; } };

  // ---------- start ----------
  refreshSaved();
  let last = null;
  try { last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { last = null; }
  if (last && last.weapon) apply(last); else update();
})();
