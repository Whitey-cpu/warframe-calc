/*
 * "What's new" dialog with three tabs: Game updates and Events (ui/news.js) and This site, the change log
 * (data/changelog.js) with a one-line summary (TL;DR) per update, plus a banner the first time someone visits
 * after a new version. Nothing here needs the calculator state.
 */
(function () {
  const $ = id => document.getElementById(id);
  const LOG = window.WF_CHANGELOG || [];
  if (!LOG.length) return;
  const KEY = 'wfcalc.seenVersion';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const newer = (a, b) => { const x = a.split('.').map(Number), y = (b || '0').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  const latest = LOG[0];
  let seen = null;
  try {
    seen = localStorage.getItem(KEY);
    // visited before the change log existed (other saved settings, no seen version): announce the latest release once
    if (!seen && LOG[1] && Object.keys(localStorage).some(k => k.startsWith('wfcalc.') && k !== KEY)) seen = LOG[1].version;
  } catch (e) { seen = latest.version; }
  const markSeen = () => { try { localStorage.setItem(KEY, latest.version); } catch (e) { /* ignore */ } $('whatsNew').classList.remove('has-new'); };
  const fmtDate = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return d; } };

  function render() {
    const unseen = v => seen && newer(v, seen);
    $('changelogBody').innerHTML = `<div class="cl-tldr-all"><h3>TL;DR</h3><ul>${LOG.slice(0, 3).map(e => `<li><b>v${esc(e.version)}</b> ${esc(e.tldr)}</li>`).join('')}</ul></div>` +
      LOG.map((e, i) => `<details class="cl-entry" ${i === 0 ? 'open' : ''}>
        <summary><span class="cl-ver">v${esc(e.version)}</span><span class="cl-date">${esc(fmtDate(e.date))}</span>${unseen(e.version) ? '<span class="cl-new">New</span>' : ''}<span class="cl-sum">${esc(e.tldr)}</span></summary>
        ${e.sections.map(s => `<h4>${esc(s.title)}</h4><ul>${s.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul>`).join('')}
      </details>`).join('');
  }
  // tabs: Game updates (DE patch notes), Events (live world state), This site (this change log)
  const EXT = {
    game: ['Official patch notes', 'https://www.warframe.com/en/patch-notes'],
    events: ['DE news', 'https://www.warframe.com/news'],
    site: ['Full log on GitHub', 'https://github.com/Whitey-cpu/warframe-calc/blob/main/CHANGELOG.md']
  };
  const PANES = { game: 'clpane-game', events: 'clpane-events', site: 'changelogBody' };
  const rendered = {};
  function showTab(name) {
    for (const [k, id] of Object.entries(PANES)) {
      const on = k === name;
      $(id).hidden = !on;
      const t = $('cltab-' + k);
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
    }
    $('clExt').textContent = EXT[name][0]; $('clExt').href = EXT[name][1];
    const W = window.WFNews;
    if (name === 'site') { render(); markSeen(); $('updateBanner').hidden = true; }
    else if (W && name === 'game' && !rendered.game) { rendered.game = true; W.renderGame($(PANES.game)); }
    else if (W && name === 'events') W.renderEvents($(PANES.events), false);
    try { localStorage.setItem('wfcalc.clTab', name); } catch (e) { /* ignore */ }
  }
  $('clTabs').addEventListener('click', e => { const t = e.target.closest('[data-cl]'); if (t) showTab(t.dataset.cl); });
  $('clTabs').addEventListener('keydown', e => {
    const tabs = [...$('clTabs').querySelectorAll('[role=tab]')], i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); tabs[j].focus(); showTab(tabs[j].dataset.cl);
  });
  const open = tab => { $('changelogDialog').showModal(); showTab(tab); };
  $('whatsNew').addEventListener('click', () => {
    let last = null;
    try { last = localStorage.getItem('wfcalc.clTab'); } catch (e) { /* ignore */ }
    // an unseen site update opens "This site"; otherwise the tab used last time, starting with Game updates
    open($('whatsNew').classList.contains('has-new') ? 'site' : PANES[last] ? last : 'game');
  });
  $('changelogDialog').addEventListener('click', e => { if (e.target === $('changelogDialog')) $('changelogDialog').close(); });

  if (!seen) { markSeen(); return; }            // first visit ever: nothing to announce
  if (newer(latest.version, seen)) {
    $('whatsNew').classList.add('has-new');
    const b = $('updateBanner');
    b.innerHTML = `<b>Updated to v${esc(latest.version)}.</b> <span class="cl-banner-tldr">TL;DR: ${esc(latest.tldr)}</span>
      <button type="button" class="btn sm" id="ubOpen">See what changed</button> <button type="button" class="btn ghost sm" id="ubClose">Dismiss</button>`;
    b.hidden = false;
    $('ubOpen').onclick = () => open('site');
    $('ubClose').onclick = () => { b.hidden = true; markSeen(); };
  }
})();
