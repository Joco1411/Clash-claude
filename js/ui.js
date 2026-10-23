'use strict';
// DOM user interface: HUD, panels, modals, battle HUD and tutorial.

const $ = id => document.getElementById(id);
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function fmt(n) { return Math.floor(n).toLocaleString('en-US').replace(/,/g, ' '); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const RES_ICON = { gold: 'coin', elixir: 'drop', gems: 'gem' };
function resIco(res, sm) { return '<span class="ico ' + RES_ICON[res] + (sm ? ' sm' : '') + '"></span>'; }

const ADVISOR_SVG = `
<svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg">
  <path d="M40 260 Q45 170 100 160 Q155 170 160 260 Z" fill="#3f6f5a"/>
  <path d="M70 175 L100 230 L130 175 Z" fill="#e9c27a"/>
  <rect x="62" y="205" width="76" height="14" rx="5" fill="#d9a53a"/>
  <path d="M125 210 q30 10 25 45 l-25 0 z" fill="#8a5a2b"/>
  <circle cx="100" cy="110" r="44" fill="#f4c7a1"/>
  <path d="M52 112 Q48 50 100 48 Q155 48 150 115 Q160 175 140 200 Q150 130 128 92 Q100 80 72 95 Q55 130 62 200 Q40 170 52 112 Z" fill="#d9442b"/>
  <path d="M60 95 Q100 40 145 100 Q120 70 95 72 Q75 74 60 95Z" fill="#e8583a"/>
  <ellipse cx="85" cy="115" rx="6" ry="8" fill="#fff"/><ellipse cx="117" cy="115" rx="6" ry="8" fill="#fff"/>
  <circle cx="86" cy="117" r="4" fill="#2a6fb0"/><circle cx="116" cy="117" r="4" fill="#2a6fb0"/>
  <path d="M78 102 q8 -5 15 0 M108 102 q8 -5 15 0" stroke="#8a3a1a" stroke-width="3" fill="none"/>
  <ellipse cx="101" cy="140" rx="9" ry="6" fill="#a8473a"/>
  <path d="M30 150 q-5 -30 20 -40 l8 10 q-15 10 -10 35 z" fill="#f4c7a1"/>
</svg>`;

const UI = {
  modalState: null,
  iconCache: {},
  lastChatLen: 0,

  init() {
    $('btnShop').onclick = () => { Sound.play('click'); this.openShop(); };
    $('btnArmy').onclick = () => { Sound.play('click'); this.openArmy(); };
    $('btnAttack').onclick = () => { Sound.play('click'); this.openAttack(); };
    $('btnClan').onclick = () => { Sound.play('click'); this.openClan(); };
    $('btnSettings').onclick = () => { Sound.play('click'); this.openSettings(); };
    $('btnBuyBuilder').onclick = () => { Game.startPlacing('builderhut'); };
    $('mClose').onclick = () => this.closeModal();
    $('modalWrap').addEventListener('pointerdown', e => { if (e.target.id === 'modalWrap' && !this.modalState?.locked) this.closeModal(); });
    $('btnPlaceOk').onclick = () => Game.confirmPlace();
    $('btnPlaceCancel').onclick = () => Game.cancelPlace();
    $('btnEndBattle').onclick = () => {
      const b = Battle.b;
      if (!b) return;
      if (!b.anyDeployed) Game.endBattleEarly();
      else this.confirm('End the battle now?', () => Battle.surrender());
    };
    $('btnNext').onclick = () => Game.nextMatch();
    $('bubble').onclick = () => Tutorial.tap();
    $('advisorArt').innerHTML = ADVISOR_SVG;
  },

  // ---------- HUD ----------
  updateHud() {
    if (!S) return;
    const gc = storageCap('gold'), ec = storageCap('elixir');
    $('hudGold').textContent = fmt(S.gold);
    $('hudElixir').textContent = fmt(S.elixir);
    $('hudGems').textContent = fmt(S.gems);
    $('hudGoldMax').textContent = 'Max: ' + fmt(gc);
    $('hudElixirMax').textContent = 'Max: ' + fmt(ec);
    $('hudGoldFill').style.width = Math.min(100, S.gold / Math.max(1, gc) * 100) + '%';
    $('hudElixirFill').style.width = Math.min(100, S.elixir / Math.max(1, ec) * 100) + '%';
    $('hudLevel').textContent = S.level;
    $('hudName').textContent = S.name;
    $('hudXp').style.width = Math.min(100, S.xp / xpNeeded(S.level) * 100) + '%';
    $('hudTrophies').textContent = fmt(S.trophies);
    $('hudBuildersTxt').textContent = freeBuilders() + '/' + totalBuilders();
    if (Game.sel && !Game.placing) this.refreshSel();
    if (this.modalState && this.modalState.tick) this.modalState.tick();
  },

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 2200);
  },

  floatText(b, txt, res) {
    const s = sizeOf(b);
    Game.floats.push({ x: b.x + s / 2, y: b.y + s / 2, txt, res, t: 0 });
  },

  // ---------- icons rendered with the game renderer ----------
  buildingIcon(type, level, w, h) {
    w = w || 110; h = h || 96;
    const key = type + ':' + level + ':' + w;
    if (this.iconCache[key]) return this.iconCache[key];
    const off = document.createElement('canvas');
    off.width = w * 2; off.height = h * 2;
    const saved = ctx;
    ctx = off.getContext('2d');
    const size = type === 'tree' ? 2 : BUILDINGS[type].size;
    const scale = Math.min(w / (size * TW + 20), h / (size * TH + 90)) * 2;
    const c = P(size / 2, size / 2);
    ctx.setTransform(scale, 0, 0, scale, off.width / 2 - c[0] * scale, off.height * 0.72 - c[1] * scale);
    const fake = { id: 1, type, x: 0, y: 0, level, ruin: false };
    if (type === 'wall') drawWall(fake, null);
    else drawBuilding(fake, { fillRatio: 0.7 });
    ctx = saved;
    return (this.iconCache[key] = off.toDataURL());
  },
  troopIcon(type) {
    const key = 'troop:' + type;
    if (this.iconCache[key]) return this.iconCache[key];
    const off = document.createElement('canvas');
    off.width = 96; off.height = 96;
    const saved = ctx;
    ctx = off.getContext('2d');
    const sc = type === 'giant' ? 2.0 : 3.2;
    ctx.setTransform(sc, 0, 0, sc, 48, 84);
    drawTroopFigure(type, 0, 0, 1, 1, 0, 0);
    ctx = saved;
    return (this.iconCache[key] = off.toDataURL());
  },

  // ---------- selection panel ----------
  showSel(target) {
    $('selPanel').classList.remove('hidden');
    this.refreshSel(true);
  },
  hideSel() { $('selPanel').classList.add('hidden'); },

  refreshSel(force) {
    const t = Game.sel;
    if (!t) return this.hideSel();
    const isObs = !!OBSTACLES[t.type];
    const key = isObs ? 'o' + t.id : [t.id, t.level, !!t.upgrade, t.ruin, storedIn(t) > 0, S.gold, S.elixir, S.gems, freeBuilders(), S.clan ? 1 : 0].join('|');
    if (t.upgrade) {
      const left = (t.upgrade.end - now()) / 1000;
      const sub = $('selSub');
      sub.textContent = (t.level === 0 ? 'Building' : 'Upgrading to level ' + (t.level + 1)) + ' — ' + fmtTime(left);
      const fb = $('selFinish');
      if (fb) fb.querySelector('.cost').innerHTML = finishNowCost(t) + resIco('gems', true);
    }
    const cb = $('selCollect');
    if (cb) cb.querySelector('.cost').innerHTML = fmt(storedIn(t)) + resIco(bDef(t).produces, true);
    if (!force && key === this._selKey) return;
    this._selKey = key;
    const btns = $('selBtns');
    btns.innerHTML = '';
    if (isObs) {
      const d = OBSTACLES[t.type];
      $('selTitle').textContent = d.name;
      $('selSub').textContent = 'Remove to clear space (may contain gems!)';
      this.addSelBtn('Remove', d.cost, d.res, 'green', () => {
        const r = removeObstacle(t);
        if (typeof r === 'string') return this.shortfall(d.res, d.cost, () => { addRes(d.res, d.cost - S[d.res]); this.refreshSel(true); });
        this.toast(r > 0 ? 'Found ' + r + ' gems!' : 'Obstacle removed');
        Game.select(null);
      });
      return;
    }
    const def = bDef(t);
    $('selTitle').textContent = def.name;
    if (!t.upgrade) $('selSub').textContent = t.ruin ? 'Ruined' : 'Level ' + t.level;
    this.addSelBtn('Info', null, null, 'blue', () => this.openInfo(t));
    if (t.upgrade) {
      const fb = this.addSelBtn('Finish', finishNowCost(t), 'gems', 'green', () => {
        const err = finishNow(t);
        if (err) this.toast(err);
        this.refreshSel(true);
      });
      fb.id = 'selFinish';
      this.addSelBtn('Cancel', null, null, 'red', () => this.confirm('Cancel? You will get back only half of the resources.', () => { cancelUpgrade(t); Game.select(null); }));
    } else if (t.ruin) {
      const n = nextLv(t);
      this.addSelBtn('Rebuild', n.cost, def.res, 'green', () => this.tryUpgrade(t));
    } else if (nextLv(t) && t.type !== 'builderhut') {
      const n = nextLv(t);
      this.addSelBtn('Upgrade', n.cost, def.res, 'green', () => this.tryUpgrade(t));
    }
    if (def.produces && !t.upgrade) {
      const c = this.addSelBtn('Collect', storedIn(t), def.produces, 'yellow', () => { collect(t); this.refreshSel(true); });
      c.id = 'selCollect';
    }
    if ((t.type === 'barracks' || t.type === 'armycamp') && t.level > 0) this.addSelBtn('Train', null, null, 'purple', () => this.openArmy());
    if (t.type === 'clancastle' && !t.ruin) {
      this.addSelBtn('Clan', null, null, 'purple', () => this.openClan());
      if (S.clan) this.addSelBtn('Request', null, null, 'yellow', () => {
        const err = Clan.requestTroops();
        this.toast(err || 'Troops requested!');
      });
    }
  },

  addSelBtn(label, cost, res, color, fn) {
    const b = el('button', 'selBtn ' + color);
    b.innerHTML = '<span class="lbl">' + label + '</span>' + (cost != null ? '<span class="cost">' + fmt(cost) + resIco(res, true) + '</span>' : '<span class="cost"></span>');
    b.onclick = e => { e.stopPropagation(); Sound.play('click'); fn(); };
    $('selBtns').appendChild(b);
    return b;
  },

  tryUpgrade(t) {
    const err = upgradeError(t);
    if (err) return this.toast(err);
    const n = nextLv(t), res = bDef(t).res;
    if (S[res] < n.cost) return this.shortfall(res, n.cost, () => this.tryUpgrade(t));
    const run = () => {
      const e2 = startUpgrade(t);
      if (e2) this.toast(e2);
      this.refreshSel(true);
    };
    if (t.ruin || t.level === 0) run();
    else this.confirm('Upgrade ' + bDef(t).name + ' to level ' + (t.level + 1) + ' for ' + fmt(n.cost) + ' ' + res + '?' + (n.time ? '<br>Time: ' + fmtTime(n.time) : ''), run);
  },

  // Offer to buy missing resources with gems, then retry.
  shortfall(res, need, retry) {
    if (res === 'gems') { this.toast('Not enough gems'); return; }
    const missing = need - S[res];
    if (need > storageCap(res)) { this.toast('Upgrade your ' + res + ' storage first!'); return; }
    const gems = gemsForRes(missing);
    this.confirm('You need ' + fmt(missing) + ' more ' + res + '.<br>Buy it for ' + gems + ' ' + resIco('gems', true) + '?', () => {
      if (S.gems < gems) return this.toast('Not enough gems');
      S.gems -= gems; addRes(res, missing);
      retry();
    });
  },

  confirm(html, onYes) {
    this.open('Are you sure?', {
      small: true,
      render: body => {
        body.innerHTML = '<p class="center">' + html + '</p>';
        const row = el('div', 'row center');
        const yes = el('button', 'btn green', 'Okay'), no = el('button', 'btn red', 'Cancel');
        yes.onclick = () => { this.closeModal(); onYes(); };
        no.onclick = () => this.closeModal();
        row.append(yes, no);
        body.appendChild(row);
      },
    });
  },

  // ---------- modal framework ----------
  open(title, st) {
    this.modalState = st;
    $('mTitle').textContent = title;
    $('modal').className = st.small ? 'small' : '';
    $('modalWrap').classList.remove('hidden');
    $('mClose').style.display = st.locked ? 'none' : '';
    const tabs = $('mTabs');
    tabs.innerHTML = '';
    if (st.tabs) {
      st.tab = st.tab || st.tabs[0];
      for (const t of st.tabs) {
        const b = el('button', 'tab' + (t === st.tab ? ' on' : ''), t);
        b.onclick = () => { st.tab = t; Sound.play('click'); this.open(title, st); };
        tabs.appendChild(b);
      }
    }
    const body = $('mBody');
    body.innerHTML = '';
    body.scrollTop = 0;
    st.render(body, st.tab);
  },
  rerender() {
    const st = this.modalState;
    if (!st) return;
    const body = $('mBody');
    const sc = body.scrollTop;
    body.innerHTML = '';
    st.render(body, st.tab);
    body.scrollTop = sc;
  },
  closeModal() {
    const st = this.modalState;
    this.modalState = null;
    $('modalWrap').classList.add('hidden');
    if (st && st.onClose) st.onClose();
  },

  // ---------- shop ----------
  openShop(tab) {
    Game.select(null);
    const tabs = Object.keys(SHOP).concat(['Treasure']);
    this.open('Shop', {
      tabs, tab: tab || (Tutorial.shopTab()) || 'Resources',
      render: (body, t) => {
        if (t === 'Treasure') return this.renderTreasure(body);
        const grid = el('div', 'cards');
        for (const type of SHOP[t]) {
          const def = BUILDINGS[type];
          const c = buildCost(type);
          const err = buildError(type);
          const free = S.tutorialFree === type;
          const card = el('div', 'card' + (err ? ' locked' : '') + (Tutorial.highlight === type ? ' pulse' : ''));
          const lim = type === 'builderhut' ? 5 : limitOf(type);
          card.innerHTML =
            '<div class="cname">' + def.name + '</div>' +
            '<img src="' + this.buildingIcon(type, 1) + '">' +
            '<div class="cinfo">Built: ' + countOf(type) + '/' + lim + (def.levels[0].time ? ' · ' + fmtTime(def.levels[0].time) : '') + '</div>' +
            (err ? '<div class="cerr">' + err + '</div>' : '') +
            '<div class="ccost">' + (free ? 'FREE' : fmt(c.amt) + resIco(c.res, true)) + '</div>';
          card.onclick = () => {
            if (err) return this.toast(err);
            if (!free && S[c.res] < c.amt) return this.shortfall(c.res, c.amt, () => { this.closeModal(); Game.startPlacing(type); });
            this.closeModal();
            Game.startPlacing(type);
          };
          grid.appendChild(card);
        }
        body.appendChild(grid);
      },
    });
  },

  renderTreasure(body) {
    body.appendChild(el('p', 'center', 'Spend gems to fill your storages instantly.'));
    const grid = el('div', 'cards');
    for (const res of ['gold', 'elixir']) {
      for (const pct of [0.1, 0.5, 1]) {
        const cap = storageCap(res);
        const amt = Math.max(0, Math.floor(cap * pct - (pct === 1 ? S[res] : 0)));
        const gems = gemsForRes(amt);
        const card = el('div', 'card' + (amt <= 0 ? ' locked' : ''));
        card.innerHTML = '<div class="cname">' + (pct === 1 ? 'Fill ' : Math.round(pct * 100) + '% of ') + res + '</div>' +
          '<div class="bigico">' + resIco(res) + '</div><div class="cinfo">+' + fmt(amt) + '</div><div class="ccost">' + gems + resIco('gems', true) + '</div>';
        card.onclick = () => {
          if (amt <= 0) return this.toast('Storage is already full');
          if (S.gems < gems) return this.toast('Not enough gems');
          S.gems -= gems; addRes(res, amt); Sound.play('collect'); this.rerender();
        };
        grid.appendChild(card);
      }
    }
    const daily = el('div', 'card');
    const ready = !S.lastDaily || Date.now() - S.lastDaily > 4 * 3600000;
    daily.innerHTML = '<div class="cname">Free gems</div><div class="bigico">' + resIco('gems') + '</div><div class="cinfo">' +
      (ready ? 'Ready!' : 'Again in ' + fmtTime((S.lastDaily + 4 * 3600000 - Date.now()) / 1000)) + '</div><div class="ccost">+25' + resIco('gems', true) + '</div>';
    daily.onclick = () => {
      if (!ready) return this.toast('Come back later!');
      S.lastDaily = Date.now(); S.gems += 25; Sound.play('collect'); this.rerender();
    };
    grid.appendChild(daily);
    body.appendChild(grid);
  },

  // ---------- army ----------
  openArmy() {
    Game.select(null);
    const st = {
      render: body => {
        const cap = armyCap();
        const head = el('div', 'armyHead');
        head.innerHTML = '<b>Army:</b> <span id="armyCount">' + armyHousing() + '/' + cap + '</span>' +
          (activeBarracks() ? '' : ' <span class="warn">— build a Barracks to train troops</span>') +
          (cap ? '' : ' <span class="warn">— build an Army Camp to house troops</span>');
        body.appendChild(head);
        // current army
        const have = el('div', 'troopRow');
        const types = Object.keys(S.army).filter(t => S.army[t] > 0);
        if (!types.length) have.appendChild(el('div', 'muted', 'No troops yet.'));
        for (const t of types) have.appendChild(this.troopChip(t, S.army[t]));
        body.appendChild(have);
        // queue
        const q = el('div', 'queue');
        q.id = 'armyQueue';
        body.appendChild(el('div', 'sect', 'Training'));
        body.appendChild(q);
        this.renderQueue(q);
        // train buttons
        body.appendChild(el('div', 'sect', 'Train troops'));
        const grid = el('div', 'cards troops');
        for (const type of Object.keys(TROOPS)) {
          const d = TROOPS[type];
          const locked = d.barracks > maxBarracksLevel();
          const card = el('div', 'card troop' + (locked ? ' locked' : '') + (Tutorial.highlight === type ? ' pulse' : ''));
          card.innerHTML = '<div class="cname">' + d.name + '</div><img src="' + this.troopIcon(type) + '">' +
            '<div class="cinfo">' + (locked ? 'Barracks lvl ' + d.barracks : 'Lv ' + troopLevel() + ' · Space ' + d.housing + ' · ' + d.time + 's') + '</div>' +
            '<div class="ccost">' + d.cost + resIco('elixir', true) + '</div>';
          card.onclick = () => {
            const err = queueTroop(type);
            if (err) {
              if (err === 'Not enough elixir') return this.shortfall('elixir', d.cost, () => card.onclick());
              return this.toast(err);
            }
            Sound.play('click');
            this.rerender();
          };
          grid.appendChild(card);
        }
        body.appendChild(grid);
        // CC troops
        if (ccCap()) {
          body.appendChild(el('div', 'sect', 'Clan Castle troops (' + housingOf(S.cc) + '/' + ccCap() + ')'));
          const row = el('div', 'troopRow');
          const ct = Object.keys(S.cc).filter(t => S.cc[t] > 0);
          if (!ct.length) row.appendChild(el('div', 'muted', S.clan ? 'Request troops from your clan!' : 'Join a clan to receive troops.'));
          for (const t of ct) row.appendChild(this.troopChip(t, S.cc[t]));
          body.appendChild(row);
        }
      },
      tick: () => {
        const q = $('armyQueue');
        if (!q) return;
        const sig = S.queue.length + ':' + armyHousing();
        if (sig !== st.sig) { st.sig = sig; this.rerender(); return; }
        const bar = $('qbar');
        if (bar && S.trainEnd) {
          const d = TROOPS[S.queue[0]];
          const total = d.time * 1000 / Math.max(1, activeBarracks());
          bar.style.width = Math.max(0, Math.min(100, (1 - (S.trainEnd - now()) / total) * 100)) + '%';
        }
      },
    };
    st.sig = S.queue.length + ':' + armyHousing();
    this.open('Army', st);
  },

  renderQueue(q) {
    if (!S.queue.length) { q.appendChild(el('div', 'muted', 'Nothing in training. Tap a troop below to train it.')); return; }
    const groups = [];
    for (const t of S.queue) {
      const g = groups[groups.length - 1];
      if (g && g.t === t) g.n++; else groups.push({ t, n: 1 });
    }
    groups.forEach((g, i) => {
      const chip = this.troopChip(g.t, g.n, true);
      if (i === 0) chip.appendChild(el('div', 'qprog', '<div id="qbar"></div>'));
      chip.onclick = () => { unqueueTroop(g.t); this.rerender(); };
      q.appendChild(chip);
    });
    const fin = el('button', 'btn green small', 'Finish ' + finishTrainingCost() + resIco('gems', true));
    fin.onclick = () => { const e = finishTrainingNow(); if (e) this.toast(e); this.rerender(); };
    q.appendChild(fin);
  },

  troopChip(type, n, removable) {
    const c = el('div', 'chip');
    c.innerHTML = '<img src="' + this.troopIcon(type) + '"><span class="cnt">x' + n + '</span>' + (removable ? '<span class="rm">−</span>' : '');
    return c;
  },

  // ---------- attack ----------
  openAttack() {
    Game.select(null);
    this.open('Attack', {
      render: body => {
        const army = armyHousing();
        if (!army && !housingOf(S.cc)) body.appendChild(el('p', 'warn center', 'You have no troops! Train some in your Barracks first.'));
        const grid = el('div', 'cards wide');
        const sp = el('div', 'card big');
        const stars = S.campaign.reduce((a, c) => a + (c ? c.stars : 0), 0);
        sp.innerHTML = '<div class="cname">Single Player</div><div class="bigico goblin">' + '<img src="' + this.troopIcon('goblin') + '">' +
          '</div><div class="cinfo">Goblin maps · ' + stars + '/' + CAMPAIGN.length * 3 + ' ★</div>';
        sp.onclick = () => this.openCampaign();
        const mp = el('div', 'card big' + (Tutorial.active() ? ' locked' : ''));
        const cost = Game.searchCost();
        mp.innerHTML = '<div class="cname">Find a Match</div><div class="bigico"><span class="ico swords big"></span></div><div class="cinfo">Raid other villages for loot & trophies</div>' +
          '<div class="ccost">' + fmt(cost) + resIco('gold', true) + '</div>';
        mp.onclick = () => {
          if (Tutorial.active()) return this.toast('Finish the tutorial first');
          if (!army && !housingOf(S.cc)) return this.toast('Train some troops first');
          if (S.gold < cost) return this.toast('Not enough gold');
          this.closeModal(); Game.startMatch();
        };
        grid.append(sp, mp);
        body.appendChild(grid);
      },
    });
  },

  openCampaign() {
    this.open('Goblin Maps', {
      render: body => {
        const list = el('div', 'list');
        CAMPAIGN.forEach((m, i) => {
          const rec = S.campaign[i] || { stars: 0, gold: m.gold, elixir: m.elixir };
          const unlocked = i === 0 || (S.campaign[i - 1] && S.campaign[i - 1].stars > 0);
          const row = el('div', 'lrow' + (unlocked ? '' : ' locked') + (Tutorial.highlight === 'campaign' && i === 0 ? ' pulse' : ''));
          row.innerHTML = '<div class="lnum">' + (i + 1) + '</div><div class="lmain"><b>' + m.name + '</b><div class="muted">Town Hall ' + m.th + ' · ' +
            fmt(rec.gold) + resIco('gold', true) + ' ' + fmt(rec.elixir) + resIco('elixir', true) + '</div></div>' +
            '<div class="lstars">' + '<span class="on">★</span>'.repeat(rec.stars) + '<span>★</span>'.repeat(3 - rec.stars) + '</div>';
          const b = el('button', 'btn green small', unlocked ? 'Attack!' : '🔒');
          b.onclick = () => {
            if (!unlocked) return this.toast('Earn a star on the previous map first');
            if (!armyHousing() && !housingOf(S.cc)) return this.toast('Train some troops first');
            this.closeModal(); Game.startCampaign(i);
          };
          row.appendChild(b);
          list.appendChild(row);
        });
        body.appendChild(list);
      },
    });
  },

  // ---------- info ----------
  openInfo(t) {
    const def = bDef(t);
    this.open(def.name + (t.level ? ' (Level ' + t.level + ')' : ''), {
      render: body => {
        const top = el('div', 'infoTop');
        top.innerHTML = '<img src="' + this.buildingIcon(t.type, Math.max(1, t.level)) + '"><p>' + def.desc + '</p>';
        body.appendChild(top);
        const cur = lvData(t), nx = nextLv(t);
        const rows = [];
        const add = (label, k, f) => {
          const a = cur ? cur[k] : null, b = nx ? nx[k] : null;
          if (a == null && b == null) return;
          rows.push('<tr><td>' + label + '</td><td>' + (a != null ? (f ? f(a) : fmt(a)) : '-') + '</td><td class="next">' + (b != null && nx ? (f ? f(b) : fmt(b)) : '') + '</td></tr>');
        };
        add('Hitpoints', 'hp');
        if (def.cat === 'defense' && t.type !== 'wall') { add('Damage/sec', 'dps'); rows.push('<tr><td>Range</td><td>' + def.range + ' tiles</td><td></td></tr>'); }
        if (def.produces) { add('Production/min', 'rate'); add('Capacity', 'cap'); }
        if (def.stores || t.type === 'townhall') add('Storage capacity', 'cap');
        if (t.type === 'armycamp') add('Troop capacity', 'cap');
        if (t.type === 'clancastle') add('Troop capacity', 'cap');
        if (t.type === 'barracks') {
          const un = Object.keys(TROOPS).filter(k => TROOPS[k].barracks === t.level + 1);
          rows.push('<tr><td>Unlocks</td><td>' + Object.keys(TROOPS).filter(k => TROOPS[k].barracks <= t.level).map(k => TROOPS[k].name).join(', ') + '</td><td class="next">' + un.map(k => TROOPS[k].name).join(', ') + '</td></tr>');
        }
        if (nx) rows.push('<tr><td>Upgrade cost</td><td></td><td class="next">' + fmt(nx.cost) + resIco(def.res, true) + (nx.time ? ' · ' + fmtTime(nx.time) : '') + '</td></tr>');
        if (nx && t.type !== 'townhall' && nx.th > thLevel()) rows.push('<tr><td colspan="3" class="warn">Next level requires Town Hall ' + nx.th + '</td></tr>');
        if (t.type === 'townhall') {
          const th = Math.max(1, t.level);
          const unlocks = Object.keys(LIMITS).filter(k => k !== 'townhall' && (LIMITS[k][th + 1] || 0) > (LIMITS[k][th] || 0)).map(k => BUILDINGS[k].name + ' x' + (LIMITS[k][th + 1] - LIMITS[k][th]));
          if (unlocks.length && th < MAX_TH) rows.push('<tr><td>Next unlocks</td><td colspan="2" class="next">' + unlocks.join(', ') + '</td></tr>');
        }
        body.appendChild(el('table', 'stats', '<tr><th></th><th>Now</th><th>Next</th></tr>' + rows.join('')));
      },
    });
  },

  // ---------- settings ----------
  openSettings() {
    this.open('Settings', {
      render: body => {
        const name = el('div', 'row');
        name.innerHTML = '<label>Name</label>';
        const inp = el('input'); inp.value = S.name; inp.maxLength = 16;
        inp.onchange = () => { S.name = inp.value.trim().slice(0, 16) || 'Chief'; };
        name.appendChild(inp);
        body.appendChild(name);
        const snd = el('button', 'btn ' + (S.sound ? 'green' : 'red'), 'Sound: ' + (S.sound ? 'On' : 'Off'));
        snd.onclick = () => { S.sound = !S.sound; Sound.unlock(); this.rerender(); };
        const fs = el('button', 'btn blue', 'Fullscreen');
        fs.onclick = () => { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); };
        const reset = el('button', 'btn red', 'Reset village');
        reset.onclick = () => this.confirm('Delete your village and start over?', () => { resetGame(); Game.afterLoad(); });
        const row = el('div', 'row center'); row.append(snd, fs, reset);
        body.appendChild(row);
        body.appendChild(el('div', 'help', `
          <b>How to play</b><ul>
          <li>Drag to move the camera, pinch (or mouse wheel) to zoom.</li>
          <li>Tap a building to select it. Drag a selected building to move it.</li>
          <li>Tap Gold Mines and Elixir Collectors to collect resources.</li>
          <li>Train troops at the Barracks, then press <b>Attack!</b> to raid goblins or other villages.</li>
          <li>During battle, tap or hold on the grass (outside the red zones) to deploy troops.</li>
          <li>Destroy 50% for a star, the Town Hall for another, and everything for three stars.</li>
          <li>Rebuild the Clan Castle to join a clan: chat, get troop donations, fight Clan Wars and build the Clan Capital.</li>
          </ul><p class="muted">Clash Claude is a fan-made tribute; all art is drawn procedurally in code. Progress is saved in this browser.</p>`));
      },
    });
  },

  // ---------- clan ----------
  openClan(tab) {
    Game.select(null);
    const cc = S.buildings.find(b => b.type === 'clancastle');
    if (!cc || cc.ruin || cc.level === 0) {
      this.open('Clan', {
        small: true,
        render: body => {
          body.innerHTML = '<p class="center">Your Clan Castle is in ruins. Rebuild it to join or create a clan!</p>';
          const b = el('button', 'btn green', 'Show me');
          b.onclick = () => { this.closeModal(); Game.focusOn(cc); Game.select(cc); };
          const r = el('div', 'row center'); r.appendChild(b); body.appendChild(r);
        },
      });
      return;
    }
    if (!S.clan) return this.openClanBrowse();
    const st = {
      tabs: ['Chat', 'Members', 'War', 'Capital', 'Info'], tab: tab || 'Chat',
      render: (body, t) => {
        if (t === 'Chat') this.renderChat(body);
        else if (t === 'Members') this.renderMembers(body);
        else if (t === 'War') this.renderWar(body);
        else if (t === 'Capital') this.renderCapital(body);
        else this.renderClanInfo(body);
      },
      tick: () => {
        if (st.tab === 'War' || st.tab === 'Capital') {
          const sig = JSON.stringify(S.clan && S.clan.war ? [S.clan.war.state, S.clan.war.ourStars, S.clan.war.theirStars, S.clan.war.log.length] : 0) + (S.clan ? S.clan.capital.level + ':' + S.clan.capital.progress : '');
          const tm = $('warTimer');
          if (tm && S.clan.war) tm.textContent = this.warTimeText(S.clan.war);
          if (sig !== st.sig) { st.sig = sig; this.rerender(); }
        }
        if (st.tab === 'Chat') {
          const cd = $('reqBtn');
          if (cd) { const c = Clan.requestCooldown(); cd.textContent = c > 0 ? 'Request (' + Math.ceil(c / 1000) + 's)' : 'Request troops'; }
        }
      },
    };
    this.open(S.clan.name, st);
  },

  openClanBrowse() {
    this.open('Clans', {
      tabs: ['Join', 'Create'],
      render: (body, t) => {
        if (t === 'Join') {
          const list = el('div', 'list');
          for (const c of Clan.browseList()) {
            const row = el('div', 'lrow');
            row.innerHTML = '<div class="badge" style="background:' + c.color + '">' + c.level + '</div><div class="lmain"><b>' + esc(c.name) + '</b><div class="muted">' +
              c.members + '/50 members · <span class="ico trophy sm"></span>' + fmt(c.trophies) + (c.req ? ' · requires ' + c.req + ' trophies' : ' · anyone can join') + '</div></div>';
            const b = el('button', 'btn green small', 'Join');
            b.onclick = () => {
              if (S.trophies < c.req) return this.toast('You need ' + c.req + ' trophies to join');
              Clan.join(c); this.toast('Joined ' + c.name + '!'); this.openClan();
            };
            row.appendChild(b);
            list.appendChild(row);
          }
          body.appendChild(list);
        } else {
          body.appendChild(el('p', 'center', 'Found your own clan for ' + fmt(CREATE_CLAN_COST) + resIco('gold', true)));
          const row = el('div', 'row center');
          const inp = el('input'); inp.placeholder = 'Clan name'; inp.maxLength = 18;
          const b = el('button', 'btn green', 'Create');
          b.onclick = () => {
            const nm = inp.value.trim();
            if (nm.length < 3) return this.toast('Name must be at least 3 letters');
            const err = Clan.create(nm);
            if (err) return this.toast(err);
            this.openClan();
          };
          row.append(inp, b);
          body.appendChild(row);
        }
      },
    });
  },

  renderChat(body) {
    const wrap = el('div', 'chatWrap');
    const log = el('div', 'chatLog');
    log.id = 'chatLog';
    wrap.appendChild(log);
    const bar = el('div', 'chatBar');
    const inp = el('input'); inp.placeholder = 'Say something...'; inp.maxLength = 140; inp.id = 'chatInput';
    const send = el('button', 'btn green small', 'Send');
    const doSend = () => { Clan.say(inp.value); inp.value = ''; };
    send.onclick = doSend;
    inp.onkeydown = e => { if (e.key === 'Enter') doSend(); };
    const req = el('button', 'btn yellow small', 'Request troops'); req.id = 'reqBtn';
    req.onclick = () => { const err = Clan.requestTroops(); this.toast(err || 'Troops requested!'); };
    bar.append(inp, send, req);
    wrap.appendChild(bar);
    body.appendChild(wrap);
    this.fillChat();
  },

  fillChat() {
    const log = $('chatLog');
    if (!log || !S.clan) return;
    log.innerHTML = '';
    for (const m of S.clan.chat) {
      const row = el('div', 'msg ' + (m.kind === 'sys' ? 'sys' : m.me ? 'me' : ''));
      if (m.kind === 'sys') { row.textContent = m.text; log.appendChild(row); continue; }
      row.innerHTML = '<b>' + esc(m.from) + '</b> ' + esc(m.text);
      if (m.kind === 'request' && !m.me) {
        const full = (m.filled || 0) >= m.cap;
        row.appendChild(el('div', 'reqfill', (m.filled || 0) + '/' + m.cap));
        if (!full) {
          const opts = el('div', 'donate');
          for (const t of Object.keys(S.army).filter(t => S.army[t] > 0)) {
            const b = el('button', 'dbtn', '<img src="' + this.troopIcon(t) + '"><span>' + S.army[t] + '</span>');
            b.onclick = () => { const err = Clan.donate(m, t); if (err) this.toast(err); else Sound.play('deploy'); this.fillChat(); };
            opts.appendChild(b);
          }
          if (!opts.children.length) opts.appendChild(el('span', 'muted', 'Train troops to donate'));
          row.appendChild(opts);
        }
      }
      log.appendChild(row);
    }
    log.scrollTop = log.scrollHeight;
  },

  onClanChat() {
    if (this.modalState && this.modalState.tab === 'Chat') this.fillChat();
  },

  renderMembers(body) {
    const c = S.clan;
    const all = c.members.map(m => Object.assign({}, m)).concat([{ name: S.name, level: S.level, th: thLevel(), trophies: S.trophies, donated: S.stats.donated, received: S.stats.received, role: c.role, me: true }]);
    all.sort((a, b) => b.trophies - a.trophies);
    const list = el('div', 'list');
    all.forEach((m, i) => {
      const row = el('div', 'lrow' + (m.me ? ' me' : ''));
      row.innerHTML = '<div class="lnum">' + (i + 1) + '</div><div class="lvlBadge sm">' + m.level + '</div><div class="lmain"><b>' + esc(m.name) + '</b><div class="muted">' + m.role + ' · TH' + m.th +
        ' · donated ' + m.donated + ' · received ' + m.received + '</div></div><div class="ltroph"><span class="ico trophy sm"></span>' + fmt(m.trophies) + '</div>';
      list.appendChild(row);
    });
    body.appendChild(el('div', 'muted center', all.length + '/50 members'));
    body.appendChild(list);
  },

  warTimeText(w) {
    const t = Date.now();
    if (w.state === 'prep') return 'Preparation day — battle starts in ' + fmtTime((w.prepEnd - t) / 1000);
    if (w.state === 'battle') return 'Battle day — ends in ' + fmtTime((w.end - t) / 1000);
    return 'War ended';
  },

  renderWar(body) {
    const c = S.clan, w = c.war;
    if (!w || w.state === 'ended') {
      if (w) {
        const res = el('div', 'warResult ' + w.result);
        res.innerHTML = '<div class="big">' + (w.result === 'win' ? 'Victory!' : w.result === 'draw' ? 'Draw' : 'Defeat') + '</div>' +
          '<div>' + esc(c.name) + ' ' + w.ourStars + '★ — ' + w.theirStars + '★ ' + esc(w.enemyName) + '</div>' + (w.reward ? '<div>War loot: ' + fmt(w.reward) + resIco('gold', true) + fmt(w.reward) + resIco('elixir', true) + '</div>' : '');
        body.appendChild(res);
      }
      body.appendChild(el('p', 'center', 'Wars won: ' + c.warsWon + ' · lost: ' + c.warsLost));
      const b = el('button', 'btn green', 'Start Clan War');
      b.onclick = () => { const err = Clan.startWar(); if (err) this.toast(err); this.rerender(); };
      const r = el('div', 'row center'); r.appendChild(b); body.appendChild(r);
      body.appendChild(el('p', 'muted center', 'Clan Wars: every member gets 2 attacks on the enemy clan\'s bases. The clan with the most stars wins bonus loot.'));
      return;
    }
    const head = el('div', 'warHead');
    head.innerHTML = '<div class="side us"><b>' + esc(c.name) + '</b><div class="wstars">' + w.ourStars + '★</div><div class="muted">' + w.ourPct + '%</div></div>' +
      '<div class="vs">VS<div id="warTimer" class="muted">' + this.warTimeText(w) + '</div></div>' +
      '<div class="side them"><b>' + esc(w.enemyName) + '</b><div class="wstars">' + w.theirStars + '★</div><div class="muted">' + w.theirPct + '%</div></div>';
    body.appendChild(head);
    body.appendChild(el('div', 'sect', 'Enemy bases · your attacks left: ' + w.myAttacks));
    const list = el('div', 'list');
    w.enemy.forEach((e, i) => {
      const row = el('div', 'lrow');
      row.innerHTML = '<div class="lnum">' + (i + 1) + '</div><div class="lmain"><b>' + esc(e.name) + '</b><div class="muted">Town Hall ' + e.th + (e.attackedBy.length ? ' · attacked ' + e.attackedBy.length + 'x' : '') + '</div></div>' +
        '<div class="lstars">' + '<span class="on">★</span>'.repeat(e.stars) + '<span>★</span>'.repeat(3 - e.stars) + '</div>';
      const b = el('button', 'btn green small', 'Attack');
      b.disabled = w.state !== 'battle' || w.myAttacks <= 0;
      b.onclick = () => {
        if (!armyHousing() && !housingOf(S.cc)) return this.toast('Train some troops first');
        this.closeModal(); Game.startWarAttack(i);
      };
      row.appendChild(b);
      list.appendChild(row);
    });
    body.appendChild(list);
    if (w.log.length) {
      body.appendChild(el('div', 'sect', 'War log'));
      body.appendChild(el('div', 'warlog', w.log.slice(0, 12).map(esc).join('<br>')));
    }
  },

  renderCapital(body) {
    const cap = S.clan.capital;
    const next = Clan.capitalNext();
    const top = el('div', 'capital');
    top.innerHTML = '<div class="capHall"><img src="' + this.buildingIcon('townhall', Math.min(6, cap.level + 1), 160, 140) + '"></div>' +
      '<div><div class="big">Capital Hall level ' + cap.level + '</div>' +
      (next ? '<div>Next district: <b>' + next.district + '</b></div><div class="pbar"><div style="width:' + (cap.progress / next.cost * 100) + '%"></div><span>' + fmt(cap.progress) + ' / ' + fmt(next.cost) + '</span></div>' : '<div>All districts unlocked!</div>') +
      '<div class="muted">You contributed ' + fmt(cap.contributed) + ' gold</div></div>';
    body.appendChild(top);
    const dist = el('div', 'districts');
    CAPITAL_LEVELS.forEach((d, i) => {
      dist.appendChild(el('div', 'district' + (i < cap.level ? ' on' : ''), (i < cap.level ? '🏰 ' : '🔒 ') + d.district));
    });
    body.appendChild(dist);
    if (next) {
      const row = el('div', 'row center');
      for (const amt of [100, 1000, 10000]) {
        const b = el('button', 'btn yellow small', 'Give ' + fmt(amt) + resIco('gold', true));
        b.onclick = () => { const err = Clan.contribute(amt); if (err) this.toast(err); else Sound.play('collect'); this.rerender(); };
        row.appendChild(b);
      }
      body.appendChild(row);
    }
  },

  renderClanInfo(body) {
    const c = S.clan;
    body.appendChild(el('div', 'center', '<div class="badge big" style="background:' + c.color + '">⚔</div><h3>' + esc(c.name) + '</h3><p>Your role: ' + c.role + '</p><p>' + (c.members.length + 1) + '/50 members · Wars won: ' + c.warsWon + '</p>'));
    const b = el('button', 'btn red', 'Leave clan');
    b.onclick = () => this.confirm('Leave ' + esc(c.name) + '? Clan Castle troops will be lost.', () => { Clan.leave(); this.toast('You left the clan'); });
    const r = el('div', 'row center'); r.appendChild(b); body.appendChild(r);
  },

  // ---------- battle HUD ----------
  showBattleHud(show) {
    $('battleHud').classList.toggle('hidden', !show);
    $('hud').classList.toggle('hidden', show);
    if (show) this.buildTroopBar();
  },

  buildTroopBar() {
    const b = Battle.b;
    const bar = $('bTroops');
    bar.innerHTML = '';
    for (const t of Object.keys(b.deploy)) {
      if (!b.deploy[t] && !b.deployed[t]) continue;
      const btn = el('button', 'tbtn');
      btn.dataset.t = t;
      btn.innerHTML = '<img src="' + this.troopIcon(t) + '"><span class="cnt"></span>';
      btn.onclick = () => { b.selected = t; Sound.play('click'); this.updateBattleHud(); };
      bar.appendChild(btn);
    }
    if (Object.keys(b.ccLeft).some(t => b.ccLeft[t] > 0)) {
      const btn = el('button', 'tbtn cc');
      btn.dataset.t = 'cc';
      btn.innerHTML = '<span class="ico shield"></span><span class="cnt"></span>';
      btn.onclick = () => { b.selected = 'cc'; Sound.play('click'); this.updateBattleHud(); };
      bar.appendChild(btn);
    }
    if (!bar.children.length) bar.appendChild(el('div', 'muted', 'No troops!'));
    this.updateBattleHud();
  },

  updateBattleHud() {
    const b = Battle.b;
    if (!b) return;
    const lootLeft = r => b.lootTotal[r] - b.loot[r];
    $('bLootGold').textContent = fmt(lootLeft('gold'));
    $('bLootElixir').textContent = fmt(lootLeft('elixir'));
    $('bEnemyName').textContent = b.opts.name || 'Enemy';
    $('bPhase').textContent = b.phase === 'scout' ? 'Battle starts in:' : 'Battle ends in:';
    const t = Math.max(0, Math.ceil(b.phaseT));
    $('bTimer').textContent = b.mode === 'defense' ? '' : Math.floor(t / 60) + 'm ' + (t % 60) + 's';
    $('bPct').textContent = (b.pct || 0) + '%';
    for (let i = 1; i <= 3; i++) $('bs' + i).classList.toggle('on', b.stars >= i);
    for (const btn of $('bTroops').children) {
      const k = btn.dataset.t;
      if (!k) continue;
      const n = k === 'cc' ? housingOf(b.ccLeft) : b.deploy[k];
      btn.querySelector('.cnt').textContent = k === 'cc' ? 'Clan' : 'x' + n;
      btn.classList.toggle('sel', b.selected === k);
      btn.classList.toggle('empty', !n);
    }
    $('btnNext').classList.toggle('hidden', !(b.mode === 'multi' && !b.anyDeployed && b.phase === 'scout'));
    $('bNextCost').innerHTML = fmt(Game.searchCost()) + resIco('gold', true);
    $('btnEndBattle').textContent = b.anyDeployed ? 'Surrender' : 'End Battle';
    $('btnEndBattle').classList.toggle('hidden', b.mode === 'defense');
    $('bHint').classList.toggle('hidden', b.anyDeployed || b.mode === 'defense');
    $('bTopLeft').style.visibility = b.mode === 'defense' ? 'hidden' : '';
    $('bTopRight').style.visibility = b.mode === 'defense' ? 'hidden' : '';
    $('bPhase').textContent = b.mode === 'defense' ? 'Defend the village!' : $('bPhase').textContent;
  },

  showResults(b, res) {
    const win = b.stars > 0;
    this.open(b.mode === 'defense' ? 'Defense' : win ? 'Victory!' : 'Defeat', {
      locked: true, small: true,
      render: body => {
        const top = el('div', 'results ' + (win || b.mode === 'defense' ? 'win' : 'lose'));
        if (b.mode === 'defense') {
          top.innerHTML = '<div class="big">Village defended!</div><p>Your Cannon fought off the goblin raiders.</p>';
        } else {
          top.innerHTML = '<div class="rstars">' + [1, 2, 3].map(i => '<span class="' + (b.stars >= i ? 'on' : '') + '" style="animation-delay:' + (i * 0.25) + 's">★</span>').join('') + '</div>' +
            '<div class="big">' + b.pct + '% destruction</div>' +
            '<div class="rloot">' + resIco('gold') + ' +' + fmt(res.gold) + ' &nbsp; ' + resIco('elixir') + ' +' + fmt(res.elixir) + '</div>' +
            (res.trophies ? '<div class="rloot"><span class="ico trophy"></span> ' + (res.trophies > 0 ? '+' : '') + res.trophies + '</div>' : '') +
            (res.lost ? '<div class="muted">Troops used: ' + res.lost + '</div>' : '') +
            (res.capped ? '<div class="warn">Some loot was lost because your storages are full!</div>' : '');
        }
        body.appendChild(top);
        const btn = el('button', 'btn green', 'Return Home');
        btn.onclick = () => { this.closeModal(); Game.returnHome(); };
        const r = el('div', 'row center'); r.appendChild(btn); body.appendChild(r);
      },
    });
  },

  onBuildingComplete(b) {
    Tutorial.onEvent('built', b);
  },
};

