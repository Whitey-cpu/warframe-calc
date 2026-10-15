/*
 * Incarnon evolution perk presets. The game data set does not include these, so each weapon is
 * hand-entered from its WARFRAME Wiki page (source on each entry). Add more weapons the same way.
 *
 * Effect stats are the engine's: damage, directDamage, critChance, critDamage, statusChance, multishot,
 * fireRate, magazine, reloadSpeed, headshot, element, and flat base changes: baseDamageFlat (per pellet),
 * baseCritChance, baseCritMult, baseStatus, baseMultishot.
 * attack: regex; the perk only applies when the selected attack's name matches (e.g. Incarnon Form).
 * modeled: false marks perks with no damage effect, or effects the engine cannot model; they are listed but do nothing.
 */
(function () {
  const WF = (typeof window !== 'undefined') ? (window.WF = window.WF || {}) : (global.WF = global.WF || {});

  WF.INCARNON = [
    {
      weapons: ['Soma', 'Soma Prime'],
      source: 'https://wiki.warframe.com/w/Soma_Incarnon_Genesis',
      // Base stats the data set lacks for the Incarnon attack ("8 base Multishot" per the wiki)
      forms: [{ attack: 'Incarnon', multishot: 8 }],
      tiers: [
        { tier: 'II', perks: [
          { name: 'Fortress Salvo', text: 'Base Damage +12 per pellet. Punch Through +4 vs Armor over 450.', attack: 'Incarnon', effects: [{ stat: 'baseDamageFlat', value: 12 }] },
          { name: 'Fortifying Bloodshed', text: 'Base Damage +10 per pellet. On Slash status kill: +100 Overshield.', attack: 'Incarnon', effects: [{ stat: 'baseDamageFlat', value: 10 }] }
        ] },
        { tier: 'III', perks: [
          { name: 'Kinetic Battle', text: '-50% Weapon Recoil.', modeled: false, effects: [] },
          { name: 'Practiced Grip', text: 'Accuracy +50%.', modeled: false, effects: [] },
          { name: 'Rapid Reinforcement', text: 'Reload Speed +50%.', effects: [{ stat: 'reloadSpeed', value: 0.5 }] }
        ] },
        { tier: 'IV', perks: [
          { name: 'Fresh Havoc', text: 'On reload from empty: Base Damage +6 per pellet, stacks 2x.', attack: 'Incarnon', effects: [{ stat: 'baseDamageFlat', value: 6, cond: { trigger: 'On reload from empty', maxStacks: 2 } }] },
          { name: 'Fatal Affliction', text: 'Direct Damage +40% per Status type affecting the target.', effects: [{ stat: 'directDamage', value: 0.4, per: 'Status Type affecting the target' }] },
          { name: 'Zeroed In', text: 'Base Critical Damage Multiplier +0.6x.', effects: [{ stat: 'baseCritMult', value: 0.6 }] }
        ] }
      ]
    },
    {
      weapons: ['Torid'],
      source: 'https://wiki.warframe.com/w/Torid',
      tiers: [
        { tier: 'II', perks: [
          { name: 'Final Fusillade', text: '+51 base damage. +3 multishot on the last shot in the magazine.', effects: [{ stat: 'baseDamageFlat', value: 51 }, { stat: 'lastShotMultishotFlat', value: 3, attack: '^(?!Incarnon)' }] },
          { name: 'Plentiful Mayhem', text: '+31 base damage. Multishot consumes ammo from capacity and gives +60% damage (counted as additive with Serration-type mods, ASSUMPTION; ammo use not modeled).', effects: [{ stat: 'baseDamageFlat', value: 31 }, { stat: 'damage', value: 0.6 }] }
        ] },
        { tier: 'III', perks: [
          { name: 'Swift Deliverance', text: '+50% projectile speed.', modeled: false, effects: [] },
          { name: 'Renewed Horror', text: 'Lingering damage field duration doubles on the first shot after reloading from empty (modeled as once per magazine).', effects: [{ stat: 'lingeringFirstShotDouble', value: 1 }] },
          { name: 'Extended Volley', text: '+9 base magazine capacity (not the Incarnon magazine).', attack: '^(?!Incarnon)', effects: [{ stat: 'baseMagazineFlat', value: 9 }] }
        ] },
        { tier: 'IV', perks: [
          { name: "Commodore's Fortune", text: '+20% base critical chance.', effects: [{ stat: 'baseCritChance', value: 0.2 }] },
          { name: "Survivor's Edge", text: '+15% base critical chance and +15% base status chance.', effects: [{ stat: 'baseCritChance', value: 0.15 }, { stat: 'baseStatus', value: 0.15 }] },
          { name: 'Elemental Balance', text: '+34% base status chance.', effects: [{ stat: 'baseStatus', value: 0.34 }] }
        ] }
      ]
    },
    {
      weapons: ['Laetum'],
      source: 'https://wiki.warframe.com/w/Laetum',
      tiers: [
        { tier: 'II', perks: [
          { name: "Marksman's Hand", text: '-40% Recoil.', modeled: false, effects: [] },
          { name: 'Rapid Wrath', text: '+20% Fire Rate.', effects: [{ stat: 'fireRate', value: 0.2 }] },
          { name: "Raptor's Chase", text: '+50% Movement Speed while Aiming.', modeled: false, effects: [] }
        ] },
        { tier: 'III', perks: [
          { name: 'Lethal Rearmament', text: 'On Headshot: +30% Reload Speed for 12s, stacks 3x.', effects: [{ stat: 'reloadSpeed', value: 0.3, cond: { trigger: 'On Headshot', maxStacks: 3 } }] },
          { name: 'Awakened Readiness', text: '30% magazine reloaded per second while holstered (normal form).', modeled: false, effects: [] },
          { name: 'Feather of Justice', text: '60% Ammo Efficiency while aim gliding or sliding.', modeled: false, effects: [] }
        ] },
        { tier: 'IV', perks: [
          { name: 'Caput Mortuum', text: '+50% Headshot damage.', effects: [{ stat: 'headshot', value: 0.5 }] },
          { name: 'Incarnon Efficiency', text: 'Headshots build +50% more Transmutation charge.', modeled: false, effects: [] },
          { name: 'Elemental Excess', text: '+20% Status Chance, -10% Critical Chance (applied to base, ASSUMPTION).', effects: [{ stat: 'baseStatus', value: 0.2 }, { stat: 'baseCritChance', value: -0.1 }] }
        ] },
        { tier: 'V', perks: [
          { name: 'Devouring Attrition', text: '50% chance for +2000% damage on non-critical hits.', modeled: false, effects: [] },
          { name: "Reaper's Plenty", text: 'On Headshot: +40% Ammo Efficiency for 6s.', modeled: false, effects: [] },
          { name: 'Overwhelming Attrition', text: 'Non-crit, non-status hits: +400% damage for 10s, stacks 3x.', modeled: false, effects: [] }
        ] }
      ]
    }
  ];

  // ---------- presets generated from the wiki scrape (data.incarnon, see scripts/scrape-web.js) ----------
  // Lines are turned into engine effects; lines with no damage effect (range, recoil, ammo...) are listed but ignored,
  // and anything else lands in `unparsed` so the UI can show what is not modeled.
  const TIER = { EVO2: 'II', EVO3: 'III', EVO4: 'IV', EVO5: 'V' };
  const NO_DAMAGE = /\b(Range|Recoil|Projectile Speed|Projectile Flight|Zoom|Accuracy|Ammo|Combo|Sprint|Movement|Parkour|Bullet Jump|Heavy Attack (?:Efficiency|Wind ?Up)|Slam|Holster|Transmutation|Punch Through|Heal|Health|Energy|Overshield|Parry|Follow Through|Slide|Ricochet|Noise|Magazine Reloaded|Block|Lifesteal|Charge Rate|Charge Speed|Mobility|Aim Glide|Wall Latch)\b/i;
  const BASE_PERKS = /^(Commodore's Fortune|Survivor's Edge|Elemental Balance|Critical Parallel|Absolute Valor|Absolute Dominion|Subtle Force|Zeroed In|Deathtrap Trigger|Critical Forte)$/i;

  function valuesFor(perk, variant) {
    const v = perk.values || {};
    const raw = v[variant] || Object.values(v)[0] || '';
    const out = {};
    for (const m of raw.matchAll(/\b([XYZ])\s*=\s*\+?(-?\d+(?:\.\d+)?)\s*(%|x)?/g)) out[m[1]] = { n: m[2], u: m[3] || '' };
    return { map: out, raw };
  }
  function attackFilter(line) {
    if (/for Incarnon Form/i.test(line)) return 'Incarnon';
    if (/per projectile|normal (?:mode|form)/i.test(line)) return '^(?!Incarnon)';
    return null;
  }
  function parsePerkLine(line, perkName) {
    const t = line.replace(/\s+/g, ' ').trim()
      .replace(/,\s*resets on [^.]*\.?$/i, '.')                       // "+20% Damage, resets on Reload"
      .replace(/^(Increase Base [\w ]+?) to (\+)/i, '$1 by $2');        // "Increase Base Status Chance to +12%" 
    let m;
    const condM = t.match(/^((?:On|With|While|When|After)[^:]*):\s*(.*)$/i);
    const trigger = condM ? condM[1].trim() : null;
    const body = condM ? condM[2] : t;
    const stacksM = body.match(/Stacks? up to (\d+)x/i);
    const cond = trigger ? { trigger, maxStacks: stacksM ? +stacksM[1] : 1 } : null;
    const atk = attackFilter(body);
    const withCond = e => { if (cond) e.cond = cond; if (atk) e.attack = atk; return [e]; };
    const num = s => parseFloat(String(s).replace('+', ''));
    if ((m = body.match(/^Increase (Base )?Damage by \+?(-?\d+(?:\.\d+)?)(%?)/i))) {
      if (m[3] === '%') return withCond({ stat: 'damage', value: num(m[2]) / 100 });
      return withCond({ stat: 'baseDamageFlat', value: num(m[2]), assumed: !m[1] ? 'Treated "Increase Damage by" as a flat base damage increase.' : undefined });
    }
    if ((m = body.match(/^Increase (Base )?Critical Chance by \+?(-?\d+(?:\.\d+)?)%?(?! of)/i)))
      return withCond({ stat: 'baseCritChance', value: num(m[2]) / 100, assumed: !m[1] && !BASE_PERKS.test(perkName) ? 'Treated as a base critical chance increase.' : undefined });
    if ((m = body.match(/^Increase (Base )?Status(?: Chance)? by \+?(-?\d+(?:\.\d+)?)%?(?! of)/i)))
      return withCond({ stat: 'baseStatus', value: num(m[2]) / 100 });
    if ((m = body.match(/^Increase (?:Base )?Critical (?:Damage )?Multiplier by \+?(-?\d+(?:\.\d+)?)x?/i)))
      return withCond({ stat: 'baseCritMult', value: num(m[1]) });
    if ((m = body.match(/^Increase (?:Base )?Magazine Capacity by \+?(\d+)/i)))
      return withCond({ stat: 'baseMagazineFlat', value: num(m[1]), attack: atk || '^(?!Incarnon)' });
    if ((m = body.match(/^\+?(\d+) Base Magazine Capacity/i))) return withCond({ stat: 'baseMagazineFlat', value: num(m[1]), attack: atk || '^(?!Incarnon)' });
    if ((m = body.match(/^\+?(\d+(?:\.\d+)?) (?:Base )?Multishot on (?:last shot in magazine|final magazine burst)/i)))
      return [{ stat: 'lastShotMultishotFlat', value: num(m[1]), attack: '^(?!Incarnon)' }];
    if ((m = body.match(/^\+?(\d+(?:\.\d+)?) Base Multishot/i))) return withCond({ stat: 'baseMultishot', value: num(m[1]) });
    if ((m = body.match(/Multishot consumes ammo directly from (?:Capacity|its magazine)[^.]*?(?:increases Damage by|does) \+?(\d+(?:\.\d+)?)%/i))) {
      const out = [{ stat: 'multishotDamage', value: num(m[1]) / 100 }];
      const ms = body.match(/\+(\d+(?:\.\d+)?)% Multishot/i);
      if (ms) out.push({ stat: 'multishot', value: num(ms[1]) / 100 });
      return out;
    }
    if (/Lingering damage field duration doubles/i.test(body)) return [{ stat: 'lingeringFirstShotDouble', value: 1 }];
    const parsed = WF.parser ? WF.parser.parseStats([trigger ? `${trigger}:\n${body}` : t], { name: perkName }) : { effects: [], unparsed: [t] };
    if (parsed.effects.length) return parsed.effects.map(e => { if (atk && !e.attack) e.attack = atk; if (cond && !e.cond) e.cond = cond; return e; });
    return null;
  }

  function fromWiki(rec, variant) {
    const tiers = [];
    for (const [evo, tier] of Object.entries(TIER)) {
      const t = rec.tiers[evo];
      if (!t) continue;
      tiers.push({ tier, perks: t.perks.map(p => {
        const vals = valuesFor(p, variant);
        const text = p.text.map(l => l.replace(/\+?\b([XYZ])\b(%|x)?/g, (mm, k, unit) => vals.map[k] != null ? `+${vals.map[k].n}${unit || vals.map[k].u}` : mm));
        const effects = []; const unparsed = []; const assumed = [];
        for (const l of text) {
          if (/\b[XYZ]\b/.test(l)) { unparsed.push(l + ' (value missing on the wiki for this variant)'); continue; }
          const e = parsePerkLine(l, p.name);
          if (e) e.forEach(x => { if (x.assumed) assumed.push(x.assumed); delete x.assumed; effects.push(x); });
          else if (!NO_DAMAGE.test(l)) unparsed.push(l);
        }
        return { name: p.name, text: text.join(' '), effects, unparsed, assumed, notes: p.notes || '',
          modeled: effects.length ? (unparsed.length ? 'partial' : true) : false };
      }) });
    }
    return { weapons: [variant], source: rec.source, lastEdited: rec.lastEdited, generated: true, tiers };
  }

  // Hand-checked adjustments applied on top of the generated presets (by weapon root, tier, perk name).
  const PATCH = {
    soma: { forms: [{ attack: 'Incarnon', multishot: 8 }] }
  };

  function variantMatch(rec, name) {
    if (rec.variants.includes(name)) return name;
    const root = rec.weapon.toLowerCase();
    const n = name.toLowerCase().replace(/^(mk1-|prisma |sancti |rakta |synoid |telos |vaykor |dex |kuva |tenet |coda )/, '').replace(/ (prime|wraith|vandal)$/, '');
    return n === root ? (rec.variants[0] || rec.weapon) : null;
  }

  let dataRef = null;
  WF.setIncarnonData = function (data) { dataRef = data; cache.clear(); };
  const cache = new Map();
  WF.incarnonFor = function (weaponName, data) {
    const hand = WF.INCARNON.find(p => p.weapons.includes(weaponName)) || null;
    const d = data || dataRef || (typeof window !== 'undefined' ? window.WF_DATA : null);
    if (!d || !d.incarnon) return hand;   // hand-entered presets are the fallback when the wiki scrape is missing
    const key = weaponName;
    if (cache.has(key)) return cache.get(key);
    let preset = null;
    for (const rec of d.incarnon) {
      const v = variantMatch(rec, weaponName);
      if (!v) continue;
      // use the exact variant column when the wiki has one for this weapon, otherwise the base weapon's column
      preset = fromWiki(rec, rec.variants.includes(weaponName) ? weaponName : v);
      preset.weapons = [weaponName];
      const patch = PATCH[rec.weapon.toLowerCase()];
      if (patch && patch.forms) preset.forms = patch.forms;
      break;
    }
    if (!preset) preset = hand;
    cache.set(key, preset);
    return preset;
  };
  WF.incarnonParseLine = parsePerkLine;
})();
