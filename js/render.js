'use strict';
// Canvas renderer: camera, isometric helpers, procedural building/troop art.

const Cam = { x: 0, y: GRID * TH / 2, zoom: 1, min: 0.35, max: 2.5 };
let canvas, ctx, DPR = 1, VW = 0, VH = 0;
let animT = 0;

function P(gx, gy) { return [(gx - gy) * TW / 2, (gx + gy) * TH / 2]; }
function worldToGrid(wx, wy) {
  return { x: (wx / (TW / 2) + wy / (TH / 2)) / 2, y: (wy / (TH / 2) - wx / (TW / 2)) / 2 };
}
function screenToWorld(sx, sy) {
  return { x: (sx - VW / 2) / Cam.zoom + Cam.x, y: (sy - VH / 2) / Cam.zoom + Cam.y };
}
function worldToScreen(wx, wy) {
  return { x: (wx - Cam.x) * Cam.zoom + VW / 2, y: (wy - Cam.y) * Cam.zoom + VH / 2 };
}
function screenToGrid(sx, sy) { const w = screenToWorld(sx, sy); return worldToGrid(w.x, w.y); }
function gridToScreen(gx, gy) { const p = P(gx, gy); return worldToScreen(p[0], p[1]); }

function clampCam() {
  Cam.zoom = Math.max(Cam.min, Math.min(Cam.max, Cam.zoom));
  const hw = GRID * TW / 2, hh = GRID * TH;
  Cam.x = Math.max(-hw, Math.min(hw, Cam.x));
  Cam.y = Math.max(-40, Math.min(hh + 40, Cam.y));
}

function resizeCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.round(VW * DPR); canvas.height = Math.round(VH * DPR);
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  // fit the whole map at minimum zoom
  Cam.min = Math.max(0.25, Math.min(VW / (GRID * TW * 1.05), VH / (GRID * TH * 1.05)));
  clampCam();
}

// ---------- colour helpers ----------
function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}

// ---------- primitives ----------
function poly(pts, fill, stroke, lw) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function up(p, h) { return [p[0], p[1] - h]; }

// Box on grid rect [x0,x1]x[y0,y1] from elevation z with height h.
function isoBox(x0, y0, x1, y1, z, h, col, opt) {
  const N = up(P(x0, y0), z), E = up(P(x1, y0), z), S2 = up(P(x1, y1), z), W = up(P(x0, y1), z);
  const o = opt || {};
  const edge = o.edge === undefined ? 'rgba(0,0,0,0.35)' : o.edge;
  poly([W, S2, up(S2, h), up(W, h)], o.left || shade(col, -0.25), edge);
  poly([S2, E, up(E, h), up(S2, h)], o.right || shade(col, -0.42), edge);
  poly([up(N, h), up(E, h), up(S2, h), up(W, h)], o.top || col, edge);
}
function isoPyramid(x0, y0, x1, y1, z, h, col) {
  const N = up(P(x0, y0), z), E = up(P(x1, y0), z), S2 = up(P(x1, y1), z), W = up(P(x0, y1), z);
  const c = P((x0 + x1) / 2, (y0 + y1) / 2), A = up(c, z + h);
  const edge = 'rgba(0,0,0,0.35)';
  poly([W, N, A], shade(col, 0.15), edge);
  poly([N, E, A], shade(col, -0.05), edge);
  poly([W, S2, A], shade(col, -0.15), edge);
  poly([S2, E, A], shade(col, -0.38), edge);
}
// Gabled roof running along the x axis.
function isoGable(x0, y0, x1, y1, z, h, col) {
  const ym = (y0 + y1) / 2;
  const N = up(P(x0, y0), z), E = up(P(x1, y0), z), S2 = up(P(x1, y1), z), W = up(P(x0, y1), z);
  const R0 = up(P(x0, ym), z + h), R1 = up(P(x1, ym), z + h);
  const edge = 'rgba(0,0,0,0.35)';
  poly([N, E, R1, R0], shade(col, 0.1), edge);
  poly([W, S2, R1, R0], shade(col, -0.18), edge);
  poly([S2, E, R1], shade(col, -0.4), edge);
}
// Iso ellipse centred at grid (cx,cy) with grid radius r.
function isoEllipse(cx, cy, r, z, fill, stroke) {
  const c = P(cx, cy);
  ctx.beginPath();
  ctx.ellipse(c[0], c[1] - z, r * TW * 0.707, r * TH * 0.707, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function isoCylinder(cx, cy, r, z, h, col) {
  const c = P(cx, cy);
  const rx = r * TW * 0.707, ry = r * TH * 0.707;
  ctx.beginPath();
  ctx.ellipse(c[0], c[1] - z, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(c[0] - rx, c[1] - z - h);
  ctx.ellipse(c[0], c[1] - z - h, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  const g = ctx.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0);
  g.addColorStop(0, shade(col, -0.1)); g.addColorStop(0.4, shade(col, 0.05)); g.addColorStop(1, shade(col, -0.45));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  isoEllipse(cx, cy, r, z + h, shade(col, 0.15), 'rgba(0,0,0,0.3)');
}
function sphere(x, y, r, col) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(col, 0.7)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.45));
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
}
function circle(x, y, r, fill, stroke) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// ---------- ground ----------
const forestTrees = [];
(function seedForest() {
  const rnd = mulberry32(99);
  for (let i = 0; i < 420; i++) {
    // pick a spot outside the diamond
    const gx = -12 + rnd() * (GRID + 24), gy = -12 + rnd() * (GRID + 24);
    if (gx > -0.5 && gx < GRID + 0.5 && gy > -0.5 && gy < GRID + 0.5) continue;
    forestTrees.push({ gx, gy, r: 18 + rnd() * 16, c: rnd() });
  }
  forestTrees.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));
})();

