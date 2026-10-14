/*
 * Turns mod / arcane stat text from @wfcd/items into structured effects.
 * Example: "On Kill:\n+30% Multishot for 20s. Stacks up to 5x."
 *   -> { stat: 'multishot', value: 0.30, cond: { trigger: 'On Kill', maxStacks: 5 } }
 * Anything the parser does not understand is returned in `unparsed` so the UI can
 * show it instead of silently dropping it.
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});

  // Crit chance sources that add a FLAT amount after mods, not to the Point Strike pool.
  // Source: https://wiki.warframe.com/w/Critical_Hit
  const FLAT_CRIT = ['Arcane Avenger', "Cat's Eye", 'Covenant', 'Charm', 'Hunter Synergy', 'Secondary Enervate', 'Shadow Haze'];

  const ELEMENT_WORDS = {
    impact: 'impact', puncture: 'puncture', slash: 'slash',
    heat: 'heat', cold: 'cold', electricity: 'electricity', toxin: 'toxin',
    blast: 'blast', radiation: 'radiation', gas: 'gas', magnetic: 'magnetic', viral: 'viral', corrosive: 'corrosive',
    void: 'void'
  };

  const STAT_WORDS = {
    'damage': 'damage', 'melee damage': 'damage', 'weapon damage': 'damage', 'base damage': 'damage',
    'critical chance': 'critChance', 'critical damage': 'critDamage',
    'status chance': 'statusChance', 'status duration': 'statusDuration', 'status damage': 'statusDamage',
    'multishot': 'multishot', 'fire rate': 'fireRate', 'attack speed': 'fireRate',
    'magazine capacity': 'magazine', 'reload speed': 'reloadSpeed',
    'headshot multiplier': 'headshot', 'headshot damage': 'headshot',
    'weak point damage': 'weakPoint', 'weak point critical chance': 'weakPointCrit',
    // "Direct Damage" (Galvanized mods) adds to the base damage pool for the hit itself.
    'direct damage': 'directDamage'
  };

  const TAG_WORDS = {
    DT_IMPACT_COLOR: 'Impact', DT_PUNCTURE_COLOR: 'Puncture', DT_SLASH_COLOR: 'Slash',
    DT_FIRE_COLOR: 'Heat', DT_FREEZE_COLOR: 'Cold', DT_ELECTRICITY_COLOR: 'Electricity', DT_POISON_COLOR: 'Toxin',
    DT_EXPLOSION_COLOR: 'Blast', DT_RADIATION_COLOR: 'Radiation', DT_GAS_COLOR: 'Gas', DT_MAGNETIC_COLOR: 'Magnetic',
    DT_VIRAL_COLOR: 'Viral', DT_CORROSIVE_COLOR: 'Corrosive', DT_RADIANT_COLOR: 'Void'
  };

  function clean(s) {
    // A damage-type tag is either followed by its word ("<DT_FIRE_COLOR>Heat") or stands alone
    // ("apply <DT_SLASH_COLOR> on Critical"). Only insert the word in the second case.
    return String(s)
      .replace(/<([A-Z_]+)>(\s*)([A-Za-z]?)/g, (m, tag, sp, next) => {
        const w = TAG_WORDS[tag];
        if (!w) return sp + next;
        if (next && !sp) return next;      // tag directly followed by its word
        return w + sp + next;             // standalone tag: insert the word
      })
      .replace(/\\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  }

  function parseStatPhrase(text, ctx) {
    // returns effect or null
    let m;
    let t = text.trim().replace(/\.$/, '');
    let bowMult = 1;
    const bow = t.match(/\(x(\d+(?:\.\d+)?) for Bows\)/i);
    if (bow) bowMult = parseFloat(bow[1]);
    t = t.replace(/\s*\([^)]*\)/g, '').trim();
    t = t.replace(/\s+for\s+\d+(?:\.\d+)?s$/i, '');
    let aiming = false;
    if (/\s+when Aiming$/i.test(t)) { aiming = true; t = t.replace(/\s+when Aiming$/i, ''); }
    let onlyFor = null;
    const of = t.match(/^(.*?)\s+(?:to|for) (Primary|Secondary|Melee) Weapons$/i);
    if (of) { t = of[1]; onlyFor = of[2]; }

    m = null;
    const soc = t.match(/^\+?(\d+(?:\.\d+)?)% chance to apply Slash on Critical$/i);
    if (soc) return { stat: 'slashOnCrit', value: parseFloat(soc[1]) / 100 };

    m = t.match(/^x(\d+(?:\.\d+)?)\s+Damage to (.+)$/i);
    if (m) return { stat: 'faction', faction: m[2].trim(), value: parseFloat(m[1]) - 1 };

    m = t.match(/^([+-]?\d+(?:\.\d+)?)%\s+(?:to\s+)?(.+)$/i);
    if (!m) return null;
    const value = parseFloat(m[1]) / 100;
    let rest = m[2].trim();
    let per = null;
    if (/\s+stacks with Combo Multiplier$/i.test(rest)) { rest = rest.replace(/\s+stacks with Combo Multiplier$/i, ''); per = 'Combo Multiplier'; }
    const perM = rest.match(/^(.*?)\s+per\s+(.+)$/i);
    if (perM) { rest = perM[1].trim(); per = perM[2].trim(); }
    const key = rest.toLowerCase().replace(/^weapon\s+/, '');

    let eff = null;
    if (ELEMENT_WORDS[key]) eff = { stat: 'element', element: ELEMENT_WORDS[key], value };
    else if (STAT_WORDS[key]) eff = { stat: STAT_WORDS[key], value };
    else if (STAT_WORDS[key.replace(/^melee\s+/, '')]) eff = { stat: STAT_WORDS[key.replace(/^melee\s+/, '')], value };
    if (!eff) return null;
    if (eff.stat === 'critChance' && ctx && FLAT_CRIT.includes(ctx.name)) eff.stat = 'critChanceFlat';
    if (bowMult !== 1) eff.bowMult = bowMult;
    if (onlyFor) eff.onlyFor = onlyFor;
    if (aiming) eff.cond = { trigger: 'When Aiming' };
    if (per) {
      if (/combo multiplier/i.test(per)) eff.perCombo = true;
      else eff.per = per; // e.g. "Status Type affecting the target" -> user supplies a count
    }
    return eff;
  }

  /**
   * @param {string[]} stats  levelStats[maxRank].stats
   * @param {{name:string}} ctx
   * @returns {{effects:object[], unparsed:string[]}}
   */
  function parseStats(stats, ctx) {
    const effects = [];
    const unparsed = [];
    if (!stats || !stats.length) return { effects, unparsed };
    const entries = stats.map(clean);
    // Arcanes often repeat their unconditional lines as separate entries after a full
    // multi-line description. Skip those duplicates inside the first block.
    const singles = new Set(entries.filter(e => !e.includes('\n')));

    entries.forEach((entry, idx) => {
      const lines = entry.split('\n').map(l => l.trim()).filter(Boolean);
      let cond = null;
      let block = [];
      const flush = () => { block = []; };
      for (const line of lines) {
        if (idx === 0 && entries.length > 1 && lines.length > 1 && singles.has(line)) continue;
        const header = line.match(/^((?:On|While|When|After|Upon)\b[^:]*):$/i);
        if (header) { cond = { trigger: header[1] }; flush(); continue; }
        if (/Arcane Revive/i.test(line)) continue;
        const sentences = line.split(/\.\s+/).map(s => s.trim()).filter(Boolean);
        for (let s of sentences) {
          const stacks = s.match(/^Stacks up to (\d+)(?:x| times)\.?$/i);
          if (stacks) { block.forEach(e => { e.cond = Object.assign({}, e.cond || {}, { maxStacks: parseInt(stacks[1], 10) }); }); continue; }
          let chance = null;
          const ch = s.match(/^(\d+(?:\.\d+)?)% chance for (?:an? )?(.+)$/i);
          if (ch) { chance = parseFloat(ch[1]) / 100; s = ch[2]; }
          const eff = parseStatPhrase(s, ctx);
          if (eff) {
            if (cond || chance != null) eff.cond = Object.assign({}, eff.cond || {}, cond || { trigger: 'Chance' }, chance != null ? { chance } : {});
            eff.raw = s;
            effects.push(eff);
            block.push(eff);
          } else {
            unparsed.push(s);
          }
        }
      }
    });
    return { effects, unparsed };
  }

  WF.parser = { parseStats, clean, FLAT_CRIT };
})();
