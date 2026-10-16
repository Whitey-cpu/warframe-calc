/*
 * Parser for DE's official patch notes pages (https://www.warframe.com/en/patch-notes).
 * Plain string handling, no dependencies, so the same code runs in Node (scripts/scrape-patches.js) and in a browser.
 * Everything here is taken from the page text: the TL;DR is built from DE's own section headings and item counts,
 * nothing is written or guessed by hand.
 */
(function (root) {
  const BASE = 'https://www.warframe.com';
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', times: 'x', deg: '°' };

  const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
  // DE writes em/en dashes in titles; the site style avoids them
  const tidy = s => s.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

  function isoDate(text) {
    const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text || '');
    if (!m || !MONTHS[m[1].toLowerCase()]) return null;
    return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  // Index page: the list of releases, newest first (absolute links are the list entries; relative ones are the hero cards)
  function parseIndex(html) {
    const out = [], seen = new Set();
    const re = /href="https:\/\/www\.warframe\.com\/en\/patch-notes\/pc\/([\w.-]+)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ slug: m[1], title: tidy(decode(m[2]).trim()), url: `${BASE}/en/patch-notes/pc/${m[1]}` });
    }
    return out;
  }

  // HTML body -> lines tagged as heading (h), bullet (b) or paragraph (p)
  function htmlToLines(body) {
    let h = body
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<em[^>]*>\s*Image Description:[\s\S]*?<\/em>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (m, t) => '\u0001' + t + '\u0002')
      .replace(/<li[^>]*>/gi, '\n\u0003')
      .replace(/<(ul|ol)\b[^>]*>/gi, '\n\u0004\n').replace(/<\/(ul|ol)>/gi, '\n\u0005\n')
      .replace(/<\/?(p|li|div|h[1-6]|table|tr|blockquote)\b[^>]*>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    h = tidy(decode(h));
    const lines = [];
    let depth = 0;
    for (let raw of h.split('\n')) {
      raw = raw.replace(/[ \t\u00a0]+/g, ' ').trim();
      if (raw === '\u0004') { depth++; continue; }
      if (raw === '\u0005') { depth = Math.max(0, depth - 1); continue; }
      if (!raw || raw === '\u0003') continue;
      const bullet = raw.startsWith('\u0003');
      if (bullet) raw = raw.slice(1).trim();
      const plain = raw.replace(/[\u0001\u0002]/g, '').trim();
      if (!plain) continue;
      const heading = !bullet && /^\u0001[^\u0001\u0002]+\u0002\s*:?\s*$/.test(raw);
      lines.push({ k: heading ? 'h' : bullet ? 'b' : 'p', t: plain, d: Math.max(0, depth - 1) });
    }
    return lines;
  }

  const PART_RE = /(^|:\s*)(Hotfix|Update)\s+\d+(\.\d+)*(\s*\+\s*[\d.]+)?\s*$|^Update\s+\d+(\.\d+)*\s*:/i;
  const GENERIC_RE = /^(top\s+|general\s+|other\s+|more\s+)?(bug\s+)?(fixes|changes|additions|improvements|optimizations|known issues|changes\s*(&|and)\s*fixes|fixes\s*(&|and)\s*changes)\s*:?$/i;

  // One release page -> date, forum thread and parts (a page can hold e.g. Hotfix 44.1.2 and 44.1.2.1)
  function parsePage(html, fallbackTitle) {
    const rec = html.indexOf('<div class="record"');
    const start = html.indexOf('class="content">', rec < 0 ? 0 : rec);
    if (start < 0) throw new Error('patch notes body not found');
    let end = html.indexOf('detail-navigation', start);
    end = end < 0 ? html.indexOf('<div class="resources"', start) : html.lastIndexOf('<', end);
    const body = html.slice(start + 'class="content">'.length, end < 0 ? undefined : end);
    const nav = end < 0 ? '' : html.slice(end, end + 1500);
    const forum = (/href="(https:\/\/forums\.warframe\.com\/topic\/[^"]+)"/.exec(nav) || [])[1] || null;
    const dateText = (/<date[^>]*>([^<]+)<\/date>/.exec(html.slice(rec < 0 ? 0 : rec)) || [])[1];

    const parts = [];
    let part = null, section = null;
    const newPart = title => { part = { title, sections: [] }; parts.push(part); section = null; };
    const newSection = title => { if (!part) newPart(fallbackTitle || ''); section = { title, items: [] }; part.sections.push(section); };
    for (const ln of htmlToLines(body)) {
      if (ln.k === 'h' && PART_RE.test(ln.t.replace(/:$/, ''))) {
        // a Hotfix heading always starts a part; an Update heading only renames the start of the page
        const t = ln.t.replace(/:$/, '');
        const hasBullets = part && part.sections.some(s => s.items.some(it => typeof it === 'string' || it.d != null));
        if (/hotfix/i.test(t) || !part) newPart(t); else if (hasBullets) newSection(titleCase(t));
        continue;
      }
      if (ln.k === 'h') { newSection(ln.t.replace(/\s*:$/, '')); continue; }
      if (!section) newSection('');
      section.items.push(ln.k === 'p' ? { p: ln.t } : ln.d ? { t: ln.t, d: ln.d } : ln.t);
    }
    return { date: isoDate(dateText), forum, parts: parts.filter(p => p.sections.some(s => s.items.length)) };
  }

  // --------------- summary ---------------
  // DE writes the main sections of big updates in capitals ("NEW WARFRAME: NARIN"); show them in title case
  const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'vs']);
  function titleCase(t) {
    if (/[a-z]/.test(t)) return t;
    return t.toLowerCase().replace(/[a-z0-9'][^\s:/()-]*/g, (w, i, all) => {
      if (/^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/.test(w)) return w.toUpperCase();   // roman numerals (Art Pack VI)
      return i > 0 && SMALL.has(w) && !/:\s*$/.test(all.slice(0, i)) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    })
      .replace(/\(([a-z]{2,3})\)/gi, (m, w) => `(${w.toUpperCase()})`);
  }
  const isCaps = t => /[A-Z]{3}/.test(t) && !/[a-z]/.test(t);
  const BUCKET_RE = /^(script errors?|crash(es)?(\s*(&|and)\s*script errors?)?|performance( issues)?|cosmetic|ui|mission|equipment|quest|misc(ellaneous)?|other|general|level design(\s*(&|and)\s*environment)?|mission and equipment)$/i;

  function summarize(parts) {
    let fixes = 0, changes = 0;
    const highlights = [];
    // big updates: only the capitalised main sections become highlights
    const capsOnly = parts.some(p => p.sections.some(s => isCaps(s.title) && !GENERIC_RE.test(s.title)));
    for (const p of parts) for (const s of p.sections) {
      const fixSection = /fix/i.test(s.title) && !/change|addition|improve/i.test(s.title);
      for (const it of s.items) {
        if (typeof it !== 'string') continue;   // paragraphs and sub-points are not counted
        if (/^fix(ed|es)?\b/i.test(it) || fixSection) fixes++; else changes++;
      }
      if (s.title && !GENERIC_RE.test(s.title) && (!capsOnly || isCaps(s.title)) && !/^group\s+(one|two|three|four|five|six|\d+)$/i.test(s.title)) {
        const name = titleCase(s.title.replace(/\s+(changes|fixes|additions|improvements)(\s*(&|and)\s*(changes|fixes))?$/i, '').replace(/\s+-\s+Begins\b.*$/i, '').trim());
        if (name && !GENERIC_RE.test(name) && !BUCKET_RE.test(name) && !highlights.includes(name)) highlights.push(name);
      }
    }
    const hl = highlights.slice(0, 4);
    const counts = [fixes && `${fixes} fix${fixes === 1 ? '' : 'es'}`, changes && `${changes} other change${changes === 1 ? '' : 's'}`].filter(Boolean).join(', ');
    const tldr = (hl.length ? `${hl.join('; ')}. ` : '') + (counts ? counts.charAt(0).toUpperCase() + counts.slice(1) + '.' : '');
    return { fixes, changes, highlights: highlights.slice(0, 10), tldr: tldr.trim() };
  }

  // Names of weapons, Warframes, mods and arcanes that appear in the notes (whole words, exact case)
  const STOP = new Set(['Flow', 'Reach', 'Fury', 'Rush', 'Rage', 'Vigor', 'Continuity', 'Stretch', 'Intensify', 'Streamline', 'Vitality', 'Redirection', 'Equilibrium', 'Constitution', 'Energy', 'Health', 'Shield', 'Armor', 'Fixed', 'Excavator']);
  function buildMatcher(data) {
    const kinds = new Map();
    const add = (list, kind, minLen) => (list || []).forEach(x => { const n = x && x.name; if (n && n.length >= minLen && !STOP.has(n) && !kinds.has(n)) kinds.set(n, kind); });
    add(data.frames, 'Warframe', 3); add(data.weapons, 'Weapon', 4); add(data.arcanes, 'Arcane', 4); add(data.mods, 'Mod', 4);
    if (!kinds.size) return null;
    const names = [...kinds.keys()].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return { kinds, re: new RegExp(`(?<![\\w'])(${names.join('|')})(?![\\w])`, 'g') };
  }
  function mentions(parts, matcher) {
    if (!matcher) return [];
    const hits = new Map();
    for (const p of parts) for (const s of p.sections) for (const it of s.items) {
      const t = typeof it === 'string' ? it : it.p || it.t;
      for (const m of t.matchAll(matcher.re)) hits.set(m[1], (hits.get(m[1]) || 0) + 1);
    }
    return [...hits].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, kind: matcher.kinds.get(name), n }));
  }

  // version number from the slug ("44-1-2" -> "44.1.2") and kind from the title
  const versionOf = slug => slug.replace(/-/g, '.');
  const kindOf = title => /hotfix/i.test(title) ? 'hotfix' : 'update';

  // release dates from a WARFRAME Wiki update page's wikitext ({{Update|update number=44.0.3|...|date=September 30, 2026|...}}),
  // for patch notes pages that show no date
  function wikiDates(wikitext) {
    const out = {};
    const w = String(wikitext || '');
    for (const m of w.matchAll(/\{\{Update\s*\|/g)) {
      const head = w.slice(m.index, m.index + 500);
      const num = (/\|\s*update number\s*=\s*([\d.]+)/.exec(head) || [])[1], date = isoDate((/\|\s*date\s*=\s*([^|\n]+)/.exec(head) || [])[1]);
      if (num && date && !out[num]) out[num] = date;
    }
    return out;
  }

  const api = { parseIndex, parsePage, htmlToLines, summarize, buildMatcher, mentions, isoDate, versionOf, kindOf, decode, titleCase, wikiDates };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.WFPatchNotes = api;
})(typeof self !== 'undefined' ? self : this);
