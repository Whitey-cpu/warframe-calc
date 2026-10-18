/*
 * Riven tab: builder (stat picker with the real min-max range for the weapon), grader (where each entered value
 * landed), best stats for the current build, and a saved-rivens library (this browser, or your account when signed in).
 * The riven goes into a real mod slot as the "Riven Mod" card; math lives in src/riven.js.
 */
window.WFRiven = function (UI) {
  const { $, esc, fmt, state, E, D, S, WF } = UI;
  const R = WF.riven;
  const panel = $('rivenPanel');
  const LIB_KEY = 'wfcalc.rivens.v1';
  const CLOUD_PREFIX = '[riven] ';
  const POLS = ['madurai', 'naramon', 'vazarin'];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  // saved rivens are kept out of the normal build list
  const prevIsConfig = UI.isConfigBuild;
  UI.isConfigBuild = n => String(n).startsWith(CLOUD_PREFIX) || (prevIsConfig ? prevIsConfig(n) : false);

  const weapon = () => state.weapon;
  const slotIdx = () => UI.rivenIndex();
  const rank = () => { const i = slotIdx(); return i >= 0 && state.ranks[i] != null ? state.ranks[i] : (state.riven.rank != null ? state.riven.rank : R.MAX_RANK); };
  const dots = d => '&#9679;'.repeat(Math.max(1, Math.min(5, d <= 0.69 ? 1 : d <= 0.89 ? 2 : d <= 1.1 ? 3 : d <= 1.3 ? 4 : 5))) + '&#9675;'.repeat(5 - Math.max(1, Math.min(5, d <= 0.69 ? 1 : d <= 0.89 ? 2 : d <= 1.1 ? 3 : d <= 1.3 ? 4 : 5)));
  const fmtNum = (def, v) => def.unit === 'x' ? 'x' + (1 + v / 100).toFixed(2) : (v >= 100 ? v.toFixed(1) : v.toFixed(v >= 10 ? 1 : 2)) + (def.unit === '%' ? '%' : def.unit);
  const fmtNeg = (def, v) => def.unit === 'x' ? 'x' + (1 - v / 100).toFixed(2) : '-' + fmtNum(def, v);

  // The model keeps up to 3 positive rows and 1 negative row in fixed positions for the editor
  function rows() {
    const st = state.riven.stats || [];
    const pos = st.filter(s => !s.neg), neg = st.filter(s => s.neg);
    return [pos[0] || null, pos[1] || null, pos[2] || null, neg[0] || null];
  }
  function setRows(rs) { state.riven.stats = rs.filter(Boolean); }

  function changed(full) {
    if (slotIdx() >= 0) UI.renderSlots();
    UI.update();
    if (full) render(); else refreshGrades();
  }

  // ---------------- render ----------------
  function render() {
    const w = weapon();
    if (!w) { panel.innerHTML = '<p class="muted small">Choose a weapon first. Each riven belongs to one weapon.</p>'; return; }
    const type = R.typeFor(w);
    const d = w.omega || 1;
    const i = slotIdx();
    const rs = rows();
    const c = R.counts(state.riven);
    const statOpts = (neg, cur) => {
      const ok = def => R.available(def, type) && (neg ? !def.posOnly : !def.negOnly);
      const opt = def => `<option value="${def.key}"${cur === def.key ? ' selected' : ''}>${esc(R.labelFor(def, type))}${def.fx ? '' : ' (not modeled)'}</option>`;
      return `<option value="">${neg ? 'No negative' : 'None'}</option><optgroup label="Stats">${R.STATS.filter(ok).map(opt).join('')}</optgroup>` +
        (neg ? '' : `<optgroup label="Spliced (Riven Splicer)">${R.SPLICED.filter(ok).map(opt).join('')}</optgroup>`);
    };
    const row = (s, idx) => {
      const neg = idx === 3;
      const def = s && R.statDef(s.key);
      const r = s ? R.range(s.key, w, Math.max(2, c.pos), c.neg, neg, R.MAX_RANK) : null;
      const posv = r && r.max > r.min ? ((Math.abs(s.value) - r.min) / (r.max - r.min)) : 0.5;
      return `<div class="rv-row${neg ? ' neg' : ''}" data-row="${idx}">
        <span class="rv-sign">${neg ? '&minus;' : '+'}</span>
        <select data-k="${idx}" aria-label="${neg ? 'Negative stat' : 'Positive stat ' + (idx + 1)}">${statOpts(neg, s && s.key)}</select>
        ${s ? `<input type="number" step="any" min="0" data-v="${idx}" value="${+Math.abs(s.value).toFixed(def.unit === '%' || def.unit === 'x' ? 2 : 3)}" aria-label="Value"><span class="rv-unit">${def.unit === 'x' ? '% (x)' : def.unit}</span>
          <input type="range" min="0" max="1000" data-s="${idx}" value="${Math.round(Math.max(0, Math.min(1, posv)) * 1000)}" aria-label="Roll within the possible range" ${r ? '' : 'disabled'}>
          <span class="rv-range muted small" data-r="${idx}">${r ? (neg ? `${fmtNeg(def, r.min)} to ${fmtNeg(def, r.max)}` : `${fmtNum(def, r.min)} to ${fmtNum(def, r.max)}`) : 'n/a'}</span>
          <span class="rv-grade" data-g="${idx}"></span>` : '<span class="muted small rv-empty">' + (neg ? 'Optional. A negative makes the positives stronger.' : idx === 2 ? 'Optional third positive.' : 'Pick a stat.') + '</span>'}
      </div>`;
    };
    const splices = R.RECIPES.all.concat(type === 'melee' ? R.RECIPES.melee : R.RECIPES.ranged)
      .filter(([, a, b]) => c.list.some(s => s.key === a) && c.list.some(s => s.key === b))
      .map(([out, a, b]) => `${esc(R.labelFor(R.statDef(a), type))} + ${esc(R.labelFor(R.statDef(b), type))} &rarr; <b>${esc(R.labelFor(R.statDef(out), type))}</b>`);
    panel.innerHTML = `
      <div class="rv-head">
        <div><b>${esc(w.name)}</b> riven <span class="muted small">${esc(R.TYPE_LABEL[type])} stats</span><br>
          <span class="muted small" title="Riven disposition (wiki: 0.5 to 1.55)">Disposition <b>${d}</b> <span class="rv-dots">${dots(d)}</span></span></div>
        <div class="rv-equip">${i >= 0 ? `<span class="small">In slot <b>${i + 1}</b></span> <button type="button" class="btn ghost sm" id="rvUnequip">Remove from slot</button>`
          : `<button type="button" class="btn sm" id="rvEquip">Put in a mod slot</button>`}</div>
      </div>
      <div class="grid2 rv-settings">
        <label>Rank <select id="rvRank">${Array.from({ length: R.MAX_RANK + 1 }, (_, k) => `<option${k === rank() ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Polarity <select id="rvPol">${POLS.map(p => `<option value="${p}"${state.riven.polarity === p ? ' selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
        <label title="Capacity cost shown on your riven at rank 8. Riven cards differ; 18 is only a starting guess.">Drain at rank 8 <input type="number" id="rvDrain" min="0" max="30" value="${state.riven.drain != null ? state.riven.drain : R.DEFAULT_DRAIN}"></label>
      </div>
      <p class="muted small">Type the numbers from your riven card (rank 8 values), or pick a stat and drag its slider through the possible range.</p>
      <div class="rv-rows">${rs.map(row).join('')}</div>
      <div id="rvMsgs"></div>
      <div class="rv-grade-all" id="rvGradeAll"></div>
      ${splices.length ? `<p class="small rv-splice"><span class="muted">Riven Splicer can combine:</span> ${splices.join(' &middot; ')}</p>` : ''}
      <details class="rv-sec" id="rvBestBox" open>
        <summary>Best stats for this build</summary>
        <p class="muted small">Every 2- and 3-stat combination at an average roll, for your build and enemy (${esc(($('metric').selectedOptions[0] || {}).textContent || 'DPS')}).</p>
        <label class="check small"><input type="checkbox" id="rvSpliced"> Include spliced traits</label>
        <label class="check small"><input type="checkbox" id="rvNoAmmo"> Ignore magazine and reload stats</label>
        <button type="button" class="btn sm" id="rvBest">Find best stats</button>
        <div id="rvBestOut"></div>
      </details>
      <details class="rv-sec" open>
        <summary>Saved rivens</summary>
        <div class="rv-save"><input type="text" id="rvName" maxlength="30" placeholder="Name, e.g. CC/CD/Dmg -zoom"><button type="button" class="btn sm" id="rvSave">Save this riven</button></div>
        <p class="muted small" id="rvLibNote">${UI.getUser() ? 'Saved to your account.' : 'Saved in this browser. Sign in to keep them on every device.'}</p>
        <div id="rvLib"></div>
      </details>
      <p class="muted small">Math: <a href="https://wiki.warframe.com/w/Riven_Mods" target="_blank" rel="noopener">WARFRAME Wiki, Riven Mods</a> (base values, disposition, stat-count multipliers, splicing).
        Values below rank 8 are scaled like other mods, (rank + 1) / 9.</p>`;
    refreshGrades();
    renderLibrary();
  }

  function refreshGrades() {
    const w = weapon(); if (!w) return;
    const g = R.grade(state.riven, w, R.MAX_RANK);
    const rs = rows();
    rs.forEach((s, idx) => {
      const el = panel.querySelector(`[data-g="${idx}"]`);
      if (!el || !s) return;
      const r = g.rows.find(x => x.key === s.key);
      if (!r || !r.ok) { el.textContent = ''; return; }
      const q = Math.round(r.quality * 100);
      el.textContent = r.outside ? 'outside range' : q + '%';
      el.className = 'rv-grade ' + (r.outside ? 'bad' : q >= 75 ? 'good' : q >= 40 ? 'mid' : 'low');
      el.title = r.outside ? 'This value cannot roll for this weapon with this many stats. Check the weapon, the stat count, the rank, or whether the disposition changed.'
        : `Roll ${r.roll.toFixed(3)} (possible 0.900 to 1.100). ${s.neg ? 'Smaller is better for a negative.' : 'Higher is better.'}`;
      const rr = panel.querySelector(`[data-r="${idx}"]`);
      const def = R.statDef(s.key);
      if (rr && r.range) rr.textContent = s.neg ? `${fmtNeg(def, r.range.min)} to ${fmtNeg(def, r.range.max)}` : `${fmtNum(def, r.range.min)} to ${fmtNum(def, r.range.max)}`;
    });
    const msgs = R.counts(state.riven).list.length ? R.validate(state.riven, w) : [];
    const nm = R.notModeled(state.riven).map(k => R.labelFor(R.statDef(k), R.typeFor(w)));
    $('rvMsgs').innerHTML = (msgs.length ? `<ul class="notes">${msgs.map(m => `<li class="warn">${esc(m)}</li>`).join('')}</ul>` : '') +
      (nm.length ? `<p class="muted small">Shown but not used in the damage math: ${esc(nm.join(', '))}.</p>` : '') +
      (slotIdx() < 0 && R.counts(state.riven).list.length ? '<p class="small warn-t">Not in a mod slot, so it is not counted in the results yet.</p>' : '');
    $('rvGradeAll').innerHTML = g.overall == null ? '' : `Overall roll quality <b class="rv-letter l-${g.letter}">${g.letter}</b> <span class="muted small">${Math.round(g.overall * 100)}% (S 90%+, A 75%+, B 50%+, C 25%+)</span>`;
  }

  // ---------------- editing ----------------
  panel.addEventListener('change', e => {
    const t = e.target;
    const rs = rows();
    if (t.matches('[data-k]')) {
      const idx = +t.dataset.k, key = t.value;
      // adding or removing a stat changes every stat's multiplier: keep each existing stat at the same roll
      const before = R.grade(state.riven, weapon(), R.MAX_RANK).rows;
      rs[idx] = key ? { key, value: 0, neg: idx === 3 } : null;
      setRows(rs);
      const c = R.counts(state.riven);
      rs.forEach((s, j) => {
        if (!s) return;
        const r = R.range(s.key, weapon(), Math.max(2, c.pos), c.neg, j === 3, R.MAX_RANK);
        if (!r) return;
        const old = j === idx ? null : before.find(x => x.key === s.key && x.ok);
        s.value = +R.valueAt(r, old ? old.pos : 0.5).toFixed(2);   // a new stat starts at an average roll
      });
      setRows(rs);
      changed(true);
    } else if (t.id === 'rvRank') {
      const v = +t.value; const i = slotIdx();
      if (i >= 0) state.ranks[i] = v === R.MAX_RANK ? null : v; else state.riven.rank = v;
      changed(false);
    } else if (t.id === 'rvPol') { state.riven.polarity = t.value; changed(false); }
    else if (t.id === 'rvDrain') { state.riven.drain = Math.max(0, Math.min(30, parseInt(t.value, 10) || 0)); changed(false); }
  });
  panel.addEventListener('input', e => {
    const t = e.target;
    const rs = rows();
    if (t.matches('[data-v]')) {
      const idx = +t.dataset.v; if (!rs[idx]) return;
      rs[idx].value = Math.abs(parseFloat(t.value) || 0); setRows(rs);
      const c = R.counts(state.riven);
      const r = R.range(rs[idx].key, weapon(), Math.max(2, c.pos), c.neg, idx === 3, R.MAX_RANK);
      const sl = panel.querySelector(`[data-s="${idx}"]`);
      if (sl && r) sl.value = Math.round(Math.max(0, Math.min(1, (rs[idx].value - r.min) / (r.max - r.min))) * 1000);
      changed(false);
    } else if (t.matches('[data-s]')) {
      const idx = +t.dataset.s; if (!rs[idx]) return;
      const c = R.counts(state.riven);
      const r = R.range(rs[idx].key, weapon(), Math.max(2, c.pos), c.neg, idx === 3, R.MAX_RANK);
      if (!r) return;
      rs[idx].value = +R.valueAt(r, +t.value / 1000).toFixed(2); setRows(rs);
      const inp = panel.querySelector(`[data-v="${idx}"]`); if (inp) inp.value = rs[idx].value;
      changed(false);
    }
  });
  panel.addEventListener('click', e => {
    if (e.target.id === 'rvEquip') {
      const free = state.mods.slice(0, UI.SLOT_COUNT).indexOf(null);
      if (free < 0) { UI.flashMsg('All 8 mod slots are full. Remove a mod first, or drag the Riven Mod card onto a slot to replace it.'); return; }
      UI.addMod(UI.RIVEN, free); render();
    } else if (e.target.id === 'rvUnequip') {
      const i = slotIdx(); if (i >= 0) { state.mods[i] = null; state.ranks[i] = null; UI.renderSlots(); UI.update(); render(); }
    } else if (e.target.id === 'rvBest') bestStats();
    else if (e.target.id === 'rvSave') saveRiven();
    else if (e.target.closest('[data-use]')) useBest(+e.target.closest('[data-use]').dataset.use);
    else if (e.target.closest('[data-load]')) loadRiven(e.target.closest('[data-load]').dataset.load);
    else if (e.target.closest('[data-del]')) deleteRiven(e.target.closest('[data-del]').dataset.del);
  });

  // ---------------- best stats ----------------
  let lastBest = [];
  let bestRun = 0;
  const RIVEN_FACTION = { Grineer: 'vsGrineer', Corpus: 'vsCorpus', Infested: 'vsInfested', Orokin: 'vsOrokin', Scaldra: 'vsScaldra', Techrot: 'vsTechrot' };
  function metricScore(res, metric) {
    if (metric === 'ttk') return res.ttk && res.ttk.seconds > 0 ? 1 / res.ttk.seconds : 0;
    if (metric === 'perShotVsEnemy') return res.perShotVsEnemy || 0;
    return (res.dps && res.dps[metric]) || 0;
  }
  function bestStats() {
    const w = weapon(); const b = UI.collect(); if (!w || !b) return;
    const run = ++bestRun;
    const out = $('rvBestOut');
    let metric = $('metric').value || 'sustainedTotal';
    if (metric === 'ttk' && !(b.enemy && b.enemy.health > 0)) metric = 'sustainedTotal';
    const fi = S.FACTIONS[b.enemy && b.enemy.faction] || {};
    const factionKey = RIVEN_FACTION[fi.baneKey] || RIVEN_FACTION[fi.rivenKey] || null;
    const opts = { factionKey, spliced: $('rvSpliced').checked, noAmmo: $('rvNoAmmo').checked, attack: b.attack };
    const base = Object.assign({}, b, { riven: [], rivenSlot: undefined });
    const baseRes = E.calculate(base, D);
    const baseScore = metricScore(baseRes, metric);
    const slot = slotIdx() >= 0 ? b.rivenSlot : (b.mods.length - 0.5);
    const cond = baseRes.fightSeconds && !(b.conditions && b.conditions.fightSeconds) && b.enemy && b.enemy.health > 0
      ? Object.assign({}, b.conditions, { fightSeconds: baseRes.fightSeconds, iterations: 2 }) : b.conditions;
    const jobs = [...R.bestStatsJobs(w, opts)];
    const { harmless } = R.candidateKeys(w, opts);
    const results = [];
    let k = 0;
    out.innerHTML = `<p class="muted small">Testing ${jobs.length} combinations...</p>`;
    const step = () => {
      if (run !== bestRun) return;
      const end = Math.min(jobs.length, k + 80);
      for (; k < end; k++) {
        const j = jobs[k];
        const riv = R.averageRiven(j.keys, j.neg, w);
        try {
          const res = E.calculate(Object.assign({}, b, { riven: R.toEffects(riv), rivenSlot: slot, conditions: cond }), D);
          results.push({ keys: j.keys, neg: j.neg, score: metricScore(res, metric) });
        } catch (err) { /* skip a combination the engine rejects */ }
      }
      if (k < jobs.length) { out.querySelector('p').textContent = `Testing ${jobs.length} combinations... ${Math.round(k / jobs.length * 100)}%`; setTimeout(step, 0); return; }
      results.sort((a, b2) => b2.score - a.score);
      // keep the best version of each positive set (with or without the negative)
      const seen = new Set();
      lastBest = results.filter(r => { const id = r.keys.slice().sort().join('+'); if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 10);
      const type = R.typeFor(w);
      const lbl = key => esc(R.labelFor(R.statDef(key), type));
      const unit = metric === 'ttk' ? '' : metric === 'perShotVsEnemy' ? ' per shot' : ' DPS';
      out.innerHTML = `<table class="rv-best"><tr><th>Positives (average roll)</th><th>Negative</th><th>${metric === 'ttk' ? 'Time to kill' : 'Result'}</th><th>vs no riven</th><th></th></tr>${lastBest.map((r, i) => {
        const val = metric === 'ttk' ? (1 / r.score).toFixed(2) + 's' : fmt(r.score) + unit;
        const gain = baseScore > 0 ? ((r.score / baseScore - 1) * 100) : 0;
        return `<tr><td>${r.keys.map(lbl).join(', ')}</td><td>${r.neg ? 'any harmless one' : 'none'}</td><td>${val}</td><td class="pos">+${gain.toFixed(gain >= 10 ? 0 : 1)}%</td><td><button type="button" class="btn ghost sm" data-use="${i}">Use</button></td></tr>`;
      }).join('')}</table>
      <p class="muted small">"Harmless" negatives here do not change damage in this model: ${harmless.map(lbl).join(', ') || 'none'}. Disposition ${w.omega || 1}, rank 8.
        ${opts.factionKey ? '' : 'Faction stats are skipped because the current enemy faction has no matching riven stat.'}</p>`;
    };
    setTimeout(step, 10);
  }
  function useBest(i) {
    const r = lastBest[i]; const w = weapon(); if (!r || !w) return;
    const { harmless } = R.candidateKeys(w, {});
    const pick = r.neg ? (harmless.includes('zoom') ? 'zoom' : r.neg) : null;
    state.riven.stats = R.averageRiven(r.keys, pick, w).stats.map(s => Object.assign(s, { value: +s.value.toFixed(2) }));
    if (slotIdx() < 0) { const free = state.mods.slice(0, UI.SLOT_COUNT).indexOf(null); if (free >= 0) UI.addMod(UI.RIVEN, free); }
    changed(true);
  }

  // ---------------- library ----------------
  let cloud = null;   // [{name, data}] from the account, loaded on demand
  const libLocal = () => store.get(LIB_KEY, {});
  async function loadCloud(force) {
    if (!UI.getUser()) { cloud = null; return; }
    if (cloud && !force) return;
    try { const r = await UI.api('/builds'); cloud = r.builds.filter(b => b.name.startsWith(CLOUD_PREFIX)); }
    catch (e) { cloud = []; UI.flashMsg('Could not load saved rivens: ' + e.message); }
  }
  function libFor(w) {
    if (UI.getUser() && cloud) {
      const pre = `${CLOUD_PREFIX}${w.name} :: `;
      return cloud.filter(b => b.name.startsWith(pre)).map(b => ({ id: b.name, name: b.name.slice(pre.length), riven: b.data.rivenMod }));
    }
    return (libLocal()[w.name] || []).map((x, i) => ({ id: String(i), name: x.name, riven: x.riven }));
  }
  async function renderLibrary() {
    const w = weapon(); const el = $('rvLib'); if (!w || !el) return;
    if (UI.getUser()) await loadCloud(false);
    const list = libFor(w);
    el.innerHTML = list.length ? `<ul class="rv-lib">${list.map(x => `<li><span><b>${esc(x.name)}</b> <span class="muted small">${esc(R.lines(x.riven, w).join(', '))}</span></span>
      <span><button type="button" class="btn ghost sm" data-load="${esc(x.id)}">Load</button> <button type="button" class="linkbtn small" data-del="${esc(x.id)}">delete</button></span></li>`).join('')}</ul>`
      : '<p class="muted small">No saved rivens for this weapon yet.</p>';
  }
  async function saveRiven() {
    const w = weapon(); if (!w) return;
    const name = ($('rvName').value || '').trim().replace(/::/g, ':').slice(0, 30) || R.lines(state.riven, w).map(l => l.split(' ').slice(1).join(' ')).join('/').slice(0, 30) || 'Riven';
    if (!R.counts(state.riven).list.length) { UI.flashMsg('Add some stats first.'); return; }
    const copy = JSON.parse(JSON.stringify(state.riven));
    if (UI.getUser()) {
      try { await UI.api('/builds/' + encodeURIComponent(`${CLOUD_PREFIX}${w.name} :: ${name}`), { method: 'PUT', body: JSON.stringify({ data: { weapon: w.name, rivenMod: copy } }) }); await loadCloud(true); }
      catch (e) { UI.flashMsg('Save failed: ' + e.message); return; }
    } else {
      const lib = libLocal(); const arr = lib[w.name] || [];
      const at = arr.findIndex(x => x.name === name);
      if (at >= 0) arr[at] = { name, riven: copy, savedAt: Date.now() }; else arr.push({ name, riven: copy, savedAt: Date.now() });
      lib[w.name] = arr;
      if (!store.set(LIB_KEY, lib)) { UI.flashMsg('This browser would not save it (storage blocked or full).'); return; }
    }
    $('rvName').value = '';
    UI.flashMsg(`Saved riven "${name}".`);
    renderLibrary();
  }
  function loadRiven(id) {
    const w = weapon(); if (!w) return;
    const x = libFor(w).find(r => r.id === id); if (!x) return;
    state.riven = Object.assign(R.empty(), JSON.parse(JSON.stringify(x.riven)));
    if (slotIdx() < 0) { const free = state.mods.slice(0, UI.SLOT_COUNT).indexOf(null); if (free >= 0) UI.addMod(UI.RIVEN, free); }
    changed(true);
  }
  async function deleteRiven(id) {
    const w = weapon(); if (!w) return;
    if (!confirm('Delete this saved riven?')) return;
    if (UI.getUser() && cloud) {
      try { await UI.api('/builds/' + encodeURIComponent(id), { method: 'DELETE' }); await loadCloud(true); } catch (e) { UI.flashMsg('Delete failed: ' + e.message); return; }
    } else {
      const lib = libLocal(); const arr = lib[w.name] || []; arr.splice(+id, 1); lib[w.name] = arr; store.set(LIB_KEY, lib);
    }
    renderLibrary();
  }

  // ---------------- hooks ----------------
  UI.openRiven = () => { if (window.WFOpenTab) window.WFOpenTab('riven'); else if (window.WFSelectTab) window.WFSelectTab('riven', true); render(); const p = $('pane-riven'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest' }); };
  // re-render when the weapon, slot or build changes (cheap; skipped while typing in the panel)
  let lastKey = '';
  UI.hooks.push(() => {
    if (panel.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
    const key = [state.weapon && state.weapon.name, slotIdx(), rank(), JSON.stringify(state.riven), !!UI.getUser()].join('|');
    if (key !== lastKey) { lastKey = key; render(); }
  });
  $('tab-riven').addEventListener('click', render);
  render();
};
