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

  WF.incarnonFor = function (weaponName) {
    return WF.INCARNON.find(p => p.weapons.includes(weaponName)) || null;
  };
})();
