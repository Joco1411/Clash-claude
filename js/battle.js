'use strict';
// Battle simulation: enemy village generation, troop AI, defenses, loot and stars.

const WALL_COST = 8;
const DEF_BOOST = 1.4; // defenses hit harder to balance massed troops
const BATTLE_TIME = 180, SCOUT_TIME = 30;

// ---------- enemy village generator ----------
function genVillage(th, seed, totalLoot, list) {
  const rnd = mulberry32(seed);
  const blds = [];
  let nid = 1;
  const occ = new Uint8Array(GRID * GRID);
  const fits = (x, y, s, gap) => {
    gap = gap || 0;
    if (x < BORDER || y < BORDER || x + s > GRID - BORDER || y + s > GRID - BORDER) return false;
    for (let j = y - gap; j < y + s + gap; j++) for (let i = x - gap; i < x + s + gap; i++) {
      if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
      if (occ[j * GRID + i]) return false;
    }
    return true;
  };
  const put = (type, x, y, level) => {
    const s = BUILDINGS[type].size;
    for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) occ[j * GRID + i] = 1;
    const b = { id: nid++, type, x, y, level };
    blds.push(b);
    return b;
  };
  const lvlFor = type => {
    const m = maxLevelFor(type, th);
    return Math.max(1, m - Math.floor(rnd() * 3));
  };
  const placeIn = (type, x0, y0, x1, y1, gap) => {
    const s = BUILDINGS[type].size;
    for (let k = 0; k < 300; k++) {
      const x = x0 + Math.floor(rnd() * Math.max(1, x1 - x0 - s + 1));
      const y = y0 + Math.floor(rnd() * Math.max(1, y1 - y0 - s + 1));
      if (fits(x, y, s, gap)) return put(type, x, y, lvlFor(type));
    }
    return null;
  };
  const th0 = put('townhall', 20, 20, th);
  if (list) { // hand-made tiny village (first goblin map)
    for (const t of list) { const b = placeIn(t, 14, 14, 30, 30, 1); if (b) b.level = 1; }
    th0.level = 1;
    distributeLoot(blds, totalLoot);
    return blds;
  }
  // wall ring(s)
  const nWalls = limitOf('wall', th);
  const wallLv = Math.max(1, maxLevelFor('wall', th) - Math.floor(rnd() * 2));
  let ring = null;
  if (nWalls >= 20) {
    const L = Math.min(15, Math.floor(nWalls / 4) + 1);
    const x0 = 22 - Math.floor(L / 2), y0 = 22 - Math.floor(L / 2);
    ring = { x0, y0, x1: x0 + L - 1, y1: y0 + L - 1 };
  }
  const core = ['cannon', 'archertower', 'mortar', 'goldstorage', 'elixirstorage'];
  const outer = ['goldmine', 'elixircollector', 'barracks', 'armycamp', 'clancastle', 'builderhut'];
  const coreList = [], outerList = [];
  for (const t of core) for (let i = 0; i < limitOf(t, th); i++) coreList.push(t);
  for (const t of outer) {
    const n = t === 'builderhut' ? 2 + Math.floor(rnd() * 2) : t === 'clancastle' ? (th >= 2 ? 1 : 0) : limitOf(t, th);
    for (let i = 0; i < n; i++) outerList.push(t);
  }
  // reserve wall tiles
  if (ring) {
    for (let x = ring.x0; x <= ring.x1; x++) { occ[ring.y0 * GRID + x] = 2; occ[ring.y1 * GRID + x] = 2; }
    for (let y = ring.y0; y <= ring.y1; y++) { occ[y * GRID + ring.x0] = 2; occ[y * GRID + ring.x1] = 2; }
  }
  for (const t of coreList) {
    let b = ring ? placeIn(t, ring.x0 + 1, ring.y0 + 1, ring.x1, ring.y1, 0) : placeIn(t, 15, 15, 30, 30, 1);
    if (!b) outerList.push(t);
  }
  for (const t of outerList) {
    if (!placeIn(t, 6, 6, GRID - 6, GRID - 6, 1)) placeIn(t, BORDER, BORDER, GRID - BORDER, GRID - BORDER, 0);
  }
  if (ring) {
    let used = 0;
    const addWall = (x, y) => { if (used < nWalls) { blds.push({ id: nid++, type: 'wall', x, y, level: wallLv }); used++; } };
    for (let x = ring.x0; x <= ring.x1; x++) { addWall(x, ring.y0); addWall(x, ring.y1); }
    for (let y = ring.y0 + 1; y < ring.y1; y++) { addWall(ring.x0, y); addWall(ring.x1, y); }
    // spare walls hug the town hall
    const tx0 = th0.x - 1, ty0 = th0.y - 1, tx1 = th0.x + 4, ty1 = th0.y + 4;
    const inner = [];
    for (let x = tx0; x <= tx1; x++) { inner.push([x, ty0], [x, ty1]); }
    for (let y = ty0 + 1; y < ty1; y++) { inner.push([tx0, y], [tx1, y]); }
    if (nWalls - used >= inner.length) {
      for (const [x, y] of inner) if (!occ[y * GRID + x] && !blds.some(b => b.type === 'wall' && b.x === x && b.y === y)) addWall(x, y);
    }
  }
  distributeLoot(blds, totalLoot);
  return blds;
}

