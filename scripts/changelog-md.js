#!/usr/bin/env node
// Writes CHANGELOG.md from data/changelog.js (the same list the site shows). Run after adding an entry.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'data', 'changelog.js'));
const log = global.window.WF_CHANGELOG;
const out = ['# Change log', '', 'Newest first. The site shows the same list under "What\'s new". Game data refreshes are automatic and listed by the data banner.', ''];
out.push('## TL;DR', '');
log.slice(0, 3).forEach(e => out.push(`- **v${e.version}**: ${e.tldr}`));
out.push('');
for (const e of log) {
  out.push(`## v${e.version} (${e.date})`, '', `**TL;DR:** ${e.tldr}`, '');
  for (const s of e.sections) { out.push(`### ${s.title}`, ''); s.items.forEach(it => out.push(`- ${it}`)); out.push(''); }
}
fs.writeFileSync(path.join(ROOT, 'CHANGELOG.md'), out.join('\n'));
console.log(`CHANGELOG.md written (${log.length} releases)`);