const grassTufts = [];
(function seedTufts() {
  const rnd = mulberry32(7);
  for (let i = 0; i < 260; i++) grassTufts.push({ gx: rnd() * GRID, gy: rnd() * GRID, s: rnd() });
})();

function drawGround(battle) {
  ctx.fillStyle = '#2f6b1f';
  ctx.fillRect(-4000, -3000, 8000, 7000);
  // map diamond
  const corners = [P(0, 0), P(GRID, 0), P(GRID, GRID), P(0, GRID)];
  poly(corners, '#86b833');
  // checker pattern in 2x2 blocks
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let y = 0; y < GRID; y += 2) {
    for (let x = (y / 2) % 2 === 0 ? 0 : 2; x < GRID; x += 4) {
      const a = P(x, y), b = P(x + 2, y), c = P(x + 2, y + 2), d = P(x, y + 2);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.fill();
    }
  }
  // darker border ring where nothing can be built
  const inner = [P(BORDER, BORDER), P(GRID - BORDER, BORDER), P(GRID - BORDER, GRID - BORDER), P(BORDER, GRID - BORDER)];
  ctx.beginPath();
  ctx.moveTo(corners[0][0], corners[0][1]); for (const c of corners) ctx.lineTo(c[0], c[1]); ctx.closePath();
  ctx.moveTo(inner[0][0], inner[0][1]); for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]); ctx.closePath();
  ctx.fillStyle = 'rgba(40,80,10,0.18)'; ctx.fill('evenodd');
  // tufts
  ctx.strokeStyle = 'rgba(60,110,20,0.55)'; ctx.lineWidth = 1.5;
  for (const t of grassTufts) {
    const p = P(t.gx, t.gy);
    ctx.beginPath();
    ctx.moveTo(p[0] - 3, p[1]); ctx.lineTo(p[0] - 4, p[1] - 5);
    ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - 7);
    ctx.moveTo(p[0] + 3, p[1]); ctx.lineTo(p[0] + 5, p[1] - 5);
    ctx.stroke();
  }
  // forest edge (only back half drawn here, the rest after buildings)
  for (const t of forestTrees) if (t.gx + t.gy < GRID) drawForestTree(t);
}
function drawForestFront() { for (const t of forestTrees) if (t.gx + t.gy >= GRID) drawForestTree(t); }
function drawForestTree(t) {
  const p = P(t.gx, t.gy);
  const col = t.c < 0.33 ? '#2e7d1e' : t.c < 0.66 ? '#3a8f25' : '#28701a';
  circle(p[0], p[1] - t.r * 0.6, t.r, col);
  circle(p[0] - t.r * 0.35, p[1] - t.r * 0.9, t.r * 0.55, shade(col, 0.15));
}

