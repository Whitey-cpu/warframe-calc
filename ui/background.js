/*
 * Page backgrounds from the official Warframe Fansite Kit (Digital Extremes), used under the Warframe Content Policy.
 * The list lives in assets/bg/manifest.js (written by scripts/fetch-art.js); the choice is kept in this browser only.
 */
(function () {
  const $ = id => document.getElementById(id);
  const KEY = 'wfcalc.bg.v1';
  const root = document.documentElement;
  const DEFAULTS = { id: null, dim: 60, blur: 0, shuffle: false };
  let cfg = DEFAULTS;
  try { cfg = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { cfg = Object.assign({}, DEFAULTS); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage unavailable */ } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // manifest is loaded on demand as a script so it also works from file:// (desktop app)
  let manifestPromise = null;
  function loadManifest() {
    if (window.WF_BG) return Promise.resolve(window.WF_BG);
    if (!manifestPromise) {
      manifestPromise = new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'assets/bg/manifest.js';
        s.onload = () => resolve(window.WF_BG || null);
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
      });
    }
    return manifestPromise;
  }
  const available = m => (m && m.items || []).filter(it => it.fetched);

  function apply() {
    const art = $('bgArt');
    if (!cfg.id) {
      root.removeAttribute('data-bg');
      art.style.backgroundImage = '';
      $('bgCreditLine').hidden = true;
      return;
    }
    root.dataset.bg = 'on';
    art.style.backgroundImage = `url("assets/bg/${encodeURIComponent(cfg.id)}.webp")`;
    root.style.setProperty('--bg-dim', String(cfg.dim / 100));
    root.style.setProperty('--bg-blur', cfg.blur + 'px');
    loadManifest().then(m => {
      const it = m && m.items.find(x => x.id === cfg.id);
      const line = $('bgCreditLine');
      line.hidden = !it;
      if (it) line.innerHTML = `Background: ${esc(it.title)}, from the official <a href="${esc(m.source.url)}" target="_blank" rel="noopener">Warframe Fansite Kit</a> by Digital Extremes.`;
    });
  }

  // ---------------- picker ----------------
  let chip = 'all';
  async function renderPicker() {
    const m = await loadManifest();
    const list = available(m);
    const cats = m ? Object.entries(m.categories).filter(([k]) => list.some(it => it.category === k)) : [];
    $('bgChips').innerHTML = [['all', 'All']].concat(cats).map(([k, l]) => `<button type="button" class="chip" data-bgc="${esc(k)}" aria-pressed="${k === chip}">${esc(l)}</button>`).join('');
    const shown = list.filter(it => chip === 'all' || it.category === chip);
    $('bgGrid').innerHTML = (chip === 'all' ? `<button type="button" class="bg-card${!cfg.id ? ' sel' : ''}" data-bg="" aria-pressed="${!cfg.id}"><span class="bg-none">Default</span><span class="bg-name">No image</span></button>` : '') +
      shown.map(it => `<button type="button" class="bg-card${cfg.id === it.id ? ' sel' : ''}" data-bg="${esc(it.id)}" aria-pressed="${cfg.id === it.id}" title="${esc(it.title)} (${esc(m.categories[it.category] || '')})">
        <img loading="lazy" decoding="async" src="assets/bg/${encodeURIComponent(it.id)}.thumb.webp" alt="" width="240" height="135"><span class="bg-name">${esc(it.title)}</span></button>`).join('') +
      (!list.length ? '<p class="muted small">The background images have not been downloaded yet.</p>' : '');
    $('bgDim').value = cfg.dim; $('bgBlur').value = cfg.blur; $('bgShuffle').checked = !!cfg.shuffle;
  }
  $('bgButton').addEventListener('click', () => { renderPicker(); $('bgDialog').showModal(); });
  $('bgChips').addEventListener('click', e => { const c = e.target.closest('[data-bgc]'); if (c) { chip = c.dataset.bgc; renderPicker(); } });
  $('bgGrid').addEventListener('click', e => {
    const c = e.target.closest('[data-bg]'); if (!c) return;
    cfg.id = c.dataset.bg || null; save(); apply();
    $('bgGrid').querySelectorAll('.bg-card').forEach(x => { const on = x === c; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on); });
  });
  // light-dismiss for browsers without the closedby attribute
  $('bgDialog').addEventListener('click', e => { if (e.target === $('bgDialog')) $('bgDialog').close(); });
  $('bgDim').addEventListener('input', e => { cfg.dim = +e.target.value; save(); apply(); });
  $('bgBlur').addEventListener('input', e => { cfg.blur = +e.target.value; save(); apply(); });
  $('bgShuffle').addEventListener('change', e => { cfg.shuffle = e.target.checked; save(); });

  // ---------------- start ----------------
  if (cfg.shuffle) {
    loadManifest().then(m => {
      const list = available(m).filter(it => it.id !== cfg.id);
      if (list.length) { cfg.id = list[Math.floor(Math.random() * list.length)].id; save(); }
      apply();
    });
  } else apply();
})();
