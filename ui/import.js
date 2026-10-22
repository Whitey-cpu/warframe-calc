/*
 * Build importer (Builds tab): read mod names from a screenshot of the in-game mod screen or of single mod cards,
 * or from a typed list, check them in a review table, then put them in the slots. Matching: src/modmatch.js.
 * Screenshots are read on this device with the bundled text reader (vendor/tesseract); nothing is uploaded.
 */
window.WFImport = function (UI) {
  const { $, esc, state, D, E, WF, SLOT_COUNT } = UI;
  const M = WF.modmatch;
  const panel = $('importPanel');
  if (!panel || !M) return;

  let rows = [];          // [{ use, text, cand: [{name, kind, score, maxRank, exilus}], name, rank, slot }]
  let note = '';
  let detectedWeapon = null;

  function itemsForWeapon() {
    const w = state.weapon; if (!w) return [];
    const mods = (UI.getCompatMods && UI.getCompatMods()) || E.modsFor(D, w);
    const arcTypes = WF.optimizer && WF.optimizer.arcaneTypesFor ? WF.optimizer.arcaneTypesFor(w) : [];
    const arcs = (D.arcanes || []).filter(a => !arcTypes.length || arcTypes.includes(a.type));
    return mods.map(m => ({ name: m.name, kind: 'mod', exilus: !!m.exilus, maxRank: m.maxRank || 0 })).concat(arcs.map(a => ({ name: a.name, kind: 'arcane', maxRank: a.maxRank || 5 })));
  }

  function render() {
    const w = state.weapon;
    panel.innerHTML = `
      <h3>Import a build</h3>
      <p class="muted small">Read the mods from a screenshot of the in-game mod screen, from cropped single mod cards, or from a typed list. You check every match before anything changes.
        Screenshots are read on your device; nothing is uploaded.</p>
      ${w ? '' : '<p class="small warn-t">Choose a weapon first, so only mods that fit it are matched.</p>'}
      <div class="row imp-src">
        <button type="button" class="btn sm" id="impShot"${w ? '' : ' disabled'}>Read screenshots</button>
        <input type="file" id="impFile" accept="image/*" multiple hidden>
        <label class="small">Screenshot shows <select id="impMode"><option value="screen">the whole mod screen (replaces the build)</option><option value="cards">single mod cards (fills empty slots)</option></select></label>
      </div>
      <p class="muted small">You can also paste a screenshot here (Ctrl+V) while this tab is open.</p>
      <label class="small"><span>Or type the mods, one per line. A rank is optional, for example <code>Serration 10</code>, <code>Split Chamber r5</code> or <code>Primary Merciless</code>.</span>
        <textarea id="impText" rows="4" spellcheck="false" placeholder="Serration 10&#10;Split Chamber&#10;Point Strike 5"></textarea></label>
      <button type="button" class="btn ghost sm" id="impRead"${w ? '' : ' disabled'}>Match the list</button>
      <div id="impMsg" class="small" role="status" aria-live="polite">${note}</div>
      <div id="impReview"></div>`;
    renderReview();
  }

  function slotOptions(cur, kind) {
    const o = [];
    if (kind === 'arcane') o.push(['arcane', 'Arcane']);
    else { for (let i = 0; i < SLOT_COUNT; i++) o.push([String(i), 'Slot ' + (i + 1)]); o.push(['exilus', 'Exilus']); }
    o.push(['', 'Skip']);
    return o.map(([v, t]) => `<option value="${v}"${String(cur == null ? '' : cur) === v ? ' selected' : ''}>${t}</option>`).join('');
  }
  function renderReview() {
    const el = $('impReview'); if (!el) return;
    if (!rows.length) { el.innerHTML = ''; return; }
    const mode = $('impMode') ? $('impMode').value : 'screen';
    el.innerHTML = `<div class="tbl-wrap"><table class="rv-best imp-table"><tr><th>Use</th><th>Read as</th><th>Mod</th><th>Rank</th><th>Slot</th></tr>
      ${rows.map((r, i) => {
        const c = r.cand.find(x => x.name === r.name) || r.cand[0] || {};
        const low = (c.score || 0) < 0.86;
        return `<tr class="${r.use ? '' : 'muted'}"><td><input type="checkbox" data-iuse="${i}"${r.use ? ' checked' : ''} aria-label="Use this row"></td>
          <td class="small">${esc(r.text)}</td>
          <td><select data-iname="${i}" aria-label="Mod">${r.cand.map(x => `<option value="${esc(x.name)}"${x.name === r.name ? ' selected' : ''}>${esc(x.name)} (${Math.round(x.score * 100)}%)</option>`).join('')}</select>
            ${low ? '<span class="small warn-t" title="Not a close match. Check the name.">check</span>' : ''}</td>
          <td><input type="number" min="0" max="${c.maxRank || 10}" data-irank="${i}" value="${r.rank != null ? r.rank : (c.maxRank || 0)}" aria-label="Rank" class="imp-rank"></td>
          <td><select data-islot="${i}" aria-label="Slot">${slotOptions(r.slot, c.kind)}</select></td></tr>`;
      }).join('')}</table></div>
      ${detectedWeapon && state.weapon && detectedWeapon !== state.weapon.name ? `<p class="small">The screenshot names <b>${esc(detectedWeapon)}</b>. <button type="button" class="btn ghost sm" id="impSwitch">Switch to ${esc(detectedWeapon)} and match again</button></p>` : ''}
      <div class="row"><button type="button" class="btn sm" id="impApply">${mode === 'cards' ? 'Add to the build' : 'Replace the mods with these'}</button>
        <button type="button" class="btn ghost sm" id="impClear">Clear</button></div>
      <p class="muted small">Ranks start at max because a screenshot does not show them reliably; change any that are lower. Your riven, arcane and Warframe settings stay unless a row sets them.</p>`;
  }

  function setRows(list, fromScreen) {
    const mode = $('impMode') ? $('impMode').value : 'screen';
    const picked = list.map(x => Object.assign({}, x.cand[0], { text: x.text, cand: x.cand, rank: x.rank }));
    let plan;
    if (mode === 'cards' && fromScreen) {
      // fill the empty slots in order
      const free = state.mods.slice(0, SLOT_COUNT).map((n, i) => n ? null : i).filter(i => i != null);
      plan = picked.map(p => Object.assign({}, p, { slot: p.kind === 'arcane' ? 'arcane' : (free.length ? free.shift() : (p.exilus && !state.mods[SLOT_COUNT] ? 'exilus' : null)) }));
    } else plan = M.planSlots(picked, SLOT_COUNT);
    rows = plan.map(p => ({ use: p.slot != null, text: p.text, cand: p.cand, name: p.name, rank: p.rank, slot: p.slot }));
    renderReview();
  }

  // ---------- typed list ----------
  function readList() {
    const items = itemsForWeapon(); if (!items.length) return;
    const idx = M.index(items);
    const lines = M.parseList($('impText').value);
    const out = [], miss = [];
    lines.forEach(l => { const cand = M.candidates(l.query, idx, 5); if (cand.length && cand[0].score >= 0.6) out.push({ text: l.raw, cand, rank: l.rank }); else miss.push(l.raw); });
    note = `${out.length} matched${miss.length ? `; no close match for: ${esc(miss.slice(0, 4).join(', '))}` : ''}.`;
    detectedWeapon = null;
    $('impMsg').innerHTML = note;
    setRows(out, false);
  }

  // ---------- screenshots ----------
  function loadImage(file) {
    return new Promise((res, rej) => { const url = URL.createObjectURL(file); const im = new Image(); im.onload = () => res({ im, url }); im.onerror = () => rej(new Error('That file is not an image.')); im.src = url; });
  }
  // big, grey, dark text on light; the mod screen is wide, so it is scaled up rather than down
  function prepareScreen(img, plain) {
    const scale = Math.min(2.5, Math.max(1, 2600 / Math.max(img.width, img.height)));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) { const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = y; sum += y; }
    const invert = sum / (px.length / 4) < 128;
    // plain: grey and inverted only (keeps large titles the contrast step can lose); otherwise also stretch contrast
    for (let i = 0; i < px.length; i += 4) { let y = px[i]; if (invert) y = 255 - y; if (!plain) y = y < 140 ? Math.max(0, y - 70) : Math.min(255, y + 70); px[i] = px[i + 1] = px[i + 2] = y; }
    g.putImageData(d, 0, 0);
    return c;
  }
  function linesOf(data) {
    if (data.lines && data.lines.length) return data.lines;
    const out = [];
    (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => out.push(l))));
    if (out.length) return out;
    return String(data.text || '').split('\n').map((t, i) => ({ text: t, bbox: { x0: 0, y0: i * 30, x1: t.length * 14, y1: i * 30 + 22 }, words: [] }));
  }
  async function readShots(files) {
    const msg = t => { const el = $('impMsg'); if (el) el.innerHTML = t; };
    const items = itemsForWeapon(); if (!items.length) { msg('Choose a weapon first.'); return; }
    if (!UI.ocr) { msg('The text reader is not available on this page.'); return; }
    const idx = M.index(items);
    const all = [];
    let riven = false;
    try {
      for (let k = 0; k < files.length; k++) {
        msg(`Reading screenshot ${k + 1} of ${files.length}...`);
        const { im, url } = await loadImage(files[k]);
        const worker = await UI.ocr.getWorker(msg);
        const names = D.weapons.map(w => w.name).sort((a, b) => b.length - a.length);
        // the weapon name, if the screenshot shows it (longest name found wins)
        const weaponIn = text => { const flat = ' ' + M.norm(text) + ' '; return names.find(n => flat.includes(' ' + M.norm(n) + ' ')) || null; };
        // first pass with stronger contrast; a second, plain pass when few names or no weapon name came through
        let { data } = await worker.recognize(prepareScreen(im), {}, { text: true, blocks: true });
        let r = M.readScreen(linesOf(data), idx);
        let named = weaponIn(data.text);
        if (r.matches.length < 4 || !named) {
          msg(`Reading screenshot ${k + 1} of ${files.length} again...`);
          const d2 = (await worker.recognize(prepareScreen(im, true), {}, { text: true, blocks: true })).data;
          const r2 = M.readScreen(linesOf(d2), idx);
          if (r2.matches.length > r.matches.length) { const extra = r.matches.filter(m => !r2.matches.some(x => x.cand[0].name === m.cand[0].name)); r = Object.assign(r2, { matches: r2.matches.concat(extra), riven: r.riven || r2.riven }); }
          else r.matches = r.matches.concat(r2.matches.filter(m => !r.matches.some(x => x.cand[0].name === m.cand[0].name)));
          named = named || weaponIn(d2.text);
        }
        URL.revokeObjectURL(url);
        riven = riven || r.riven;
        r.matches.forEach(m => { if (!all.some(a => a.cand[0].name === m.cand[0].name)) all.push(m); });
        if (named) detectedWeapon = named;
      }
    } catch (e) { msg('Could not read it: ' + esc(e.message)); return; }
    note = all.length ? `Found ${all.length} mod${all.length > 1 ? 's' : ''}.${riven ? ' A riven was seen: set it up in the Riven tab (its own importer reads riven cards).' : ''} Check each row.`
      : 'No mod names found. Try a sharper screenshot, crop closer to the cards, or type the names below.';
    msg(note);
    setRows(all, true);
  }

  // ---------- apply ----------
  function applyRows() {
    const use = rows.filter(r => r.use && r.slot != null && r.slot !== '');
    if (!use.length) { UI.flashMsg('Nothing selected to add.'); return; }
    const mode = $('impMode') ? $('impMode').value : 'screen';
    const b = UI.collect(); if (!b) return;
    const layout = mode === 'cards' ? (b.slotLayout || []).slice() : new Array(SLOT_COUNT + 1).fill(null);
    const ranks = mode === 'cards' ? (b.slotRanks || []).slice() : new Array(SLOT_COUNT + 1).fill(null);
    // keep the riven where it was
    const rIdx = UI.rivenIndex();
    if (mode !== 'cards' && rIdx >= 0 && rIdx < SLOT_COUNT) layout[rIdx] = UI.RIVEN;
    let arcSlots = (b.arcaneSlots || [null, null]).slice();
    const clash = [];
    use.forEach(r => {
      const c = r.cand.find(x => x.name === r.name) || {};
      if (r.slot === 'arcane') { arcSlots[0] = r.name; return; }
      let i = r.slot === 'exilus' ? SLOT_COUNT : +r.slot;
      if (layout[i] && layout[i] !== r.name) {
        const free = layout.slice(0, SLOT_COUNT).indexOf(null);
        if (r.slot !== 'exilus' && free >= 0) i = free; else { clash.push(r.name); return; }
      }
      layout[i] = r.name;
      ranks[i] = c.maxRank != null && r.rank != null && +r.rank < c.maxRank ? Math.max(0, +r.rank) : null;
    });
    UI.apply(Object.assign({}, b, { mods: undefined, slotLayout: layout, slotRanks: ranks, arcaneSlots: arcSlots }));
    UI.flashMsg(`Imported ${use.length - clash.length} item${use.length - clash.length === 1 ? '' : 's'}${clash.length ? `; no free slot for ${clash.join(', ')}` : ''}.`);
    rows = []; note = ''; render();
  }

  // ---------- events ----------
  panel.addEventListener('click', e => {
    const t = e.target;
    if (t.id === 'impShot') $('impFile').click();
    else if (t.id === 'impRead') readList();
    else if (t.id === 'impApply') applyRows();
    else if (t.id === 'impClear') { rows = []; note = ''; detectedWeapon = null; render(); }
    else if (t.id === 'impSwitch' && detectedWeapon) {
      const w = E.findWeapon(D, detectedWeapon); if (!w) return;
      const texts = rows.map(r => r.text);
      UI.apply(Object.assign({}, UI.collect(), { weapon: w.name, mods: [], slotLayout: null, slotRanks: null, slotPolarities: null, riven: [], rivenMod: null }));
      const idx = M.index(itemsForWeapon());
      const again = texts.map(tx => ({ text: tx, cand: M.candidates(tx, idx, 5) })).filter(x => x.cand.length);
      detectedWeapon = null; setRows(again, true);
    }
  });
  panel.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'impFile') { const f = [...(t.files || [])]; if (f.length) readShots(f); t.value = ''; return; }
    if (t.id === 'impMode') { if (rows.length) setRows(rows.map(r => ({ text: r.text, cand: [r.cand.find(x => x.name === r.name)].concat(r.cand.filter(x => x.name !== r.name)), rank: r.rank })), true); return; }
    const i = +(t.dataset.iuse || t.dataset.iname || t.dataset.irank || t.dataset.islot);
    if (Number.isNaN(i) || !rows[i]) return;
    if (t.dataset.iuse != null) rows[i].use = t.checked;
    else if (t.dataset.iname != null) rows[i].name = t.value;
    else if (t.dataset.irank != null) rows[i].rank = t.value === '' ? null : +t.value;
    else if (t.dataset.islot != null) { rows[i].slot = t.value === '' ? null : t.value; rows[i].use = t.value !== ''; }
    renderReview();
  });
  document.addEventListener('paste', e => {
    if (!panel.offsetParent || (e.target.closest && e.target.closest('input, textarea'))) return;
    const files = [...((e.clipboardData || {}).items || [])].filter(x => x.type && x.type.startsWith('image/')).map(x => x.getAsFile());
    if (files.length && state.weapon) { e.preventDefault(); readShots(files); }
  });
  let lastW = '';
  UI.hooks.push(() => { const n = state.weapon ? state.weapon.name : ''; if (n !== lastW) { lastW = n; if (!rows.length) render(); else renderReview(); } });
  render();
};
