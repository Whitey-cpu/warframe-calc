/*
 * Downloads the latest @wfcd/items package straight from the npm registry (no npm or tar
 * needed), extracts the JSON files the calculator uses, and builds the slim dataset.
 */
const zlib = require('zlib');
const { buildData } = require('../src/build-data.js');

const REGISTRY = 'https://registry.npmjs.org/@wfcd/items/latest';
const NEEDED = ['Primary.json', 'Secondary.json', 'Melee.json', 'Mods.json', 'Arcanes.json', 'Warframes.json'];

// Minimal tar reader: returns { 'package/data/json/Mods.json': Buffer, ... } for wanted paths.
function untar(buf, want) {
  const files = {};
  let off = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every(b => b === 0)) break;
    const str = (s, e) => header.subarray(s, e).toString('utf8').replace(/\0.*$/s, '');
    let name = str(0, 100);
    const prefix = str(345, 500);
    if (prefix) name = prefix + '/' + name;
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = str(156, 157);
    off += 512;
    if ((type === '0' || type === '') && want(name)) files[name] = Buffer.from(buf.subarray(off, off + size));
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}

async function fetchLatest(fetchFn, current) {
  const metaRes = await fetchFn(REGISTRY);
  if (!metaRes.ok) throw new Error(`npm registry returned ${metaRes.status}`);
  const meta = await metaRes.json();
  if (current && current === meta.version) return { upToDate: true, version: meta.version };
  const tgzRes = await fetchFn(meta.dist.tarball);
  if (!tgzRes.ok) throw new Error(`Download failed: ${tgzRes.status}`);
  const tar = zlib.gunzipSync(Buffer.from(await tgzRes.arrayBuffer()));
  const files = untar(tar, n => NEEDED.some(f => n === 'package/data/json/' + f));
  for (const f of NEEDED) if (!files['package/data/json/' + f]) throw new Error(`Package is missing ${f}`);
  const data = buildData(f => JSON.parse(files['package/data/json/' + f].toString('utf8')), meta.version);
  return { upToDate: false, version: meta.version, data };
}

module.exports = { fetchLatest, untar };
