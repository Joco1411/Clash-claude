'use strict';
// Persistent home village state and economy logic.

const SAVE_KEY = 'clashclaude_save_v1';

const OBSTACLES = {
  tree: { name: 'Tree', size: 2, res: 'elixir', cost: 100 },
  bush: { name: 'Bush', size: 2, res: 'elixir', cost: 50 },
  rock: { name: 'Stone', size: 2, res: 'gold', cost: 150 },
  bigrock: { name: 'Big Stone', size: 3, res: 'gold', cost: 300 },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let S = null; // the save state

function now() { return Date.now(); }

function newGame() {
  const s = {
    version: 1,
    name: 'Chief',
    xp: 0, level: 1, trophies: 0,
    gold: 750, elixir: 750, gems: 500,
    buildings: [], obstacles: [],
    army: {}, queue: [], trainEnd: 0,
    cc: {},
    tutorial: 0,
    campaign: [],
    clan: null,
    sound: true,
    nextId: 1,
    created: now(),
    stats: { attacksWon: 0, donated: 0, received: 0 },
  };
  S = s;
  addBuildingRaw('townhall', 20, 20, 1);
  addBuildingRaw('builderhut', 25, 17, 1);
  const cc = addBuildingRaw('clancastle', 14, 25, 0);
  cc.ruin = true;
  // Scatter obstacles like the start of a fresh village.
  const rnd = mulberry32(1234);
  const types = ['tree', 'tree', 'bush', 'rock', 'rock', 'bigrock', 'tree', 'bush'];
  let tries = 0;
  while (s.obstacles.length < 26 && tries++ < 2000) {
    const t = types[Math.floor(rnd() * types.length)];
    const size = OBSTACLES[t].size;
    const x = BORDER + Math.floor(rnd() * (GRID - BORDER * 2 - size));
    const y = BORDER + Math.floor(rnd() * (GRID - BORDER * 2 - size));
    // keep the area around the Town Hall clear
    if (Math.abs(x - 21) < 7 && Math.abs(y - 21) < 7) continue;
    if (!isFree(x - 1, y - 1, size + 2, null)) continue;
    s.obstacles.push({ id: s.nextId++, type: t, x, y, size });
  }
  return s;
}

function addBuildingRaw(type, x, y, level) {
  const b = { id: S.nextId++, type, x, y, level, upgrade: null, lastCollect: now() };
  S.buildings.push(b);
  return b;
}

function saveGame() {
  if (!S) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { S = JSON.parse(raw); return true; }
  } catch (e) { /* ignore */ }
  return false;
}

function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  newGame();
}

// ---------- queries ----------
function bDef(b) { return BUILDINGS[b.type]; }
function lvData(b) { return b.level > 0 ? BUILDINGS[b.type].levels[b.level - 1] : null; }
function nextLv(b) { return BUILDINGS[b.type].levels[b.level] || null; }
function sizeOf(b) { return b.size || BUILDINGS[b.type].size; }
function townHall() { return S.buildings.find(b => b.type === 'townhall'); }
function thLevel() { const t = townHall(); return t ? Math.max(1, t.level) : 1; }
function countOf(type) { return S.buildings.filter(b => b.type === type).length; }
function limitOf(type, th) { return (LIMITS[type] || [])[th == null ? thLevel() : th] || 0; }
function maxLevelFor(type, th) {
  const lv = BUILDINGS[type].levels;
  let m = 0;
  for (let i = 0; i < lv.length; i++) if (lv[i].th <= th) m = i + 1;
  return m;
}
function functional(b) { return b.level > 0 && !b.ruin; }

function storageCap(res) {
  let cap = 0;
  for (const b of S.buildings) {
    if (!functional(b)) continue;
    const d = lvData(b);
    if (b.type === 'townhall') cap += d.cap;
    else if (bDef(b).stores === res) cap += d.cap;
  }
  return cap;
}