function drawRedZone(blds) {
  ctx.fillStyle = 'rgba(255,40,40,0.16)';
  for (const b of blds) {
    if (b.type === 'wall' || b.destroyed) continue;
    const s = sizeOf(b);
    const pts = [P(b.x - 1, b.y - 1), P(b.x + s + 1, b.y - 1), P(b.x + s + 1, b.y + s + 1), P(b.x - 1, b.y + s + 1)];
    poly(pts, ctx.fillStyle);
  }
}

// ---------- building art ----------
const TH_COLORS = [
  { wall: '#9a6b3c', roof: '#b5652b', stone: '#8d8d84' },
  { wall: '#a37445', roof: '#b9542d', stone: '#9b9b92' },
  { wall: '#b0b0a6', roof: '#c0392b', stone: '#a7a79f' },
  { wall: '#8f97a3', roof: '#2f64b3', stone: '#7f8792' },
  { wall: '#d9c27a', roof: '#7d3cb5', stone: '#a5986d' },
  { wall: '#5a5a66', roof: '#d6462e', stone: '#4a4a55' },
];
const WALL_COLORS = ['#8a5a2b', '#a9a9a0', '#6d6d72', '#e2b93b', '#9b59d0', '#3a3a44'];
const STONE_TIER = ['#8d8d84', '#9b9b92', '#7f8792', '#6f7782', '#a5986d', '#4a4a55'];
const TIER = ['#8a5a2b', '#9e9e96', '#6f7782', '#d4a937', '#8e4fc2', '#40404a'];

function footprintPatch(b) {
  const s = sizeOf(b);
  if (b.type === 'wall') return;
  const pts = [P(b.x + 0.1, b.y + 0.1), P(b.x + s - 0.1, b.y + 0.1), P(b.x + s - 0.1, b.y + s - 0.1), P(b.x + 0.1, b.y + s - 0.1)];
  poly(pts, b.destroyed ? '#5d5a3c' : 'rgba(120,150,50,0.9)', 'rgba(70,100,20,0.6)');
}