// ---------- tutorial ----------
const Tutorial = {
  highlight: null,
  steps: [
    { say: 'Welcome, Chief! This humble village is now yours to lead.', tap: true },
    { say: "Oh no, it's the Goblin Horde! Quick, let's set up a Cannon to defend the village!", arrow: 'btnShop', hl: 'cannon', tab: 'Defenses', free: 'cannon', wait: 'cannon' },
    { say: 'Here they come! Watch our Cannon blast them!', tap: true, then: () => Game.startGoblinRaid() },
    { say: 'Phew, that was close! To grow we need resources. Build an Elixir Collector!', arrow: 'btnShop', hl: 'elixircollector', wait: 'elixircollector' },
    { say: 'Splendid! Now build a Gold Mine. Tap a building while it\'s under construction to finish it with gems.', arrow: 'btnShop', hl: 'goldmine', wait: 'goldmine' },
    { say: 'Every chief needs an army. Build Barracks to train troops!', arrow: 'btnShop', hl: 'barracks', tab: 'Army', wait: 'barracks' },
    { say: 'Troops need a place to rest. Build an Army Camp!', arrow: 'btnShop', hl: 'armycamp', tab: 'Army', wait: 'armycamp' },
    { say: 'Now train some Barbarians. Train at least 5!', arrow: 'btnArmy', hl: 'barbarian', wait: 'army5' },
    { say: "Time for revenge! Let's attack the goblins. Tap Attack!", arrow: 'btnAttack', hl: 'campaign', wait: 'attacked' },
    { say: 'Victory tastes sweet! Keep upgrading your village. Rebuild the Clan Castle when you can to join a clan. Good luck, Chief!', tap: true },
  ],
  active() { return S && S.tutorial >= 0 && S.tutorial < this.steps.length; },
  cur() { return this.active() ? this.steps[S.tutorial] : null; },
  shopTab() { const s = this.cur(); return s && s.tab; },

  show() {
    const s = this.cur();
    this.highlight = null;
    $('tutArrow').classList.add('hidden');
    if (!s || Game.mode !== 'village') { $('advisor').classList.add('hidden'); return; }
    if (s.wait && this.isDone(s.wait)) { this.advance(); return; }
    $('advisor').classList.remove('hidden');
    $('advisor').classList.toggle('mini', !s.tap);
    $('bubbleTxt').textContent = s.say;
    $('bubbleTap').style.display = s.tap ? '' : 'none';
    this.highlight = s.hl || null;
    if (s.free && !countOf(s.free)) S.tutorialFree = s.free;
    if (s.arrow) this.pointAt($(s.arrow));
  },

  pointAt(target) {
    const a = $('tutArrow');
    if (!target) return;
    const r = target.getBoundingClientRect();
    a.classList.remove('hidden');
    a.style.left = (r.left + r.width / 2 - 30) + 'px';
    a.style.top = (r.top - 70) + 'px';
  },

  isDone(w) {
    if (w === 'army5') return (S.army.barbarian || 0) + S.queue.filter(t => t === 'barbarian').length >= 5;
    if (w === 'attacked') return S.campaign[0] && S.campaign[0].stars > 0;
    return S.buildings.some(b => b.type === w);
  },

  tap() {
    const s = this.cur();
    if (!s || !s.tap) return;
    Sound.unlock();
    Sound.play('click');
    this.advance();
    if (s.then) s.then();
  },

  advance() {
    S.tutorial++;
    if (S.tutorial >= this.steps.length) S.tutorial = -1;
    saveGame();
    this.show();
  },

  onEvent() {
    const s = this.cur();
    if (s && s.wait && this.isDone(s.wait)) this.advance();
  },

  tick() {
    const s = this.cur();
    if (!s) return;
    if (s.wait && this.isDone(s.wait)) this.advance();
    else if (s.arrow && !$('tutArrow').classList.contains('hidden')) this.pointAt($(s.arrow));
    const hide = !!UI.modalState || !!Game.placing || Game.mode !== 'village';
    $('advisor').style.visibility = hide && !s.tap ? 'hidden' : '';
    $('tutArrow').style.visibility = hide ? 'hidden' : '';
  },

  skip() { S.tutorial = -1; this.show(); },
};
