/*
 * Warframe weapon damage engine.
 * Formulas follow the WARFRAME Wiki (links in static.js / README). Places where the wiki
 * is silent and the engine had to pick a model are tagged ASSUMPTION and also returned in
 * result.notes so they show up in the UI and CLI output.
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});
  const S = WF.STATIC;

  function variantRoot(name) {
    let n = name;
    for (const p of S.VARIANT_PREFIXES) if (n.startsWith(p)) n = n.slice(p.length);
    return n.toLowerCase();
  }

  // ---------- data lookup ----------
  function findWeapon(data, name) {
    const n = String(name).toLowerCase();
    return data.weapons.find(w => w.name.toLowerCase() === n);
  }

  function compatibleCompats(weapon) {
    const c = new Set([weapon.name]);
    const t = weapon.type;
    if (weapon.category === 'Primary') {
      c.add('PRIMARY');
      if (t === 'Shotgun') c.add('Shotgun');
      else {
        c.add('Rifle');
        if (t === 'Rifle') c.add('Assault Rifle'); // ASSUMPTION: data cannot tell assault rifles from other rifles
        if (t === 'Sniper') c.add('Sniper');
        if (t === 'Bow') c.add('Bow');
      }
    } else if (weapon.category === 'Secondary') {
      c.add('Pistol');
      if (t === 'Throwing') c.add('Thrown');
    } else if (weapon.category === 'Melee') {
      c.add('Melee');
    }
    return c;
  }

  function modsFor(data, weapon) {
    const compats = compatibleCompats(weapon);
    const typeOk = {
      Primary: weapon.type === 'Shotgun' ? ['Shotgun Mod', 'Primary Mod'] : ['Primary Mod'],
      Secondary: ['Secondary Mod'],
      Melee: ['Melee Mod']
    }[weapon.category] || [];
    return data.mods.filter(m => typeOk.includes(m.type) && compats.has(m.compat));
  }

  function findMod(data, weapon, name) {
    const n = String(name).toLowerCase();
    const pool = weapon ? modsFor(data, weapon) : data.mods;
    return pool.find(m => m.name.toLowerCase() === n) || data.mods.find(m => m.name.toLowerCase() === n);
  }

  function findArcane(data, name) {
    const n = String(name).toLowerCase();
    return data.arcanes.find(a => a.name.toLowerCase() === n);
  }

  // ---------- helpers ----------
  const quantize = (v, scale) => scale > 0 ? Math.floor(v / scale + 0.5) * scale : v;

  function critTierMult(tier, cd) { return 1 + tier * (cd - 1); }

  // Expected crit multiplier. Headshot crits get an extra x2 (Weak_Point wiki page).
  function expectedCrit(cc, cd, headshot) {
    const c = Math.max(0, cc);
    const t = Math.floor(c);
    const f = c - t;
    const h = tier => (headshot && tier >= 1) ? S.HEADSHOT_CRIT_BONUS : 1;
    return (1 - f) * critTierMult(t, cd) * h(t) + f * critTierMult(t + 1, cd) * h(t + 1);
  }

  function viralMult(stacks) {
    if (!stacks || stacks <= 0) return 1;
    const n = Math.min(stacks, S.VIRAL.max);
    return 1 + S.VIRAL.first + S.VIRAL.perExtra * (n - 1);
  }
  function corrosiveStrip(stacks) {
    if (!stacks || stacks <= 0) return 0;
    const n = Math.min(stacks, S.CORROSIVE.max);
    return S.CORROSIVE.first + S.CORROSIVE.perExtra * (n - 1);
  }

  // ---------- gather effects ----------
  function gatherSources(build, data, weapon, notes) {
    const sources = [];
    (build.mods || []).forEach((entry, slot) => {
      if (!entry) return;
      const name = typeof entry === 'string' ? entry : entry.name;
      const mod = findMod(data, weapon, name);
      if (!mod) { notes.push(`Mod not found: ${name}`); return; }
      const rank = (typeof entry === 'object' && entry.rank != null) ? entry.rank : mod.maxRank;
      const rankScale = mod.maxRank > 0 ? (rank + 1) / (mod.maxRank + 1) : 1; // ASSUMPTION: linear per rank
      sources.push({ key: mod.name, kind: 'mod', slot, item: mod, scale: rankScale });
    });
    (build.arcanes || []).forEach(name => {
      if (!name) return;
      const a = findArcane(data, name);
      if (!a) { notes.push(`Arcane not found: ${name}`); return; }
      sources.push({ key: a.name, kind: 'arcane', slot: 100, item: a, scale: 1 });
    });
    if (build.riven && build.riven.length) {
      sources.push({ key: 'Riven', kind: 'riven', slot: build.rivenSlot != null ? build.rivenSlot : 99,
        item: { name: 'Riven', effects: build.riven.map(e => Object.assign({}, e)) }, scale: 1 });
    }
    return sources;
  }

  function stackCount(src, eff, idx, cond, conditions) {
    const k = `${src.key}#${idx}`;
    if (conditions.stacks && conditions.stacks[k] != null) return conditions.stacks[k];
    if (conditions.stacks && conditions.stacks[src.key] != null) return conditions.stacks[src.key];
    if (cond.trigger === 'When Aiming') return conditions.aiming === false ? 0 : 1;
    return conditions.assumeMax === false ? 0 : (cond.maxStacks || 1);
  }

  // ---------- main ----------
  function calculate(build, data) {
    const notes = [];
    const weapon = typeof build.weapon === 'object' ? build.weapon : findWeapon(data, build.weapon);
    if (!weapon) throw new Error(`Weapon not found: ${build.weapon}`);
    let attackIdx = 0;
    if (build.attack != null) {
      if (typeof build.attack === 'number') attackIdx = build.attack;
      else { const i = weapon.attacks.findIndex(a => a.name.toLowerCase() === String(build.attack).toLowerCase()); if (i >= 0) attackIdx = i; }
    }
    const atk = weapon.attacks[attackIdx] || weapon.attacks[0];
    const ov = build.overrides || {};
    const cond = Object.assign({ assumeMax: true, combo: 1, statusTypes: 0, aiming: true }, build.conditions || {});
    const enemy = Object.assign({ faction: 'None (neutral)', armor: 0, headshotRate: 0, viralStacks: 0, corrosiveStacks: 0, heatStrip: false, armorStripPct: 0 }, build.enemy || {});
    const isMelee = weapon.category === 'Melee';

    const P = {
      dmg: 0, direct: 0, phys: { impact: 0, puncture: 0, slash: 0 },
      cc: 0, ccFlat: 0, cd: 0, cdFlat: 0, sc: 0, ms: 0, fr: 0, mag: 0, reload: 0,
      statusDuration: 0, statusDamage: 0, headshot: 0, weakPoint: 0, faction: 0,
      slashOnCrit: 0, separate: [], voidExtra: 0
    };
    const elementOrder = []; // [{el, bonus, slot}]
    const used = [];
    const unparsed = [];
    const factionInfo = S.FACTIONS[enemy.faction] || S.FACTIONS['None (neutral)'];

    const sources = gatherSources(build, data, weapon, notes);

    // exclusivity check
    const roots = new Map();
    sources.filter(s => s.kind === 'mod').forEach(s => {
      const r = variantRoot(s.key);
      if (roots.has(r)) notes.push(`${s.key} and ${roots.get(r)} are variants of the same mod and cannot both be equipped.`);
      roots.set(r, s.key);
      S.INCOMPATIBLE.forEach(([a, b]) => {
        if (s.key === a && sources.some(o => o.key === b)) notes.push(`${a} cannot be equipped with ${b}.`);
      });
    });

    function applyEffect(src, eff, idx) {
      if (eff.onlyFor && eff.onlyFor !== weapon.category) return;
      let v = eff.value * (src.scale || 1);
      if (eff.bowMult && weapon.type === 'Bow') v *= eff.bowMult;
      let mult = 1;
      if (eff.cond) mult *= stackCount(src, eff, idx, eff.cond, cond);
      if (eff.perCombo) mult *= Math.max(0, (cond.combo || 1) - 1);
      else if (eff.per) {
        if (/status type/i.test(eff.per)) mult *= cond.statusTypes || 0;
        else { mult *= (cond.perCounts && cond.perCounts[eff.per]) || 0; }
      }
      v *= mult;
      if (!v) return;
      used.push({ source: src.key, stat: eff.stat, element: eff.element || eff.faction, value: v });
      switch (eff.stat) {
        case 'damage': P.dmg += v; break;
        case 'directDamage': P.direct += v; break;
        case 'element':
          if (S.PHYSICAL.includes(eff.element)) P.phys[eff.element] += v;
          else {
            const ex = elementOrder.find(e => e.el === eff.element);
            if (ex) ex.bonus += v; else elementOrder.push({ el: eff.element, bonus: v, slot: src.slot, innate: 0 });
          }
          break;
        case 'critChance': P.cc += v; break;
        case 'critChanceFlat': P.ccFlat += v; break;
        case 'critDamage': P.cd += v; break;
        case 'critDamageFlat': P.cdFlat += v; break;
        case 'statusChance': P.sc += v; break;
        case 'multishot': P.ms += v; break;
        case 'fireRate': P.fr += v; break;
        case 'magazine': P.mag += v; break;
        case 'reloadSpeed': P.reload += v; break;
        case 'statusDuration': P.statusDuration += v; break;
        case 'statusDamage': P.statusDamage += v; break;
        case 'headshot': P.headshot += v; break;
        case 'weakPoint': P.weakPoint += v; break;
        case 'slashOnCrit': P.slashOnCrit += v; break;
        case 'faction':
          if (eff.faction && factionInfo.baneKey && eff.faction.toLowerCase() === factionInfo.baneKey.toLowerCase()) P.faction += v;
          else if (eff.faction === '*') P.faction += v;
          break;
        default: break;
      }
    }

    sources.sort((a, b) => a.slot - b.slot).forEach(src => {
      (src.item.effects || []).forEach((eff, idx) => applyEffect(src, eff, idx));
      (src.item.unparsed || []).forEach(u => unparsed.push(`${src.key}: ${u}`));
    });

    // Ability buffs
    (build.buffs || []).forEach(b => {
      const def = S.ABILITIES.find(a => a.id === b.id);
      if (!def) { notes.push(`Unknown ability buff: ${b.id}`); return; }
      const str = b.strength != null ? b.strength : 1;
      const v = def.value * (def.scalesWithStrength ? str : 1);
      used.push({ source: def.name, stat: def.kind, value: v });
      if (def.kind === 'baseDamage') P.dmg += v;
      else if (def.kind === 'faction') P.faction += v;
      else if (def.kind === 'separate') P.separate.push(1 + v);
      else if (def.kind === 'voidExtra') P.voidExtra += v;
      if (def.note && /ASSUMPTION/.test(def.note)) notes.push(`${def.name}: ${def.note}`);
    });
    // Custom buffs: [{kind, value, element?}] kind = damage|separate|faction|critChance|critChanceFlat|critDamage|multishot|fireRate|statusChance|element
    (build.customBuffs || []).forEach(b => {
      used.push({ source: b.label || 'Custom buff', stat: b.kind, value: b.value });
      if (b.kind === 'separate') P.separate.push(1 + b.value);
      else applyEffect({ key: b.label || 'Custom', slot: 200, scale: 1 }, { stat: b.kind === 'faction' ? 'faction' : b.kind, value: b.value, element: b.element, faction: b.kind === 'faction' ? '*' : undefined }, 0);
    });

    // ---------- damage composition ----------
    const base = {};
    for (const [k, v] of Object.entries(atk.damage)) base[k] = v;
    const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
    const scale = baseTotal / 32;

    // Innate elements: merge into a matching modded element, else append last (HCET order for two).
    const innatePrimaries = S.HCET.filter(e => base[e] > 0);
    innatePrimaries.forEach(e => {
      const ex = elementOrder.find(x => x.el === e);
      if (ex) ex.innate += base[e];
      else elementOrder.push({ el: e, bonus: 0, slot: 1000, innate: base[e] });
    });
    // Modded secondary elements that match an innate secondary merge into it.
    const groups = [];
    let pending = null;
    for (const item of elementOrder) {
      if (!S.PRIMARY_ELEMENTS.includes(item.el)) { groups.push({ type: item.el, parts: [item] }); continue; }
      if (pending) {
        const combo = S.combine(pending.el, item.el);
        if (combo) { groups.push({ type: combo, parts: [pending, item] }); pending = null; continue; }
        groups.push({ type: pending.el, parts: [pending] });
      }
      pending = item;
    }
    if (pending) groups.push({ type: pending.el, parts: [pending] });

    const typed = {}; // quantized, unmultiplied
    const add = (t, v) => { typed[t] = (typed[t] || 0) + v; };
    S.PHYSICAL.forEach(p => { if (base[p]) add(p, quantize(base[p] * (1 + P.phys[p]), scale)); });
    // innate secondary/other types that are not handled by the element groups
    Object.keys(base).forEach(k => {
      if (S.PHYSICAL.includes(k) || S.PRIMARY_ELEMENTS.includes(k)) return;
      if (groups.some(g => g.type === k)) return;
      add(k, quantize(base[k], scale));
    });
    groups.forEach(g => {
      let v = 0;
      g.parts.forEach(p => { v += baseTotal * p.bonus + (p.innate || 0); });
      if (!S.PRIMARY_ELEMENTS.includes(g.type) && base[g.type] && g.parts.length === 1 && !g.parts[0].innate) v += base[g.type];
      add(g.type, quantize(v, scale));
    });
    const quantTotal = Object.values(typed).reduce((a, b) => a + b, 0);

    // ---------- multipliers ----------
    const sepMult = P.separate.reduce((a, b) => a * b, 1);
    const hitMult = (1 + P.dmg + P.direct) * sepMult;
    const dotDmgMult = (1 + P.dmg) * sepMult;
    if (P.direct) notes.push('ASSUMPTION: "Direct Damage" bonuses (Galvanized mods) add to the damage pool for hits but not for status DoTs.');

    const hitTyped = {};
    for (const [k, v] of Object.entries(typed)) hitTyped[k] = v * hitMult;
    const hitTotal = quantTotal * hitMult;

    const ms = (ov.multishot != null ? ov.multishot : (isMelee ? 1 : weapon.multishot)) * (isMelee ? 1 : (1 + P.ms));
    const baseCC = ov.critChance != null ? ov.critChance : atk.critChance;
    const baseCD = ov.critMult != null ? ov.critMult : atk.critMult;
    const baseSC = ov.statusChance != null ? ov.statusChance : atk.statusChance;
    const cc = baseCC * (1 + P.cc) + P.ccFlat;
    const cd = baseCD * (1 + P.cd) + P.cdFlat;
    const sc = Math.max(0, baseSC * (1 + P.sc));

    // headshots
    const hsRate = Math.min(1, Math.max(0, enemy.headshotRate || 0));
    const wpBase = enemy.weakPointMult != null ? enemy.weakPointMult : (S.HEADSHOT_MULT_BY_FACTION[enemy.faction] || S.HEADSHOT_MULT_DEFAULT);
    const headMult = (wpBase + 1.5 * P.weakPoint) * (1 + P.headshot);
    const critBody = expectedCrit(cc, cd, false);
    const critHead = expectedCrit(cc, cd, true);
    const critBodyHeadAvg = (1 - hsRate) * critBody + hsRate * critHead * headMult;

    // enemy
    const factionMult = 1 + P.faction;
    const typeMod = t => {
      if (factionInfo.vuln.includes(t)) return S.VULN;
      if (factionInfo.resist.includes(t)) return S.RESIST;
      return 1;
    };
    let netArmor = Math.max(0, enemy.armor || 0);
    netArmor *= (1 - Math.min(1, enemy.armorStripPct || 0));
    netArmor *= (1 - corrosiveStrip(enemy.corrosiveStacks));
    if (enemy.heatStrip) netArmor *= (1 - S.HEAT_STRIP_MAX);
    const armorDM = netArmor > 0 ? 1 - S.ARMOR_DR_MAX * Math.sqrt(Math.min(netArmor, S.ARMOR_CAP) / S.ARMOR_CAP) : 1;
    const viral = viralMult(enemy.viralStacks);
    if (enemy.armor && (enemy.armorStripPct || enemy.corrosiveStacks || enemy.heatStrip))
      notes.push('ASSUMPTION: armor strip sources are applied multiplicatively (flat % strip, then Corrosive, then Heat).');

    const vsTyped = {};
    let vsTotalNonCrit = 0;
    for (const [k, v] of Object.entries(hitTyped)) {
      const dm = (k === 'true') ? 1 : typeMod(k) * armorDM;
      vsTyped[k] = v * dm;
      vsTotalNonCrit += vsTyped[k];
    }
    vsTotalNonCrit *= factionMult * viral;

    // Xata's Whisper style extra Void instance
    let voidPerHit = 0;
    if (P.voidExtra) {
      voidPerHit = P.voidExtra * hitTotal * factionMult * factionMult * typeMod('void') * armorDM * viral;
      notes.push("ASSUMPTION: Xata's Whisper Void instance = % of weapon hit damage, with faction applied twice (wiki says it double-dips).");
    }

    const perProjectile = (vsTotalNonCrit + voidPerHit) * critBodyHeadAvg;
    const perShot = perProjectile * ms;

    // ---------- status ----------
    const procWeights = {};
    const wTotal = Object.values(typed).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(typed)) if (k !== 'true') procWeights[k] = wTotal ? v / wTotal : 0;
    const procsPerShot = sc * ms; // ASSUMPTION: expected procs = status chance x projectiles (wiki gives no closed form)
    const extraSlashPerShot = P.slashOnCrit * Math.min(1, cc) * ms;
    notes.push('ASSUMPTION: expected status procs per shot = status chance x multishot.');

    const pureElementBonus = el => {
      const g = groups.find(x => x.type === el && x.parts.length === 1 && x.parts[0].el === el);
      return g ? g.parts[0].bonus : 0;
    };
    const dots = {};
    let dotPerShot = 0;
    for (const [t, d] of Object.entries(S.DOT)) {
      const procs = (procWeights[t] || 0) * procsPerShot + (t === 'slash' ? extraSlashPerShot : 0);
      if (!procs) continue;
      const elemFactor = t === 'slash' ? 1 : (1 + pureElementBonus(t));
      const tick = baseTotal * dotDmgMult * d.pct * factionMult * factionMult * (1 + P.statusDamage) * elemFactor * critBodyHeadAvg;
      const dur = d.duration * (1 + P.statusDuration);
      const ticks = Math.floor(dur - d.delay) + 1;
      const tickVs = tick * typeMod(t) * (d.bypassArmor ? 1 : armorDM) * viral;
      const perProc = tickVs * ticks;
      dots[t] = { procsPerShot: procs, tick: tickVs, ticks, perProc, perShot: perProc * procs };
      dotPerShot += perProc * procs;
    }
    if (Object.keys(dots).some(t => t !== 'slash')) notes.push('ASSUMPTION: elemental DoTs (Heat/Toxin/Electricity/Gas) are scaled by mods of that exact element only (wiki: combined elements are not buffed by component mods).');

    // ---------- rate of fire ----------
    const baseFR = ov.fireRate != null ? ov.fireRate : (atk.fireRate || weapon.fireRate);
    const fr = baseFR * (1 + P.fr);
    let effFR = fr;
    const chargeTime = ov.chargeTime != null ? ov.chargeTime : atk.chargeTime;
    if (chargeTime > 0 && !isMelee) {
      effFR = 1 / (chargeTime / (1 + P.fr) + 1 / fr);
      notes.push('ASSUMPTION: fire rate bonuses also shorten charge time.');
    }
    if (weapon.trigger === 'Burst') notes.push('Burst trigger: dataset has no burst delay, so burst weapons are treated as their listed fire rate.');
    const mag = Math.max(1, Math.floor((ov.magazine != null ? ov.magazine : weapon.magazine) * (1 + P.mag)));
    const reload = (ov.reload != null ? ov.reload : weapon.reload) / (1 + P.reload);
    const sustainFactor = (isMelee || !weapon.magazine) ? 1 : mag / (effFR * reload + mag);

    const burstDirect = perShot * effFR;
    const burstDot = dotPerShot * effFR;
    const result = {
      weapon: weapon.name, attack: atk.name, category: weapon.category, type: weapon.type,
      stats: {
        baseTotal, quantizationScale: scale, damagePool: P.dmg, directPool: P.direct,
        critChance: cc, critMultiplier: cd, statusChance: sc, multishot: ms,
        fireRate: fr, effectiveFireRate: effFR, magazine: mag, reload,
        factionMultiplier: factionMult, separateMultiplier: sepMult,
        headshotMultiplier: headMult, avgCritBody: critBody, avgCritHead: critHead,
        armorAfterStrip: netArmor, armorDamageMultiplier: armorDM, viralMultiplier: viral
      },
      damageTypes: Object.fromEntries(Object.entries(hitTyped).map(([k, v]) => [k, round(v)])),
      elements: groups.map(g => g.type),
      perHitNonCrit: round(hitTotal),
      perShotVsEnemy: round(perShot),
      dots: Object.fromEntries(Object.entries(dots).map(([k, v]) => [k, mapRound(v)])),
      procsPerShot: round(procsPerShot + extraSlashPerShot),
      dps: {
        burstDirect: round(burstDirect),
        burstDot: round(burstDot),
        burstTotal: round(burstDirect + burstDot),
        sustainedTotal: round((burstDirect + burstDot) * sustainFactor),
        sustainFactor: round(sustainFactor)
      },
      used, unparsed, notes: [...new Set(notes)]
    };
    return result;
  }

  function round(v) { return Math.round(v * 1000) / 1000; }
  function mapRound(o) { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = typeof v === 'number' ? round(v) : v; return r; }

  WF.engine = { calculate, findWeapon, findMod, findArcane, modsFor, compatibleCompats, quantize, expectedCrit, variantRoot };
})();