function drawBuilding(b, ctxOpts) {
  const s = sizeOf(b), x = b.x, y = b.y;
  const o = ctxOpts || {};
  const lvl = Math.max(1, b.level);
  const tier = TIER[Math.min(TIER.length - 1, Math.floor((lvl - 1)))];
  if (b.destroyed) { drawRubble(b); return; }
  if (b.level === 0 && !b.ruin) { drawConstruction(b); return; }
  const cx = x + s / 2, cy = y + s / 2;
  const c = P(cx, cy);
  switch (b.type) {
    case 'townhall': {
      const col = TH_COLORS[Math.min(5, lvl - 1)];
      isoBox(x + 0.45, y + 0.45, x + s - 0.45, y + s - 0.45, 0, 16, col.stone);
      isoBox(x + 0.55, y + 0.55, x + s - 0.55, y + s - 0.55, 16, 24, col.wall);
      // door
      const d1 = up(P(x + s - 0.55, y + s / 2 + 0.35), 0), d2 = up(P(x + s - 0.55, y + s / 2 - 0.35), 0);
      poly([d1, d2, up(d2, 22), up(d1, 22)], '#3b2412');
      isoPyramid(x + 0.3, y + 0.3, x + s - 0.3, y + s - 0.3, 40, 34, col.roof);
      // chimney
      isoBox(x + 1.0, y + 1.2, x + 1.5, y + 1.7, 52, 18, '#777');
      const ch = up(P(x + 1.25, y + 1.45), 72);
      ctx.fillStyle = 'rgba(200,200,200,' + (0.35 + 0.15 * Math.sin(animT * 2)) + ')';
      circle(ch[0] + Math.sin(animT) * 3, ch[1] - 8 - (animT * 10 % 12), 5, ctx.fillStyle);
      if (lvl >= 3) { // banner
        const p = up(P(x + s - 0.6, y + 0.6), 30);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - 50); ctx.stroke();
        poly([[p[0], p[1] - 50], [p[0] + 18, p[1] - 44], [p[0], p[1] - 38]], col.roof);
      }
      break;
    }
    case 'builderhut': {
      isoBox(x + 0.4, y + 0.4, x + s - 0.4, y + s - 0.4, 0, 18, '#7b6a58');
      isoPyramid(x + 0.25, y + 0.25, x + s - 0.25, y + s - 0.25, 18, 18, '#556070');
      // hammer & saw sign
      const p = up(P(x + s - 0.4, y + s / 2), 12);
      ctx.fillStyle = '#ddd'; ctx.fillRect(p[0] - 5, p[1] - 6, 10, 8);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.strokeRect(p[0] - 5, p[1] - 6, 10, 8);
      break;
    }
    case 'goldmine': {
      isoBox(x + 0.4, y + 0.4, x + s - 0.4, y + s - 0.4, 0, 8, '#8c8273');
      // frame posts
      ctx.strokeStyle = shade(tier, -0.2); ctx.lineWidth = 5; ctx.lineCap = 'round';
      const a = up(P(x + 0.8, y + 1.5), 8), bq = up(P(x + 2.2, y + 1.5), 8);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], a[1] - 34); ctx.lineTo(bq[0], bq[1] - 34); ctx.lineTo(bq[0], bq[1]); ctx.stroke();
      // wheel
      circle((a[0] + bq[0]) / 2, a[1] - 34, 9, '#6a4a2a', '#2a1a0a');
      // gold pile
      const pile = up(P(cx + 0.3, cy + 0.5), 8);
      const amt = o.fillRatio != null ? o.fillRatio : Math.min(1, (storedIn(b) || 0) / lvData(b).cap);
      for (let i = 0; i < 6 + amt * 8; i++) {
        const ang = i * 2.4, rr = 3 + i * 1.2;
        circle(pile[0] + Math.cos(ang) * rr, pile[1] + Math.sin(ang) * rr * 0.5 - i * 0.7, 5, '#f7c62f', '#a07a10');
      }
      // cart
      isoBox(cx - 0.6, cy + 0.2, cx + 0.1, cy + 0.9, 8, 10, '#7a5230');
      break;
    }
    case 'elixircollector': {
      isoCylinder(cx, cy, 1.05, 0, 8, '#8f8678');
      ctx.strokeStyle = shade(tier, -0.1); ctx.lineWidth = 4;
      for (const dx of [-14, 14]) { ctx.beginPath(); ctx.moveTo(c[0] + dx, c[1] - 8); ctx.lineTo(c[0] + dx * 0.6, c[1] - 30); ctx.stroke(); }
      const r = 16 + lvl;
      sphere(c[0], c[1] - 38 - Math.sin(animT * 2 + b.id) * 1.5, r, '#d63cd0');
      isoCylinder(cx, cy, 0.25, 54 + lvl, 8, '#7c7064');
      break;
    }
    case 'goldstorage': {
      const fill = o.fillRatio != null ? o.fillRatio : Math.min(1, S ? S.gold / Math.max(1, storageCap('gold')) : 0.5);
      isoBox(x + 0.35, y + 0.35, x + s - 0.35, y + s - 0.35, 0, 24, '#8a5a2b', { top: '#5a3a1b' });
      // gold heap on top
      const top = up(P(cx, cy), 24);
      ctx.fillStyle = '#f5c22b';
      ctx.beginPath(); ctx.ellipse(top[0], top[1] - fill * 10, 40, 18 + fill * 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a07a10'; ctx.stroke();
      for (let i = 0; i < 8 * fill + 2; i++) circle(top[0] + Math.cos(i * 2.1) * 18, top[1] - fill * 12 + Math.sin(i * 2.1) * 7 - 2, 5, '#ffd84a', '#a07a10');
      // corner posts
      for (const [px, py] of [[x + 0.35, y + s - 0.35], [x + s - 0.35, y + s - 0.35], [x + s - 0.35, y + 0.35]]) {
        const p = P(px, py); ctx.fillStyle = tier; ctx.fillRect(p[0] - 3, p[1] - 28, 6, 28);
      }
      break;
    }
    case 'elixirstorage': {
      const fill = o.fillRatio != null ? o.fillRatio : Math.min(1, S ? S.elixir / Math.max(1, storageCap('elixir')) : 0.5);
      isoCylinder(cx, cy, 1.15, 0, 10, tier === '#8a5a2b' ? '#8f8678' : tier);
      // glass dome
      const base = up(c, 10);
      const rx = 1.0 * TW * 0.707, ry = 1.0 * TH * 0.707;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(base[0], base[1], rx, ry, 0, 0, Math.PI);
      ctx.lineTo(base[0] - rx, base[1] - 20);
      ctx.ellipse(base[0], base[1] - 20, rx, rx * 0.9, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(230,200,255,0.35)'; ctx.fill();
      ctx.clip();
      const lvlY = base[1] + ry - (ry + 20 + rx * 0.9) * fill;
      ctx.fillStyle = '#c02bd0'; ctx.fillRect(base[0] - rx, lvlY, rx * 2, 200);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(base[0] - rx * 0.6, base[1] - 50, 6, 60);
      ctx.restore();
      ctx.strokeStyle = 'rgba(80,0,90,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(base[0], base[1] - 20, rx, rx * 0.9, 0, Math.PI, 0); ctx.stroke();
      // metal bands
      ctx.strokeStyle = shade(tier, 0.2); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(base[0], base[1] - 20 - rx * 0.9); ctx.lineTo(base[0], base[1] + ry); ctx.stroke();
      break;
    }
    case 'barracks': {
      isoBox(x + 0.4, y + 0.4, x + s - 0.4, y + s - 0.4, 0, 22, lvl >= 3 ? '#a9a9a0' : '#9a6b3c');
      isoGable(x + 0.25, y + 0.3, x + s - 0.25, y + s - 0.3, 22, 20, '#c0392b');
      // crossed swords sign
      const p = up(P(x + s - 0.4, y + s / 2), 12);
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p[0] - 6, p[1] - 6); ctx.lineTo(p[0] + 6, p[1] + 6); ctx.moveTo(p[0] + 6, p[1] - 6); ctx.lineTo(p[0] - 6, p[1] + 6); ctx.stroke();
      break;
    }
    case 'armycamp': {
      isoEllipse(cx, cy, 1.7, 0, '#9b8152', 'rgba(60,40,10,0.5)');
      // stones ring
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2;
        const p = P(cx + Math.cos(a) * 1.6, cy + Math.sin(a) * 1.6);
        circle(p[0], p[1] - 2, 3.5, shade(tier, 0.1), 'rgba(0,0,0,0.3)');
      }
      // fire
      const f = P(cx, cy);
      isoEllipse(cx, cy, 0.35, 0, '#555');
      const fl = 1 + Math.sin(animT * 12 + b.id) * 0.15;
      poly([[f[0] - 7, f[1] - 2], [f[0], f[1] - 20 * fl], [f[0] + 7, f[1] - 2]], '#ff7b1a');
      poly([[f[0] - 4, f[1] - 2], [f[0], f[1] - 12 * fl], [f[0] + 4, f[1] - 2]], '#ffe14a');
      // troops resting
      if (o.troops) {
        let i = 0;
        for (const t of o.troops) {
          const a = i * 0.9 + 0.5, rr = 0.8 + (i % 3) * 0.25;
          const tp = P(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          drawTroopFigure(t, tp[0], tp[1], 1, Math.sin(a) > 0 ? 1 : -1, 0, 0);
          i++;
        }
      }
      break;
    }
    case 'clancastle': {
      if (b.ruin) {
        for (let i = 0; i < 7; i++) {
          const p = P(x + 0.6 + (i * 0.37) % 1.8, y + 0.6 + ((i * 0.71) % 1.8));
          poly([[p[0] - 10, p[1]], [p[0] - 4, p[1] - 10], [p[0] + 6, p[1] - 8], [p[0] + 10, p[1]]], i % 2 ? '#8c8c84' : '#73736c', 'rgba(0,0,0,0.35)');
        }
        isoBox(x + 0.5, y + 0.5, x + 1.2, y + 1.2, 0, 16, '#8c8c84');
        break;
      }
      isoBox(x + 0.35, y + 0.35, x + s - 0.35, y + s - 0.35, 0, 30, '#a5a59c');
      // battlements
      for (let i = 0; i < 4; i++) {
        const t = 0.35 + i * (s - 0.7 - 0.35) / 3;
        isoBox(x + t, y + s - 0.7, x + t + 0.35, y + s - 0.35, 30, 8, '#b5b5ac');
        isoBox(x + s - 0.7, y + t, x + s - 0.35, y + t + 0.35, 30, 8, '#b5b5ac');
      }
      const p = up(P(cx, cy), 30);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - 40); ctx.stroke();
      const wave = Math.sin(animT * 4) * 3;
      const flag = S && S.clan ? S.clan.color : '#3a7bd5';
      poly([[p[0], p[1] - 40], [p[0] + 22, p[1] - 36 + wave], [p[0], p[1] - 28]], flag);
      break;
    }
    case 'cannon': {
      isoBox(x + 0.5, y + 0.5, x + s - 0.5, y + s - 0.5, 0, 10, STONE_TIER[Math.min(5, lvl - 1)]);
      isoBox(cx - 0.55, cy - 0.55, cx + 0.55, cy + 0.55, 10, 8, '#7a5230');
      const ang = b.angle != null ? b.angle : Math.PI * 0.25;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const base = up(c, 22);
      const tip = up(P(cx + dx * 1.15, cy + dy * 1.15), 22 + (b.recoil || 0));
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(base[0], base[1] - 2); ctx.lineTo(tip[0], tip[1] - 2); ctx.stroke();
      circle(tip[0], tip[1], 6, '#111');
      if (lvl >= 4) circle(base[0], base[1], 6, '#d4a937');
      break;
    }
    case 'archertower': {
      const wood = lvl >= 4 ? '#8f97a3' : '#8a5a2b';
      isoBox(x + 0.6, y + 0.6, x + s - 0.6, y + s - 0.6, 0, 50, wood, { top: '#6b4422' });
      // cross braces
      ctx.strokeStyle = 'rgba(40,20,0,0.6)'; ctx.lineWidth = 2;
      const l0 = P(x + 0.6, y + s - 0.6), l1 = P(x + s - 0.6, y + s - 0.6), l2 = P(x + s - 0.6, y + 0.6);
      ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1] - 48); ctx.moveTo(l1[0], l1[1]); ctx.lineTo(l0[0], l0[1] - 48);
      ctx.moveTo(l1[0], l1[1]); ctx.lineTo(l2[0], l2[1] - 48); ctx.moveTo(l2[0], l2[1]); ctx.lineTo(l1[0], l1[1] - 48); ctx.stroke();
      isoBox(x + 0.35, y + 0.35, x + s - 0.35, y + s - 0.35, 50, 8, '#a87a4a');
      // archer
      const ap = up(c, 58);
      drawTroopFigure('archer', ap[0], ap[1], 1, 1, 0, 0);
      isoPyramid(x + 0.3, y + 0.3, x + s - 0.3, y + s - 0.3, 78, 18, lvl >= 3 ? '#2f64b3' : '#b5652b');
      // posts holding roof
      ctx.strokeStyle = '#5a3a1b'; ctx.lineWidth = 3;
      for (const [px, py] of [[x + 0.4, y + s - 0.4], [x + s - 0.4, y + s - 0.4], [x + s - 0.4, y + 0.4]]) {
        const p = P(px, py); ctx.beginPath(); ctx.moveTo(p[0], p[1] - 58); ctx.lineTo(p[0], p[1] - 78); ctx.stroke();
      }
      break;
    }
    case 'mortar': {
      isoCylinder(cx, cy, 1.1, 0, 8, '#a08a62');
      for (let i = 0; i < 10; i++) { // sandbags
        const a = i / 10 * Math.PI * 2;
        const p = P(cx + Math.cos(a) * 0.95, cy + Math.sin(a) * 0.95);
        ctx.fillStyle = '#c9b07a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 12, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
      }
      isoCylinder(cx, cy, 0.45, 8, 16 + (b.recoil || 0) * 0.5, lvl >= 3 ? '#4a4a55' : '#333');
      isoEllipse(cx, cy, 0.32, 24 + (b.recoil || 0) * 0.5, '#111');
      break;
    }
    case 'wall': drawWall(b, o.wallSet); break;
    default:
      isoBox(x + 0.3, y + 0.3, x + s - 0.3, y + s - 0.3, 0, 20, '#999');
  }
}

