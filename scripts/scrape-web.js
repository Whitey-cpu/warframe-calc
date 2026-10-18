#!/usr/bin/env node
/*
 * Pulls public game data that @wfcd/items does not carry, from public web pages only
 * (never from a game client or player account):
 *   - Incarnon evolutions for every Incarnon Genesis and base Incarnon weapon
 *     Source: WARFRAME Wiki (https://wiki.warframe.com) through its public MediaWiki API.
 *   - The latest PC build label (update / hotfix number and date)
 *     Source: https://www.warframe.com/en/patch-notes
 * Writes data/web-data.json. Each record keeps its source page and the page's last edit time,
 * so the app can show where every number came from and how old it is.
 *
 * Usage: node scripts/scrape-web.js     (Node 18+, needs internet access to the two sites above)
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'web-data.json');
const WIKI = 'https://wiki.warframe.com';
const UA = 'warframe-calc data sync (https://warframe.hardn.net; public pages only)';
// Base (non-Genesis) Incarnon weapons keep their evolutions on the weapon page itself.
const BASE_INCARNON = ['Felarx', 'Innodem', 'Laetum', 'Onos', 'Phenmor', 'Praedos', 'Ruvox', 'Thalys'];

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (r.ok) return r.json();
    await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
  }
  throw new Error(`GET ${url} failed`);
}

// ---------- wikitext helpers ----------
function clean(s) {
  return s.replace(/\[\[File:[^\]]*\]\]/g, '')
    .replace(/\{\{(?:D|M|A|Arcane|Weapon|W|Proc|Tooltip|Resource|Faction|Polarity|Mod)\|([^}|]+)(?:\|([^}|]*))?[^}]*\}\}/g,
      (m, a, b) => (b && !/^\d+$/.test(b) && b.length < 30 ? b : a))
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''|''/g, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const lines = s => s.split('\n').map(l => l.trim()).filter(l => l && l !== '-')
  .map(l => clean(l.replace(/^\*+\s*/, ''))).filter(Boolean);

/**
 * Parses an Incarnon evolution table. Columns: EVO tier | perk name | description | one value
 * column per weapon variant (fills in X/Y placeholders) | notes.
 */
