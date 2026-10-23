'use strict';
// Static game data: buildings, troops, limits, names.

const GRID = 44;          // map is GRID x GRID tiles
const BORDER = 2;         // outer tiles where nothing can be built
const TW = 64, TH = 32;   // isometric tile size in world pixels
const MAX_TH = 6;

// Build parallel arrays into level objects.
function mkLevels(spec) {
  const n = spec.cost.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const lv = {};
    for (const k in spec) lv[k] = Array.isArray(spec[k]) ? spec[k][i] : spec[k];
    out.push(lv);
  }
  return out;
}

const BUILDINGS = {
  townhall: {
    name: 'Town Hall', size: 4, cat: 'other', res: 'gold',
    desc: 'The heart of your village. Upgrading it unlocks new buildings and more of them.',
    levels: mkLevels({
      cost: [0, 1000, 4000, 25000, 100000, 400000],
      time: [0, 10, 60, 300, 900, 1800],
      hp: [1500, 1600, 1850, 2100, 2400, 2800],
      cap: [1000, 1500, 2000, 2500, 3000, 3500],
      th: [0, 1, 2, 3, 4, 5],
    }),
  },
  builderhut: {
    name: "Builder's Hut", size: 2, cat: 'other', res: 'gems',
    desc: 'Each hut houses a builder. More builders let you construct more at once.',
    levels: mkLevels({ cost: [0], time: [0], hp: [250], th: [1] }),
  },
  goldmine: {
    name: 'Gold Mine', size: 3, cat: 'resource', res: 'elixir', produces: 'gold',
    desc: 'Mines gold from the earth. Tap it to collect.',
    levels: mkLevels({
      cost: [150, 300, 700, 1400, 3000, 7000],
      time: [10, 30, 60, 180, 300, 600],
      hp: [400, 440, 480, 520, 560, 600],
      rate: [20, 40, 60, 80, 100, 130], // per minute
      cap: [500, 1000, 1500, 2500, 10000, 20000],
      th: [1, 1, 2, 2, 3, 3],
    }),
  },
  elixircollector: {
    name: 'Elixir Collector', size: 3, cat: 'resource', res: 'gold', produces: 'elixir',
    desc: 'Pumps elixir from ley lines under your village. Tap it to collect.',
    levels: mkLevels({
      cost: [150, 300, 700, 1400, 3000, 7000],
      time: [10, 30, 60, 180, 300, 600],
      hp: [400, 440, 480, 520, 560, 600],
      rate: [20, 40, 60, 80, 100, 130],
      cap: [500, 1000, 1500, 2500, 10000, 20000],
      th: [1, 1, 2, 2, 3, 3],
    }),
  },
  goldstorage: {
    name: 'Gold Storage', size: 3, cat: 'resource', res: 'elixir', stores: 'gold',
    desc: 'Stores your precious gold. Upgrade it to store more.',
    levels: mkLevels({
      cost: [300, 750, 1500, 3000, 6000, 12000],
      time: [10, 60, 180, 300, 600, 900],
      hp: [400, 600, 800, 1000, 1200, 1500],
      cap: [1500, 3000, 6000, 12000, 25000, 50000],
      th: [1, 2, 2, 3, 3, 4],
    }),
  },
  elixirstorage: {
    name: 'Elixir Storage', size: 3, cat: 'resource', res: 'gold', stores: 'elixir',
    desc: 'Stores elixir. Upgrade it to store more.',
    levels: mkLevels({
      cost: [300, 750, 1500, 3000, 6000, 12000],
      time: [10, 60, 180, 300, 600, 900],
      hp: [400, 600, 800, 1000, 1200, 1500],
      cap: [1500, 3000, 6000, 12000, 25000, 50000],
      th: [1, 2, 2, 3, 3, 4],
    }),
  },
  barracks: {
    name: 'Barracks', size: 3, cat: 'army', res: 'elixir',
    desc: 'Trains troops. Upgrade to unlock new troop types and train faster.',
    levels: mkLevels({
      cost: [100, 500, 2500, 5000, 10000],
      time: [10, 60, 180, 300, 600],
      hp: [250, 290, 330, 370, 420],
      th: [1, 1, 2, 3, 4],
    }),
  },
  armycamp: {
    name: 'Army Camp', size: 4, cat: 'army', res: 'elixir',
    desc: 'Your trained troops rest here. More camps hold a bigger army.',
    levels: mkLevels({
      cost: [200, 2000, 10000, 50000],
      time: [10, 120, 600, 1200],
      hp: [250, 270, 290, 310],
      cap: [20, 30, 35, 40],
      th: [1, 2, 3, 4],
    }),
  },
  clancastle: {
    name: 'Clan Castle', size: 3, cat: 'army', res: 'gold',
    desc: 'Rebuild it to join a clan. Troops donated by clanmates wait here and join your attacks.',
    levels: mkLevels({
      cost: [3000, 25000, 100000],
      time: [10, 600, 1800],
      hp: [1000, 1400, 2000],
      cap: [10, 15, 20],
      th: [2, 4, 6],
    }),
  },
  cannon: {
    name: 'Cannon', size: 3, cat: 'defense', res: 'gold',
    desc: 'Packs a punch against ground troops.',
    range: 9, rate: 0.8,
    levels: mkLevels({
      cost: [250, 1000, 4000, 16000, 50000, 100000],
      time: [10, 60, 300, 600, 1200, 1800],
      hp: [420, 470, 520, 570, 620, 670],
      dps: [9, 11, 15, 19, 25, 31],
      th: [1, 1, 2, 3, 4, 5],
    }),
  },
  archertower: {
    name: 'Archer Tower', size: 3, cat: 'defense', res: 'gold',
    desc: 'Archers rain arrows on anything that comes in range.',
    range: 10, rate: 0.5,
    levels: mkLevels({
      cost: [1000, 2000, 5000, 20000, 80000, 180000],
      time: [15, 90, 300, 900, 1500, 2400],
      hp: [380, 420, 460, 500, 540, 580],
      dps: [11, 15, 19, 25, 30, 35],
      th: [2, 2, 3, 4, 5, 6],
    }),
  },
  mortar: {
    name: 'Mortar', size: 3, cat: 'defense', res: 'gold',
    desc: 'Lobs explosive shells that splash groups of troops. Cannot hit troops right next to it.',
    range: 11, minRange: 4, rate: 5, splash: 1.5,
    levels: mkLevels({
      cost: [8000, 32000, 120000, 400000],
      time: [300, 900, 1800, 3600],
      hp: [400, 450, 500, 550],
      dps: [4, 5, 6, 7],
      th: [3, 4, 5, 6],
    }),
  },
  wall: {
    name: 'Wall', size: 1, cat: 'defense', res: 'gold',
    desc: 'Walls keep enemy troops at bay.',
    levels: mkLevels({
      cost: [50, 1000, 5000, 10000, 20000, 40000],
      time: [0, 0, 0, 0, 0, 0],
      hp: [300, 500, 700, 900, 1400, 2000],
      th: [2, 2, 3, 4, 5, 6],
    }),
  },
};

