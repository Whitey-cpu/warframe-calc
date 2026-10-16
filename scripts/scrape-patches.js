#!/usr/bin/env node
/*
 * Game updates feed: reads DE's official patch notes (https://www.warframe.com/en/patch-notes, public pages only)
 * and writes data/game-updates.json plus data/game-updates.js (window.WF_GAME_UPDATES, for file:// pages).
 * Keeps the newest KEEP releases. Older entries are reused from the previous file; the newest REFRESH are always
 * re-read because DE adds follow-up hotfixes (e.g. 44.1.2.1) to an existing page.
 * Writes nothing when the releases did not change, so the scheduled job only commits real news.
 */
const fs = require('fs');
const path = require('path');
const P = require('./patch-notes');

const ROOT = path.join(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'data', 'game-updates.json');
const OUT_JS = path.join(ROOT, 'data', 'game-updates.js');
const INDEX = 'https://www.warframe.com/en/patch-notes';
const UA = 'warframe-calc patch notes sync (https://warframe.hardn.net; public pages only)';
const KEEP = 15, REFRESH = 3, PARSER = 2;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (r.ok) return await r.text();
      if (r.status === 404) throw new Error('404 ' + url);
    } catch (e) { if (attempt === 3 || /^404/.test(e.message)) throw e; }
    await sleep(2000 * attempt);
  }
  throw new Error('failed ' + url);
}

// some patch notes pages show no date; the WARFRAME Wiki update page lists every release date (one request per major update)
const wikiCache = {};
async function wikiDate(version) {
  const major = version.split('.')[0];
  if (!(major in wikiCache)) {
    wikiCache[major] = {};
    try {
      const url = `https://wiki.warframe.com/api.php?action=parse&page=Update_${major}&redirects=1&prop=wikitext&format=json&formatversion=2`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) wikiCache[major] = P.wikiDates(((await r.json()).parse || {}).wikitext);
    } catch (e) { console.warn(`wiki dates for Update ${major}: ${e.message}`); }
  }
  return wikiCache[major][version] || wikiCache[major][version.replace(/\.0$/, '')] || wikiCache[major][version.replace(/(\.0)+$/, '')] || null;
}

async function main() {
  const prev = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : { releases: [] };
  const prevBy = new Map((prev.releases || []).map(r => [r.slug, r]));
  const reuseOk = prev.parser === PARSER;
  let data = {};
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'game-data.json'), 'utf8')); } catch (e) { console.warn('game-data.json not found; mentions skipped'); }
  const matcher = P.buildMatcher(data);

  const index = P.parseIndex(await get(INDEX));
  if (index.length < 3) throw new Error(`only ${index.length} releases found on the index page; layout changed?`);

  const releases = [];
  for (const [i, it] of index.slice(0, KEEP).entries()) {
    const old = prevBy.get(it.slug);
    if (old && reuseOk && i >= REFRESH) { releases.push(old); continue; }
    try {
      const page = P.parsePage(await get(it.url), it.title);
      let dateSource = 'patch notes';
      if (!page.date) { page.date = await wikiDate(P.versionOf(it.slug)); dateSource = 'WARFRAME Wiki'; }
      const sum = P.summarize(page.parts);
      releases.push({
        slug: it.slug, version: P.versionOf(it.slug), kind: P.kindOf(it.title), title: it.title, url: it.url, forum: page.forum, date: page.date, dateSource: page.date ? dateSource : null,
        tldr: sum.tldr, fixes: sum.fixes, changes: sum.changes, highlights: sum.highlights,
        mentions: P.mentions(page.parts, matcher).slice(0, 15), parts: page.parts
      });
      console.log(`ok   ${it.slug} ${page.date} ${sum.fixes} fixes, ${sum.changes} changes`);
    } catch (e) {
      console.error(`FAIL ${it.slug}: ${e.message}`);
      if (old) releases.push(old);
    }
    await sleep(800);
  }
  if (!releases.length) throw new Error('no releases parsed');

  if (reuseOk && JSON.stringify(releases) === JSON.stringify(prev.releases)) { console.log('No new game updates.'); return; }
  const out = {
    source: INDEX,
    note: 'Parsed from the official Warframe patch notes. TL;DR = DE section headings plus item counts; mentions = names from the calculator data found in the notes.',
    parser: PARSER, checkedAt: new Date().toISOString(), releases
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1) + '\n');
  fs.writeFileSync(OUT_JS, 'window.WF_GAME_UPDATES = ' + JSON.stringify(out) + ';\n');
  console.log(`Wrote ${releases.length} releases, newest ${releases[0].title} (${releases[0].date}).`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