function parseEvolutionTable(text, fallbackName) {
  const start = text.search(/!\s*(?:rowspan="?\d+"?\s*\|\s*)?EVO1/);
  if (start < 0) return null;
  const pre = text.slice(Math.max(0, text.lastIndexOf('{|', start)), start);
  const variants = [...pre.matchAll(/\{\{Weapon\|([^}|]+)/g)].map(m => m[1].trim());
  if (!variants.length) variants.push(fallbackName);
  const body = text.slice(start);
  const end = body.indexOf('\n|}');
  const table = end > 0 ? body.slice(0, end) : body;
  const rows = ('|-\n' + table).split(/\n?\|-\s*\n/).filter(Boolean);
  let tier = null;
  const tiers = {};
  for (const row of rows) {
    if (/Evolution (?:[IV]+ )?Challenge/.test(row)) {
      const m = row.match(/Challenge\s*!!\s*(?:colspan="\d+"\s*\|)?\s*(.*)/) || row.match(/Challenge[^\n]*\n!\s*(.*)/);
      if (m && tier) (tiers[tier] = tiers[tier] || { perks: [] }).challengeAfter = clean(m[1]);
      continue;
    }
    const tm = row.match(/^!\s*(?:rowspan="?\d+"?\s*\|\s*)?(EVO\d)/m);
    if (tm) tier = tm[1];
    if (!tier) continue;
    const rest = row.replace(/^!.*\n/m, '');
    const cells = rest.split(/(?:^|\n)\|(?!-)\s*(?:(?:style|colspan|rowspan)="[^"]*"\s*)*(?:\|)?/)
      .map(c => c.trim()).filter((c, i) => i > 0 || c);
    if (!cells.length) continue;
    const name = clean(cells[0].split('\n')[0]);
    if (!name || name.length > 60) continue;
    const vals = cells.slice(2, -1).map(c => clean(c.replace(/\n/g, ' ')));
    const v = {};
    variants.forEach((vn, i) => { if (vals[i] && vals[i] !== '-') v[vn] = vals[i]; });
    (tiers[tier] = tiers[tier] || { perks: [] }).perks.push({
      name,
      text: lines(cells[1] || ''),
      values: v,
      notes: cells.length > 3 ? lines(cells[cells.length - 1]).join(' | ').slice(0, 600) : ''
    });
  }
  return { variants, tiers };
}

async function pages(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const r = await getJson(`${WIKI}/api.php?action=query&prop=revisions&rvprop=content|timestamp&rvslots=main&format=json&formatversion=2&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`);
    for (const p of r.query.pages) out.push(p);
  }
  return out;
}

async function scrapeIncarnon() {
  const s = await getJson(`${WIKI}/api.php?action=query&list=search&srsearch=${encodeURIComponent('intitle:"Incarnon Genesis"')}&srlimit=200&format=json`);
  const genesis = s.query.search.map(x => x.title).filter(t => / Incarnon Genesis$/.test(t)).sort();
  const result = [];
  const failed = [];
  for (const p of await pages(genesis.concat(BASE_INCARNON))) {
    const rev = p.revisions && p.revisions[0];
    const weapon = p.title.replace(/ Incarnon Genesis$/, '');
    const parsed = rev && parseEvolutionTable(rev.slots.main.content, weapon);
    if (!parsed || !Object.keys(parsed.tiers).length) { failed.push(p.title); continue; }
    result.push({
      weapon, genesis: / Incarnon Genesis$/.test(p.title), variants: parsed.variants,
      source: `${WIKI}/w/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, lastEdited: rev.timestamp,
      tiers: parsed.tiers
    });
  }
  return { weapons: result.sort((a, b) => a.weapon.localeCompare(b.weapon)), failed };
}

// Melee classes and stance combos from the wiki's Lua data modules (Module:Weapons/data/melee, Module:Stances/data).
const STANCE_COMBOS = ['Neutral', 'Forward', 'Block', 'Forward Block', 'Slide'];
function parseMeleeModules(stanceSrc, meleeSrc) {
  const L = require('./lua-table.js');
  const W = L.readTableAfter(meleeSrc, 'return');
  const classes = {};
  for (const [name, w] of Object.entries(W)) if (w && w.Class && w.Class !== 'Exalted Weapon') classes[name] = w.Class;
  const T = L.readTableAfter(stanceSrc, 'local StanceData =');
  const slimCombo = c => c && c.Attacks ? {
    name: c.Name || null, duration: typeof c.Duration === 'number' ? c.Duration : null,
    attacks: c.Attacks.map(a => {
      const o = { dmg: a.Dmg || [], hits: a.Hits || (a.Dmg || []).map(() => 1) };
      if (a.Procs) o.procs = a.Procs.map(x => Array.isArray(x) ? x : (x ? [x] : []));
      for (const k of ['Impact', 'Puncture', 'Slash', 'Status']) if (a[k + 'Multiplier']) o[k.toLowerCase() + 'Mult'] = a[k + 'Multiplier'];
      return o;
    })
  } : null;
  const stances = {}, shared = {};
  for (const [name, st] of Object.entries(T)) {
    if (!st || name === '__Legend' || !st.WeaponType) continue;
    const combos = {};
    for (const k of STANCE_COMBOS.concat(['Heavy'])) { const c = slimCombo(st[k]); if (c) combos[k] = c; }
    if (name === st.WeaponType) { shared[name] = combos; continue; } // weapon-type entry: shared slide / heavy combos
    if (st.ConclaveOnly) continue;
    stances[name] = { type: st.WeaponType, unique: !!st.UniqueToWeapon, combos };
  }
  return { classes, stances, shared };
}
async function scrapeMelee() {
  const ps = await pages(['Module:Stances/data', 'Module:Weapons/data/melee']);
  const get = t => ps.find(p => p.title === t);
  const st = get('Module:Stances/data'), me = get('Module:Weapons/data/melee');
  const parsed = parseMeleeModules(st.revisions[0].slots.main.content, me.revisions[0].slots.main.content);
  return Object.assign(parsed, {
    sources: [{ page: `${WIKI}/w/Module:Stances/data`, lastEdited: st.revisions[0].timestamp }, { page: `${WIKI}/w/Module:Weapons/data/melee`, lastEdited: me.revisions[0].timestamp }]
  });
}

async function scrapeBuild() {
  try {
    const r = await fetch('https://www.warframe.com/en/patch-notes', { headers: { 'User-Agent': UA } });
    const html = await r.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const hot = text.match(/Hotfix (\d+\.\d+(?:\.\d+)?)/);
    const upd = text.match(/Update (\d+(?:\.\d+)*):?\s*([^|]{0,60}?)\s+(\w{3} \d{1,2}, \d{4})/);
    return {
      latestHotfix: hot ? hot[1] : null,
      latestUpdate: upd ? { number: upd[1], name: upd[2].trim(), date: upd[3] } : null,
      source: 'https://www.warframe.com/en/patch-notes', checkedAt: new Date().toISOString()
    };
  } catch (e) {
    return { error: String(e), source: 'https://www.warframe.com/en/patch-notes', checkedAt: new Date().toISOString() };
  }
}

async function main() {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const incarnon = await scrapeIncarnon();
  if (incarnon.weapons.length < 40 && prev) {
    console.error(`Only ${incarnon.weapons.length} Incarnon weapons parsed; keeping the previous file.`);
    process.exit(1);
  }
  const build = await scrapeBuild();
  let melee = prev && prev.melee;
  try {
    const m = await scrapeMelee();
    if (Object.keys(m.stances).length >= 50 && Object.keys(m.classes).length >= 150) melee = m;
    else console.error(`Only ${Object.keys(m.stances).length} stances / ${Object.keys(m.classes).length} melee classes parsed; keeping the previous melee data.`);
  } catch (e) { console.error('Melee modules failed, keeping the previous melee data:', e.message); }
  const out = { scrapedAt: new Date().toISOString(), build, incarnon, melee };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`Incarnon weapons: ${incarnon.weapons.length}, failed: ${incarnon.failed.join(', ') || 'none'}`);
  console.log('Build:', JSON.stringify(build));
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { parseEvolutionTable, clean, parseMeleeModules };
