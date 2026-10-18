/*
 * Beginner / Advanced mode, the Simulacrum timeline (first minute of a fight) and the
 * "How this number is made" step-by-step breakdown on the DPS tab.
 */
window.WFSim = function (UI) {
  const { $, esc, fmt, D, E } = UI;
  const root = document.documentElement;

  // ---------- Beginner / Advanced ----------
  const MODE_KEY = 'wfcalc.mode';
  function storedMode() {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === 'beginner' || m === 'advanced') return m;
      // returning visitors (a saved build) keep the full view they are used to; new visitors start simple
      return localStorage.getItem('wfcalc.last.v1') ? 'advanced' : 'beginner';
    } catch (e) { return 'beginner'; }
  }
  function setMode(m, save) {
    root.dataset.mode = m;
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    if (save) { try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* storage unavailable */ } }
    // a hidden tab cannot stay selected
    const cur = document.querySelector('#statTabs [aria-selected="true"]');
    if (m === 'beginner' && cur && cur.hasAttribute('data-adv') && window.WFSelectTab) window.WFSelectTab('arsenal');
  }
  document.querySelectorAll('.mode-switch [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode, true)));
  setMode(storedMode(), false);
  window.WFSetMode = m => setMode(m, true);

  // ---------- How this number is made ----------
  const W = p => `https://wiki.warframe.com/w/${p}`;
  const link = (p, t) => `<a href="${W(p)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  const x = v => (Math.round(v * 1000) / 1000).toString();
  function mathSteps(b, r) {
    const s = r.stats;
    const steps = [];
    const typeList = Object.entries(r.damageTypes || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
    steps.push([`Base damage per ${s.multishot > 1 ? 'pellet' : 'hit'}`, fmt(s.baseTotal),
      `The attack's listed damage${b.valence ? ' plus the Valence bonus' : ''}. ${link('Damage', 'Damage')}`]);
    const dmgMods = 1 + s.damagePool;
    steps.push(['Damage mods', `x ${x(dmgMods)}${s.directPool ? ` + ${x(s.directPool)} direct` : ''}${s.falloff < 1 ? ` (falloff x ${x(s.falloff)})` : ''}`,
      `Serration-type bonuses add together, then multiply base damage${s.directPool ? '. "Direct Damage" (Galvanized) adds to the same pool' : ''}. ${link('Damage_calculation', 'Damage calculation')}`]);
    steps.push(['Elements and quantization', fmt(s.hitTotal),
      `Elemental mods add their % of the modded base as new damage types, combining by slot order. Each type is rounded to 1/32 of base. Types: ${esc(typeList)}. ${link('Quantization', 'Quantization')}`]);
    const enemyParts = [];
    if (s.armorDamageMultiplier < 1) enemyParts.push(`armor x ${x(s.armorDamageMultiplier)}`);
    if (s.factionMultiplier !== 1) enemyParts.push(`faction mods x ${x(s.factionMultiplier)}`);
    if (s.viralMultiplier > 1) enemyParts.push(`Viral x ${x(s.viralMultiplier)}`);
    steps.push(['Against the enemy', fmt(s.vsNonCrit),
      `${enemyParts.length ? esc(enemyParts.join(', ')) + ', plus' : 'Plus'} each type's faction weakness or resistance. Armor reduces damage by 0.9 x sqrt(armor / 2700). ${link('Armor', 'Armor')}`]);
    steps.push(['Average crit', `x ${x(s.critAvg)}`,
      `${Math.round(s.critChance * 1000) / 10}% crit chance, ${x(s.critMultiplier)}x crit damage. Over 100% chance means some hits are orange or red crits. Headshots are included at your headshot rate. ${link('Critical_Hit', 'Critical Hit')}`]);
    steps.push(['Multishot', `x ${x(s.multishot)}`, `Every pellet deals the hit damage above. ${link('Multishot', 'Multishot')}`]);
    steps.push(['Damage per shot', fmt(r.perShotVsEnemy), 'Direct hits only, before status damage over time.']);
    if (r.dotPerShot > 0) steps.push(['Status damage per shot', `+ ${fmt(r.dotPerShot)}`, `Slash, Heat, Toxin, Gas and Electricity ticks, from ${x(r.procsPerShot)} expected procs per shot. ${link('Status_Effect', 'Status Effect')}`]);
    steps.push(['Burst DPS', fmt(r.dps.burstTotal), `x ${x(s.effectiveFireRate)} ${b && D && UI.state.weapon && UI.state.weapon.category === 'Melee' ? 'hits' : 'shots'} per second while firing.`]);
    if (r.dps.sustainFactor < 1) steps.push(['Sustained DPS', fmt(r.dps.sustainedTotal), `x ${x(r.dps.sustainFactor)}: time spent firing out of firing plus reloading (magazine ${s.magazine}, reload ${x(s.reload)}s). ${link('Reload', 'Reload')}`]);
    else steps.push(['Sustained DPS', fmt(r.dps.sustainedTotal), 'No reload in the way, so it equals burst DPS.']);
    $('mathSteps').innerHTML = `<ol class="math-steps">${steps.map(([k, v, why]) => `<li><div class="ms-head"><span>${esc(k)}</span><b>${esc(v)}</b></div><div class="muted small">${why}</div></li>`).join('')}</ol>
      <p class="muted small">Want the full picture? Read the ${'<a href="learn.html">Learn page</a>'}.</p>`;
  }

  // ---------- Simulacrum timeline ----------
  let tlTimer = null, lastBuild = null;
  const simActive = () => { const p = $('pane-sim'); return p && p.classList.contains('active') && p.offsetParent !== null; };
  function scheduleTimeline(b) {
    lastBuild = b;
    clearTimeout(tlTimer);
    if (!simActive()) return;
    tlTimer = setTimeout(() => renderTimeline(lastBuild), 120);
  }
  function renderTimeline(b) {
    const box = $('simTimeline');
    if (!b) { box.innerHTML = '<p class="muted small">Choose a weapon first.</p>'; return; }
    let t;
    try { t = E.timeline(b, D, { seconds: 60, step: 2 }); } catch (e) { box.innerHTML = `<p class="warn-t small">${esc(e.message)}</p>`; return; }
    const pts = t.points;
    const Wd = 480, H = 210, pl = 44, pr = 12, pt = 12, pb = 28;
    const maxY = Math.max(t.steady, ...pts.map(p => p.dps)) * 1.08 || 1;
    const X = s => pl + s / 60 * (Wd - pl - pr), Y = v => pt + (1 - v / maxY) * (H - pt - pb);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => maxY * f);
    const short = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : String(Math.round(v));
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.dps).toFixed(1)}`).join('');
    const reach = pts.find(p => p.dps >= t.steady * 0.95);
    box.innerHTML = `
      <p class="muted small">Sustained DPS after the fight starts with no stacks and no statuses on the target. The dashed line is the long-run number the rest of the site uses.${reach ? ` This build reaches 95% of it after about ${reach.t}s.` : ''}</p>
      <div class="tl-wrap">
        <svg class="tl-svg" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Sustained DPS over the first 60 seconds">
          ${ticks.map(v => `<line x1="${pl}" x2="${Wd - pr}" y1="${Y(v)}" y2="${Y(v)}" class="tl-grid"/><text x="${pl - 6}" y="${Y(v) + 4}" class="tl-ax" text-anchor="end">${short(v)}</text>`).join('')}
          ${[0, 10, 20, 30, 40, 50, 60].map(s => `<text x="${X(s)}" y="${H - 8}" class="tl-ax" text-anchor="middle">${s}s</text>`).join('')}
          <line x1="${pl}" x2="${Wd - pr}" y1="${Y(t.steady)}" y2="${Y(t.steady)}" class="tl-ref"/>
          <path d="${path}" class="tl-line"/>
          <line class="tl-cross" y1="${pt}" y2="${H - pb}" x1="-10" x2="-10"/>
          <circle class="tl-dot" r="4" cx="-10" cy="-10"/>
          <rect class="tl-hit" x="${pl}" y="${pt}" width="${Wd - pl - pr}" height="${H - pt - pb}"/>
        </svg>
        <div class="tl-tip" hidden></div>
      </div>
      <details class="small"><summary>Table view</summary>
        <table class="tl-table"><thead><tr><th>Time</th><th>Sustained DPS</th><th>Stacks</th></tr></thead><tbody>
        ${pts.filter(p => p.t % 10 === 0).map(p => `<tr><td>${p.t}s</td><td>${fmt(p.dps)}</td><td>${esc(Object.entries(p.stacks).map(([k, v]) => `${k} ${Math.round(v * 10) / 10}`).join(', ') || '-')}</td></tr>`).join('')}
        </tbody></table></details>
      <p class="muted small">ASSUMPTION: stacks from kills, procs and weak point hits build up in a straight line at their rate until they reach their long-run level; your own statuses build up the same way the steady state uses.</p>`;
    const svg = box.querySelector('svg'), tip = box.querySelector('.tl-tip'), cross = box.querySelector('.tl-cross'), dot = box.querySelector('.tl-dot');
    const move = ev => {
      const rc = svg.getBoundingClientRect();
      const sx = (ev.clientX - rc.left) / rc.width * Wd;
      const s = Math.max(0, Math.min(60, (sx - pl) / (Wd - pl - pr) * 60));
      const p = pts.reduce((a, c) => Math.abs(c.t - s) < Math.abs(a.t - s) ? c : a);
      cross.setAttribute('x1', X(p.t)); cross.setAttribute('x2', X(p.t));
      dot.setAttribute('cx', X(p.t)); dot.setAttribute('cy', Y(p.dps));
      const st = Object.entries(p.stacks).map(([k, v]) => `${esc(k)}: ${Math.round(v * 10) / 10}`).join('<br>');
      tip.innerHTML = `<b>${p.t}s</b><br>${fmt(p.dps)} DPS${st ? '<br>' + st : ''}`;
      tip.hidden = false;
      const left = X(p.t) / Wd * rc.width;
      tip.style.left = Math.min(rc.width - 150, Math.max(0, left + 10)) + 'px';
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); dot.setAttribute('cx', -10); });
  }
  $('statTabs').addEventListener('click', e => { const t = e.target.closest('[data-tab="sim"]'); if (t) setTimeout(() => scheduleTimeline(UI.collect()), 0); });

  UI.hooks.push((b, r) => {
    try { mathSteps(b, r); } catch (e) { $('mathSteps').innerHTML = ''; }
    scheduleTimeline(b);
  });
};
