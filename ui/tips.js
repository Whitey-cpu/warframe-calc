/*
 * Help tips: a small "?" next to stats and settings opens a short explanation with a WARFRAME Wiki link.
 * Static elements opt in with data-tip="key"; arsenal rows and result tiles are matched by their label.
 */
window.WFTips = function (UI) {
  const { esc } = UI;
  const W = p => `https://wiki.warframe.com/w/${p}`;
  const TIPS = {
    // stats
    'critical chance': ['Chance for each hit to crit. Over 100% guarantees a crit and gives a chance of an orange (or red) crit, which deals more.', 'Critical_Hit'],
    'critical damage': ['Damage multiplier on a crit. Orange crits multiply again: tier x (crit damage - 1) + 1.', 'Critical_Hit'],
    'status': ['Chance for each pellet to apply a status effect. The status type is picked by damage share.', 'Status_Effect'],
    'status chance': ['Chance for each pellet to apply a status effect. The status type is picked by damage share.', 'Status_Effect'],
    'multishot': ['Pellets fired per shot. Every pellet deals full damage and rolls status on its own.', 'Multishot'],
    'fire rate': ['Shots per second. Charge time and reload come on top.', 'Fire_Rate'],
    'magazine': ['Shots before a reload. Sustained DPS counts the reload time.', 'Ammo'],
    'reload': ['Seconds to reload. Battery weapons refill at a fixed rate instead; reload speed only shortens their delay.', 'Reload'],
    'riven disposition': ['Retired on 2026-10-22 (Hotfix 44.1.3). Every riven now rolls with the same 1.2 multiplier.', 'Riven_Mods'],
    'riven multiplier': ['Since Hotfix 44.1.3 (2026-10-22) every riven uses 1.2, the old 1.2 disposition. The number in brackets is the weapon\'s disposition before that, used to convert old riven values.', 'Riven_Mods'],
    rivenMult: ['Since Hotfix 44.1.3 (2026-10-22) every riven uses 1.2, the old 1.2 disposition. Values on cards from before then used the weapon\'s old disposition; "Convert them" fixes those numbers.', 'Riven_Mods'],
    rcMinRoll: ['How high in its range each needed trait must roll. 0% accepts any roll. Rolls are assumed to be spread evenly, since DE has not published how they are drawn.', 'Riven_Mods'],
    rcDone: ['Kuva per cycle rises with each cycle of the same riven, up to 3,500 from the 10th. Enter how many times this riven has been cycled.', 'Riven_Mods'],
    'total': ['Total damage of one shot with multishot, as the arsenal shows it: no enemy, no buffs, no quantization.', 'Damage'],
    'trigger': ['How the weapon fires: auto, semi, charge, burst, held.', 'Trigger_Type'],
    'charge time': ['Seconds to charge before the shot fires.', 'Charge'],
    // results
    'sustained dps': ['Damage per second over a long fight, including reloads and status damage over time. This is the number the optimizer uses by default.', 'Damage_per_second'],
    'burst dps': ['Damage per second while the trigger is held, before any reload.', 'Damage_per_second'],
    'avg per shot': ['Average direct damage of one shot against this enemy, with crits and headshots averaged in.', 'Damage_calculation'],
    'burst direct': ['Burst DPS from hits only, no status ticks.', 'Damage_calculation'],
    'burst dot': ['Burst DPS from status damage over time: Slash, Heat, Toxin, Gas, Electricity.', 'Status_Effect'],
    'group dps': ['DPS across several enemies, for area damage and status that spreads. Set "Enemies in area" on the Enemy tab.', 'Area_of_Effect'],
    'time to kill': ['Seconds to kill one enemy with its scaled health, shields, armor and Overguard.', 'Enemy_Level_Scaling'],
    'shots to kill': ['Shots needed to kill one enemy.', 'Enemy_Level_Scaling'],
    // settings
    mode: ['Beginner shows the essentials. Advanced shows every setting, the Simulacrum and the full breakdowns.', null],
    killRate: ['How often you get kills with this weapon. On Kill buffs use the stacks you would actually hold: each buff\'s duration and how it loses stacks decide that. Galvanized mods lose one stack every 20s without a kill, so even Steady keeps them near full; Primary Merciless (4s) falls off much sooner. Horde and Steady are suggested rates, not game data.', 'Galvanized_Mods'],
    distance: ['Metres to the target. Drives damage falloff and range conditions like Shotgun Vendetta\'s "within 5m". 10m is a starting point, not game data.', 'Damage_Falloff'],
    fightSeconds: ['How long one fight lasts. Status damage over time stops when the target dies. Blank uses the time to kill when you pick an enemy.', 'Status_Effect'],
    combo: ['The Melee Combo multiplier: 2x at 20 hits, +1x per 20 hits, up to 12x at 220. It multiplies heavy attacks, not normal swings, and powers Blood Rush and Weeping Wounds.', 'Melee_Combo'],
    statusTypes: ['Status types already on the target from teammates or abilities. Your own procs are counted automatically when "My own status effects" is on.', 'Status_Effect'],
    aoeSpread: ['Area attacks lose damage away from the blast centre. On: targets are spread evenly over the blast. Off: the target takes the centre hit.', 'Damage_Falloff'],
    energyOver500: ['Violet Archon Shard melee critical damage doubles when your Warframe\'s max energy is over 500.', 'Violet_Archon_Shard'],
    assumeMax: ['Counts conditional buffs: On Kill stacks, on-proc arcanes, "while aiming" and similar. Off counts none of them, like the arsenal screen.', 'Damage_calculation'],
    selfStatus: ['Works out the Viral, Corrosive, Heat, Magnetic, Puncture and Cold stacks your own procs keep on the target, and how many status types it carries.', 'Status_Effect'],
    aiming: ['Some mods only work while aiming (Galvanized Scope, Argon Scope).', null],
    falloff: ['Many shotguns and some other weapons lose damage with distance: full damage up to the start distance, then a straight drop to the minimum at the end distance.', 'Damage_Falloff'],
    battery: ['Some weapons refill their magazine on their own (Coda Bubonico, Fulmin, Cycron). Refill time = delay / (1 + reload speed) + magazine / refill rate.', 'Battery_Weapon'],
    range: ['Buffs that need the target within a distance (Shotgun Vendetta: 5m) or away from you (Range Advantage: no enemies within 10m) follow the target distance.', null],
    shards: ['Archon Shards on your Warframe. Crimson and Violet crit, status and electricity bonuses add to the matching mods; Tauforged shards are 1.5x.', 'Archon_Shard'],
    timeline: ['How DPS ramps up from the first shot: On Kill stacks, arcane stacks and your statuses on the target all need time to build.', null],
    stance: ['Stance combos change how hard and how often each swing hits. Damage = weapon damage x the hit\'s %, and attack speed shortens the whole combo.', 'Stance'],
    stanceCombo: ['Which combo you repeat. Neutral is standing still, Forward is moving, Block holds block.', 'Stance'],
    headcrit: ['Whether a headshot crit doubles the base crit multiplier on this enemy. Auto follows the faction: on for most Grineer, Infested and Sentient heads, off for Corpus humanoids, most of The Murmur and Techrot. Airborne Corpus units such as Ospreys do take it, so set Yes for those.', 'Critical_Hit'],
    weakPointMult: ['Headshot multiplier for this enemy. Blank uses 2x for most enemies (3x if your mods say so).', 'Weak_Point'],
    targets: ['How many enemies area damage hits: explosions, clouds, Gas, Electricity chains, Blast bursts.', 'Area_of_Effect'],
    shotSim: ['Simulates every shot with real dice rolls: pellet count, crit tier, headshots and status per pellet. Repeating the fight shows the range between unlucky and lucky.', 'Critical_Hit'],
    rotation: ['The best loop of normal combos and heavy attacks, with the combo worked out from your stance, Heavy Attack Efficiency, Initial Combo and the combo timer.', 'Melee_Combo'],
    autoCombo: ['Heavy attacks use the combo from the best melee loop instead of the combo number you type in.', 'Melee_Combo'],
    formaBudget: ['Most Forma you are willing to use. The optimizer only keeps builds that fit the capacity with that many, and shows where the polarities go. Blank: no limit.', 'Forma'],
    optPolarity: ['After a search, set each slot\'s polarity to the plan so the capacity bar matches.', 'Polarity'],
    allowed: ['Only these mods are tried (comma separated). Blank tries every mod that fits the weapon.', null],
    excluded: ['These mods are never tried (comma separated).', null]
  };
  // one box for all tips
  const box = document.createElement('div');
  box.className = 'tipbox'; box.setAttribute('role', 'tooltip'); box.id = 'tipbox'; box.hidden = true;
  document.body.appendChild(box);
  let owner = null;
  function show(btn) {
    const t = TIPS[btn.dataset.key]; if (!t) return;
    owner = btn;
    box.innerHTML = `${esc(t[0])}${t[1] ? ` <a href="${W(t[1])}" target="_blank" rel="noopener">Wiki</a>` : ''}`;
    box.hidden = false;
    const r = btn.getBoundingClientRect();
    const bw = Math.min(300, window.innerWidth - 24);
    box.style.maxWidth = bw + 'px';
    box.style.left = Math.max(12, Math.min(window.innerWidth - bw - 12, r.left + window.scrollX - 8)) + 'px';
    box.style.top = (r.bottom + window.scrollY + 6) + 'px';
    btn.setAttribute('aria-describedby', 'tipbox');
  }
  function hide() { box.hidden = true; if (owner) owner.removeAttribute('aria-describedby'); owner = null; }
  const qBtn = key => `<button type="button" class="tip-q" data-key="${esc(key)}" aria-label="What is this?">?</button>`;
  function decorate(scope) {
    (scope || document).querySelectorAll('[data-tip]').forEach(el => {
      if (el.querySelector(':scope > .tip-q') || !TIPS[el.dataset.tip]) return;
      // put the ? right after the label text, before any input
      const input = el.querySelector('input, select');
      const tmp = document.createElement('span'); tmp.innerHTML = qBtn(el.dataset.tip);
      const q = tmp.firstChild;
      if (input && input.parentNode === el && el.classList.contains('check')) el.appendChild(q);
      else if (input && input.parentNode === el && el.firstChild && el.firstChild.nodeType === 3) {
        // keep the ? on the same line as the label text
        const wrap = document.createElement('span'); wrap.className = 'tip-lbl';
        wrap.textContent = el.firstChild.textContent.trim();
        el.replaceChild(wrap, el.firstChild); wrap.appendChild(q);
      } else if (input && input.parentNode === el) el.insertBefore(q, input);
      else el.appendChild(q);
    });
  }
  function decorateLabels() {
    document.querySelectorAll('#gameStats .gs-k, #tiles .tile .k').forEach(el => {
      if (el.querySelector('.tip-q')) return;
      const key = el.textContent.trim().toLowerCase();
      if (TIPS[key]) el.insertAdjacentHTML('beforeend', qBtn(key));
    });
  }
  document.addEventListener('mouseover', e => { const b = e.target.closest('.tip-q'); if (b && window.matchMedia('(hover: hover)').matches) show(b); });
  document.addEventListener('mouseout', e => { const b = e.target.closest('.tip-q'); if (b && !box.contains(e.relatedTarget) && window.matchMedia('(hover: hover)').matches) hide(); });
  document.addEventListener('focusin', e => { const b = e.target.closest('.tip-q'); if (b && b.matches(':focus-visible')) show(b); });
  document.addEventListener('click', e => {
    const b = e.target.closest('.tip-q');
    if (b) { e.preventDefault(); e.stopPropagation(); if (owner === b && !box.hidden && !window.matchMedia('(hover: hover)').matches) hide(); else show(b); return; }
    if (!box.contains(e.target)) hide();
  }, true);
  box.addEventListener('mouseleave', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  decorate();
  UI.hooks.push(() => { decorateLabels(); });
  window.WFTipsDecorate = decorate;
};
