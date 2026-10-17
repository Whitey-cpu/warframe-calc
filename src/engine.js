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
        if (t !== 'Launcher') c.add('Rifle (No Aoe)');
        if (t === 'Sniper') c.add('Sniper');
        if (t === 'Bow') c.add('Bow');
      }
    } else if (weapon.category === 'Secondary') {
      c.add('Pistol'); c.add('Pistol (No Aoe)');
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
    return data.mods.filter(m => typeOk.includes(m.type) && compats.has(m.compat) && triggerModAllowed(m, weapon));
  }

  // Semi-Auto-only mods (Cannonades): "Weapons with an Incarnon mode must have Semi-Auto trigger type for both
  // firing modes in order to equip this mod." Incarnon weapons the wiki names as able to equip them are listed in
  // S.SEMI_INCARNON_OK; other Incarnon weapons are treated as unable (ASSUMPTION for ones the wiki does not name).
  function genesisRoot(name) { return variantRoot(name).replace(/^mk1-/, '').replace(/ (prime|wraith|vandal)$/, ''); }
  function triggerModAllowed(m, weapon) {
    if (!m.requiresTrigger) return true;
    if (!String(weapon.trigger || '').toLowerCase().startsWith(m.requiresTrigger.toLowerCase())) return false;
    if (weapon.incarnon && m.requiresTrigger === 'Semi') return (S.SEMI_INCARNON_OK || []).includes(genesisRoot(weapon.name));
    return true;
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

  // Stack curves accept fractional (expected) stacks: below 1 stack the first-stack effect is scaled by the stack count.
  function stackCurve(stacks, def) {
    if (!stacks || stacks <= 0) return 0;
    const n = Math.min(stacks, def.max);
    return n < 1 ? def.first * n : def.first + def.perExtra * (n - 1);
  }
  // Average damaging ticks per proc when procs land uniformly over a fight of T seconds.
  // Ticks happen at delay, delay+1, ... (n ticks, n may be Infinity for refreshing Heat).
  function avgTicksInFight(T, delay, n) {
    if (!(T > 0)) return n === Infinity ? 0 : n;
    const steps = 400; let sum = 0;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps * T;
      const remain = T - t - delay;
      const k = remain < 0 ? 0 : Math.floor(remain) + 1;
      sum += Math.min(n, k);
    }
    return sum / steps;
  }
  function viralMult(stacks) { return 1 + stackCurve(stacks, S.VIRAL); }
  function corrosiveStrip(stacks) { return stackCurve(stacks, S.CORROSIVE); }
  function coldCritBonus(stacks) { return Math.min(S.COLD_CD.max, stackCurve(Math.min(stacks || 0, 9), { first: S.COLD_CD.first, perExtra: S.COLD_CD.perExtra, max: 9 })); }

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
    const passive = S.WEAPON_PASSIVES && S.WEAPON_PASSIVES[weapon.name];
    if (passive && build.weaponPassive !== false) sources.push({ key: passive.name, kind: 'passive', slot: 90, item: { name: passive.name, effects: passive.effects }, scale: 1 });
    if (build.riven && build.riven.length) {
      sources.push({ key: 'Riven', kind: 'riven', slot: build.rivenSlot != null ? build.rivenSlot : 99,
        item: { name: 'Riven', effects: build.riven.map(e => Object.assign({}, e)) }, scale: 1 });
    }
    return sources;
  }

  // Can this build trigger the condition at all? Weak point / headshot triggers need headshots on a direct-hit attack,
  // melee-kill triggers need a melee weapon, critical-hit triggers need some crit chance.
  function triggerPossible(trigger, ctx) {
    const t = String(trigger || '').toLowerCase();
    // Weak point KILL buffs (Deadhead, Galvanized Scope stacks) are kept up by occasional headshot kills, so they count
    // with "Conditional buffs at max" even when the DPS itself is worked out on body shots (ASSUMPTION).
    // Weak point HIT buffs need the hits themselves, so they need a headshot rate. Area attacks cannot weak-point at all.
    if (/weak point kill|headshot kill/.test(t)) return !ctx.isAoE;
    if (/weak point|headshot/.test(t)) return !ctx.isAoE && ctx.hsRate > 0;
    if (/melee kill/.test(t)) return ctx.isMelee;
    if (/critical hit/.test(t)) return ctx.baseCC > 0;
    return true;
  }
  function stackCount(src, eff, idx, cond, conditions, ctx) {
    const k = `${src.key}#${idx}`;
    if (conditions.stacks && conditions.stacks[k] != null) return conditions.stacks[k];
    if (conditions.stacks && conditions.stacks[src.key] != null) return conditions.stacks[src.key];
    if (cond.trigger === 'When Aiming') return conditions.aiming === false ? 0 : 1;
    if (ctx && !triggerPossible(cond.trigger, ctx)) return 0;
    return conditions.assumeMax === false ? 0 : (cond.maxStacks || 1);
  }

  // ---------- main ----------
  function calcCore(build, data) {
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
    const trigCtx = { isAoE: atk.shotType === 'AoE', hsRate: Math.max(0, enemy.headshotRate || 0), isMelee, baseCC: (ov.critChance != null ? ov.critChance : atk.critChance) };

    const P = {
      dmg: 0, direct: 0, phys: { impact: 0, puncture: 0, slash: 0 },
      cc: 0, ccFlat: 0, cd: 0, cdFlat: 0, sc: 0, ms: 0, fr: 0, mag: 0, reload: 0,
      statusDuration: 0, statusDamage: 0, headshot: 0, weakPoint: 0, faction: 0,
      slashOnCrit: 0, separate: [], voidExtra: 0,
      // flat changes to the weapon's BASE stats (Incarnon evolutions, e.g. "+12 base damage per pellet")
      baseDmgFlat: 0, baseCCFlat: 0, baseCDFlat: 0, baseSCFlat: 0, baseMSFlat: 0, baseMagFlat: 0,
      locks: {}, wpCrit: 0, lingerFirstDouble: 0, lastShotMS: 0, msDmg: 0
    };
    const elementOrder = []; // [{el, bonus, slot}]
    const used = [];
    const unparsed = [];
    const factionInfo = S.FACTIONS[enemy.faction] || S.FACTIONS['None (neutral)'];

    const sources = gatherSources(build, data, weapon, notes);
    // Incarnon evolution perks: build.incarnon = { II: 'Perk name', ... }
    if (build.incarnon && WF.incarnonFor) {
      const preset = WF.incarnonFor(weapon.name, data);
      if (preset) {
        for (const t of preset.tiers) {
          const pick = build.incarnon[t.tier];
          const perk = pick && t.perks.find(x => x.name === pick);
          if (!perk) continue;
          if (perk.modeled === false) { notes.push(`Incarnon ${t.tier} "${perk.name}" has no modeled damage effect.`); continue; }
          if (perk.attack && !new RegExp(perk.attack, 'i').test(atk.name)) continue;
          if (perk.unparsed && perk.unparsed.length) notes.push(`Incarnon ${t.tier} "${perk.name}": not modeled: ${perk.unparsed.join('; ')}`);
          (perk.assumed || []).forEach(a => notes.push(`ASSUMPTION: Incarnon ${t.tier} "${perk.name}": ${a}`));
          sources.push({ key: `Incarnon: ${perk.name}`, kind: 'incarnon', slot: 150, item: { name: perk.name, effects: perk.effects.filter(e => !e.attack || new RegExp(e.attack, 'i').test(atk.name)) }, scale: 1 });
        }
      }
    }

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
      if (eff.cond) mult *= stackCount(src, eff, idx, eff.cond, cond, trigCtx);
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
        case 'baseDamageFlat': P.baseDmgFlat += v; break;
        case 'baseCritChance': P.baseCCFlat += v; break;
        case 'baseCritMult': P.baseCDFlat += v; break;
        case 'baseStatus': P.baseSCFlat += v; break;
        case 'baseMultishot': P.baseMSFlat += v; break;
        case 'baseMagazineFlat': P.baseMagFlat += v; break;
        case 'lock': P.locks[eff.lock] = true; break;
        case 'weakPointCrit': P.wpCrit += v; break;
        case 'lingeringFirstShotDouble': P.lingerFirstDouble = 1; break;
        case 'lastShotMultishotFlat': P.lastShotMS += v; break;
        case 'multishotDamage': P.msDmg += v; break;
        case 'faction':
          if (eff.faction && factionInfo.baneKey && eff.faction.toLowerCase() === factionInfo.baneKey.toLowerCase()) P.faction += v;
          else if (eff.faction === '*') P.faction += v;
          // riven faction stats (Damage vs. Orokin / Scaldra / Techrot) for factions without a Bane mod
          else if (eff.faction && factionInfo.rivenKey && eff.faction.toLowerCase() === factionInfo.rivenKey.toLowerCase()) P.faction += v;
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
    let baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
    if (P.baseDmgFlat && baseTotal > 0) {
      // ASSUMPTION: flat base damage is spread over the attack's damage types in their existing proportions
      const f = (baseTotal + P.baseDmgFlat) / baseTotal;
      for (const k of Object.keys(base)) base[k] *= f;
      baseTotal += P.baseDmgFlat;
      notes.push('ASSUMPTION: flat base damage bonuses are split across damage types in proportion to the base damage.');
    }
    // Valence bonus (Kuva / Tenet / Coda): extra base damage of one type, a share of the attack's base damage
    const val = build.valence;
    if (val && val.element && val.pct > 0 && baseTotal > 0) {
      const extra = baseTotal * Math.min(0.6, val.pct);
      base[val.element] = (base[val.element] || 0) + extra;
      baseTotal += extra;
      if (!S.isAdversaryWeapon(weapon.name)) notes.push(`Valence bonus set on ${weapon.name}, which is not a Kuva, Tenet or Coda weapon.`);
    }
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
    const unquant = {}; // same, without quantization (what the in-game arsenal screen shows)
    const add = (t, v, raw) => { typed[t] = (typed[t] || 0) + v; unquant[t] = (unquant[t] || 0) + (raw != null ? raw : v); };
    S.PHYSICAL.forEach(p => { if (base[p]) add(p, quantize(base[p] * (1 + P.phys[p]), scale), base[p] * (1 + P.phys[p])); });
    // innate secondary/other types that are not handled by the element groups
    Object.keys(base).forEach(k => {
      if (S.PHYSICAL.includes(k) || S.PRIMARY_ELEMENTS.includes(k)) return;
      if (groups.some(g => g.type === k)) return;
      add(k, quantize(base[k], scale), base[k]);
    });
    groups.forEach(g => {
      let v = 0;
      g.parts.forEach(p => { v += baseTotal * p.bonus + (p.innate || 0); });
      if (!S.PRIMARY_ELEMENTS.includes(g.type) && base[g.type] && g.parts.length === 1 && !g.parts[0].innate) v += base[g.type];
      add(g.type, quantize(v, scale), v);
    });
    const quantTotal = Object.values(typed).reduce((a, b) => a + b, 0);

    let formMs = null;
    const incPreset = WF.incarnonFor ? WF.incarnonFor(weapon.name, data) : null;
    if (incPreset && incPreset.forms) {
      const fm = incPreset.forms.find(x => new RegExp(x.attack, 'i').test(atk.name));
      if (fm && fm.multishot != null) formMs = fm.multishot;
    }
    const isIncForm = /incarnon/i.test(atk.name);
    // "Multishot consumes ammo ... increases Damage by +N%": normal mode = extra projectiles deal +N% (multiplicative);
    // Incarnon Form = all multishot bonuses are increased by N% (wiki notes, e.g. https://wiki.warframe.com/w/Torid_Incarnon_Genesis)
    const msBonus = P.ms * (P.msDmg && isIncForm ? 1 + P.msDmg : 1);
    const msModded = ((ov.multishot != null ? ov.multishot : (formMs != null ? formMs : (isMelee ? 1 : weapon.multishot))) + P.baseMSFlat) * (isMelee || P.locks.multishot ? 1 : (1 + msBonus));
    let ms = msModded;
    if (P.lastShotMS) {
      // "+N Multishot on last shot in magazine": averaged over the magazine, added after multishot mods (ASSUMPTION)
      const magE = Math.max(1, Math.floor(((ov.magazine != null ? ov.magazine : weapon.magazine) + P.baseMagFlat) * (1 + P.mag)));
      ms += P.lastShotMS / magE;
      notes.push(`ASSUMPTION: +${P.lastShotMS} multishot on the last shot is averaged over the ${magE}-round magazine and not scaled by multishot mods.`);
    }
    if (P.locks.multishot && P.ms) notes.push('A mod says "Multishot cannot be modified": multishot bonuses are ignored.');
    if (P.msDmg && !isIncForm && ms > 1) {
      P.separate.push((1 + (ms - 1) * (1 + P.msDmg)) / ms);
      notes.push(`Extra multishot projectiles deal +${Math.round(P.msDmg * 100)}% damage (Incarnon perk), averaged over ${ms.toFixed(2)} projectiles.`);
    }

    // ---------- multipliers ----------
    const sepMult = P.separate.reduce((a, b) => a * b, 1);
    const hitMult = (1 + P.dmg + P.direct) * sepMult;
    const dotDmgMult = (1 + P.dmg) * sepMult;
    if (P.direct) notes.push('ASSUMPTION: "Direct Damage" bonuses (Galvanized mods) add to the damage pool for hits but not for status DoTs.');

    const hitTyped = {};
    for (const [k, v] of Object.entries(typed)) hitTyped[k] = v * hitMult;
    const hitTotal = quantTotal * hitMult;

    const baseCC = (ov.critChance != null ? ov.critChance : atk.critChance) + P.baseCCFlat;
    const baseCD = (ov.critMult != null ? ov.critMult : atk.critMult) + P.baseCDFlat;
    const baseSC = (ov.statusChance != null ? ov.statusChance : atk.statusChance) + P.baseSCFlat;
    const isAoE = atk.shotType === 'AoE';
    // statuses on the target: Weakened (Puncture) and Freeze (Cold) add flat crit after mods, direct hits only
    const statusCC = isAoE ? 0 : S.PUNCTURE_CC * Math.min(5, enemy.punctureStacks || 0);
    const statusCD = isAoE ? 0 : coldCritBonus(enemy.coldStacks || 0);
    const cc = baseCC * (1 + P.cc) + P.ccFlat + statusCC;
    const cd = baseCD * (1 + P.cd) + P.cdFlat + statusCD;
    const sc = Math.max(0, baseSC * (1 + P.sc));

    // headshots
    const hsRate = isAoE ? 0 : Math.min(1, Math.max(0, enemy.headshotRate || 0)); // AoE cannot headshot (wiki: Weak Point)
    const wpBase = enemy.weakPointMult != null ? enemy.weakPointMult : (S.HEADSHOT_MULT_BY_FACTION[enemy.faction] || S.HEADSHOT_MULT_DEFAULT);
    const headMult = (wpBase + 1.5 * P.weakPoint) * (1 + P.headshot);
    const critBody = expectedCrit(cc, cd, false);
    // weak point crit chance (Primary Acuity): adds to the crit chance pool for weak point hits only
    const ccHead = P.wpCrit ? baseCC * (1 + P.cc + P.wpCrit) + P.ccFlat + statusCC : cc;
    const critHead = expectedCrit(ccHead, cd, true);
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
    if (enemy.heatStrip) netArmor *= (1 - S.HEAT_STRIP_MAX * (typeof enemy.heatStrip === 'number' ? Math.min(1, enemy.heatStrip) : 1));
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

    // ---------- shields and Overguard ----------
    // Shields: armor does not apply, Toxin bypasses shields (goes to health), Magnetic stacks amplify.
    // Overguard: armor does not apply, Void deals +50%, Magnetic stacks amplify.
    // Sources: https://wiki.warframe.com/w/Damage_calculation , https://wiki.warframe.com/w/Overguard , https://wiki.warframe.com/w/Status_Effect
    const magnetic = viralMult(enemy.magneticStacks); // same 100% + 25%/stack curve as Viral
    let shieldPart = 0, toxinPart = 0, ogPart = 0;
    for (const [k, v] of Object.entries(hitTyped)) {
      if (k === 'toxin') { toxinPart += v * typeMod(k) * armorDM * viral; continue; }
      shieldPart += v * (k === 'true' ? 1 : typeMod(k));
      ogPart += v * (k === 'true' ? 1 : typeMod(k)) * (k === 'void' ? 1.5 : 1);
    }
    const voidRaw = P.voidExtra ? P.voidExtra * hitTotal * factionMult : 0;
    const perShotShield = (shieldPart * factionMult * magnetic + voidRaw * factionMult * typeMod('void') * magnetic) * critBodyHeadAvg * ms;
    const perShotToxinThroughShield = toxinPart * factionMult * critBodyHeadAvg * ms;
    const perShotOverguard = (ogPart * factionMult * magnetic + voidRaw * factionMult * typeMod('void') * 1.5 * magnetic) * critBodyHeadAvg * ms;

    // ---------- rate of fire ----------
    const baseFR = ov.fireRate != null ? ov.fireRate : (atk.fireRate || weapon.fireRate);
    if (P.locks.fireRate && P.fr) notes.push('A mod says "Fire Rate cannot be modified": fire rate bonuses and penalties are ignored.');
    const fr = baseFR * (P.locks.fireRate ? 1 : (1 + P.fr));
    let effFR = fr;
    const chargeTime = ov.chargeTime != null ? ov.chargeTime : atk.chargeTime;
    if (chargeTime > 0 && !isMelee) {
      effFR = 1 / (chargeTime / (P.locks.fireRate ? 1 : (1 + P.fr)) + 1 / fr);
      notes.push('ASSUMPTION: fire rate bonuses also shorten charge time.');
    }
    if (weapon.trigger === 'Burst') notes.push('Burst trigger: dataset has no burst delay, so burst weapons are treated as their listed fire rate.');
    const mag = Math.max(1, Math.floor(((ov.magazine != null ? ov.magazine : weapon.magazine) + P.baseMagFlat) * (1 + P.mag)));
    const reload = (ov.reload != null ? ov.reload : weapon.reload) / (1 + P.reload);
    const sustainFactor = (isMelee || !weapon.magazine) ? 1 : mag / (effFR * reload + mag);

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
    let heatRefresh = false;
    let dotGroupPerShot = 0;
    const targets = Math.max(1, enemy.targets || 1); // enemies caught by area damage
    const fightKnown = !!((build.conditions && build.conditions.fightSeconds) || enemy.fightSeconds);
    const fightSeconds = (build.conditions && build.conditions.fightSeconds) || enemy.fightSeconds || 0;
    for (const [t, d] of Object.entries(S.DOT)) {
      const procs = (procWeights[t] || 0) * procsPerShot + (t === 'slash' ? extraSlashPerShot : 0);
      if (!procs) continue;
      const elemFactor = (t === 'slash' || d.noElementBonus) ? 1 : (1 + pureElementBonus(t));
      const tick = baseTotal * dotDmgMult * d.pct * factionMult * factionMult * (1 + P.statusDamage) * elemFactor * critBodyHeadAvg;
      const dur = d.duration * (1 + P.statusDuration);
      let ticks = d.fixedTicks || (Math.floor(dur - d.delay) + 1 - (d.lastTickNoDamage ? 1 : 0));
      // Heat: every proc refreshes all active Heat stacks (wiki: Damage/Heat_Damage), so while procs keep coming
      // (ASSUMPTION: when procs/s x duration >= 3) each stack keeps ticking until the target dies.
      const pps = procs * effFR * sustainFactor;
      const refresh = t === 'heat' && pps * dur >= 3;
      if (fightKnown) {
        // DoTs stop when the target dies: average the ticks a proc lands within a fight of T seconds.
        ticks = avgTicksInFight(fightSeconds, d.fixedTicks ? d.delay : d.delay, refresh ? Infinity : ticks);
        if (refresh) heatRefresh = true;
      }
      const tickVs = tick * typeMod(t) * (d.bypassArmor ? 1 : armorDM) * viral;
      const perProc = tickVs * ticks;
      dots[t] = { procsPerShot: procs, tick: tickVs, ticks: Math.round(ticks * 100) / 100, perProc, perShot: perProc * procs };
      dotPerShot += perProc * procs;
      dotGroupPerShot += perProc * procs * (d.aoe ? targets : 1);
      if (t === 'blast' && targets > 1) {
        // ASSUMPTION: stacks reset after the 10-stack burst, so one burst per 10 Blast procs
        const burst = S.BLAST_BURST * baseTotal * dotDmgMult * factionMult * factionMult * (1 + P.statusDamage) * critBodyHeadAvg * typeMod('blast') * armorDM * viral;
        dotGroupPerShot += burst * (procs / 10) * (targets - 1);
      }
    }
    if (fightKnown) notes.push(`DoTs are counted only until the target dies (${Math.round(fightSeconds * 100) / 100}s fight)${heatRefresh ? '; Heat stacks refresh each other and tick until then' : ''}.`);
    if (Object.keys(dots).some(t => t !== 'slash')) notes.push('ASSUMPTION: elemental DoTs (Heat/Toxin/Electricity/Gas) are scaled by mods of that exact element only (wiki: combined elements are not buffed by component mods).');

    const burstDirect = perShot * effFR;
    const burstDot = dotPerShot * effFR;

    // ---------- time to kill (optional: enemy.health / shield / overguard) ----------
    let ttk = null;
    if (enemy.health > 0) {
      const rate = effFR * sustainFactor;
      const hp = enemy.health, sh = Math.max(0, enemy.shield || 0), og = Math.max(0, enemy.overguard || 0);
      const tOg = og ? og / Math.max(1e-9, perShotOverguard * rate) : 0;
      // while shields are up, only Toxin (and DoTs, ASSUMPTION) reach health
      const tSh = sh ? sh / Math.max(1e-9, perShotShield * rate) : 0;
      const hpDuringShield = sh ? Math.min(hp, (perShotToxinThroughShield * rate) * tSh) : 0;
      const tHp = Math.max(0, hp - hpDuringShield) / Math.max(1e-9, perShot * rate + dotPerShot * rate);
      const shots = (og ? og / Math.max(1e-9, perShotOverguard) : 0) + (sh ? sh / Math.max(1e-9, perShotShield) : 0) + Math.max(0, hp - hpDuringShield) / Math.max(1e-9, perShot + dotPerShot);
      ttk = { seconds: round(tOg + tSh + tHp), shots: round(shots), overguardSeconds: round(tOg), shieldSeconds: round(tSh), healthSeconds: round(tHp) };
      notes.push('ASSUMPTION: time to kill uses sustained rate with average crits and expected DoT damage on health; DoTs are not counted against shields or Overguard.');
    }
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
      perShotVsShield: round(perShotShield),
      perShotVsOverguard: round(perShotOverguard),
      ttk,
      dots: Object.fromEntries(Object.entries(dots).map(([k, v]) => [k, mapRound(v)])),
      procsPerShot: round(procsPerShot + extraSlashPerShot),
      procPerShotByType: Object.fromEntries(Object.entries(procWeights).map(([k, w]) => [k, w * procsPerShot + (k === 'slash' ? extraSlashPerShot : 0)])),
      dotPerShot,
      perShotGroup: round(perShot * (isAoE ? targets : 1)),
      dotGroupPerShot,
      statusDurationBonus: P.statusDuration,
      lingerFirstDouble: P.lingerFirstDouble,
      isAoE,
      // arsenal-style numbers: per projectile before quantization and enemy effects, total includes multishot
      arsenal: {
        types: Object.fromEntries(Object.entries(unquant).map(([k, v]) => [k, round(v * hitMult)])),
        multishot: msModded,
        total: round(Object.values(unquant).reduce((a, c) => a + c, 0) * hitMult * msModded)
      },
      dps: {
        burstDirect: round(burstDirect),
        burstDot: round(burstDot),
        burstTotal: round(burstDirect + burstDot),
        sustainedTotal: round((burstDirect + burstDot) * sustainFactor),
        groupSustained: round((perShot * (isAoE ? targets : 1) + dotGroupPerShot) * effFR * sustainFactor),
        sustainFactor: round(sustainFactor)
      },
      used, unparsed, notes: [...new Set(notes)]
    };
    return result;
  }

  // ---------- extra attacks (e.g. grenade impact + its explosion / cloud) ----------
  // build.extraAttacks: attack indexes (or names) whose damage is added once per shot of the main attack.
  function resolveAttackIndex(weapon, a) {
    if (typeof a === 'number') return a;
    const i = weapon.attacks.findIndex(x => x.name.toLowerCase() === String(a).toLowerCase());
    return i;
  }
  // Hits per main shot for a lingering field: ticks over its life, cut short when the fight ends first.
  function lingeringHits(def, fight, mag, firstDouble) {
    const one = d => {
      const n = Math.max(1, Math.floor((d - def.firstTick) * def.tickRate + 1e-9) + 1);
      if (!(fight > 0)) return n;
      return avgTicksInFight(fight * def.tickRate, def.firstTick * def.tickRate, n);
    };
    if (firstDouble && mag > 0) return (one(def.duration * 2) + (mag - 1) * one(def.duration)) / mag;
    return one(def.duration);
  }
  function calcWithExtras(build, data) {
    const r = calcCore(build, data);
    const extras = (build.extraAttacks || []).filter(x => x != null);
    if (!extras.length) return r;
    const weapon = typeof build.weapon === 'object' ? build.weapon : findWeapon(data, build.weapon);
    const rate = r.stats.effectiveFireRate, sf = r.dps.sustainFactor;
    const fight = build.conditions && build.conditions.fightSeconds;
    const parts = [{ attack: r.attack, perShot: r.perShotVsEnemy, dotPerShot: r.dotPerShot, hits: 1 }];
    let lingeringUsed = false, onceUsed = false;
    for (const a of extras) {
      const idx = resolveAttackIndex(weapon, a);
      if (idx < 0 || weapon.attacks[idx].name === r.attack) continue;
      const rx = calcCore(Object.assign({}, build, { attack: idx, extraAttacks: undefined }), data);
      const def = S.LINGERING[`${genesisRoot(weapon.name)}|${rx.attack.toLowerCase()}`];
      const h = def ? lingeringHits(def, fight, r.stats.magazine, r.lingerFirstDouble) : 1;
      if (def) lingeringUsed = def; else onceUsed = true;
      parts.push({ attack: rx.attack, perShot: round(rx.perShotVsEnemy * h), dotPerShot: rx.dotPerShot * h, hits: round(h) });
      r.perShotVsEnemy = round(r.perShotVsEnemy + rx.perShotVsEnemy * h);
      r.perShotVsShield = round(r.perShotVsShield + rx.perShotVsShield * h);
      r.perShotVsOverguard = round(r.perShotVsOverguard + rx.perShotVsOverguard * h);
      r.dotPerShot += rx.dotPerShot * h;
      r.perShotGroup = round(r.perShotGroup + rx.perShotGroup * h);
      r.dotGroupPerShot += rx.dotGroupPerShot * h;
      for (const [k, v] of Object.entries(rx.procPerShotByType)) r.procPerShotByType[k] = (r.procPerShotByType[k] || 0) + v * h;
      for (const [k, v] of Object.entries(rx.dots)) {
        const d = r.dots[k];
        if (d) { d.procsPerShot = round(d.procsPerShot + v.procsPerShot * h); d.perShot = round(d.perShot + v.perShot * h); }
        else r.dots[k] = Object.assign({}, v, { procsPerShot: round(v.procsPerShot * h), perShot: round(v.perShot * h) });
      }
      rx.notes.forEach(n => { if (!r.notes.includes(n)) r.notes.push(n); });
    }
    if (lingeringUsed) r.notes.push(`ASSUMPTION: lingering cloud hits ${lingeringUsed.tickRate}/s for ${lingeringUsed.duration}s${r.lingerFirstDouble ? ' (doubled on the first shot of each magazine)' : ''}, first hit after ${lingeringUsed.firstTick}s, cut short when the target dies; the target stays inside it and overlapping clouds all deal damage. Source for duration: ${lingeringUsed.source}`);
    if (onceUsed) r.notes.push('ASSUMPTION: each extra attack (explosion) adds its damage once per shot of the main attack.');
    const oldSustained = r.dps.sustainedTotal;
    r.dps.burstDirect = round(r.perShotVsEnemy * rate);
    r.dps.burstDot = round(r.dotPerShot * rate);
    r.dps.burstTotal = round(r.dps.burstDirect + r.dps.burstDot);
    r.dps.sustainedTotal = round(r.dps.burstTotal * sf);
    r.dps.groupSustained = round((r.perShotGroup + r.dotGroupPerShot) * rate * sf);
    if (r.ttk && r.dps.sustainedTotal > 0) {
      const k = oldSustained / r.dps.sustainedTotal;
      r.ttk = Object.fromEntries(Object.entries(r.ttk).map(([key, v]) => [key, round(v * k)]));
    }
    r.attackParts = parts;
    return r;
  }

  // ---------- statuses the build keeps on its own target ----------
  // Each proc adds a stack with its own timer (ASSUMPTION). At time t into the fight the expected stacks are
  // min(max, procs/s x min(t, duration)) and the chance the status is active is 1 - exp(-procs/s x min(t, duration)).
  // With a known fight length T these are averaged over [0, T] (stacks build up); without one, the steady state is used.
  function selfStatusState(r, T) {
    const rate = r.stats.effectiveFireRate * r.dps.sustainFactor;
    const durMult = Math.max(0, 1 + (r.statusDurationBonus || 0));
    const out = { types: 0, stacks: {}, uptime: {}, procsPerSecond: {} };
    const steps = 120;
    for (const [t, perShot] of Object.entries(r.procPerShotByType || {})) {
      const def = S.STATUS[t];
      if (!def || !(perShot > 0)) continue;
      const pps = perShot * rate;
      const dur = def.duration * durMult;
      out.procsPerSecond[t] = pps;
      if (T > 0 && isFinite(T)) {
        let st = 0, up = 0;
        for (let i = 0; i < steps; i++) {
          const x = Math.min((i + 0.5) / steps * T, dur);
          st += Math.min(def.max, pps * x); up += 1 - Math.exp(-pps * x);
        }
        out.stacks[t] = st / steps; out.uptime[t] = up / steps;
      } else {
        out.stacks[t] = Math.min(def.max, pps * dur);
        out.uptime[t] = 1 - Math.exp(-pps * dur);
      }
      out.types += out.uptime[t];
    }
    return out;
  }

  // Result for an assumed fight length T (null = open-ended): one pass to read proc rates, then passes that feed
  // the self-applied statuses back in (status-type counts can change proc-dependent bonuses, so passes repeat).
  function evalAtFight(build, data, T, selfOn, passes) {
    const manualEnemy = Object.assign({}, build.enemy || {});
    const manualTypes = (build.conditions && build.conditions.statusTypes) || 0;
    const c0 = Object.assign({}, build.conditions || {});
    if (T) c0.fightSeconds = T;
    let r = calcWithExtras(Object.assign({}, build, { conditions: c0 }), data);
    let st = null;
    if (!selfOn) return { r, st };
    for (let i = 0; i < passes; i++) {
      st = selfStatusState(r, T);
      const e = Object.assign({}, manualEnemy, {
        viralStacks: Math.max(manualEnemy.viralStacks || 0, st.stacks.viral || 0),
        corrosiveStacks: Math.max(manualEnemy.corrosiveStacks || 0, st.stacks.corrosive || 0),
        magneticStacks: Math.max(manualEnemy.magneticStacks || 0, st.stacks.magnetic || 0),
        punctureStacks: Math.max(manualEnemy.punctureStacks || 0, st.stacks.puncture || 0),
        coldStacks: Math.max(manualEnemy.coldStacks || 0, st.stacks.cold || 0),
        heatStrip: manualEnemy.heatStrip === true ? true : Math.max(+manualEnemy.heatStrip || 0, st.uptime.heat || 0)
      });
      const c = Object.assign({}, c0, { statusTypes: Math.max(manualTypes, st.types) });
      r = calcWithExtras(Object.assign({}, build, { enemy: e, conditions: c }), data);
    }
    return { r, st };
  }

  // The fight length and the time to kill depend on each other (DoT ticks, cloud hits and status build-up all
  // need time). TTK(T) falls as T grows, so the self-consistent fight T = TTK(T) is found by a bracketed
  // root search (Illinois false position on log T) instead of plain iteration, which can oscillate.
  function calculate(build, data) {
    const cond = build.conditions || {};
    const selfOn = cond.selfStatus !== false;
    const explicitFight = cond.fightSeconds || null;
    const fast = (cond.iterations || 5) <= 2;
    const passes = fast ? 1 : 2;
    let out;
    const hasHealth = build.enemy && build.enemy.health > 0;
    if (explicitFight || !hasHealth) {
      out = evalAtFight(build, data, explicitFight, selfOn, passes);
      out.T = explicitFight;
    } else {
      const memo = new Map();
      const at = T => { if (!memo.has(T)) memo.set(T, evalAtFight(build, data, T, selfOn, passes)); return memo.get(T); };
      const h = x => { const o = at(Math.exp(x)); const k = o.r.ttk && o.r.ttk.seconds > 0 ? o.r.ttk.seconds : 1e6; return Math.log(k) - x; };
      let lo = Math.log(0.05), hi = Math.log(600);
      let flo = h(lo), fhi = h(hi);
      let x;
      if (flo <= 0) x = lo;            // dies faster than 0.05 s even with no time for DoTs
      else if (fhi >= 0) x = hi;       // takes longer than 10 minutes
      else {
        const tol = fast ? 0.02 : 0.002; let side = 0;
        x = lo;
        for (let i = 0; i < (fast ? 12 : 30); i++) {
          x = (lo * fhi - hi * flo) / (fhi - flo);
          const fx = h(x);
          if (Math.abs(fx) < tol || hi - lo < tol) break;
          if (fx > 0) { lo = x; flo = fx; if (side === 1) fhi /= 2; side = 1; }
          else { hi = x; fhi = fx; if (side === -1) flo /= 2; side = -1; }
        }
      }
      out = at(Math.exp(x)); out.T = Math.exp(x);
    }
    const r = out.r;
    r.fightSeconds = out.T ? round(out.T) : null;
    const manualTypes = cond.statusTypes || 0;
    if (selfOn && out.st) {
      const st = out.st;
      r.selfStatus = {
        statusTypes: round(Math.max(manualTypes, st.types)),
        stacks: Object.fromEntries(Object.entries(st.stacks).map(([k, v]) => [k, round(v)])),
        uptime: Object.fromEntries(Object.entries(st.uptime).map(([k, v]) => [k, round(v)])),
        procsPerSecond: Object.fromEntries(Object.entries(st.procsPerSecond).map(([k, v]) => [k, round(v)]))
      };
      r.notes.push(out.T
        ? 'ASSUMPTION: statuses you apply yourself build up over the fight (each stack has its own timer, Heat refreshes); stacks shown are the average over the fight. Turn off "Count my own status effects" to use only the manual enemy settings.'
        : 'ASSUMPTION: statuses you apply yourself are counted at their steady state (no enemy health set, so no fight length). Turn off "Count my own status effects" to use only the manual enemy settings.');
    }
    return r;
  }

  function round(v) { return Math.round(v * 1000) / 1000; }
  function mapRound(o) { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = typeof v === 'number' ? round(v) : v; return r; }

  WF.engine = { calculate, calcCore, selfStatusState, findWeapon, findMod, findArcane, modsFor, compatibleCompats, quantize, expectedCrit, variantRoot };
})();