function armyCap() {
  let c = 0;
  for (const b of S.buildings) if (b.type === 'armycamp' && functional(b)) c += lvData(b).cap;
  return c;
}
function ccCap() {
  const b = S.buildings.find(x => x.type === 'clancastle');
  return b && functional(b) ? lvData(b).cap : 0;
}
function housingOf(map) {
  let h = 0;
  for (const t in map) h += (TROOPS[t] ? TROOPS[t].housing : 0) * map[t];
  return h;
}
function armyHousing() { return housingOf(S.army); }
function queueHousing() { return S.queue.reduce((a, t) => a + TROOPS[t].housing, 0); }
function maxBarracksLevel() {
  let m = 0;
  for (const b of S.buildings) if (b.type === 'barracks' && b.level > m) m = b.level;
  return m;
}
function activeBarracks() {
  return S.buildings.filter(b => b.type === 'barracks' && b.level > 0 && !b.upgrade).length;
}
function totalBuilders() { return S.buildings.filter(b => b.type === 'builderhut' && b.level > 0).length; }
function busyBuilders() { return S.buildings.filter(b => b.upgrade).length; }
function freeBuilders() { return totalBuilders() - busyBuilders(); }

// ---------- placement ----------
function occupiedBy(x, y, ignoreId) {
  for (const b of S.buildings) {
    if (b.id === ignoreId) continue;
    const s = sizeOf(b);
    if (x >= b.x && x < b.x + s && y >= b.y && y < b.y + s) return b;
  }
  for (const o of S.obstacles) {
    if (o.id === ignoreId) continue;
    if (x >= o.x && x < o.x + o.size && y >= o.y && y < o.y + o.size) return o;
  }
  return null;
}

function isFree(x, y, size, ignoreId) {
  if (x < BORDER || y < BORDER || x + size > GRID - BORDER || y + size > GRID - BORDER) return false;
  for (const b of S.buildings) {
    if (b.id === ignoreId) continue;
    const s = sizeOf(b);
    if (x < b.x + s && x + size > b.x && y < b.y + s && y + size > b.y) return false;
  }
  for (const o of S.obstacles) {
    if (o.id === ignoreId) continue;
    if (x < o.x + o.size && x + size > o.x && y < o.y + o.size && y + size > o.y) return false;
  }
  return true;
}

