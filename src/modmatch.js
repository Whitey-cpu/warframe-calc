/*
 * Mod name matching for the build importer: typed lists ("Serration 10", "Split Chamber r5") and text read from
 * screenshots of the in-game mod screen or single mod cards. Pure functions; the UI (ui/import.js) runs the text reader.
 *
 * How a screenshot is read: the text reader returns lines with word boxes. Words far apart on one line are split into
 * separate pieces (two cards side by side), and a piece is also tried together with the piece right under it, because
 * longer names wrap onto two lines on a card. Each piece is compared with every mod name for the weapon (edit distance),
 * the closest unique matches win, and they are ordered top to bottom, left to right like the slots.
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});

  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  const similarity = (a, b) => { const x = norm(a), y = norm(b); if (!x || !y) return 0; return 1 - lev(x, y) / Math.max(x.length, y.length); };

  // items: [{ name, kind: 'mod' | 'arcane', exilus, maxRank }]
  function index(items) { return items.map(it => Object.assign({ n: norm(it.name) }, it)); }

  function candidates(text, idx, limit = 5) {
    const t = norm(text);
    if (t.length < 3) return [];
    return idx.map(it => ({ name: it.name, kind: it.kind, exilus: !!it.exilus, maxRank: it.maxRank, score: t === it.n ? 1 : 1 - lev(t, it.n) / Math.max(t.length, it.n.length) }))
      .sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // "Serration 10", "Split Chamber r5", "Hornet Strike (rank 3)", "Vital Sense 5/5", "Point Strike: 3", "- Serration"
  function parseLine(raw) {
    let s = String(raw || '').replace(/^\s*[-*•\d]+[.)]\s+/, '').replace(/^\s*[-*•]\s*/, '').trim();
    if (!s) return null;
    let rank = null;
    const pats = [/\(\s*(?:r|rank)?\s*(\d{1,2})(?:\s*\/\s*\d{1,2})?\s*\)\s*$/i, /\b(?:r|rank)\s*[:.]?\s*(\d{1,2})\s*$/i, /\s(\d{1,2})\s*\/\s*\d{1,2}\s*$/, /[:\s]\s*(\d{1,2})\s*$/];
    for (const p of pats) { const m = s.match(p); if (m) { rank = +m[1]; s = s.slice(0, m.index).replace(/[:\s-]+$/, ''); break; } }
    return s ? { raw: String(raw).trim(), query: s, rank } : null;
  }
  function parseList(text) {
    return String(text || '').split(/\r?\n|;|,(?![^(]*\))/).map(parseLine).filter(Boolean);
  }

  // ---------- screenshot text ----------
  // lines: [{ text, bbox: {x0,y0,x1,y1}, words: [{ text, bbox }] }]
  function pieces(lines) {
    const out = [];
    for (const ln of lines || []) {
      const ws = (ln.words && ln.words.length ? ln.words : [{ text: ln.text, bbox: ln.bbox }]).filter(w => w && w.bbox && String(w.text || '').trim());
      if (!ws.length) continue;
      const h = Math.max(4, ws.reduce((t, w) => t + (w.bbox.y1 - w.bbox.y0), 0) / ws.length);
      let cur = [ws[0]];
      const flush = () => {
        const text = cur.map(w => w.text).join(' ').trim();
        const bbox = { x0: Math.min(...cur.map(w => w.bbox.x0)), y0: Math.min(...cur.map(w => w.bbox.y0)), x1: Math.max(...cur.map(w => w.bbox.x1)), y1: Math.max(...cur.map(w => w.bbox.y1)) };
        if (/[a-z]{2}/i.test(text)) out.push({ text, bbox, h });
      };
      for (let i = 1; i < ws.length; i++) {
        if (ws[i].bbox.x0 - ws[i - 1].bbox.x1 > 1.6 * h) { flush(); cur = [ws[i]]; } else cur.push(ws[i]);
      }
      flush();
    }
    return out;
  }
  function readScreen(lines, idx, opts = {}) {
    const min = opts.min || 0.74;
    const ps = pieces(lines).map((p, i) => Object.assign(p, { i }));
    const tries = [];
    ps.forEach(p => tries.push({ parts: [p.i], text: p.text, bbox: p.bbox }));
    // two-line names: the piece directly below, overlapping horizontally, within about one line height
    ps.forEach(a => ps.forEach(b => {
      if (a === b) return;
      const gap = b.bbox.y0 - a.bbox.y1;
      const overlap = Math.min(a.bbox.x1, b.bbox.x1) - Math.max(a.bbox.x0, b.bbox.x0);
      if (gap >= -0.3 * a.h && gap < 1.2 * a.h && overlap > 0.3 * Math.min(a.bbox.x1 - a.bbox.x0, b.bbox.x1 - b.bbox.x0))
        tries.push({ parts: [a.i, b.i], text: a.text + ' ' + b.text, bbox: { x0: Math.min(a.bbox.x0, b.bbox.x0), y0: a.bbox.y0, x1: Math.max(a.bbox.x1, b.bbox.x1), y1: b.bbox.y1 } });
    }));
    tries.forEach(t => { t.cand = candidates(t.text, idx, 5); t.score = t.cand.length ? t.cand[0].score : 0; });
    const used = new Set(), names = new Set(), found = [];
    tries.filter(t => t.score >= min).sort((a, b) => b.score - a.score || b.parts.length - a.parts.length).forEach(t => {
      if (t.parts.some(p => used.has(p)) || names.has(t.cand[0].name)) return;
      t.parts.forEach(p => used.add(p)); names.add(t.cand[0].name); found.push(t);
    });
    // reading order: rows by vertical position (half a card name height apart), then left to right
    found.sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const rows = [];
    for (const f of found) {
      const row = rows.find(r => Math.abs(r.y - f.bbox.y0) < Math.max(20, 2.5 * (f.bbox.y1 - f.bbox.y0)));
      if (row) row.items.push(f); else rows.push({ y: f.bbox.y0, items: [f] });
    }
    const ordered = rows.flatMap(r => r.items.sort((a, b) => a.bbox.x0 - b.bbox.x0));
    const riven = (lines || []).some(l => /\briven\b/i.test(l.text || ''));
    return { matches: ordered.map(f => ({ text: f.text, cand: f.cand, bbox: f.bbox })), riven, rows: rows.length };
  }

  // Slot plan for a list of matched names: arcanes to the arcane slot, a ninth mod (or one that only fits there) to Exilus
  function planSlots(list, slotCount = 8) {
    const mods = list.filter(x => x.kind !== 'arcane'), arcs = list.filter(x => x.kind === 'arcane');
    const out = [];
    let exilusUsed = false, k = 0;
    if (mods.length > slotCount) {
      const ex = mods.find(m => m.exilus);
      if (ex) { out.push(Object.assign({}, ex, { slot: 'exilus' })); exilusUsed = true; }
    }
    mods.forEach(m => {
      if (out.some(o => o.name === m.name)) return;
      if (k < slotCount) out.push(Object.assign({}, m, { slot: k++ }));
      else if (!exilusUsed && m.exilus) { out.push(Object.assign({}, m, { slot: 'exilus' })); exilusUsed = true; }
      else out.push(Object.assign({}, m, { slot: null }));
    });
    arcs.forEach((a, i) => out.push(Object.assign({}, a, { slot: i === 0 ? 'arcane' : null })));
    return out;
  }

  WF.modmatch = { norm, lev, similarity, index, candidates, parseLine, parseList, pieces, readScreen, planSlots };
})();
