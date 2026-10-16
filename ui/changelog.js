/*
 * "What's new": change log dialog (data/changelog.js) with a one-line summary (TL;DR) per update,
 * plus a banner the first time someone visits after a new version. Nothing here needs the calculator state.
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
  try { seen = localStorage.getItem(KEY); } catch (e) { seen = latest.version; }
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
  $('whatsNew').addEventListener('click', () => { render(); $('changelogDialog').showModal(); markSeen(); $('updateBanner').hidden = true; });
  $('changelogDialog').addEventListener('click', e => { if (e.target === $('changelogDialog')) $('changelogDialog').close(); });

  if (!seen) { markSeen(); return; }            // first visit ever: nothing to announce
  if (newer(latest.version, seen)) {
    $('whatsNew').classList.add('has-new');
    const b = $('updateBanner');
    b.innerHTML = `<b>Updated to v${esc(latest.version)}.</b> <span class="cl-banner-tldr">TL;DR: ${esc(latest.tldr)}</span>
      <button type="button" class="btn sm" id="ubOpen">See what changed</button> <button type="button" class="btn ghost sm" id="ubClose">Dismiss</button>`;
    b.hidden = false;
    $('ubOpen').onclick = () => $('whatsNew').click();
    $('ubClose').onclick = () => { b.hidden = true; markSeen(); };
  }
})();