function findFreeSpot(size, nearX, nearY) {
  let best = null, bd = 1e9;
  for (let y = BORDER; y <= GRID - BORDER - size; y++) {
    for (let x = BORDER; x <= GRID - BORDER - size; x++) {
      const d = Math.hypot(x - nearX, y - nearY);
      if (d < bd && isFree(x, y, size, null)) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

// ---------- resources ----------
function resOf(res) { return S[res]; }
function addRes(res, amt) {
  if (res === 'gems') { S.gems += amt; return amt; }
  const cap = storageCap(res);
  const before = S[res];
  S[res] = Math.max(0, Math.min(cap, S[res] + amt));
  if (amt < 0) S[res] = Math.max(0, before + amt);
  return S[res] - before;
}
function canAfford(res, amt) { return S[res] >= amt; }
function spend(res, amt) {
  if (S[res] < amt) return false;
  S[res] -= amt;
  return true;
}
function gemsForTime(sec) {
  if (sec <= 0) return 0;
  if (sec < 60) return 1;
  if (sec < 3600) return Math.ceil(1 + (sec - 60) / 3540 * 19);
  return Math.ceil(20 + (sec - 3600) / 82800 * 240);
}
function gemsForRes(amt) { return amt <= 0 ? 0 : Math.max(1, Math.ceil(Math.pow(amt, 0.75) / 6)); }

function addXP(n) {
  S.xp += n;
  let need = xpNeeded(S.level);
  while (S.xp >= need) {
    S.xp -= need; S.level++;
    need = xpNeeded(S.level);
    if (typeof UI !== 'undefined') UI.toast('Level up! You are now level ' + S.level);
  }
}
function xpNeeded(level) { return 30 + level * 20; }

// ---------- building actions ----------
// Returns error string or null.
function buildError(type) {
  const th = thLevel();
  if (type === 'builderhut') {
    const n = countOf('builderhut');
    if (n >= 5) return 'All builder huts built';
    return null;
  }
  if (countOf(type) >= limitOf(type, th)) {
    const nextTh = (LIMITS[type] || []).findIndex((v, i) => i > th && v > countOf(type));
    return nextTh > 0 ? 'Requires Town Hall level ' + nextTh : 'Maximum number reached';
  }
  const cost = BUILDINGS[type].levels[0].cost;
  if (BUILDINGS[type].levels[0].time > 0 && freeBuilders() <= 0) return 'All builders are busy';
  return null;
}

function buildCost(type) {
  if (type === 'builderhut') return { res: 'gems', amt: BUILDER_HUT_GEMS[countOf('builderhut')] || 0 };
  return { res: BUILDINGS[type].res, amt: BUILDINGS[type].levels[0].cost };
}

function placeNewBuilding(type, x, y) {
  const err = buildError(type);
  if (err) return err;
  const size = BUILDINGS[type].size;
  if (!isFree(x, y, size, null)) return 'Cannot place there';
  const c = buildCost(type);
  if (S.tutorialFree !== type && !spend(c.res, c.amt)) return 'Not enough ' + c.res;
  const b = addBuildingRaw(type, x, y, 0);
  const t = BUILDINGS[type].levels[0].time;
  if (S.tutorialFree === type || t <= 0 || type === 'builderhut') {
    S.tutorialFree = null;
    completeUpgrade(b, true);
  } else {
    b.upgrade = { start: now(), end: now() + t * 1000 };
  }
  Sound.play('build');
  return b;
}

function upgradeError(b) {
  const n = nextLv(b);
  if (!n) return 'Maximum level reached';
  if (b.upgrade) return 'Already upgrading';
  if (b.type !== 'townhall' && n.th > thLevel()) return 'Requires Town Hall level ' + n.th;
  if (b.type === 'townhall' && b.level >= MAX_TH) return 'Maximum level reached';
  if (n.time > 0 && freeBuilders() <= 0) return 'All builders are busy';
  if (b.type === 'builderhut') return 'Builder huts cannot be upgraded';
  return null;
}

function startUpgrade(b) {
  const err = upgradeError(b);
  if (err) return err;
  const n = nextLv(b);
  const res = bDef(b).res;
  if (!spend(res, n.cost)) return 'Not enough ' + res;
  if (bDef(b).produces) collect(b, true);
  if (n.time <= 0) { completeUpgrade(b, true); }
  else b.upgrade = { start: now(), end: now() + n.time * 1000 };
  Sound.play('build');
  return null;
}

function completeUpgrade(b, silent) {
  const n = nextLv(b);
  const t = n ? n.time : 0;
  b.level++;
  b.upgrade = null;
  b.ruin = false;
  b.lastCollect = now();
  addXP(Math.max(1, Math.floor(Math.sqrt(t))));
  if (!silent && typeof UI !== 'undefined') {
    UI.toast(bDef(b).name + ' is now level ' + b.level + '!');
    Sound.play('done');
  }
  if (typeof UI !== 'undefined') UI.onBuildingComplete(b);
}

function finishNowCost(b) {
  if (!b.upgrade) return 0;
  return gemsForTime(Math.ceil((b.upgrade.end - now()) / 1000));
}
function finishNow(b) {
  const g = finishNowCost(b);
  if (S.gems < g) return 'Not enough gems';
  S.gems -= g;
  completeUpgrade(b, false);
  return null;
}
function cancelUpgrade(b) {
  if (!b.upgrade) return;
  if (b.level === 0) {
    const c = buildCost(b.type);
    addRes(c.res, Math.floor(c.amt / 2));
    S.buildings = S.buildings.filter(x => x !== b);
  } else {
    const n = nextLv(b);
    addRes(bDef(b).res, Math.floor(n.cost / 2));
    b.upgrade = null;
    b.lastCollect = now();
  }
}

function removeObstacle(o) {
  const d = OBSTACLES[o.type];
  if (!spend(d.res, d.cost)) return 'Not enough ' + d.res;
  S.obstacles = S.obstacles.filter(x => x !== o);
  const gems = Math.floor(Math.random() * 6);
  S.gems += gems;
  addXP(1);
  Sound.play('build');
  return gems;
}

// ---------- production ----------
function storedIn(b) {
  const d = bDef(b);
  if (!d.produces || !functional(b) || b.upgrade) return 0;
  const lv = lvData(b);
  return Math.min(lv.cap, Math.floor((now() - b.lastCollect) / 60000 * lv.rate));
}

function collect(b, silent) {
  const d = bDef(b);
  if (!d.produces) return 0;
  const amt = storedIn(b);
  if (amt <= 0) return 0;
  const got = addRes(d.produces, amt);
  const left = amt - got;
  const lv = lvData(b);
  b.lastCollect = now() - (left > 0 ? left / lv.rate * 60000 : 0);
  if (!silent && typeof UI !== 'undefined') {
    if (got > 0) { UI.floatText(b, '+' + got, d.produces); Sound.play('collect'); }
    else UI.toast(d.produces[0].toUpperCase() + d.produces.slice(1) + ' storage is full!');
  }
  return got;
}

// ---------- training ----------
// Troops level up with the Town Hall (stands in for a laboratory).
function troopLevel() { return thLevel(); }
function troopMult(level) { return 1 + 0.2 * ((level || troopLevel()) - 1); }

function unlockedTroops() {
  const m = maxBarracksLevel();
  return Object.keys(TROOPS).filter(t => TROOPS[t].barracks <= m);
}
function trainError(type) {
  const t = TROOPS[type];
  if (t.barracks > maxBarracksLevel()) return 'Requires Barracks level ' + t.barracks;
  if (armyHousing() + queueHousing() + t.housing > armyCap()) return 'Army camps are full';
  if (S.elixir < t.cost) return 'Not enough elixir';
  return null;
}
function queueTroop(type) {
  const err = trainError(type);
  if (err) return err;
  spend('elixir', TROOPS[type].cost);
  S.queue.push(type);
  if (S.queue.length === 1) S.trainEnd = 0;
  return null;
}
function unqueueTroop(type) {
  const i = S.queue.lastIndexOf(type);
  if (i < 0) return;
  S.queue.splice(i, 1);
  addRes('elixir', TROOPS[type].cost);
  if (i === 0) S.trainEnd = 0;
}
function finishTrainingCost() {
  let sec = 0;
  for (const t of S.queue) sec += TROOPS[t].time;
  return gemsForTime(sec / Math.max(1, activeBarracks()));
}
function finishTrainingNow() {
  const g = finishTrainingCost();
  if (S.gems < g) return 'Not enough gems';
  S.gems -= g;
  for (const t of S.queue) S.army[t] = (S.army[t] || 0) + 1;
  S.queue = []; S.trainEnd = 0;
  return null;
}
function processTraining(t) {
  let guard = 0;
  while (S.queue.length && guard++ < 1000) {
    const nb = activeBarracks();
    if (nb <= 0) { S.trainEnd = 0; return; }
    if (!S.trainEnd) S.trainEnd = t + TROOPS[S.queue[0]].time * 1000 / nb;
    if (t < S.trainEnd) return;
    const type = S.queue.shift();
    S.army[type] = (S.army[type] || 0) + 1;
    const prevEnd = S.trainEnd;
    S.trainEnd = S.queue.length ? prevEnd + TROOPS[S.queue[0]].time * 1000 / nb : 0;
  }
}

// ---------- main tick ----------
function villageTick() {
  const t = now();
  for (const b of S.buildings) {
    if (b.upgrade && t >= b.upgrade.end) completeUpgrade(b, false);
  }
  processTraining(t);
  if (typeof Clan !== 'undefined') Clan.tick(t);
}
