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
  const OLD = () => window.WF_OLD_DISPO || null;   // data/old-dispositions.js (before Hotfix 44.1.3)
  const oldDispo = w => R.oldDisposition(w, OLD());
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

  // roll scanner option lists (stats this weapon can roll)
  function scanOptions() {
    const w = weapon(); if (!w) return '';
    const type = R.typeFor(w);
    return R.STATS.concat(R.SPLICED).filter(d => R.available(d, type) && d.fx && !d.negOnly).map(d => `<option value="${d.key}">${esc(R.labelFor(d, type))}</option>`).join('');
  }
  function negOptions() {
    const w = weapon(); if (!w) return '';
    const type = R.typeFor(w);
    return R.STATS.filter(d => R.available(d, type) && !d.posOnly).map(d => `<option value="${d.key}">-${esc(R.labelFor(d, type))}</option>`).join('');
  }
  const selected = id => { const el = $(id); return el ? [...el.selectedOptions].map(o => o.value) : []; };

  // ---------------- import from a screenshot (Tesseract.js, bundled in vendor/tesseract, runs on this device) ----------------
  let ocrWorker = null;
  let importNote = ''; // last import result, kept across re-renders
  function loadScript(src) { return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(sc); }); }
  async function getWorker(msg) {
    if (ocrWorker) return ocrWorker;
    const base = new URL('vendor/tesseract/', location.href).href;
    if (!window.Tesseract) await loadScript(base + 'tesseract.min.js');
    msg('Loading the text reader (about 7 MB, once)...');
    ocrWorker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', gzip: true, cacheMethod: 'write'
    });
    return ocrWorker;
  }
  // bigger, grey and dark-on-light reads best; riven cards are light text on dark purple
  function prepare(img) {
    const scale = Math.min(3, Math.max(1, 1600 / Math.max(img.width, img.height)));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) { const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = y; sum += y; }
    const invert = sum / (px.length / 4) < 128;
    for (let i = 0; i < px.length; i += 4) { let y = px[i]; if (invert) y = 255 - y; y = y < 150 ? Math.max(0, y - 60) : Math.min(255, y + 60); px[i] = px[i + 1] = px[i + 2] = y; }
    g.putImageData(d, 0, 0);
    return c;
  }
  async function importImage(file) {
    const out = $('rvImportMsg');
    const msg = t => { if (out) out.textContent = t; };
    try {
      msg('Reading the screenshot...');
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That file is not an image.')); im.src = url; });
      const worker = await getWorker(msg);
      msg('Reading the card...');
      const { data } = await worker.recognize(prepare(img));
      URL.revokeObjectURL(url);
      const got = R.parseCardText(data.text, D.weapons, weapon());
      if (!got.stats.length) { msg('No riven stats found. Crop the screenshot to the riven card and try again.'); return; }
      if (got.weaponName && weapon() && got.weaponName !== weapon().name) {
        out.innerHTML = `This riven is for <b>${esc(got.weaponName)}</b>. <button type="button" class="btn ghost sm" id="rvSwitchW">Switch to ${esc(got.weaponName)}</button>`;
        $('rvSwitchW').onclick = () => { UI.apply(Object.assign({}, UI.collect(), { weapon: got.weaponName, mods: [], slotLayout: null, riven: [], rivenMod: { stats: got.stats } })); state.riven.stats = got.stats; render(); };
        return;
      }
      const od = oldDispo(weapon());
      const conv = $('rvImportOld') && $('rvImportOld').checked && od;
      importNote = `Imported ${got.stats.length} stat${got.stats.length > 1 ? 's' : ''}${conv ? ` and converted them from the old ${od.value} disposition` : ''}. Check them against your card${got.unmatched.length ? `; could not read: ${esc(got.unmatched.slice(0, 3).join(' | '))}` : ''}.`;
      state.riven.stats = conv ? R.convertRiven({ stats: got.stats }, od.value).stats : got.stats;
      state.riven.era = 'v44.1.3';
      changed(true);
    } catch (e) { msg('Import failed: ' + e.message); }
  }
  UI.ocr = { getWorker, prepare, loadScript };
  panel.addEventListener('paste', e => {
    const it = [...(e.clipboardData || {}).items || []].find(x => x.type && x.type.startsWith('image/'));
    if (it) { e.preventDefault(); importImage(it.getAsFile()); }
  });
  document.addEventListener('paste', e => {
    if (!panel.offsetParent || e.target.closest('input, textarea')) return;
    const it = [...(e.clipboardData || {}).items || []].find(x => x.type && x.type.startsWith('image/'));
    if (it && !panel.contains(e.target)) { e.preventDefault(); importImage(it.getAsFile()); }
  });

  // ---------------- render ----------------
  function render() {
    const w = weapon();
    if (!w) { panel.innerHTML = '<p class="muted small">Choose a weapon first. Each riven belongs to one weapon.</p>'; return; }
    const type = R.typeFor(w);
    const od = oldDispo(w);
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
      const pendingHere = !s && c.pending && (neg ? state.riven.pending.neg : !state.riven.pending.neg) && (neg || idx === Math.min(2, c.list.filter(x => !x.neg).length));
      const def = s && R.statDef(s.key);
      const r = s ? R.range(s.key, w, Math.max(2, c.pos), c.neg, neg, R.MAX_RANK) : null;
      const posv = r && r.max > r.min ? ((Math.abs(s.value) - r.min) / (r.max - r.min)) : 0.5;
      return `<div class="rv-row${neg ? ' neg' : ''}" data-row="${idx}">
        <span class="rv-sign">${neg ? '&minus;' : '+'}</span>
        <select data-k="${idx}" aria-label="${neg ? 'Negative stat' : 'Positive stat ' + (idx + 1)}">${statOpts(neg, s && s.key)}</select>
        ${s ? `<input type="number" step="any" min="0" data-v="${idx}" value="${+Math.abs(s.value).toFixed(def.unit === '%' || def.unit === 'x' ? 2 : 3)}" aria-label="Value"><span class="rv-unit">${def.unit === 'x' ? '% (x)' : def.unit}</span>
          <input type="range" min="0" max="1000" data-s="${idx}" value="${Math.round(Math.max(0, Math.min(1, posv)) * 1000)}" aria-label="Roll within the possible range" ${r ? '' : 'disabled'}>
          <span class="rv-range muted small" data-r="${idx}">${r ? (neg ? `${fmtNeg(def, r.min)} to ${fmtNeg(def, r.max)}` : `${fmtNum(def, r.min)} to ${fmtNum(def, r.max)}`) : 'n/a'}</span>
          <span class="rv-grade" data-g="${idx}"></span>` : '<span class="muted small rv-empty">' + (pendingHere ? '<b class="warn-t">Pick the trait the splice added.</b>' : neg ? 'Optional. A negative makes the positives stronger.' : idx === 2 ? 'Optional third positive.' : 'Pick a stat.') + '</span>'}
      </div>`;
    };
    const splices = R.spliceOptions(state.riven, w)
      .map((rc, k) => `<button type="button" class="btn ghost sm" data-splice="${k}" title="Uses one Riven Splicer in game. Both traits are consumed, the spliced trait keeps the higher roll, and a random trait of the same polarity takes the free place.">${esc(R.labelFor(R.statDef(rc[1]), type))} + ${esc(R.labelFor(R.statDef(rc[2]), type))} &rarr; <b>${esc(R.labelFor(R.statDef(rc[0]), type))}</b></button>`);
    panel.innerHTML = `
      <div class="rv-head">
        <div><b>${esc(w.name)}</b> riven <span class="muted small">${esc(R.TYPE_LABEL[type])} stats</span><br>
          <span class="muted small" data-tip="rivenMult">Riven multiplier <b>${R.DISPOSITION}</b>, the same for every weapon since Hotfix 44.1.3${od ? ` (was ${od.value})` : ''}</span></div>
        <div class="rv-equip">${i >= 0 ? `<span class="small">In slot <b>${i + 1}</b></span> <button type="button" class="btn ghost sm" id="rvUnequip">Remove from slot</button>`
          : `<button type="button" class="btn sm" id="rvEquip">Put in a mod slot</button>`}</div>
      </div>
      <div class="grid2 rv-settings">
        <label>Rank <select id="rvRank">${Array.from({ length: R.MAX_RANK + 1 }, (_, k) => `<option${k === rank() ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Polarity <select id="rvPol">${POLS.map(p => `<option value="${p}"${state.riven.polarity === p ? ' selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
        <label title="Capacity cost shown on your riven at rank 8. Riven cards differ; 18 is only a starting guess.">Drain at rank 8 <input type="number" id="rvDrain" min="0" max="30" value="${state.riven.drain != null ? state.riven.drain : R.DEFAULT_DRAIN}"></label>
      </div>
      <div class="rv-import">
        <button type="button" class="btn ghost sm" id="rvImportBtn">Import from screenshot</button>
        <input type="file" id="rvImportFile" accept="image/*" hidden>
        <span class="muted small">or paste a screenshot here (Ctrl+V). It is read on your device; nothing is uploaded.</span>
        ${od && od.value !== R.DISPOSITION ? `<label class="check small" title="Rivens changed on 2026-10-22. Screenshots or trade listings from before then show the old numbers."><input type="checkbox" id="rvImportOld"> The screenshot is from before Oct 22, 2026</label>` : ''}
        <div id="rvImportMsg" class="small">${importNote}</div>
      </div>
      <p class="muted small">Type the numbers from your riven card (rank 8 values), or pick a stat and drag its slider through the possible range.</p>
      <div class="rv-rows">${rs.map(row).join('')}</div>
      <div id="rvMsgs"></div>
      ${od && od.value !== R.DISPOSITION && c.list.length ? `<p class="small muted rv-old">Numbers from before Oct 22, 2026? <button type="button" class="linkbtn" id="rvConvert">Convert them</button> (x${R.DISPOSITION} / ${od.value}, the old disposition${od.from === 'weapon data' ? ' from the weapon data' : ''}).</p>` : ''}
      <div class="rv-grade-all" id="rvGradeAll"></div>
      ${splices.length ? `<div class="small rv-splice"><span class="muted">Riven Splicer can combine:</span> ${splices.join(' ')}</div>` : ''}
      <details class="rv-sec" id="rvBestBox" open>
        <summary>Roll scanner: best stats for this build</summary>
        <p class="muted small">Every 2- and 3-stat combination for your build and enemy (${esc(($('metric').selectedOptions[0] || {}).textContent || 'DPS')}).</p>
        <div class="grid2 rv-scan">
          <label>Must have <select id="rvForce" multiple size="4">${scanOptions()}</select></label>
          <label>Never use <select id="rvExclude" multiple size="4">${scanOptions()}</select></label>
          <label>Negative <select id="rvNeg"><option value="">None or a harmless one</option><option value="none">No negative</option>${negOptions()}</select></label>
          <label>Roll quality <span class="muted small" id="rvRollTxt">average</span><input type="range" id="rvRoll" min="90" max="110" step="1" value="100"></label>
        </div>
        <label class="check small"><input type="checkbox" id="rvSpliced"> Include spliced traits</label>
        <label class="check small"><input type="checkbox" id="rvNoAmmo"> Ignore magazine and reload stats</label>
        <label class="check small" title="Runs the optimizer again around each of the top 3 rivens, so the mods can change with the riven (slower)"><input type="checkbox" id="rvReopt"> Re-optimize mods for the top 3</label>
        <button type="button" class="btn sm" id="rvBest">Find best stats</button>
        <div id="rvBestOut"></div>
      </details>
      <details class="rv-sec" open>
        <summary>Saved rivens</summary>
        <div class="rv-save"><input type="text" id="rvName" maxlength="30" placeholder="Name, e.g. CC/CD/Dmg -zoom"><button type="button" class="btn sm" id="rvSave">Save this riven</button></div>
        <p class="muted small" id="rvLibNote">${UI.getUser() ? 'Saved to your account.' : 'Saved in this browser. Sign in to keep them on every device.'}</p>
        <div id="rvLib"></div>
      </details>
      <p class="muted small">Math: <a href="https://wiki.warframe.com/w/Riven_Mods" target="_blank" rel="noopener">WARFRAME Wiki, Riven Mods</a> (base values, stat-count multipliers, splicing; value = base &times; (rank + 1) &times; 1.2 &times; multiplier &times; roll).
        <a href="https://www.warframe.com/en/patch-notes/pc/44-1-3" target="_blank" rel="noopener">Hotfix 44.1.3</a> set every riven to the old 1.2 disposition.</p>`;
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
      el.title = r.outside ? 'This value cannot roll for this weapon with this many stats. Check the weapon, the stat count and the rank. Numbers from before Oct 22, 2026 used the old disposition: use "Convert them".'
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
    if (e.target.id === 'rvImportFile') { const f = e.target.files && e.target.files[0]; if (f) importImage(f); e.target.value = ''; return; }
    const t = e.target;
    const rs = rows();
    if (t.matches('[data-k]')) {
      const idx = +t.dataset.k, key = t.value;
      // adding or removing a stat changes every stat's multiplier: keep each existing stat at the same roll
      const before = R.grade(state.riven, weapon(), R.MAX_RANK).rows;
      rs[idx] = key ? { key, value: 0, neg: idx === 3 } : null;
      setRows(rs);
      if (state.riven.pending) { const cc = R.counts(Object.assign({}, state.riven, { pending: null })); const L = state.riven.pending.layout; if (cc.pos >= L.pos && cc.neg >= L.neg) delete state.riven.pending; }
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
    if (e.target.id === 'rvRoll') { const v = +e.target.value; $('rvRollTxt').textContent = v === 100 ? 'average' : v === 110 ? 'perfect' : v === 90 ? 'worst' : v + '%'; return; }
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
    else if (e.target.id === 'rvImportBtn') $('rvImportFile').click();
    else if (e.target.id === 'rvSave') saveRiven();
    else if (e.target.id === 'rvConvert') {
      const od = oldDispo(weapon()); if (!od) return;
      state.riven = Object.assign(state.riven, { stats: R.convertRiven(state.riven, od.value).stats, era: 'v44.1.3' });
      UI.flashMsg(`Converted from the old ${od.value} disposition to ${R.DISPOSITION}.`); changed(true);
    } else if (e.target.closest('[data-splice]')) {
      const rc = R.spliceOptions(state.riven, weapon())[+e.target.closest('[data-splice]').dataset.splice]; if (!rc) return;
      const out = R.splice(state.riven, weapon(), rc);
      state.riven = out.riven;
      UI.flashMsg(`Spliced into ${R.labelFor(R.statDef(rc[0]), R.typeFor(weapon()))} at a ${Math.round(out.roll * 100)}% roll. Now pick the ${out.pendingNegative ? 'negative' : 'positive'} trait the game added.`);
      changed(true);
    } else if (e.target.closest('[data-convert]')) convertSaved(e.target.closest('[data-convert]').dataset.convert);
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
    const negSel = $('rvNeg').value;
    const roll = (+$('rvRoll').value || 100) / 100;
    const opts = { factionKey, spliced: $('rvSpliced').checked, noAmmo: $('rvNoAmmo').checked, attack: b.attack,
      forced: selected('rvForce'), excluded: selected('rvExclude'), negative: negSel === 'none' ? null : (negSel || undefined) };
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
        const riv = R.averageRiven(j.keys, j.neg, w, roll);
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
      // optional: let the mods change around each of the top 3 rivens
      if ($('rvReopt').checked && WF.optimizer) {
        const rIdx = slotIdx();
        for (const r of lastBest.slice(0, 3)) {
          try {
            const riv = R.averageRiven(r.keys, r.neg, w, roll);
            const o = WF.optimizer.optimize(Object.assign({}, b, { riven: R.toEffects(riv), rivenSlot: rIdx >= 0 ? b.rivenSlot : 7.5, slots: UI.SLOT_COUNT - 1,
              metric, locked: [], exilus: true, arcane: false, fixedArcanes: b.arcanes, beamWidth: 5, refine: 1 }), D);
            r.reopt = { score: metric === 'ttk' ? (o.score ? 1 / o.score : 0) : o.score, mods: o.mods };
          } catch (err) { /* keep the plain result */ }
        }
      }
      const type = R.typeFor(w);
      const lbl = key => esc(R.labelFor(R.statDef(key), type));
      const unit = metric === 'ttk' ? '' : metric === 'perShotVsEnemy' ? ' per shot' : ' DPS';
      out.innerHTML = `<table class="rv-best"><tr><th>Positives</th><th>Negative</th><th>${metric === 'ttk' ? 'Time to kill' : 'Result'}</th><th>vs no riven</th><th></th></tr>${lastBest.map((r, i) => {
        const val = metric === 'ttk' ? (1 / r.score).toFixed(2) + 's' : fmt(r.score) + unit;
        const gain = baseScore > 0 ? ((r.score / baseScore - 1) * 100) : 0;
        const re = r.reopt ? `<br><span class="muted small">with re-optimized mods: ${metric === 'ttk' ? (1 / r.reopt.score).toFixed(2) + 's' : fmt(r.reopt.score) + unit}</span>` : '';
        const negTxt = !r.neg ? 'none' : opts.negative ? '-' + lbl(r.neg) : 'any harmless one';
        return `<tr><td>${r.keys.map(lbl).join(', ')}</td><td>${negTxt}</td><td>${val}${re}</td><td class="pos">${gain >= 0 ? '+' : ''}${gain.toFixed(Math.abs(gain) >= 10 ? 0 : 1)}%</td><td><button type="button" class="btn ghost sm" data-use="${i}">Use</button></td></tr>`;
      }).join('')}</table>
      <p class="muted small">"Harmless" negatives here do not change damage in this model: ${harmless.map(lbl).join(', ') || 'none'}. Riven multiplier ${R.DISPOSITION}, rank 8, every stat at ${Math.round(roll * 100)}% of its average roll.
        ${opts.factionKey ? '' : 'Faction stats are skipped because the current enemy faction has no matching riven stat.'}</p>`;
    };
    setTimeout(step, 10);
  }
  UI.rivenBest = () => lastBest;
  function useBest(i) {
    const r = lastBest[i]; const w = weapon(); if (!r || !w) return;
    const { harmless } = R.candidateKeys(w, {});
    const negSel = $('rvNeg') ? $('rvNeg').value : '';
    const pick = !r.neg ? null : (negSel && negSel !== 'none') ? r.neg : (harmless.includes('zoom') ? 'zoom' : r.neg);
    const roll = $('rvRoll') ? (+$('rvRoll').value || 100) / 100 : 1;
    state.riven.stats = R.averageRiven(r.keys, pick, w, roll).stats.map(s => Object.assign(s, { value: +s.value.toFixed(2) }));
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
      return cloud.filter(b => b.name.startsWith(pre)).map(b => ({ id: b.name, name: b.name.slice(pre.length), riven: b.data.rivenMod, old: !(b.data.rivenMod && b.data.rivenMod.era) }));
    }
    // saved before Hotfix 44.1.3 (2026-10-22) = old disposition numbers
    const cut = Date.parse(R.DISPO_RETIRED + 'T00:00:00Z');
    return (libLocal()[w.name] || []).map((x, i) => ({ id: String(i), name: x.name, riven: x.riven, old: !(x.riven && x.riven.era) && (!x.savedAt || x.savedAt < cut) }));
  }
  async function renderLibrary() {
    const w = weapon(); const el = $('rvLib'); if (!w || !el) return;
    if (UI.getUser()) await loadCloud(false);
    const list = libFor(w);
    const od = oldDispo(w);
    const canConv = od && od.value !== R.DISPOSITION;
    el.innerHTML = list.length ? `<ul class="rv-lib">${list.map(x => `<li><span><b>${esc(x.name)}</b> <span class="muted small">${esc(R.lines(x.riven, w).join(', '))}</span>
        ${x.old && canConv ? `<br><span class="small warn-t">Saved before Oct 22, 2026 (old ${od.value} disposition).</span> <button type="button" class="linkbtn small" data-convert="${esc(x.id)}">Convert to today's values</button>` : ''}</span>
      <span><button type="button" class="btn ghost sm" data-load="${esc(x.id)}">Load</button> <button type="button" class="linkbtn small" data-del="${esc(x.id)}">delete</button></span></li>`).join('')}</ul>`
      : '<p class="muted small">No saved rivens for this weapon yet.</p>';
  }
  async function saveRiven() {
    const w = weapon(); if (!w) return;
    const name = ($('rvName').value || '').trim().replace(/::/g, ':').slice(0, 30) || R.lines(state.riven, w).map(l => l.split(' ').slice(1).join(' ')).join('/').slice(0, 30) || 'Riven';
    if (!R.counts(state.riven).list.length) { UI.flashMsg('Add some stats first.'); return; }
    const copy = Object.assign(JSON.parse(JSON.stringify(state.riven)), { era: state.riven.era || 'v44.1.3' });
    delete copy.pending;
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
  async function convertSaved(id) {
    const w = weapon(); if (!w) return;
    const od = oldDispo(w); const x = libFor(w).find(r => r.id === id); if (!x || !od) return;
    const conv = R.convertRiven(x.riven, od.value);
    if (UI.getUser() && cloud) {
      try { await UI.api('/builds/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ data: { weapon: w.name, rivenMod: conv } }) }); await loadCloud(true); }
      catch (e) { UI.flashMsg('Could not update it: ' + e.message); return; }
    } else {
      const lib = libLocal(); const arr = lib[w.name] || []; if (!arr[+id]) return;
      arr[+id] = Object.assign({}, arr[+id], { riven: conv, savedAt: Date.now() }); lib[w.name] = arr; store.set(LIB_KEY, lib);
    }
    UI.flashMsg(`"${x.name}" converted from the old ${od.value} disposition.`);
    renderLibrary();
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
