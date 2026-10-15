#!/usr/bin/env node
/*
 * Downloads the latest @wfcd/items package and builds a slim local dataset:
 *   data/game-data.json  (used by the CLI / Claude)
 *   data/game-data.js    (loaded by index.html, works when opened from disk)
 *
 * Usage:  node scripts/sync-data.js            (download latest from npm)
 *         node scripts/sync-data.js <dir>      (use an already-extracted package dir)
 * Requires Node 18+ and npm on PATH. Source: https://www.npmjs.com/package/@wfcd/items
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { buildData, diffData } = require('../src/build-data.js');
const WF = global.WF;

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data');

function getPackageDir() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfcd-'));
  console.log('Downloading @wfcd/items from npm...');
  const out = execSync('npm pack @wfcd/items --silent', { cwd: tmp, encoding: 'utf8', shell: true }).trim().split(/\r?\n/).pop();
  execSync(`tar -xzf "${out}"`, { cwd: tmp, shell: true });
  return path.join(tmp, 'package');
}

function build(dir) {
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  return buildData(file => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'json', file), 'utf8')), version);
}

function main() {
  const dir = getPackageDir();
  const data = build(dir);
  fs.mkdirSync(OUT, { recursive: true });
  // Record what changed since the previous data build (shown as a banner on the site)
  const prevPath = path.join(OUT, 'game-data.json');
  if (fs.existsSync(prevPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
      if (prev.meta && prev.meta.version !== data.meta.version) {
        const changes = diffData(prev, data);
        data.meta.changes = changes;
        data.meta.previousVersion = prev.meta.version;
      } else if (prev.meta && prev.meta.changes) {
        data.meta.changes = prev.meta.changes;
        data.meta.previousVersion = prev.meta.previousVersion;
      }
    } catch (e) { console.warn('Could not diff previous data:', e.message); }
  }
  const json = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT, 'game-data.json'), json);
  fs.writeFileSync(path.join(OUT, 'game-data.js'), 'window.WF_DATA = ' + json + ';\n');
  const unparsedMods = data.mods.filter(m => m.unparsed.length).length;
  console.log(`@wfcd/items ${data.meta.version}: ${data.weapons.length} weapons, ${data.mods.length} mods (${unparsedMods} with some unparsed text), ${data.arcanes.length} arcanes, ${data.frames.length} frames`);
  console.log('Wrote data/game-data.json and data/game-data.js');
}

if (require.main === module) main();
module.exports = { build };
