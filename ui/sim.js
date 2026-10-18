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

  // ---------- melee: heavy attack rotation ----------
  function renderRotation(b) {
    const box = $('rotationBox');
    const rot = window.WFLastRotation;
    if (!rot || !UI.state.weapon || UI.state.weapon.category !== 'Melee') { box.hidden = true; box.innerHTML = ''; return; }
    const B = rot.best, sp = rot.heavySpam;
    const what = B.normals === 0 ? 'heavy attacks back to back' : `${B.normals} normal combo${B.normals > 1 ? 's' : ''}, then a heavy attack`;
    box.hidden = false;
    box.innerHTML = `<h3 data-tip="rotation">Best melee loop</h3>
      <p class="small">${esc(what)} at <b>${B.combo}x</b> combo: <b>${fmt(B.dps)}</b> DPS over a ${Math.round(B.cycle * 100) / 100}s loop.</p>
      <div class="statline small"><span>Heavy spam <b>${fmt(sp.dps)}</b> (${sp.combo}x)</span><span>Normal swings only <b>${fmt(rot.normalsOnly)}</b></span>
        <span>Combo per ${rot.stance ? 'stance combo' : 'hit'} <b>${Math.round(rot.pointsPerCombo * 10) / 10}</b></span><span>Heavy Attack Efficiency <b>${Math.round(rot.efficiency * 100)}%</b></span>
        ${rot.initialCombo ? `<span>Initial Combo <b>${Math.round(rot.initialCombo)}</b></span>` : ''}<span>Combo timer <b>${Math.round(rot.comboDuration * 10) / 10}s</b></span></div>
      <p class="muted small">${rot.stance ? '' : 'Pick a stance for exact combo timing; without one each swing counts as one hit. '}A heavy attack spends the combo except what Heavy Attack Efficiency keeps; Initial Combo refills at 40 points per second. ${link('Melee_Combo', 'Melee Combo')}</p>`;
    if (window.WFTipsDecorate) window.WFTipsDecorate(box);
  }

  // ---------- shot by shot ----------
  let lastResult = null;
  function runSim() {
    const out = $('simOut');
    if (!lastResult || !WF.sim) { out.innerHTML = '<p class="muted small">Choose a weapon first.</p>'; return; }
    const seconds = +$('simSeconds').value, runs = +$('simRuns').value;
    out.innerHTML = '<p class="muted small">Rolling...</p>';
    setTimeout(() => {
      const r = lastResult;
      const res = WF.sim.simulate(r, { seconds, runs, seed: (Date.now() & 0xffffff), melee: UI.state.weapon && UI.state.weapon.category === 'Melee' });
      // histogram (one series, accent colour, hover per bar)
      const bins = 24, lo = res.min, hi = res.max === res.min ? res.min + 1 : res.max;
      const counts = new Array(bins).fill(0);
      res.all.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins))]++; });
      const Wd = 480, H = 120, pad = 4, bw = (Wd - pad * 2) / bins, maxC = Math.max(...counts) || 1;
      const bars = counts.map((c, i) => { const h = c / maxC * (H - 24); const x0 = lo + (hi - lo) * i / bins, x1 = lo + (hi - lo) * (i + 1) / bins;
        return `<rect class="hist-bar" x="${(pad + i * bw + 1).toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2"><title>${fmt(x0)} to ${fmt(x1)}: ${c} run${c === 1 ? '' : 's'}</title></rect>`; }).join('');
      const formula = r.dps.sustainedTotal;
      const fx = formula >= lo && formula <= hi ? pad + (formula - lo) / (hi - lo) * (Wd - pad * 2) : null;
      const rows = res.log.map(e => e.kind === 'reload'
        ? `<tr class="muted"><td>${e.t.toFixed(2)}s</td><td colspan="4">Reload (${Math.round(e.dur * 100) / 100}s)</td></tr>`
        : `<tr><td>${e.t.toFixed(2)}s</td><td>${e.pellets}</td><td>${[e.crits[0] ? e.crits[0] + ' no crit' : '', e.crits[1] ? e.crits[1] + ' yellow' : '', e.crits[2] ? e.crits[2] + ' orange' : '', e.crits[3] ? e.crits[3] + ' red' : ''].filter(Boolean).join(', ')}${e.heads ? `, ${e.heads} head` : ''}</td>
            <td>${esc(Object.entries(e.procs).map(([k, v]) => v > 1 ? `${k} x${v}` : k).join(', ') || '-')}</td><td>${fmt(e.dmg)}</td></tr>`).join('');
      out.innerHTML = `
        <div class="sim-stats">
          ${[['Worst', res.min], ['Unlucky (10%)', res.p10], ['Median', res.median], ['Lucky (90%)', res.p90], ['Best', res.max]].map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${fmt(v)}</div></div>`).join('')}
        </div>
        <svg class="hist" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="DPS spread over ${runs} simulated fights">
          ${bars}${fx != null ? `<line x1="${fx}" x2="${fx}" y1="4" y2="${H - 18}" class="tl-ref"/>` : ''}
          <text x="${pad}" y="${H - 4}" class="tl-ax">${fmt(lo)}</text><text x="${Wd - pad}" y="${H - 4}" class="tl-ax" text-anchor="end">${fmt(hi)}</text>
        </svg>
        <p class="muted small">${runs} fights of ${seconds}s. Dashed line: the calculator's long-run number (${fmt(formula)}). Short fights start with a full magazine and cut off status ticks that land after the window, so they can read a little above or below it.</p>
        <details class="small"><summary>Combat log (first fight, first ${res.log.length} events)</summary>
          <div class="log-wrap"><table class="tl-table log-table"><thead><tr><th>Time</th><th>Pellets</th><th>Crits</th><th>Status</th><th>Hit damage</th></tr></thead><tbody>${rows}</tbody></table></div>
          <p class="muted small">Hit damage is direct damage only; status ticks land over the next seconds and are counted in the totals.</p></details>
        <p class="muted small">ASSUMPTION: enemy statuses and buff stacks stay at their long-run average, so this shows luck, not ramp-up (see the Simulacrum's first minute).</p>`;
    }, 20);
  }
  $('simRun').addEventListener('click', runSim);

  UI.hooks.push((b, r) => {
    lastResult = r;
    try { mathSteps(b, r); } catch (e) { $('mathSteps').innerHTML = ''; }
    try { renderRotation(b); } catch (e) { $('rotationBox').hidden = true; }
    if ($('simOut').innerHTML && $('simBox').open) $('simOut').innerHTML = '<p class="muted small">Build changed. Press Run for a new roll.</p>';
    scheduleTimeline(b);
  });
};