// How many of each building a Town Hall level allows (index = TH level).
const LIMITS = {
  townhall: [1, 1, 1, 1, 1, 1, 1],
  builderhut: [0, 5, 5, 5, 5, 5, 5],
  goldmine: [0, 1, 2, 3, 4, 5, 6],
  elixircollector: [0, 1, 2, 3, 4, 5, 6],
  goldstorage: [0, 1, 1, 2, 2, 2, 2],
  elixirstorage: [0, 1, 1, 2, 2, 2, 2],
  barracks: [0, 1, 2, 2, 3, 3, 3],
  armycamp: [0, 1, 1, 2, 2, 3, 3],
  clancastle: [1, 1, 1, 1, 1, 1, 1],
  cannon: [0, 2, 2, 2, 2, 3, 3],
  archertower: [0, 0, 1, 1, 2, 3, 3],
  mortar: [0, 0, 0, 1, 1, 1, 2],
  wall: [0, 0, 25, 50, 75, 100, 125],
};

const BUILDER_HUT_GEMS = [0, 250, 500, 1000, 2000];

const SHOP = {
  Resources: ['goldmine', 'elixircollector', 'goldstorage', 'elixirstorage', 'builderhut'],
  Army: ['barracks', 'armycamp'],
  Defenses: ['cannon', 'archertower', 'mortar', 'wall'],
};