function drawWall(b, wallSet) {
  const col = WALL_COLORS[Math.min(WALL_COLORS.length - 1, Math.max(0, b.level - 1))];
  const x = b.x, y = b.y;
  const h = 18;
  const has = (dx, dy) => wallSet && wallSet.has((x + dx) + ',' + (y + dy));
  if (has(-1, 0)) isoBox(x - 0.5, y + 0.3, x + 0.5, y + 0.7, 0, h - 4, col);
  if (has(0, -1)) isoBox(x + 0.3, y - 0.5, x + 0.7, y + 0.5, 0, h - 4, col);
  isoBox(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, h, col);
  if (b.level >= 6) {
    const p = up(P(x + 0.5, y + 0.5), h);
    poly([[p[0] - 4, p[1]], [p[0], p[1] - 9], [p[0] + 4, p[1]]], '#ff5b2a');
  }
}

function drawConstruction(b) {
  const s = sizeOf(b), x = b.x, y = b.y;
  isoBox(x + 0.4, y + 0.4, x + s - 0.4, y + s - 0.4, 0, 6, '#b08a5a');
  ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = 3;
  const pts = [P(x + 0.4, y + s - 0.4), P(x + s - 0.4, y + s - 0.4), P(x + s - 0.4, y + 0.4), P(x + 0.4, y + 0.4)];
  const h = 14 + s * 6;
  for (const p of pts) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - h); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] - h); ctx.lineTo(pts[1][0], pts[1][1] - h); ctx.lineTo(pts[2][0], pts[2][1] - h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] - h / 2); ctx.lineTo(pts[1][0], pts[1][1] - h / 2); ctx.lineTo(pts[2][0], pts[2][1] - h / 2); ctx.stroke();
}