function distributeLoot(blds, totalLoot) {
  const lootB = blds.filter(b => b.type === 'townhall' || BUILDINGS[b.type].stores || BUILDINGS[b.type].produces);
  for (const res of ['gold', 'elixir']) {
    const total = totalLoot[res] || 0;
    const holders = lootB.filter(b => b.type === 'townhall' || BUILDINGS[b.type].stores === res || BUILDINGS[b.type].produces === res);
    const weights = holders.map(b => b.type === 'townhall' ? 1 : BUILDINGS[b.type].stores ? 3 : 1);
    const sum = weights.reduce((a, w) => a + w, 0) || 1;
    holders.forEach((b, i) => { b['loot_' + res] = Math.floor(total * weights[i] / sum); });
  }
}

function homeVillageCopy() {
  return S.buildings.filter(b => b.level > 0 && !b.ruin).map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level }));
}

// ---------- battle ----------
const Battle = {
  b: null,

  start(opts) {
    const blds = opts.buildings.map(o => {
      const lv = BUILDINGS[o.type].levels[o.level - 1];
      return Object.assign({}, o, {
        hp: lv.hp, maxHp: lv.hp, destroyed: false, cd: Math.random(), target: null,
        cat: BUILDINGS[o.type].cat, size: BUILDINGS[o.type].size,
        angle: Math.PI * 0.25,
        loot_gold: o.loot_gold || 0, loot_elixir: o.loot_elixir || 0,
        taken_gold: 0, taken_elixir: 0,
      });
    });
    const b = {
      mode: opts.mode, opts,
      blds, troops: [], proj: [], fx: [], floats: [],
      time: 0, phase: opts.mode === 'defense' ? 'battle' : 'scout', phaseT: opts.mode === 'defense' ? 9999 : SCOUT_TIME,
      deploy: Object.assign({}, opts.army || {}), ccLeft: Object.assign({}, opts.cc || {}),
      deployed: {}, ccDeployed: {},
      selected: null, loot: { gold: 0, elixir: 0 },
      stars: 0, thDown: false, ended: false, endTimer: 0, redFlash: 0,
      fields: new Map(), nextTroopId: 1, anyDeployed: false,
      dmgMult: opts.defMult || 1,
      troopMult: opts.mode === 'defense' ? 1 : troopMult(),
    };
    b.total = blds.filter(x => x.type !== 'wall').length;
    b.lootTotal = {
      gold: blds.reduce((a, x) => a + x.loot_gold, 0),
      elixir: blds.reduce((a, x) => a + x.loot_elixir, 0),
    };
    b.wallSet = wallSetOf(blds);
    this.b = b;
    this.rebuildGrid();
    // red zone
    b.red = new Uint8Array(GRID * GRID);
    for (const x of blds) {
      if (x.type === 'wall') { b.red[x.y * GRID + x.x] = 1; continue; }
      for (let j = x.y - 1; j < x.y + x.size + 1; j++) for (let i = x.x - 1; i < x.x + x.size + 1; i++) {
        if (i >= 0 && j >= 0 && i < GRID && j < GRID) b.red[j * GRID + i] = 1;
      }
    }
    const first = Object.keys(b.deploy).find(t => b.deploy[t] > 0);
    b.selected = first || (Object.keys(b.ccLeft).some(t => b.ccLeft[t] > 0) ? 'cc' : null);
    return b;
  },

  rebuildGrid() {
    const b = this.b;
    b.grid = new Int32Array(GRID * GRID).fill(-1);
    b.blds.forEach((x, idx) => {
      if (x.destroyed) return;
      for (let j = x.y; j < x.y + x.size; j++) for (let i = x.x; i < x.x + x.size; i++) b.grid[j * GRID + i] = idx;
    });
    b.fields.clear();
  },

  canDeployAt(gx, gy) {
    const b = this.b;
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return false;
    return !b.red[Math.floor(gy) * GRID + Math.floor(gx)];
  },

  deployAt(gx, gy) {
    const b = this.b;
    if (!b || b.ended || !b.selected) return false;
    if (!this.canDeployAt(gx, gy)) { b.redFlash = 1.2; return false; }
    if (b.selected === 'cc') {
      let any = false;
      for (const t in b.ccLeft) {
        while (b.ccLeft[t] > 0) {
          b.ccLeft[t]--; b.ccDeployed[t] = (b.ccDeployed[t] || 0) + 1;
          this.spawn(t, gx + (Math.random() - 0.5) * 1.2, gy + (Math.random() - 0.5) * 1.2, 'att');
          any = true;
        }
      }
      if (any) this.afterDeploy();
      return any;
    }
    const t = b.selected;
    if (!b.deploy[t]) return false;
    b.deploy[t]--; b.deployed[t] = (b.deployed[t] || 0) + 1;
    this.spawn(t, gx, gy, 'att');
    this.afterDeploy();
    return true;
  },

  afterDeploy() {
    const b = this.b;
    b.anyDeployed = true;
    if (b.phase === 'scout') { b.phase = 'battle'; b.phaseT = BATTLE_TIME; }
    Sound.play('deploy');
    if (!b.deploy[b.selected] && b.selected !== 'cc') {
      const next = Object.keys(b.deploy).find(t => b.deploy[t] > 0);
      if (next) b.selected = next;
      else if (Object.values(b.ccLeft).some(v => v > 0)) b.selected = 'cc';
    }
  },

  spawn(type, x, y, side) {
    const d = TROOPS[type];
    const m = side === 'att' ? this.b.troopMult : 1;
    const t = {
      id: this.b.nextTroopId++, type, x, y, hp: d.hp * m, maxHp: d.hp * m, side, mult: m,
      target: null, cd: 0.3, walk: Math.random(), face: 1, hurt: 0,
      jx: (Math.random() - 0.5) * 0.5, jy: (Math.random() - 0.5) * 0.5,
    };
    this.b.troops.push(t);
    return t;
  },

  // distance from point to building rect
  distTo(t, x) {
    const dx = Math.max(x.x - t.x, 0, t.x - (x.x + x.size));
    const dy = Math.max(x.y - t.y, 0, t.y - (x.y + x.size));
    return Math.hypot(dx, dy);
  },

  chooseTarget(t) {
    const b = this.b, d = TROOPS[t.type];
    const alive = b.blds.filter(x => !x.destroyed);
    let pool = [];
    if (d.pref === 'defense') pool = alive.filter(x => x.cat === 'defense' && x.type !== 'wall');
    else if (d.pref === 'resource') pool = alive.filter(x => x.cat === 'resource');
    else if (d.pref === 'wall') pool = alive.filter(x => x.type === 'wall');
    if (!pool.length) pool = alive.filter(x => x.type !== 'wall');
    let best = null, bd = 1e9;
    for (const x of pool) {
      const dd = this.distTo(t, x);
      if (dd < bd) { bd = dd; best = x; }
    }
    t.target = best;
    t.wall = null;
  },

  effRange(t) { return Math.max(TROOPS[t.type].range, 0.75); },

  field(target, range) {
    const b = this.b;
    const key = target.id + ':' + range.toFixed(2);
    let f = b.fields.get(key);
    if (f) return f;
    f = new Float32Array(GRID * GRID).fill(Infinity);
    const heap = new MinHeap();
    for (let j = Math.max(0, Math.floor(target.y - range - 1)); j < Math.min(GRID, target.y + target.size + range + 1); j++) {
      for (let i = Math.max(0, Math.floor(target.x - range - 1)); i < Math.min(GRID, target.x + target.size + range + 1); i++) {
        const k = j * GRID + i;
        const occ = b.grid[k];
        if (occ >= 0) continue; // must be an open tile
        if (this.distTo({ x: i + 0.5, y: j + 0.5 }, target) <= range + 0.01) { f[k] = 0; heap.push(k, 0); }
      }
    }
    const blds = b.blds;
    while (heap.size) {
      const [u, du] = heap.pop();
      if (du > f[u]) continue;
      const ux = u % GRID, uy = (u / GRID) | 0;
      const uo = b.grid[u];
      const enter = uo < 0 ? 1 : (blds[uo].type === 'wall' ? 1 + WALL_COST : Infinity);
      if (enter === Infinity) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const vx = ux + dx, vy = uy + dy;
        if (vx < 0 || vy < 0 || vx >= GRID || vy >= GRID) continue;
        const v = vy * GRID + vx;
        const vo = b.grid[v];
        if (vo >= 0 && blds[vo].type !== 'wall') continue;
        if (dx && dy) { // no corner cutting
          if (b.grid[uy * GRID + vx] >= 0 || b.grid[vy * GRID + ux] >= 0) continue;
        }
        const nd = du + enter * (dx && dy ? 1.414 : 1);
        if (nd < f[v]) { f[v] = nd; heap.push(v, nd); }
      }
    }
    b.fields.set(key, f);
    return f;
  },

  update(dt) {
    const b = this.b;
    if (!b || b.ended) return;
    b.time += dt;
    b.redFlash = Math.max(0, b.redFlash - dt);
    if (b.phase === 'scout' || b.phase === 'battle') {
      b.phaseT -= dt;
      if (b.phaseT <= 0) {
        if (b.phase === 'scout') { b.phase = 'battle'; b.phaseT = BATTLE_TIME; }
        else { this.finish('time'); return; }
      }
    }
    if (b.mode === 'defense') this.defenseAI(dt);
    for (const t of b.troops) if (t.hp > 0) this.updateTroop(t, dt);
    for (const x of b.blds) if (!x.destroyed && x.cat === 'defense' && x.type !== 'wall') this.updateDefense(x, dt);
    this.updateProjectiles(dt);
    for (const f of b.fx) f.t += dt;
    b.fx = b.fx.filter(f => f.t < f.dur);
    for (const f of b.floats) f.t += dt;
    b.floats = b.floats.filter(f => f.t < 1.2);
    for (const x of b.blds) if (x.recoil) x.recoil = Math.max(0, x.recoil - dt * 30);
    b.troops = b.troops.filter(t => t.hp > 0 || (t.deadT = (t.deadT || 0) + dt) < 0.4);

    // end conditions
    const destroyed = b.blds.filter(x => x.type !== 'wall' && x.destroyed).length;
    b.pct = b.total ? Math.floor(destroyed / b.total * 100) : 0;
    this.computeStars();
    if (b.pct >= 100) { b.endTimer += dt; if (b.endTimer > 1.2) this.finish('destroyed'); return; }
    const aliveAtt = b.troops.some(t => t.side === 'att' && t.hp > 0);
    const left = Object.values(b.deploy).some(v => v > 0) || Object.values(b.ccLeft).some(v => v > 0);
    if (b.mode === 'defense') {
      if (b.spawned >= b.opts.raid.length && !aliveAtt) { b.endTimer += dt; if (b.endTimer > 1.5) this.finish('defended'); }
    } else if (b.anyDeployed && !aliveAtt && !left) {
      b.endTimer += dt; if (b.endTimer > 1.5) this.finish('troops');
    }
  },

  computeStars() {
    const b = this.b;
    let s = 0;
    if (b.pct >= 50) s++;
    if (b.thDown) s++;
    if (b.pct >= 100) s++;
    if (s > b.stars) { b.stars = s; Sound.play('star'); }
  },

  defenseAI(dt) {
    const b = this.b;
    b.spawned = b.spawned || 0;
    b.spawnT = (b.spawnT || 0) - dt;
    const raid = b.opts.raid;
    while (b.spawned < raid.length && b.spawnT <= 0) {
      const r = raid[b.spawned];
      this.spawn(r.type, r.x, r.y, 'att');
      b.spawned++;
      b.spawnT = 0.35;
    }
  },

  updateTroop(t, dt) {
    const b = this.b, d = TROOPS[t.type];
    t.hurt = Math.max(0, t.hurt - dt);
    if (!t.target || t.target.destroyed) this.chooseTarget(t);
    if (!t.target) return;
    // currently busy breaking a wall?
    let atk = t.wall && !t.wall.destroyed ? t.wall : null;
    if (!atk) {
      t.wall = null;
      const er = this.effRange(t);
      if (this.distTo(t, t.target) <= er + 0.05) atk = t.target;
      else {
        const f = this.field(t.target, er);
        const tx = Math.floor(t.x), ty = Math.floor(t.y);
        const k = ty * GRID + tx;
        let goal = null;
        if (tx >= 0 && ty >= 0 && tx < GRID && ty < GRID && f[k] < Infinity) {
          if (f[k] === 0) goal = { x: tx + 0.5, y: ty + 0.5 };
          else {
            let best = f[k], bk = -1;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const vx = tx + dx, vy = ty + dy;
              if (vx < 0 || vy < 0 || vx >= GRID || vy >= GRID) continue;
              const v = vy * GRID + vx;
              if (f[v] < best) {
                if (dx && dy && (b.grid[ty * GRID + vx] >= 0 || b.grid[vy * GRID + tx] >= 0)) continue;
                best = f[v]; bk = v;
              }
            }
            if (bk >= 0) {
              const occ = b.grid[bk];
              if (occ >= 0 && b.blds[occ].type === 'wall') {
                const w = b.blds[occ];
                if (this.distTo(t, w) <= 0.8) { t.wall = w; atk = w; }
                else goal = { x: w.x + 0.5, y: w.y + 0.5 };
              } else goal = { x: (bk % GRID) + 0.5 + t.jx, y: ((bk / GRID) | 0) + 0.5 + t.jy };
            }
          }
        }
        if (!atk) {
          if (!goal) { // unreachable: walk straight, attack whatever is in the way
            const cx = t.target.x + t.target.size / 2, cy = t.target.y + t.target.size / 2;
            const ang = Math.atan2(cy - t.y, cx - t.x);
            const nx = t.x + Math.cos(ang) * 0.6, ny = t.y + Math.sin(ang) * 0.6;
            const occ = b.grid[Math.floor(ny) * GRID + Math.floor(nx)];
            if (occ >= 0 && b.blds[occ] !== t.target) { t.wall = b.blds[occ]; atk = t.wall; }
            else goal = { x: cx, y: cy };
          }
          if (goal) this.moveToward(t, goal.x, goal.y, d.speed * dt);
        }
      }
    }
    if (atk) {
      t.cd -= dt;
      const cx = atk.x + atk.size / 2;
      t.face = (cx - t.x) - (atk.y + atk.size / 2 - t.y) >= 0 ? 1 : -1;
      if (t.cd <= 0) {
        t.cd = d.rate;
        if (d.suicide) { this.explodeBreaker(t); return; }
        let dmg = d.dmg * t.mult;
        if (d.resMult && atk.cat === 'resource') dmg *= d.resMult;
        if (d.ranged) {
          b.proj.push({ kind: 'arrow', x: t.x, y: t.y, z: 10, tb: atk, tx: atk.x + atk.size / 2, ty: atk.y + atk.size / 2, speed: 9, dmg });
        } else {
          this.damageBuilding(atk, dmg);
          t.swing = 0.2;
        }
      }
    }
    if (t.swing) t.swing = Math.max(0, t.swing - dt);
  },

  moveToward(t, gx, gy, step) {
    const dx = gx - t.x, dy = gy - t.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return;
    const s = Math.min(step, dist);
    t.x += dx / dist * s; t.y += dy / dist * s;
    t.walk += step;
    // screen-space facing: iso x = gx - gy
    const sx = dx - dy;
    if (Math.abs(sx) > 0.01) t.face = sx > 0 ? 1 : -1;
  },

  explodeBreaker(t) {
    const b = this.b, d = TROOPS[t.type];
    for (const x of b.blds) {
      if (x.destroyed) continue;
      if (this.distTo(t, x) <= d.splash) this.damageBuilding(x, d.dmg * t.mult * (x.type === 'wall' ? d.wallMult : 1));
    }
    b.fx.push({ kind: 'boom', x: t.x, y: t.y, t: 0, dur: 0.5, r: 1.5 });
    Sound.play('boom');
    t.hp = 0;
  },

  damageBuilding(x, dmg) {
    const b = this.b;
    if (x.destroyed) return;
    const real = Math.min(x.hp, dmg);
    x.hp -= real;
    x.hit = 0.12;
    for (const res of ['gold', 'elixir']) {
      const pool = x['loot_' + res];
      if (!pool) continue;
      const amt = x.hp <= 0 ? pool - x['taken_' + res] : Math.floor(pool * real / x.maxHp);
      const give = Math.min(amt, pool - x['taken_' + res]);
      if (give > 0) {
        x['taken_' + res] += give; b.loot[res] += give;
        if (Math.random() < 0.3 || x.hp <= 0) b.floats.push({ x: x.x + x.size / 2, y: x.y + x.size / 2, txt: '+' + give, res, t: 0 });
      }
    }
    if (x.hp <= 0) {
      x.destroyed = true;
      if (x.type === 'townhall') b.thDown = true;
      b.fx.push({ kind: 'boom', x: x.x + x.size / 2, y: x.y + x.size / 2, t: 0, dur: 0.6, r: x.size * 0.6 });
      Sound.play(x.type === 'wall' ? 'hit' : 'boom');
      if (x.type === 'wall') b.wallSet.delete(x.x + ',' + x.y);
      this.rebuildGrid();
    }
  },

  updateDefense(x, dt) {
    const b = this.b, def = BUILDINGS[x.type], lv = def.levels[x.level - 1];
    x.cd -= dt;
    const cx = x.x + x.size / 2, cy = x.y + x.size / 2;
    const inRange = t => {
      if (t.hp <= 0 || t.side !== 'att') return false;
      const dd = Math.hypot(t.x - cx, t.y - cy);
      return dd <= def.range && dd >= (def.minRange || 0);
    };
    if (!x.target || !inRange(x.target)) {
      x.target = null;
      let bd = 1e9;
      for (const t of b.troops) {
        if (!inRange(t)) continue;
        const dd = Math.hypot(t.x - cx, t.y - cy);
        if (dd < bd) { bd = dd; x.target = t; }
      }
    }
    if (!x.target) return;
    const want = Math.atan2(x.target.y - cy, x.target.x - cx);
    x.angle = want;
    if (x.cd > 0) return;
    x.cd = def.rate;
    const dmg = lv.dps * def.rate * b.dmgMult * DEF_BOOST;
    if (x.type === 'cannon') {
      b.proj.push({ kind: 'ball', x: cx + Math.cos(want) * 1.1, y: cy + Math.sin(want) * 1.1, z: 22, tt: x.target, speed: 14, dmg });
      x.recoil = 6; Sound.play('cannon');
    } else if (x.type === 'archertower') {
      b.proj.push({ kind: 'arrow', x: cx, y: cy, z: 60, tt: x.target, speed: 16, dmg });
      Sound.play('arrow');
    } else if (x.type === 'mortar') {
      const tx = x.target.x, ty = x.target.y;
      const dist = Math.hypot(tx - cx, ty - cy);
      b.proj.push({ kind: 'shell', sx: cx, sy: cy, x: cx, y: cy, z: 24, tx, ty, t: 0, dur: 0.6 + dist * 0.08, dmg, splash: def.splash });
      x.recoil = 10; Sound.play('mortar');
    }
  },

  updateProjectiles(dt) {
    const b = this.b;
    for (const p of b.proj) {
      if (p.kind === 'shell') {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k;
        p.z = 24 * (1 - k) + Math.sin(k * Math.PI) * 120;
        if (k >= 1) {
          p.done = true;
          for (const t of b.troops) if (t.side === 'att' && t.hp > 0 && Math.hypot(t.x - p.tx, t.y - p.ty) <= p.splash) this.damageTroop(t, p.dmg);
          b.fx.push({ kind: 'boom', x: p.tx, y: p.ty, t: 0, dur: 0.5, r: p.splash });
          Sound.play('boom');
        }
        continue;
      }
      let tx, ty, tz;
      if (p.tt) { tx = p.tt.x; ty = p.tt.y; tz = 8; }
      else { tx = p.tx; ty = p.ty; tz = 15; }
      const dx = tx - p.x, dy = ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step) {
        p.done = true;
        if (p.tt) { if (p.tt.hp > 0) this.damageTroop(p.tt, p.dmg); }
        else if (p.tb) this.damageBuilding(p.tb, p.dmg);
      } else {
        p.x += dx / dist * step; p.y += dy / dist * step;
        p.z += (tz - p.z) * Math.min(1, step / dist);
      }
    }
    b.proj = b.proj.filter(p => !p.done);
  },

  damageTroop(t, dmg) {
    t.hp -= dmg; t.hurt = 0.1;
    if (t.hp <= 0) { t.hp = 0; Sound.play('die'); }
  },

  finish(reason) {
    const b = this.b;
    if (b.ended) return;
    b.ended = true;
    this.computeStars();
    b.reason = reason;
    if (typeof Game !== 'undefined') Game.onBattleEnd(b);
  },

  surrender() { this.finish('surrender'); },

  // ---------- drawing ----------
  draw() {
    const b = this.b;
    drawGround(true);
    if (b.redFlash > 0 || b.phase === 'scout') {
      ctx.globalAlpha = b.redFlash > 0 ? Math.min(1, b.redFlash * 2) : 0.6;
      drawRedZone(b.blds);
      ctx.globalAlpha = 1;
    }
    for (const x of b.blds) footprintPatch(x);
    const items = [];
    for (const x of b.blds) {
      const opt = { wallSet: b.wallSet };
      if (BUILDINGS[x.type].stores) {
        const res = BUILDINGS[x.type].stores;
        const pool = x['loot_' + res];
        opt.fillRatio = pool ? Math.max(0.05, 1 - x['taken_' + res] / pool) * Math.min(1, pool / 4000 + 0.3) : 0.1;
      } else if (BUILDINGS[x.type].produces) opt.fillRatio = 0.5;
      items.push({ key: x.x + x.y + x.size, draw: () => drawBuilding(x, opt) });
    }
    for (const t of b.troops) {
      items.push({
        key: t.x + t.y,
        draw: () => {
          const p = P(t.x, t.y);
          ctx.globalAlpha = t.hp > 0 ? 1 : Math.max(0, 1 - t.deadT / 0.4);
          drawTroopFigure(t.type, p[0], p[1] - (t.swing ? 3 : 0), 1, t.face, t.walk, t.hurt > 0);
          ctx.globalAlpha = 1;
          if (t.hp > 0 && t.hp < t.maxHp) drawBar(p[0], p[1] - 30 * (t.type === 'giant' ? 1.5 : 1), 18, t.hp / t.maxHp, '#4cd137');
        },
      });
    }
    drawSorted(items);
    drawForestFront();
    // projectiles
    for (const p of b.proj) {
      const s = up(P(p.x, p.y), p.z);
      if (p.kind === 'ball') circle(s[0], s[1], 4, '#222');
      else if (p.kind === 'shell') { circle(s[0], s[1], 6, '#333', '#000'); const g = P(p.x, p.y); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], 6, 3, 0, 0, 7); ctx.fill(); }
      else {
        let tx = p.tt ? p.tt.x : p.tx, ty = p.tt ? p.tt.y : p.ty;
        const e = P(tx, ty); const a = Math.atan2(e[1] - s[1], e[0] - s[0]);
        ctx.strokeStyle = '#5a3a1b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s[0] - Math.cos(a) * 8, s[1] - Math.sin(a) * 8); ctx.lineTo(s[0], s[1]); ctx.stroke();
      }
    }
    // effects
    for (const f of b.fx) {
      const k = f.t / f.dur;
      const c = P(f.x, f.y);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffb22e';
      ctx.beginPath(); ctx.ellipse(c[0], c[1] - 8, f.r * 40 * (0.4 + k), f.r * 20 * (0.4 + k), 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3a0';
      ctx.beginPath(); ctx.ellipse(c[0], c[1] - 10, f.r * 20 * (0.4 + k), f.r * 10 * (0.4 + k), 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // hp bars
    for (const x of b.blds) {
      if (x.destroyed || x.hp >= x.maxHp) continue;
      const p = up(P(x.x + x.size / 2, x.y + x.size / 2), 30 + x.size * 12);
      drawBar(p[0], p[1], 14 + x.size * 8, x.hp / x.maxHp, x.hp / x.maxHp > 0.5 ? '#4cd137' : x.hp / x.maxHp > 0.25 ? '#fbc531' : '#e84118');
    }
    for (const f of b.floats) {
      const p = up(P(f.x, f.y), 50 + f.t * 30);
      ctx.globalAlpha = 1 - f.t / 1.2;
      drawText(f.txt, p[0], p[1], 16, f.res === 'gold' ? '#ffd84a' : '#f06cf0');
      ctx.globalAlpha = 1;
    }
  },
};

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = [k[0], v[0]];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