const TROOPS = {
  barbarian: {
    name: 'Barbarian', housing: 1, cost: 25, time: 5, hp: 45, dmg: 8, rate: 1, range: 0.4,
    speed: 1.6, pref: null, barracks: 1, color: '#f3c13a',
    desc: 'A fearless warrior with a mighty mustache.',
  },
  archer: {
    name: 'Archer', housing: 1, cost: 50, time: 6, hp: 20, dmg: 7, rate: 1, range: 3.5,
    speed: 1.8, pref: null, barracks: 2, color: '#e0418f', ranged: true,
    desc: 'Attacks from a distance, even over walls.',
  },
  goblin: {
    name: 'Goblin', housing: 1, cost: 25, time: 7, hp: 25, dmg: 11, rate: 1, range: 0.4,
    speed: 3.2, pref: 'resource', resMult: 2, barracks: 3, color: '#5cbf2a',
    desc: 'Fast and greedy. Heads for resources and deals double damage to them.',
  },
  giant: {
    name: 'Giant', housing: 5, cost: 250, time: 30, hp: 300, dmg: 22, rate: 2, range: 1,
    speed: 1.2, pref: 'defense', barracks: 4, color: '#e2843a',
    desc: 'Big and tough. Targets defenses first.',
  },
  wallbreaker: {
    name: 'Wall Breaker', housing: 2, cost: 600, time: 15, hp: 20, dmg: 12, rate: 1, range: 0.6,
    speed: 2.4, pref: 'wall', wallMult: 40, splash: 1.5, suicide: true, barracks: 5, color: '#e8e8e8',
    desc: 'Blows up walls with a single suicidal blast.',
  },
};

// Goblin campaign: single player maps.
const CAMPAIGN = [
  { name: 'Goblin Gauntlet', th: 1, seed: 11, gold: 500, elixir: 500 },
  { name: 'Rat Valley', th: 1, seed: 23, gold: 800, elixir: 800 },
  { name: 'Goblin Forest', th: 2, seed: 37, gold: 1500, elixir: 1500 },
  { name: 'Gobbotown', th: 2, seed: 41, gold: 2500, elixir: 2500 },
  { name: 'Fool\'s Gold', th: 3, seed: 53, gold: 5000, elixir: 4000 },
  { name: 'Bouncy Castle', th: 3, seed: 67, gold: 8000, elixir: 8000 },
  { name: 'Goblin Outpost', th: 4, seed: 71, gold: 15000, elixir: 15000 },
  { name: 'Watchtower', th: 4, seed: 83, gold: 25000, elixir: 25000 },
  { name: 'Fort Knobs', th: 5, seed: 97, gold: 50000, elixir: 50000 },
  { name: 'Goblin King\'s Keep', th: 6, seed: 113, gold: 100000, elixir: 100000 },
];

const BOT_NAMES = [
  'Kragmor', 'Lady Ivy', 'Grumblebeard', 'Pixel', 'Sir Clank', 'Moonfire', 'Tusk', 'Bramble',
  'Zephyr', 'Ogrim', 'Nyx', 'Hammerfall', 'Thistle', 'Rook', 'Sable', 'Juniper', 'Vex',
  'Copperpot', 'Wren', 'Boulder', 'Fizzwick', 'Marrow', 'Dusk', 'Ember', 'Gale', 'Hollow',
  'Ironjaw', 'Kestrel', 'Larkspur', 'Mungo', 'Nettle', 'Oakhart', 'Pip', 'Quill', 'Rumble',
  'Sprocket', 'Tinder', 'Umber', 'Vale', 'Whisk', 'Yarrow', 'Zinnia', 'Bolt', 'Cinder',
  'Drift', 'Flint', 'Grit', 'Haze', 'Jinx', 'Knave',
];

const CLAN_NAMES = [
  'Iron Wolves', 'Goblin Slayers', 'Dragon Riders', 'The Elixir Pumps', 'Mustache Legion',
  'Stormwall', 'Night Owls', 'Golden Hammers', 'Royal Barbs', 'Pekka Party',
];

const CHAT_LINES = [
  'gg everyone!', 'anyone need troops?', 'just upgraded my town hall 🎉', 'war soon?',
  'who has archers to spare?', 'nice attack!', 'saving up for mortars', 'brb farming goblins',
  'walls walls walls...', 'remember to use both war attacks!', 'giants + wall breakers ftw',
  'just got 3 stars!', 'my builders are all busy lol', 'hello clan 👋', 'thanks for the troops!',
  'who wants to push trophies tonight?', 'elixir storage full again',
];

const CAPITAL_LEVELS = [
  { cost: 0, district: 'Capital Peak' },
  { cost: 5000, district: "Barbarian Camp" },
  { cost: 20000, district: 'Wizard Valley' },
  { cost: 60000, district: 'Balloon Lagoon' },
  { cost: 150000, district: "Builder's Workshop" },
  { cost: 400000, district: 'Dragon Cliffs' },
];