function drawRubble(b) {
  const s = sizeOf(b);
  if (b.type === 'wall') {
    const p = P(b.x + 0.5, b.y + 0.5);
    circle(p[0] - 4, p[1], 3, '#6d6a60'); circle(p[0] + 3, p[1] + 1, 3, '#5a5750');
    return;
  }
  const rnd = mulberry32(b.id * 31);
  for (let i = 0; i < s * 4; i++) {
    const p = P(b.x + 0.3 + rnd() * (s - 0.6), b.y + 0.3 + rnd() * (s - 0.6));
    const r = 3 + rnd() * 5;
    poly([[p[0] - r, p[1]], [p[0] - r * 0.3, p[1] - r], [p[0] + r, p[1] - r * 0.4], [p[0] + r * 0.8, p[1]]], rnd() < 0.5 ? '#5f5c55' : '#4a473f');
  }
  if (b.smoke == null) b.smoke = rnd();
  const c = P(b.x + s / 2, b.y + s / 2);
  ctx.fillStyle = 'rgba(80,80,80,0.25)';
  circle(c[0], c[1] - 10 - ((animT * 12 + b.smoke * 20) % 20), 7, 'rgba(70,70,70,0.25)');
}

function drawObstacle(o) {
  const cx = o.x + o.size / 2, cy = o.y + o.size / 2;
  const c = P(cx, cy);
  if (o.type === 'tree') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 30, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4422'; ctx.fillRect(c[0] - 4, c[1] - 22, 8, 22);
    circle(c[0], c[1] - 36, 24, '#4c9a2a', 'rgba(0,0,0,0.25)');
    circle(c[0] - 10, c[1] - 44, 13, '#62b33a');
    circle(c[0] + 9, c[1] - 30, 12, '#3f8a22');
  } else if (o.type === 'bush') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    circle(c[0] - 8, c[1] - 10, 14, '#8acb38', 'rgba(0,0,0,0.2)');
    circle(c[0] + 8, c[1] - 12, 15, '#9bd844', 'rgba(0,0,0,0.2)');
    circle(c[0], c[1] - 20, 12, '#aee35a');
  } else {
    const r = o.type === 'bigrock' ? 34 : 24;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 1.2, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    poly([[c[0] - r, c[1]], [c[0] - r * 0.6, c[1] - r * 0.9], [c[0], c[1] - r * 1.5], [c[0] + r * 0.2, c[1] + r * 0.3]], '#b5b5b0', 'rgba(0,0,0,0.3)');
    poly([[c[0], c[1] - r * 1.5], [c[0] + r * 0.7, c[1] - r * 0.8], [c[0] + r, c[1]], [c[0] + r * 0.2, c[1] + r * 0.3]], '#8d8d88', 'rgba(0,0,0,0.3)');
  }
}

