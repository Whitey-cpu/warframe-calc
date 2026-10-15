/*
 * Enemy level scaling for health, shields, armor and Overguard.
 * Source: https://wiki.warframe.com/w/Enemy_Level_Scaling (formulas evaluated in float32 as the wiki specifies)
 * Steel Path: +100 levels, health and shields x2.5, armor unchanged since Update 36.0.
 * Source: https://wiki.warframe.com/w/The_Steel_Path
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});
  const f = Math.fround;

  // curve = [a1, p1, a2, p2] for f1(x) = 1 + a1*x^p1 and f2(x) = 1 + a2*x^p2
  const HEALTH = {
    grineer:     [0.015, 2.12, 10.7332, 0.72],
    corpus:      [0.015, 2.12, 13.4165, 0.55],
    infested:    [0.0225, 2.12, 16.0998, 0.72],
    corrupted:   [0.015, 2.1, 10.7332, 0.685],
    unaffiliated:[0.015, 2.0, 10.7332, 0.5],
    techrot:     [0.02, 2.12, 15.0998, 0.7]
  };
  const SHIELD = {
    corpus:    [0.02, 1.76, 2.0, 0.76],
    corrupted: [0.02, 1.75, 2.0, 0.75],
    grineer:   [0.02, 1.75, 1.6, 0.75],
    techrot:   [0.02, 1.76, 3.5, 0.76]
  };
  const ARMOR = [0.005, 1.75, 0.4, 0.75];
  const OVERGUARD = [0.0015, 4, 260, 0.9];

  // Faction (calculator name) -> curve family. Families the wiki does not list fall back as noted.
  const FAMILY = {
    'Grineer': 'grineer', 'Kuva Grineer': 'grineer', 'Scaldra': 'grineer',
    'Corpus': 'corpus', 'Corpus Amalgam': 'corpus',
    'Infested': 'infested', 'Infested Deimos': 'infested',
    'Orokin (Corrupted)': 'corrupted',
    'Techrot': 'techrot',
    'The Murmur': 'unaffiliated', 'Sentient': 'unaffiliated', 'Anarchs': 'unaffiliated',
    'None (neutral)': 'unaffiliated', 'Zariman': 'unaffiliated', 'Narmer': 'unaffiliated'
  };
  const SHIELD_FAMILY = { grineer: 'grineer', corpus: 'corpus', corrupted: 'corrupted', techrot: 'techrot' };

  function multiplier(curve, x, L, U) {
    if (x <= 0) return 1;
    const [a1, p1, a2, p2] = curve;
    const f1 = f(1 + f(a1 * f(Math.pow(x, p1))));
    const f2 = f(1 + f(a2 * f(Math.pow(x, p2))));
    const t = Math.min(1, Math.max(0, f(f(x - L) / f(U - L))));
    const s = f(f(t * t) * f(3 - f(2 * t)));
    return f(f1 + f(f(f2 - f1) * s));
  }

  /**
   * @param {object} o { faction, health, shield, armor, overguard (base, e.g. 12 for Eximus), baseLevel, level, steelPath }
   * @returns {{health, shield, armor, overguard, level, notes: string[]}}
   */
  function scale(o) {
    const notes = [];
    const level = (o.level || 1) + (o.steelPath ? 100 : 0);
    const baseLevel = o.baseLevel || 1;
    const x = Math.max(0, level - baseLevel);
    const fam = FAMILY[o.faction] || 'unaffiliated';
    if (['Zariman', 'Narmer'].includes(o.faction)) notes.push(`ASSUMPTION: ${o.faction} uses the "unaffiliated" health curve (the wiki table does not list it).`);
    const hm = multiplier(HEALTH[fam], x, 70, 80);
    const sFam = SHIELD_FAMILY[fam];
    if (o.shield && !sFam) notes.push(`ASSUMPTION: ${o.faction} shields use the Grineer/Sentient shield curve (not listed on the wiki).`);
    const sm = multiplier(SHIELD[sFam || 'grineer'], x, 70, 80);
    const am = multiplier(ARMOR, x, 70, 80);
    const om = multiplier(OVERGUARD, Math.max(0, level - 1), 45, 50);
    let armor = o.armor ? f(o.armor * am) : 0;
    if (o.armor) armor = Math.min(2700, Math.max(200, armor));
    const spMult = o.steelPath ? 2.5 : 1;
    if (!o.baseLevel) notes.push('ASSUMPTION: base level 1 (many enemies use a different base level; set it if you know it).');
    return {
      level,
      health: Math.round(f(o.health * hm) * spMult),
      shield: o.shield ? Math.round(f(o.shield * sm) * spMult) : 0,
      armor: Math.round(armor),
      overguard: o.overguard ? Math.round(f(o.overguard * om)) : 0,
      notes
    };
  }

  WF.enemy = { scale, multiplier, FAMILY };
})();
