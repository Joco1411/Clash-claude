'use strict';
// Game controller: main loop, input handling, mode switching.

const Game = {
  mode: 'village',
  sel: null,
  placing: null,
  moving: null,
  floats: [],
  last: 0,
  tickAcc: 0,
  saveAcc: 0,

  init() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', () => resizeCanvas());
    if (!loadGame()) newGame();
    UI.init();
    this.bindInput();
    this.afterLoad();
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
    window.addEventListener('pagehide', saveGame);
    requestAnimationFrame(t => this.frame(t));
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  afterLoad() {
    this.mode = 'village';
    this.sel = null; this.placing = null; this.moving = null;
    Battle.b = null;
    UI.closeModal();
    UI.showBattleHud(false);
    UI.hideSel();
    $('placeBtns').classList.add('hidden');
    Cam.zoom = Math.max(Cam.min, Math.min(1, VW / 1300));
    const th = townHall();
    this.focusOn(th);
    Cam.x -= 40;
    villageTick();
    UI.updateHud();
    Tutorial.show();
  },

  focusOn(b) {
    if (!b) return;
    const s = sizeOf(b);
    const p = P(b.x + s / 2, b.y + s / 2);
    Cam.x = p[0]; Cam.y = p[1];
    clampCam();
  },

  // ---------- loop ----------
  frame(t) {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    animT += dt;
    if (this.mode === 'battle' && Battle.b) {
      // fixed sub-steps for stable simulation
      let rem = dt;
      while (rem > 0) { const s = Math.min(rem, 1 / 60); Battle.update(s); rem -= s; }
      this.holdDeploy(dt);
    }
    this.tickAcc += dt;
    if (this.tickAcc > 0.25) {
      this.tickAcc = 0;
      villageTick();
      if (this.mode === 'village') UI.updateHud();
      else UI.updateBattleHud();
      Tutorial.tick();
    }
    this.saveAcc += dt;
    if (this.saveAcc > 5) { this.saveAcc = 0; saveGame(); }
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter(f => f.t < 1.4);
    this.render();
    requestAnimationFrame(tt => this.frame(tt));
  },

  render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    beginWorld();
    if (this.mode === 'battle' && Battle.b) { Battle.draw(); return; }
    this.drawVillage();
  },

  drawVillage() {
    drawGround(false);
    const wallSet = wallSetOf(S.buildings);
    for (const b of S.buildings) footprintPatch(b);
    // placement ghost footprint
    if (this.placing) {
      const p = this.placing, s = BUILDINGS[p.type].size;
      const ok = isFree(p.x, p.y, s, null);
      p.ok = ok;
      const pts = [P(p.x, p.y), P(p.x + s, p.y), P(p.x + s, p.y + s), P(p.x, p.y + s)];
      poly(pts, ok ? 'rgba(80,255,80,0.45)' : 'rgba(255,60,60,0.5)', '#fff', 2);
    }
    if (this.moving) {
      const b = this.moving.b, s = sizeOf(b);
      const ok = isFree(b.x, b.y, s, b.id);
      const pts = [P(b.x, b.y), P(b.x + s, b.y), P(b.x + s, b.y + s), P(b.x, b.y + s)];
      poly(pts, ok ? 'rgba(80,255,80,0.45)' : 'rgba(255,60,60,0.5)', '#fff', 2);
    }
    if (this.sel && !this.moving) {
      const t = this.sel, s = sizeOf(t);
      const a = 0.5 + 0.3 * Math.sin(animT * 6);
      const pts = [P(t.x, t.y), P(t.x + s, t.y), P(t.x + s, t.y + s), P(t.x, t.y + s)];
      poly(pts, 'rgba(255,255,255,' + (a * 0.25) + ')', 'rgba(255,255,255,' + a + ')', 2);
    }
    const campTroops = this.campTroops();
    const items = [];
    let campIdx = 0;
    for (const b of S.buildings) {
      const opt = { wallSet };
      if (b.type === 'armycamp' && b.level > 0) opt.troops = campTroops[campIdx++] || [];
      items.push({ key: b.x + b.y + sizeOf(b), draw: () => drawBuilding(b, opt) });
    }
    for (const o of S.obstacles) items.push({ key: o.x + o.y + o.size, draw: () => drawObstacle(o) });
    if (this.placing) {
      const p = this.placing;
      const ghost = { id: -1, type: p.type, x: p.x, y: p.y, level: 1 };
      items.push({ key: 1e6, draw: () => { ctx.globalAlpha = 0.85; drawBuilding(ghost, { wallSet }); ctx.globalAlpha = 1; } });
    }
    drawSorted(items);
    drawForestFront();
    // overlays: timers, collect bubbles, labels
    for (const b of S.buildings) {
      const s = sizeOf(b);
      const top = up(P(b.x + s / 2, b.y + s / 2), 40 + s * 14);
      if (b.upgrade) {
        const total = b.upgrade.end - b.upgrade.start;
        const left = b.upgrade.end - now();
        drawBar(top[0], top[1], 60, 1 - left / total, '#4cd137');
        drawText(fmtTime(left / 1000), top[0], top[1] - 9, 13, '#fff');
        // builder hammering
        const bp = P(b.x + s + 0.2, b.y + s / 2);
        this.drawBuilder(bp[0], bp[1]);
      } else if (bDef(b).produces && b.level > 0) {
        const st = storedIn(b), cap = lvData(b).cap;
        if (st >= Math.max(1, cap * 0.08)) {
          const bob = Math.sin(animT * 3 + b.id) * 3;
          const bx = top[0], by = top[1] + 10 + bob;
          circle(bx, by, 14, '#fff', 'rgba(0,0,0,0.4)');
          if (bDef(b).produces === 'gold') circle(bx, by, 9, '#f7c62f', '#a07a10');
          else { ctx.fillStyle = '#d63cd0'; ctx.beginPath(); ctx.moveTo(bx, by - 10); ctx.quadraticCurveTo(bx + 9, by + 2, bx, by + 8); ctx.quadraticCurveTo(bx - 9, by + 2, bx, by - 10); ctx.fill(); }
        }
      }
    }
    // selected label
    const lab = this.sel;
    if (lab && !this.moving && !OBSTACLES[lab.type]) {
      const s = sizeOf(lab);
      const p = up(P(lab.x + s / 2, lab.y + s / 2), 64 + s * 16);
      drawText(bDef(lab).name, p[0], p[1] - 14, 18, '#fff');
      drawText(lab.ruin ? 'Ruined' : 'Level ' + lab.level, p[0], p[1] + 4, 14, '#ffe14a');
    }
    for (const f of this.floats) {
      const p = up(P(f.x, f.y), 60 + f.t * 40);
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      drawText(f.txt, p[0], p[1], 20, f.res === 'gold' ? '#ffd84a' : '#f06cf0');
      ctx.globalAlpha = 1;
    }
    this.positionPlaceBtns();
  },

  drawBuilder(x, y) {
    const sw = Math.sin(animT * 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y, 6, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a6ab0'; ctx.fillRect(x - 4, y - 14, 8, 10);
    ctx.fillStyle = '#5a3a1b'; ctx.fillRect(x - 3, y - 5, 2, 5); ctx.fillRect(x + 1, y - 5, 2, 5);
    circle(x, y - 18, 4, '#f2c49b', 'rgba(0,0,0,0.4)');
    ctx.fillStyle = '#f5d33a'; ctx.beginPath(); ctx.arc(x, y - 19, 4.3, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#6b4422'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 3, y - 12); ctx.lineTo(x - 9, y - 16 + sw * 4); ctx.stroke();
    ctx.fillStyle = '#888'; ctx.fillRect(x - 12, y - 19 + sw * 4, 6, 4);
  },

  campTroops() {
    const camps = S.buildings.filter(b => b.type === 'armycamp' && b.level > 0);
    const out = camps.map(() => []);
    if (!camps.length) return out;
    let i = 0, shown = 0;
    for (const t of Object.keys(S.army)) {
      for (let n = 0; n < S.army[t] && shown < 14 * camps.length; n++, shown++) {
        const c = out[i % camps.length];
        if (c.length < 14) c.push(t);
        i++;
      }
    }
    return out;
  },

  positionPlaceBtns() {
    const pb = $('placeBtns');
    if (!this.placing) { pb.classList.add('hidden'); return; }
    const p = this.placing, s = BUILDINGS[p.type].size;
    const sp = gridToScreen(p.x + s / 2, p.y + s);
    pb.classList.remove('hidden');
    pb.style.left = (sp.x - 60) + 'px';
    pb.style.top = Math.min(VH - 70, sp.y + 10) + 'px';
    $('btnPlaceOk').classList.toggle('disabled', !p.ok);
  },

  // ---------- selection & placement ----------
  select(t) {
    this.sel = t;
    if (t) UI.showSel(t); else UI.hideSel();
  },

  startPlacing(type) {
    if (this.mode !== 'village') return;
    const err = buildError(type);
    if (err) return UI.toast(err);
    const c = buildCost(type);
    if (S.tutorialFree !== type && S[c.res] < c.amt) return UI.shortfall(c.res, c.amt, () => this.startPlacing(type));
    this.select(null);
    const s = BUILDINGS[type].size;
    const center = screenToGrid(VW / 2, VH / 2);
    let spot = { x: Math.round(center.x - s / 2), y: Math.round(center.y - s / 2) };
    if (!isFree(spot.x, spot.y, s, null)) {
      const f = findFreeSpot(s, center.x - s / 2, center.y - s / 2);
      if (!f) return UI.toast('No space left!');
      spot = f;
    }
    this.placing = { type, x: spot.x, y: spot.y, ok: true };
    const sp = gridToScreen(spot.x + s / 2, spot.y + s / 2);
    if (sp.x < 80 || sp.x > VW - 80 || sp.y < 80 || sp.y > VH - 80) this.focusOn({ x: spot.x, y: spot.y, type });
  },

  confirmPlace() {
    const p = this.placing;
    if (!p) return;
    if (!isFree(p.x, p.y, BUILDINGS[p.type].size, null)) return UI.toast('Cannot place there');
    const r = placeNewBuilding(p.type, p.x, p.y);
    if (typeof r === 'string') { UI.toast(r); return; }
    this.placing = null;
    // keep placing walls in a line, like the original
    if (p.type === 'wall' && !buildError('wall') && S.gold >= buildCost('wall').amt) {
      const dirs = [[p.dx || 1, p.dy || 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
      for (const [dx, dy] of dirs) {
        if (isFree(p.x + dx, p.y + dy, 1, null)) {
          this.placing = { type: 'wall', x: p.x + dx, y: p.y + dy, ok: true, dx, dy };
          break;
        }
      }
    }
    if (!this.placing) this.select(r);
    Tutorial.onEvent();
    UI.updateHud();
    saveGame();
  },

  cancelPlace() {
    this.placing = null;
  },

  hitTest(sx, sy) {
    const w = screenToWorld(sx, sy);
    for (const off of [0, 14, 28, 44]) {
      const g = worldToGrid(w.x, w.y + off);
      const gx = Math.floor(g.x), gy = Math.floor(g.y);
      const o = occupiedBy(gx, gy, null);
      if (o) {
        // tall hits only count for buildings, not low walls
        if (off > 0 && (o.type === 'wall')) continue;
        return o;
      }
    }
    return null;
  },

  tapVillage(sx, sy) {
    if (this.placing) {
      const g = screenToGrid(sx, sy), s = BUILDINGS[this.placing.type].size;
      this.placing.x = Math.round(g.x - s / 2);
      this.placing.y = Math.round(g.y - s / 2);
      return;
    }
    const hit = this.hitTest(sx, sy);
    if (!hit) { this.select(null); return; }
    if (!OBSTACLES[hit.type] && bDef(hit).produces && storedIn(hit) >= 1) {
      collect(hit);
      if (this.sel !== hit) this.select(hit);
      return;
    }
    Sound.play('click');
    this.select(this.sel === hit ? null : hit);
  },

  // ---------- input ----------
  bindInput() {
    const ptrs = new Map();
    let pinch = null, drag = null;
    const pos = e => ({ x: e.clientX, y: e.clientY });

    canvas.addEventListener('pointerdown', e => {
      Sound.unlock();
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now() });
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: Cam.zoom, world: screenToWorld(mid.x, mid.y) };
        drag = null;
        this.holdStop();
        return;
      }
      if (ptrs.size > 2) return;
      drag = { type: 'pan', cam: { x: Cam.x, y: Cam.y }, sx: p.x, sy: p.y, moved: false };
      if (this.mode === 'village') {
        const g = screenToGrid(p.x, p.y);
        if (this.placing) {
          const pl = this.placing, s = BUILDINGS[pl.type].size;
          if (g.x >= pl.x - 0.5 && g.x < pl.x + s + 0.5 && g.y >= pl.y - 0.5 && g.y < pl.y + s + 0.5) drag = { type: 'ghost', ox: g.x - pl.x, oy: g.y - pl.y, sx: p.x, sy: p.y, moved: false };
        } else if (this.sel && !OBSTACLES[this.sel.type]) {
          const b = this.sel, s = sizeOf(b);
          const hit = this.hitTest(p.x, p.y);
          if (hit === b) drag = { type: 'move', b, ox: g.x - b.x, oy: g.y - b.y, orig: { x: b.x, y: b.y }, sx: p.x, sy: p.y, moved: false };
        }
      } else if (this.mode === 'battle') {
        this.holdStart(p.x, p.y);
      }
    });

    canvas.addEventListener('pointermove', e => {
      const pp = ptrs.get(e.pointerId);
      if (!pp) return;
      const p = pos(e);
      pp.x = p.x; pp.y = p.y;
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        Cam.zoom = Math.max(Cam.min, Math.min(Cam.max, pinch.zoom * d / pinch.d));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        Cam.x = pinch.world.x - (mid.x - VW / 2) / Cam.zoom;
        Cam.y = pinch.world.y - (mid.y - VH / 2) / Cam.zoom;
        clampCam();
        return;
      }
      if (!drag) return;
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 8) { drag.moved = true; this.holdStop(); }
      if (!drag.moved) return;
      if (drag.type === 'pan') {
        Cam.x = drag.cam.x - dx / Cam.zoom;
        Cam.y = drag.cam.y - dy / Cam.zoom;
        clampCam();
      } else if (drag.type === 'ghost') {
        const g = screenToGrid(p.x, p.y);
        const ox = Math.round(g.x - drag.ox), oy = Math.round(g.y - drag.oy);
        this.placing.x = ox; this.placing.y = oy;
      } else if (drag.type === 'move') {
        const g = screenToGrid(p.x, p.y);
        drag.b.x = Math.round(g.x - drag.ox); drag.b.y = Math.round(g.y - drag.oy);
        this.moving = { b: drag.b };
      }
    });

    const end = e => {
      const pp = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
      if (!pp || !drag) return;
      if (drag.type === 'move' && drag.moved) {
        const b = drag.b;
        if (!isFree(b.x, b.y, sizeOf(b), b.id)) { b.x = drag.orig.x; b.y = drag.orig.y; UI.toast('Cannot place there'); }
        else saveGame();
        this.moving = null;
      }
      if (!drag.moved && performance.now() - pp.t < 600 && e.type === 'pointerup') {
        if (this.mode === 'village') this.tapVillage(pp.x, pp.y);
        else if (this.mode === 'battle' && !this.holdState?.fired) this.deployAtScreen(pp.x, pp.y);
      }
      this.holdStop();
      drag = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const before = screenToWorld(e.clientX, e.clientY);
      Cam.zoom = Math.max(Cam.min, Math.min(Cam.max, Cam.zoom * Math.exp(-e.deltaY * 0.0015)));
      Cam.x = before.x - (e.clientX - VW / 2) / Cam.zoom;
      Cam.y = before.y - (e.clientY - VH / 2) / Cam.zoom;
      clampCam();
    }, { passive: false });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (UI.modalState && !UI.modalState.locked) UI.closeModal();
        else if (this.placing) this.cancelPlace();
        else this.select(null);
      }
    });
    document.addEventListener('gesturestart', e => e.preventDefault());
  },

  // hold-to-deploy in battle
  holdStart(x, y) { this.holdState = { x, y, t: 0, fired: false }; },
  holdStop() { this.holdState = null; },
  holdDeploy(dt) {
    const h = this.holdState;
    if (!h || h.x == null) return;
    h.t += dt;
    if (h.t > 0.3) {
      h.acc = (h.acc || 0) + dt;
      while (h.acc > 0.12) { h.acc -= 0.12; h.fired = true; this.deployAtScreen(h.x + (Math.random() - 0.5) * 10, h.y + (Math.random() - 0.5) * 10); }
    }
  },

  deployAtScreen(sx, sy) {
    const g = screenToGrid(sx, sy);
    const b = Battle.b;
    if (!b || b.ended) return;
    if (b.mode === 'defense') return;
    if (!b.selected || (b.selected !== 'cc' && !b.deploy[b.selected])) { UI.toast('No troops left to deploy'); this.holdState = null; return; }
    if (!Battle.deployAt(g.x, g.y) && Battle.b.redFlash > 1.1) UI.toast("You can't deploy troops here!");
    UI.updateBattleHud();
  },

  // ---------- battles ----------
  searchCost() { return [0, 10, 50, 100, 150, 250, 380][thLevel()] || 50; },

  enterBattle(opts) {
    this.select(null);
    this.placing = null;
    UI.closeModal();
    $('advisor').classList.add('hidden');
    $('tutArrow').classList.add('hidden');
    this.mode = 'battle';
    Battle.start(opts);
    Cam.zoom = Math.max(Cam.min, Math.min(0.8, Math.min(VW / 2000, VH / 1000)));
    Cam.x = 0; Cam.y = GRID * TH / 2;
    clampCam();
    UI.showBattleHud(true);
    this.holdState = null;
  },

  startCampaign(i) {
    const m = CAMPAIGN[i];
    const rec = S.campaign[i] || { stars: 0, gold: m.gold, elixir: m.elixir };
    S.campaign[i] = rec;
    const blds = genVillage(m.th, m.seed, { gold: rec.gold, elixir: rec.elixir }, i === 0 ? ['goldstorage', 'elixirstorage', 'builderhut', 'builderhut', 'cannon'] : null);
    this.enterBattle({ mode: 'campaign', idx: i, name: m.name, buildings: blds, army: Object.assign({}, S.army), cc: Object.assign({}, S.cc) });
  },

  startMatch() {
    const cost = this.searchCost();
    if (!spend('gold', cost)) return UI.toast('Not enough gold');
    const th = Math.max(1, Math.min(MAX_TH, thLevel() + Math.floor(Math.random() * 3) - 1));
    const base = [0, 1500, 4000, 10000, 25000, 60000, 120000][th];
    const loot = { gold: Math.floor(base * (0.4 + Math.random())), elixir: Math.floor(base * (0.4 + Math.random())) };
    const blds = genVillage(th, Math.floor(Math.random() * 1e9), loot);
    const winT = Math.max(8, Math.round(28 + (th - thLevel()) * 6 + (Math.random() * 8 - 4)));
    this.enterBattle({ mode: 'multi', name: pick(BOT_NAMES) + ' (TH' + th + ')', buildings: blds, army: Object.assign({}, S.army), cc: Object.assign({}, S.cc), trophyWin: winT, trophyLose: -Math.max(5, Math.round(winT * 0.6)) });
  },

  nextMatch() {
    const b = Battle.b;
    if (!b || b.anyDeployed) return;
    if (S.gold < this.searchCost()) return UI.toast('Not enough gold');
    this.startMatch();
  },

  startWarAttack(i) {
    const w = S.clan.war;
    const e = w.enemy[i];
    const base = [0, 1500, 4000, 10000, 25000, 60000, 120000][e.th];
    const blds = genVillage(e.th, e.seed, { gold: Math.floor(base * 0.3), elixir: Math.floor(base * 0.3) });
    this.enterBattle({ mode: 'war', idx: i, name: e.name + ' (War #' + (i + 1) + ')', buildings: blds, army: Object.assign({}, S.army), cc: Object.assign({}, S.cc) });
  },

  startGoblinRaid() {
    const blds = homeVillageCopy();
    const raid = [];
    for (let i = 0; i < 5; i++) raid.push({ type: 'goblin', x: 6 + Math.random() * 2, y: 14 + i * 3 + Math.random() });
    this.enterBattle({ mode: 'defense', name: 'Goblin raid!', buildings: blds, raid, defMult: 3 });
  },

  endBattleEarly() {
    // leaving before deploying anything costs nothing
    this.mode = 'village';
    Battle.b = null;
    UI.showBattleHud(false);
    this.afterReturn();
  },

  onBattleEnd(b) {
    const res = { gold: 0, elixir: 0, trophies: 0, lost: 0, capped: false };
    if (b.mode !== 'defense') {
      for (const r of ['gold', 'elixir']) {
        const got = addRes(r, b.loot[r]);
        res[r] = got;
        if (got < b.loot[r]) res.capped = true;
      }
      for (const t in b.deployed) { S.army[t] = Math.max(0, (S.army[t] || 0) - b.deployed[t]); res.lost += b.deployed[t]; }
      for (const t in b.ccDeployed) S.cc[t] = Math.max(0, (S.cc[t] || 0) - b.ccDeployed[t]);
      if (b.mode === 'multi') {
        res.trophies = b.stars > 0 ? Math.round(b.opts.trophyWin * (0.5 + b.stars / 6)) : b.opts.trophyLose;
        S.trophies = Math.max(0, S.trophies + res.trophies);
      } else if (b.mode === 'campaign') {
        const rec = S.campaign[b.opts.idx];
        rec.stars = Math.max(rec.stars, b.stars);
        rec.gold = Math.max(0, rec.gold - b.loot.gold);
        rec.elixir = Math.max(0, rec.elixir - b.loot.elixir);
      } else if (b.mode === 'war' && S.clan && S.clan.war) {
        S.clan.war.myAttacks--;
        Clan.recordWarAttack(b.opts.idx, b.stars, b.pct, S.name);
      }
      if (b.stars > 0) S.stats.attacksWon++;
      addXP(b.stars * 2);
    }
    saveGame();
    setTimeout(() => {
      Sound.play(b.stars > 0 || b.mode === 'defense' ? 'win' : 'lose');
      UI.showResults(b, res);
    }, 600);
  },

  returnHome() {
    this.mode = 'village';
    Battle.b = null;
    UI.showBattleHud(false);
    this.afterReturn();
  },

  afterReturn() {
    Cam.zoom = Math.max(Cam.min, Math.min(1, VW / 1300));
    this.focusOn(townHall());
    UI.updateHud();
    Tutorial.show();
  },
};

window.addEventListener('load', () => Game.init());