// ---------- troops ----------
function drawTroopFigure(type, x, y, scale, face, walk, hurt) {
  const t = TROOPS[type] || TROOPS.barbarian;
  let k = scale * (type === 'giant' ? 1.7 : type === 'goblin' ? 0.8 : 1);
  const bob = walk ? Math.abs(Math.sin(walk * 10)) * 2 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y, 6 * k, 3 * k, 0, 0, Math.PI * 2); ctx.fill();
  const by = y - bob;
  if (type === 'wallbreaker') {
    circle(x, by - 8 * k, 5 * k, '#eee', '#555'); // skull body
    circle(x - 2 * k, by - 9 * k, 1.2 * k, '#222'); circle(x + 2 * k, by - 9 * k, 1.2 * k, '#222');
    circle(x + face * 6 * k, by - 5 * k, 4.5 * k, '#222'); // bomb
    ctx.strokeStyle = '#f80'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + face * 6 * k, by - 9 * k); ctx.lineTo(x + face * 8 * k, by - 12 * k); ctx.stroke();
    return;
  }
  // legs
  ctx.fillStyle = type === 'goblin' ? '#3a7a18' : '#5a3a1b';
  ctx.fillRect(x - 3 * k, by - 5 * k, 2.2 * k, 5 * k);
  ctx.fillRect(x + 0.8 * k, by - 5 * k, 2.2 * k, 5 * k);
  // body
  const bodyCol = type === 'barbarian' ? '#c98d5a' : type === 'archer' ? '#3f8f3a' : type === 'goblin' ? '#5cbf2a' : type === 'giant' ? '#e8a46a' : '#888';
  ctx.fillStyle = hurt ? '#fff' : bodyCol;
  ctx.beginPath(); ctx.ellipse(x, by - 9 * k, 4.5 * k, 5 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
  if (type === 'giant') { ctx.fillStyle = '#7a4a2a'; ctx.fillRect(x - 4.5 * k, by - 8 * k, 9 * k, 2.5 * k); }
  // head
  const skin = type === 'goblin' ? '#7ad63a' : '#f2c49b';
  circle(x, by - 16 * k, 3.6 * k, hurt ? '#fff' : skin, 'rgba(0,0,0,0.4)');
  // hair / features
  if (type === 'barbarian') {
    ctx.fillStyle = '#f3c13a';
    ctx.beginPath(); ctx.arc(x, by - 17 * k, 3.8 * k, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 3 * k, by - 14.5 * k, 6 * k, 1.5 * k); // mustache
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.moveTo(x + face * 4 * k, by - 8 * k); ctx.lineTo(x + face * 9 * k, by - 16 * k); ctx.stroke();
  } else if (type === 'archer') {
    ctx.fillStyle = '#e0418f';
    ctx.beginPath(); ctx.arc(x, by - 17 * k, 4 * k, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    ctx.fillRect(x - face * 4.5 * k, by - 17 * k, 2 * k, 8 * k);
    ctx.strokeStyle = '#6b4422'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x + face * 5 * k, by - 10 * k, 5 * k, -Math.PI / 2, Math.PI / 2, face < 0); ctx.stroke();
  } else if (type === 'goblin') {
    poly([[x - 3 * k, by - 17 * k], [x - 8 * k, by - 19 * k], [x - 3 * k, by - 15 * k]], '#7ad63a');
    poly([[x + 3 * k, by - 17 * k], [x + 8 * k, by - 19 * k], [x + 3 * k, by - 15 * k]], '#7ad63a');
    ctx.fillStyle = '#7a5a2a'; ctx.fillRect(x - face * 6 * k - 2 * k, by - 12 * k, 4 * k, 5 * k);
  } else if (type === 'giant') {
    ctx.fillStyle = '#c87a3a';
    ctx.beginPath(); ctx.arc(x, by - 17.5 * k, 3.8 * k, Math.PI, 0); ctx.fill();
  }
}

// ---------- overlays ----------
function drawBar(wx, wy, w, ratio, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(wx - w / 2 - 1, wy - 1, w + 2, 7);
  ctx.fillStyle = col; ctx.fillRect(wx - w / 2, wy, w * Math.max(0, Math.min(1, ratio)), 5);
}

function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return m + 'm ' + (s ? s + 's' : '');
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

function drawText(txt, x, y, size, col, outline) {
  ctx.font = size + 'px "Lilita One", "Arial Black", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 5); ctx.strokeStyle = outline || '#000';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}

function beginWorld() {
  ctx.setTransform(Cam.zoom * DPR, 0, 0, Cam.zoom * DPR, (VW / 2 - Cam.x * Cam.zoom) * DPR, (VH / 2 - Cam.y * Cam.zoom) * DPR);
}

// Collect and depth-sort drawables. items: {key, draw()}
function drawSorted(items) {
  items.sort((a, b) => a.key - b.key);
  for (const it of items) it.draw();
}

function wallSetOf(blds) {
  const set = new Set();
  for (const b of blds) if (b.type === 'wall' && !b.destroyed && b.level > 0) set.add(b.x + ',' + b.y);
  return set;
}
