/*
 * Riven crafting suite (Riven tab): chance per cycle and Kuva for a goal, Trait Locking, a Riven Splicing planner
 * and the Kuva cost table. Math lives in src/riven-odds.js; the riven in the editor (ui/riven.js) is the starting point.
 */
window.WFRivenCraft = function (UI) {
  const { $, esc, fmt, state, WF } = UI;
  const R = WF.riven, O = WF.rivenOdds;
  const box = $('rivenCraft');
  if (!box || !O) return;

  // goal and settings survive re-renders; reset when the weapon class changes (the trait pool differs)
  let cfg = null, cfgFor = '';
  const fresh = () => ({ need: [], okMode: 'any', okPos: [], neg: 'any', negList: [], negOptional: true, layouts: O.LAYOUTS.slice(), minRoll: 0, done: 0,
    odds: Object.assign({}, O.DEFAULT_LAYOUT_ODDS), remove: [], add: [], spliceOut: '', start: 'fresh', runs: 300 });
  const weapon = () => state.weapon;
  const type = () => R.typeFor(weapon());
  const lbl = k => esc(R.labelFor(R.statDef(k), type()));
  const pct = p => p >= 0.1 ? (p * 100).toFixed(1) + '%' : p >= 0.001 ? (p * 100).toFixed(2) + '%' : p > 0 ? (p * 100).toPrecision(2) + '%' : '0%';
  const n0 = x => x == null ? '-' : fmt(Math.round(x));
  const pools = () => O.pools(weapon(), { add: cfg.add, remove: cfg.remove, attack: +($('attack') && $('attack').value) || 0 });
  const goal = () => ({ need: cfg.need.slice(), okPos: cfg.okMode === 'list' ? cfg.okPos.slice() : null, neg: cfg.neg, negList: cfg.negList.slice(), negOptional: cfg.negOptional,
    layouts: cfg.layouts.slice(), minRoll: cfg.minRoll });

  function opts(list, sel) { return list.map(k => `<option value="${k}"${sel.includes(k) ? ' selected' : ''}>${lbl(k)}</option>`).join(''); }

  function render() {
    const w = weapon();
    if (!w) { box.innerHTML = ''; return; }
    const key = R.typeFor(w) + '|' + w.name;
    if (!cfg || cfgFor !== key) { cfg = fresh(); cfgFor = key; }
    const pl = pools();
    const spl = R.recipesFor(w);
    const splOuts = [...new Set(spl.map(r => r[0]))];
    const allPos = pl.pos.concat(splOuts);
    const cur = O.fromRiven(state.riven, w);
    const phys = R.STATS.filter(d => d.physical && R.available(d, type()));
    box.innerHTML = `
      <details class="rv-sec rc" id="rcOddsBox" open>
        <summary>Crafting odds: chance per cycle and Kuva</summary>
        <p class="muted small">Set what you are rolling for. The odds use the trait pool for ${esc(w.name)} and the Kuva costs from the wiki.
          <b>Not published by DE:</b> each layout is treated as 1 in 4 and every trait as equally likely, from community testing. You can change the layout odds below.</p>
        <div class="grid2 rc-goal">
          <label>Positives you need <select id="rcNeed" multiple size="6">${opts(allPos, cfg.need)}</select></label>
          <div>
            <label>Other positive slots <select id="rcOkMode"><option value="any"${cfg.okMode === 'any' ? ' selected' : ''}>Anything</option><option value="list"${cfg.okMode === 'list' ? ' selected' : ''}>Only these</option></select></label>
            <select id="rcOkPos" multiple size="4" aria-label="Allowed extra positives"${cfg.okMode === 'list' ? '' : ' hidden'}>${opts(pl.pos, cfg.okPos)}</select>
          </div>
          <div>
            <label>Negative <select id="rcNeg"><option value="any"${cfg.neg === 'any' ? ' selected' : ''}>Any, or none</option><option value="none"${cfg.neg === 'none' ? ' selected' : ''}>No negative</option><option value="list"${cfg.neg === 'list' ? ' selected' : ''}>One of these</option></select></label>
            <div id="rcNegWrap"${cfg.neg === 'list' ? '' : ' hidden'}>
              <select id="rcNegList" multiple size="4" aria-label="Accepted negatives">${opts(pl.neg, cfg.negList)}</select>
              <label class="check small"><input type="checkbox" id="rcNegOpt"${cfg.negOptional ? ' checked' : ''}> or no negative</label>
            </div>
          </div>
          <div>
            <span class="small">Layouts you accept</span>
            <div class="rc-lay">${O.LAYOUTS.map(k => `<label class="check small"><input type="checkbox" data-lay="${k}"${cfg.layouts.includes(k) ? ' checked' : ''}> ${esc(O.LAYOUT_LABEL[k])}</label>`).join('')}</div>
          </div>
          <label data-tip="rcMinRoll">Lowest roll for needed traits <span class="muted small" id="rcMinTxt">${Math.round(cfg.minRoll * 100)}%</span>
            <input type="range" id="rcMin" min="0" max="95" step="5" value="${Math.round(cfg.minRoll * 100)}"></label>
          <label data-tip="rcDone">Cycles already made on this riven <input type="number" id="rcDone" min="0" max="9999" value="${cfg.done}"></label>
        </div>
        <div class="row">
          <button type="button" class="btn ghost sm" id="rcFromRiven"${cur.traits.some(t => !t.neg) ? '' : ' disabled'}>Need the positives on my riven</button>
          <button type="button" class="btn ghost sm" id="rcFromBest" title="Uses the top result of the roll scanner above">Need the scanner's best stats</button>
        </div>
        <details class="small rc-adv"><summary>Layout odds and trait pool</summary>
          <p class="muted small">Layout odds (community testing; they are scaled to add up to 100%):</p>
          <div class="rc-odds">${O.LAYOUTS.map(k => `<label class="small">${esc(O.LAYOUT_LABEL[k])} <input type="number" min="0" max="100" step="1" data-odds="${k}" value="${Math.round(cfg.odds[k] * 100)}">%</label>`).join('')}</div>
          <p class="muted small">Trait pool: ${pl.pos.length} positives, ${pl.neg.length} negatives. The wiki says a physical trait "usually" needs more than 25% of the hit, with exceptions, so you can switch them here:</p>
          <div class="rc-phys">${phys.map(d => { const on = pl.pos.includes(d.key); return `<label class="check small"><input type="checkbox" data-phys="${d.key}"${on ? ' checked' : ''}> ${lbl(d.key)}</label>`; }).join('') || '<span class="muted small">No physical traits for this weapon class.</span>'}</div>
        </details>
        <div id="rcOut"></div>
      </details>
      <details class="rv-sec rc" id="rcSpliceBox">
        <summary>Splicing planner</summary>
        <p class="muted small">Plays the whole plan many times: cycle until both ingredients show up, splice them (one Riven Splicer), then cycle for the rest of your goal.
          After every cycle it keeps the better of the old and new version, like the game lets you. "Smart locking" locks an ingredient, then a needed trait, once the layout fits your goal.</p>
        <div class="grid2">
          <label>Spliced trait <select id="rcSpl"><option value="">Choose...</option>${splOuts.map(k => `<option value="${k}"${cfg.spliceOut === k ? ' selected' : ''}>${lbl(k)}</option>`).join('')}</select></label>
          <label>Start from <select id="rcStart"><option value="fresh"${cfg.start === 'fresh' ? ' selected' : ''}>A fresh riven</option><option value="mine"${cfg.start === 'mine' ? ' selected' : ''}${cur.traits.length ? '' : ' disabled'}>My riven in the editor</option></select></label>
          <label>Runs <select id="rcRuns">${[100, 300, 1000].map(n => `<option${cfg.runs === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <p class="small" id="rcRecipes">${recipesText(spl)}</p>
        <button type="button" class="btn sm" id="rcPlan">Simulate the plan</button>
        <div id="rcPlanOut"></div>
      </details>
      <details class="rv-sec rc">
        <summary>Kuva cost per cycle</summary>
        <div class="tbl-wrap"><table class="rv-best rc-cost"><tr><th>Cycle</th>${O.COST.map((_, i) => `<th>${i + 1}${i === O.COST.length - 1 ? '+' : ''}</th>`).join('')}</tr>
          <tr><td>Kuva</td>${O.COST.map(c => `<td>${fmt(c)}</td>`).join('')}</tr><tr><td>With a lock</td>${O.COST.map(c => `<td>${fmt(c * 2)}</td>`).join('')}</tr></table></div>
        <p class="muted small">Counted per riven. A spliced trait does not double the cost; a locked trait does. Source: <a href="https://wiki.warframe.com/w/Riven_Mods" target="_blank" rel="noopener">WARFRAME Wiki, Riven Mods</a>.</p>
      </details>`;
    if (window.WFTipsDecorate) window.WFTipsDecorate(box);
    compute();
  }

  function recipesText(spl) {
    const k = cfg.spliceOut;
    if (!k) return '<span class="muted">Pick a spliced trait to see its recipes.</span>';
    const rs = spl.filter(r => r[0] === k);
    return 'Recipes: ' + rs.map(r => `${lbl(r[1])} + ${lbl(r[2])}`).join(' or ') + '. Either ingredient may be the negative; the spliced trait is always positive.';
  }

  function row(name, p, done, locked, note) {
    const e = O.expected(p, done, locked);
    if (e.impossible) return `<tr><td>${name}</td><td colspan="5" class="muted">Cannot happen with these settings${note ? ': ' + note : ''}</td></tr>`;
    return `<tr><td>${name}</td><td>${pct(p)}</td><td>${n0(e.mean)}</td><td>${n0(e.kuvaMean)}</td><td>${n0(e.n50)} <span class="muted small">(${n0(e.kuva50)})</span></td><td>${n0(e.n90)} <span class="muted small">(${n0(e.kuva90)})</span></td></tr>`;
  }

  function compute() {
    const out = $('rcOut'); if (!out) return;
    const w = weapon(); const g = goal(); const pl = pools();
    if (!g.need.length && cfg.neg === 'any' && !g.okPos) { out.innerHTML = '<p class="muted small">Pick at least one positive you need.</p>'; return; }
    if (g.need.length > 3) { out.innerHTML = '<p class="small warn-t">That is more than 3 positives. A riven holds at most 3; remove one.</p>'; return; }
    const splicedNeeded = g.need.filter(k => R.statDef(k).spliced);
    const cur = O.fromRiven(state.riven, w);
    const curSpl = cur.traits.find(t => t.spliced);
    const rows = [];
    const odds = O.normLayoutOdds(cfg.odds);
    const base = { pools: pl, layoutOdds: odds };
    if (splicedNeeded.length && !(curSpl && splicedNeeded.length === 1 && splicedNeeded[0] === curSpl.key)) {
      out.innerHTML = `<p class="small">A spliced trait (${splicedNeeded.map(lbl).join(', ')}) only comes from a Riven Splicer, never from a cycle. Use the splicing planner below${curSpl ? '' : ', or splice it in the editor first'}.</p>`;
      return;
    }
    if (curSpl) {
      // the spliced trait is fixed and so is the layout
      const st = Object.assign({}, base, { spliced: { key: curSpl.key, u: curSpl.u }, layout: cur.layoutKey });
      rows.push(row(`Cycle with ${lbl(curSpl.key)} spliced`, O.cycleChance(w, g, st).p, cfg.done, false));
      cur.traits.filter(t => !t.spliced).forEach(t => rows.push(row(`&hellip; and lock ${t.neg ? '-' : '+'}${lbl(t.key)}`, O.cycleChance(w, g, Object.assign({}, st, { locked: { key: t.key, neg: t.neg, u: t.u } })).p, cfg.done, true)));
    } else {
      rows.push(row('Cycle, no lock', O.cycleChance(w, g, base).p, cfg.done, false));
      if (cur.traits.length && cur.layout.pos >= 2) cur.traits.forEach(t => rows.push(row(`Lock ${t.neg ? '-' : '+'}${lbl(t.key)} <span class="muted small">(keeps your ${esc(O.LAYOUT_LABEL[cur.layoutKey])} layout)</span>`,
        O.cycleChance(w, g, Object.assign({}, base, { locked: { key: t.key, neg: t.neg, u: t.u }, layout: cur.layoutKey })).p, cfg.done, true)));
    }
    out.innerHTML = `<div class="tbl-wrap"><table class="rv-best rc-table"><tr><th>How you cycle</th><th>Chance per cycle</th><th>Cycles on average</th><th>Kuva on average</th><th>Half done by</th><th>90% done by</th></tr>${rows.join('')}</table></div>
      <p class="muted small">"Half done by" and "90% done by": cycles (Kuva) after which half or 90% of players with this goal would have it. Lock rows use the trait's current roll and keep your riven's layout, as the game does. ${cfg.minRoll ? `Needed traits must roll at least ${Math.round(cfg.minRoll * 100)}% of their range (assumes rolls are spread evenly).` : ''}</p>`;
  }

  // ---------- splicing planner ----------
  let planRun = 0;
  function plan() {
    const w = weapon(); if (!w) return;
    const out = $('rcPlanOut');
    if (!cfg.spliceOut) { out.innerHTML = '<p class="small warn-t">Pick the spliced trait first.</p>'; return; }
    const g = goal();
    if (!g.need.includes(cfg.spliceOut)) g.need = [cfg.spliceOut].concat(g.need);
    if (g.need.length > 3) { out.innerHTML = `<p class="small warn-t">With ${lbl(cfg.spliceOut)} that is ${g.need.length} positives, and a riven holds at most 3. Remove ${g.need.length - 3} from the needed positives.</p>`; return; }
    const extraSpl = g.need.filter(k => R.statDef(k).spliced && k !== cfg.spliceOut);
    if (extraSpl.length) { out.innerHTML = `<p class="small warn-t">Only one spliced trait fits on a riven; remove ${extraSpl.map(lbl).join(', ')} from the needed positives.</p>`; return; }
    const recipes = R.recipesFor(w).filter(r => r[0] === cfg.spliceOut);
    const cur = O.fromRiven(state.riven, w);
    const start = cfg.start === 'mine' && cur.traits.length ? { traits: cur.traits, layout: cur.layout, cycles: cfg.done } : null;
    const run = ++planRun;
    const pl = pools(), odds = O.normLayoutOdds(cfg.odds), runs = cfg.runs, maxCycles = 20000;
    // every recipe x {smart, never}; batches keep the page responsive
    const jobs = [];
    recipes.forEach(rc => ['smart', 'never'].forEach(lock => jobs.push({ rc, lock, res: [], fails: 0 })));
    const noSplice = { rc: null, lock: 'smart', res: [], fails: 0 };
    const goalNoSpl = Object.assign({}, g, { need: g.need.filter(k => k !== cfg.spliceOut) });
    if (goalNoSpl.need.length) jobs.push(Object.assign(noSplice, { goal: goalNoSpl }));
    const BATCH = 25;
    let j = 0, doneRuns = 0;
    out.innerHTML = '<p class="muted small" id="rcPlanProg">Simulating...</p>';
    const step = () => {
      if (run !== planRun) return;
      const job = jobs[j];
      const r = O.simulatePlan(w, { goal: job.goal || g, splice: job.rc, lock: job.lock, start, layoutOdds: odds, pools: pl, runs: BATCH, maxCycles, seed: 1000 + doneRuns + j * 7919 });
      job.res.push(...r.raw); job.fails += r.fails; doneRuns += BATCH;
      if (job.res.length + job.fails >= runs) j++;
      const prog = $('rcPlanProg'); if (prog) prog.textContent = `Simulating... ${Math.round(Math.min(1, (j + (job.res.length + job.fails) / runs) / jobs.length) * 100)}%`;
      if (j < jobs.length) { setTimeout(step, 0); return; }
      const line = (name, job) => {
        const s = O.summarize(job.res, runs, job.fails, maxCycles);
        if (!s.done) return `<tr><td>${name}</td><td colspan="4" class="muted">Did not finish within ${fmt(maxCycles)} cycles in any run</td></tr>`;
        return `<tr><td>${name}</td><td>${n0(s.cycles.mean)} <span class="muted small">(half by ${n0(s.cycles.p50)}, 90% by ${n0(s.cycles.p90)})</span></td><td>${n0(s.kuva.mean)} <span class="muted small">(half by ${n0(s.kuva.p50)})</span></td>
          <td>${job.rc ? (s.splicers || 0).toFixed(1) : '0'}</td><td>${s.fails ? `<span class="warn-t">${s.fails} of ${s.runs} unfinished</span>` : `${s.done} of ${s.runs}`}</td></tr>`;
      };
      const rows = jobs.map(job => line(job.rc ? `${lbl(job.rc[1])} + ${lbl(job.rc[2])}, ${job.lock === 'smart' ? 'smart locking' : 'never lock'}` : `Without splicing (${goalNoSpl.need.map(lbl).join(', ')} only), smart locking`, job));
      out.innerHTML = `<div class="tbl-wrap"><table class="rv-best rc-table"><tr><th>Plan</th><th>Cycles</th><th>Kuva</th><th>Splicers</th><th>Finished</th></tr>${rows.join('')}</table></div>
        <p class="muted small">Goal: ${g.need.map(lbl).join(', ')}${g.okPos ? `, other positives only ${g.okPos.map(lbl).join(', ')}` : ''}; negative ${g.neg === 'any' ? 'any or none' : g.neg === 'none' ? 'none' : `one of ${g.negList.map(lbl).join(', ')}${g.negOptional ? ' or none' : ''}`}.
          ${runs} runs each, ${start ? 'starting from your riven' : 'starting from a fresh riven'}. A run gives up after ${fmt(maxCycles)} cycles. Same community odds as above; the results are a simulation, so they move a little between runs.</p>`;
    };
    setTimeout(step, 10);
  }

  // ---------- events ----------
  const sel = id => { const el = $(id); return el ? [...el.selectedOptions].map(o => o.value) : []; };
  box.addEventListener('change', e => {
    const t = e.target; if (!cfg) return;
    if (t.id === 'rcNeed') cfg.need = sel('rcNeed');
    else if (t.id === 'rcOkMode') { cfg.okMode = t.value; $('rcOkPos').hidden = t.value !== 'list'; }
    else if (t.id === 'rcOkPos') cfg.okPos = sel('rcOkPos');
    else if (t.id === 'rcNeg') { cfg.neg = t.value; $('rcNegWrap').hidden = t.value !== 'list'; }
    else if (t.id === 'rcNegList') cfg.negList = sel('rcNegList');
    else if (t.id === 'rcNegOpt') cfg.negOptional = t.checked;
    else if (t.dataset.lay) cfg.layouts = [...box.querySelectorAll('[data-lay]')].filter(x => x.checked).map(x => x.dataset.lay);
    else if (t.id === 'rcDone') cfg.done = Math.max(0, parseInt(t.value, 10) || 0);
    else if (t.dataset.odds) cfg.odds[t.dataset.odds] = Math.max(0, +t.value || 0) / 100;
    else if (t.dataset.phys) {
      const k = t.dataset.phys; cfg.add = cfg.add.filter(x => x !== k); cfg.remove = cfg.remove.filter(x => x !== k);
      (t.checked ? cfg.add : cfg.remove).push(k); render(); return;
    } else if (t.id === 'rcSpl') { cfg.spliceOut = t.value; $('rcRecipes').innerHTML = recipesText(R.recipesFor(weapon())); return; }
    else if (t.id === 'rcStart') { cfg.start = t.value; return; }
    else if (t.id === 'rcRuns') { cfg.runs = +t.value || 300; return; }
    else return;
    compute();
  });
  box.addEventListener('input', e => {
    if (e.target.id === 'rcMin') { cfg.minRoll = +e.target.value / 100; $('rcMinTxt').textContent = e.target.value + '%'; compute(); }
  });
  box.addEventListener('click', e => {
    if (e.target.id === 'rcPlan') plan();
    else if (e.target.id === 'rcFromRiven') {
      const cur = O.fromRiven(state.riven, weapon());
      cfg.need = cur.traits.filter(t => !t.neg).map(t => t.key);
      const n = cur.traits.find(t => t.neg);
      if (n) { cfg.neg = 'list'; cfg.negList = [n.key]; cfg.negOptional = true; }
      cfg.layouts = cur.traits.length ? O.LAYOUTS.filter(k => O.parseLayout(k).pos >= cfg.need.length) : cfg.layouts;
      render();
    } else if (e.target.id === 'rcFromBest') {
      const best = UI.rivenBest && UI.rivenBest()[0];
      if (!best) { UI.flashMsg('Run "Find best stats" in the roll scanner first.'); return; }
      cfg.need = best.keys.slice(); cfg.layouts = O.LAYOUTS.filter(k => O.parseLayout(k).pos >= cfg.need.length);
      render();
    }
  });

  // follow the weapon and the riven in the editor
  let lastKey = '';
  UI.hooks.push(() => {
    if (box.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
    const k = [weapon() && weapon().name, JSON.stringify(state.riven)].join('|');
    if (k !== lastKey) { lastKey = k; render(); }
  });
  const tab = $('tab-riven'); if (tab) tab.addEventListener('click', render);
  render();
};
