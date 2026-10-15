#!/usr/bin/env node
/*
 * Downloads the background art listed in assets/bg/manifest.json from the official Warframe Fansite Kit
 * (Digital Extremes' public Box share, https://www.warframe.com/community/fankit) and writes web-sized copies:
 *   assets/bg/<id>.webp        up to 1920x1200, for the page background
 *   assets/bg/<id>.thumb.webp  480 px wide, for the picker
 * Then records size and fetch date back into the manifest. Already-fetched items are skipped unless --force.
 * Usage (needs internet access to box.com and the sharp package): npm i sharp && node scripts/fetch-art.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'assets', 'bg');
const MANIFEST = path.join(DIR, 'manifest.json');
const force = process.argv.includes('--force');

async function download(shared, fileId) {
  const url = `https://digitalextremesltd.app.box.com/index.php?rm=box_download_shared_file&shared_name=${shared}&file_id=f_${fileId}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'warframe-calc art sync (https://warframe.hardn.net)' } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    await new Promise(res => setTimeout(res, 3000 * attempt));
  }
  throw new Error(`download failed for file ${fileId}`);
}

async function main() {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const shared = m.source.box.split('/s/')[1];
  let ok = 0, failed = 0;
  for (const it of m.items) {
    const full = path.join(DIR, `${it.id}.webp`), thumb = path.join(DIR, `${it.id}.thumb.webp`);
    if (!force && fs.existsSync(full) && fs.existsSync(thumb) && it.w) { ok++; continue; }
    try {
      const buf = await download(shared, it.boxFileId);
      const img = sharp(buf, { limitInputPixels: false }).rotate();
      const meta = await img.metadata();
      const out = await img.clone().resize({ width: 1920, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toFile(full);
      await img.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 60 }).toFile(thumb);
      Object.assign(it, { w: out.width, h: out.height, srcW: meta.width, srcH: meta.height, bytes: out.size, fetched: new Date().toISOString().slice(0, 10) });
      ok++;
      console.log(`ok   ${it.id} ${meta.width}x${meta.height} -> ${out.width}x${out.height} ${(out.size / 1024).toFixed(0)} KB`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${it.id}: ${e.message}`);
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n');
  console.log(`${ok} ready, ${failed} failed`);
  if (!ok) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
