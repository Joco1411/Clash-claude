'use strict';
// Clans: simulated clanmates, chat, troop donations, Clan Wars and the Clan Capital.

const CLAN_COLORS = ['#3a7bd5', '#d53a3a', '#3ad56a', '#d5a03a', '#8e3ad5', '#3ad5c8', '#d53a9b'];
const CLAN_MAX = 50;
const WAR_PREP = 30, WAR_BATTLE = 360; // seconds
const CREATE_CLAN_COST = 1000;

function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const Clan = {
  // AI clans to browse when joining
  browseList() {
    const rnd = mulberry32(777 + Math.floor(Date.now() / 3600000));
    return CLAN_NAMES.map((name, i) => ({
      name,
      color: CLAN_COLORS[i % CLAN_COLORS.length],
      members: 8 + Math.floor(rnd() * 40),
      trophies: Math.floor(200 + rnd() * 3000),
      req: i < 3 ? 0 : Math.floor(rnd() * 4) * 100,
      level: 1 + Math.floor(rnd() * 8),
    }));
  },

  makeBot(name) {
    const th = Math.max(1, Math.min(MAX_TH, thLevel() + rint(-1, 2)));
    return { name, level: th * 6 + rint(0, 10), th, trophies: th * 150 + rint(0, 300), donated: 0, received: 0, role: 'Member', bot: true };
  },

  join(info) {
    const used = new Set();
    const members = [];
    const n = Math.min(CLAN_MAX - 1, info.members);
    while (members.length < n) {
      const nm = pick(BOT_NAMES);
      if (used.has(nm)) { if (used.size >= BOT_NAMES.length) break; continue; }
      used.add(nm);
      members.push(this.makeBot(nm));
    }
    if (members[0]) members[0].role = 'Leader';
    if (members[1]) members[1].role = 'Co-leader';
    if (members[2]) members[2].role = 'Elder';
    S.clan = this.blank(info.name, info.color, 'Member', members);
    this.post(members[0] ? members[0].name : 'Clan', 'Welcome to ' + info.name + ', ' + S.name + '! 👋');
  },

  create(name) {
    if (!spend('gold', CREATE_CLAN_COST)) return 'Not enough gold';
    S.clan = this.blank(name, pick(CLAN_COLORS), 'Leader', []);
    this.system('You founded ' + name + '! New members will find you soon.');
    return null;
  },

  blank(name, color, role, members) {
    return {
      name, color, role, members,
      chat: [], lastRequest: 0, nextBot: Date.now() + 8000, nextJoin: Date.now() + 15000,
      pending: [], war: null, warsWon: 0, warsLost: 0,
      capital: { level: 1, progress: 0, contributed: 0 }, nextCapital: Date.now() + 20000,
      reqId: 1,
    };
  },

  leave() {
    S.clan = null;
    S.cc = {};
  },

  post(from, text, extra) {
    const c = S.clan;
    c.chat.push(Object.assign({ from, text, t: Date.now(), kind: 'msg' }, extra || {}));
    if (c.chat.length > 60) c.chat.splice(0, c.chat.length - 60);
    if (typeof UI !== 'undefined') UI.onClanChat();
  },
  system(text) { this.post('', text, { kind: 'sys' }); },

  say(text) {
    text = String(text).trim().slice(0, 140);
    if (!text) return;
    this.post(S.name, text, { me: true });
    const c = S.clan;
    if (c.members.length && Math.random() < 0.7) {
      const m = pick(c.members);
      const lower = text.toLowerCase();
      let reply = pick(['😄', 'haha', 'true!', 'nice', 'ok chief', 'agreed', 'lol']);
      if (/hi|hello|hey|yo/.test(lower)) reply = pick(['hey ' + S.name + '!', 'hello!', 'welcome back 👋']);
      else if (/troop|donat/.test(lower)) reply = 'request some and I\'ll send them';
      else if (/war/.test(lower)) reply = 'ready for war when you are, start one from the War tab';
      setTimeout(() => { if (S.clan === c) this.post(m.name, reply); }, rint(1500, 4000));
    }
  },

  // ----- donations -----
  requestCooldown() { return S.clan ? Math.max(0, S.clan.lastRequest + 60000 - Date.now()) : 0; },
  requestTroops(note) {
    const c = S.clan;
    if (!c) return 'Join a clan first';
    if (ccCap() <= 0) return 'Rebuild your Clan Castle first';
    if (this.requestCooldown() > 0) return 'You can request again in ' + Math.ceil(this.requestCooldown() / 1000) + 's';
    if (housingOf(S.cc) >= ccCap()) return 'Your Clan Castle is full';
    c.lastRequest = Date.now();
    const id = c.reqId++;
    this.post(S.name, note || 'Requesting reinforcements', { kind: 'request', me: true, reqId: id });
    // schedule bot donations
    const n = Math.max(1, Math.min(c.members.length, rint(2, 5)));
    for (let i = 0; i < n; i++) {
      const m = pick(c.members);
      if (!m) break;
      const options = Object.keys(TROOPS).filter(t => TROOPS[t].barracks <= Math.min(5, m.th + 1));
      c.pending.push({ at: Date.now() + rint(3000, 20000), from: m.name, type: pick(options), qty: rint(1, 5) });
    }
    return null;
  },

  donate(msg, type) {
    const c = S.clan;
    if (!S.army[type]) return 'You have no ' + TROOPS[type].name + 's';
    const need = msg.cap - (msg.filled || 0);
    if (TROOPS[type].housing > need) return 'Not enough room in their castle';
    S.army[type]--;
    msg.filled = (msg.filled || 0) + TROOPS[type].housing;
    S.stats.donated++;
    addXP(1);
    const m = c.members.find(x => x.name === msg.from);
    if (m) m.received++;
    if (msg.filled >= msg.cap) setTimeout(() => { if (S.clan === c && m) this.post(m.name, 'thanks ' + S.name + '! 🙏'); }, 1500);
    return null;
  },

  // ----- clan war -----
  startWar() {
    const c = S.clan;
    if (c.war && c.war.state !== 'ended') return 'A war is already in progress';
    if (c.members.length < 4) return 'You need at least 5 members for war';
    const size = Math.min(10, Math.floor((c.members.length + 1) / 5) * 5) || 5;
    const roster = [{ name: S.name, th: thLevel(), me: true }]
      .concat(c.members.slice().sort(() => Math.random() - 0.5).slice(0, size - 1).map(m => ({ name: m.name, th: m.th })));
    roster.sort((a, b) => b.th - a.th);
    const enemyName = pick(CLAN_NAMES.filter(n => n !== c.name));
    const enemy = roster.map((r, i) => ({
      name: pick(BOT_NAMES) + (i + 1), th: Math.max(1, Math.min(MAX_TH, r.th + rint(-1, 1))),
      seed: rint(1, 1e9), stars: 0, pct: 0, attackedBy: [],
    }));
    const t = Date.now();
    c.war = {
      state: 'prep', enemyName, size, roster, enemy,
      prepEnd: t + WAR_PREP * 1000, end: t + (WAR_PREP + WAR_BATTLE) * 1000,
      ourStars: 0, theirStars: 0, ourPct: 0, theirPct: 0,
      myAttacks: 2, nextAi: 0, nextEnemy: 0, rosterStars: roster.map(() => 0), log: [],
    };
    this.system('War declared against ' + enemyName + '! Preparation day has begun.');
    return null;
  },

  warStars() {
    const w = S.clan.war;
    w.ourStars = w.enemy.reduce((a, e) => a + e.stars, 0);
    w.ourPct = Math.round(w.enemy.reduce((a, e) => a + e.pct, 0) / w.enemy.length);
  },

  recordWarAttack(baseIdx, stars, pct, who) {
    const w = S.clan.war;
    const e = w.enemy[baseIdx];
    e.attackedBy.push(who);
    if (stars > e.stars || (stars === e.stars && pct > e.pct)) { e.stars = Math.max(e.stars, stars); e.pct = Math.max(e.pct, pct); }
    e.pct = Math.max(e.pct, pct);
    w.log.unshift(who + ' attacked #' + (baseIdx + 1) + ' ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + ' ' + pct + '%');
    if (w.log.length > 30) w.log.pop();
    this.warStars();
  },

  simAttack(attTh, defTh) {
    const diff = attTh - defTh + Math.random() * 1.6 - 0.5;
    const pct = Math.max(10, Math.min(100, Math.round(55 + diff * 22 + Math.random() * 25)));
    let stars = pct >= 100 ? 3 : pct >= 50 ? 1 : 0;
    if (pct >= 50 && Math.random() < 0.6 + diff * 0.15) stars = Math.min(3, stars + 1);
    if (pct < 50 && Math.random() < 0.25) stars = 1;
    return { stars, pct };
  },

  endWar() {
    const c = S.clan, w = c.war;
    w.state = 'ended';
    this.warStars();
    const win = w.ourStars > w.theirStars || (w.ourStars === w.theirStars && w.ourPct > w.theirPct);
    w.result = win ? 'win' : (w.ourStars === w.theirStars && w.ourPct === w.theirPct ? 'draw' : 'lose');
    const used = 2 - w.myAttacks;
    const bonus = Math.round((win ? 1 : 0.35) * used * 500 * thLevel());
    w.reward = bonus;
    if (bonus > 0) { addRes('gold', bonus); addRes('elixir', bonus); }
    if (win) c.warsWon++; else if (w.result === 'lose') c.warsLost++;
    this.system('War against ' + w.enemyName + ' ended: ' + (win ? 'VICTORY! 🏆' : w.result === 'draw' ? 'Draw.' : 'Defeat.') +
      ' ' + w.ourStars + '★ vs ' + w.theirStars + '★' + (bonus ? ' — you earned ' + bonus + ' gold & elixir war loot.' : ''));
  },

  // ----- capital -----
  capitalNext() {
    const cap = S.clan.capital;
    return CAPITAL_LEVELS[cap.level] || null;
  },
  contribute(amount) {
    const cap = S.clan.capital;
    const next = this.capitalNext();
    if (!next) return 'Capital Hall is maxed';
    amount = Math.min(amount, S.gold, next.cost - cap.progress);
    if (amount <= 0) return 'Not enough gold';
    spend('gold', amount);
    cap.contributed += amount;
    this.addCapital(amount, S.name);
    addXP(Math.max(1, Math.floor(amount / 500)));
    return null;
  },
  addCapital(amount, who) {
    const cap = S.clan.capital;
    const next = this.capitalNext();
    if (!next) return;
    cap.progress += amount;
    if (cap.progress >= next.cost) {
      cap.progress -= next.cost;
      cap.level++;
      this.system('🏰 Capital Hall reached level ' + cap.level + '! District unlocked: ' + next.district);
      if (!this.capitalNext()) cap.progress = 0;
    }
  },

  // ----- simulation tick -----
  tick(t) {
    const c = S.clan;
    if (!c) return;
    // bot chatter
    if (t > c.nextBot) {
      c.nextBot = t + rint(25000, 70000);
      if (c.members.length) {
        const m = pick(c.members);
        if (Math.random() < 0.25 && ccCap() > 0) {
          const opts = Object.keys(TROOPS).filter(k => TROOPS[k].barracks <= Math.max(1, maxBarracksLevel()));
          this.post(m.name, 'Need ' + TROOPS[pick(opts)].name + 's please!', { kind: 'request', reqId: c.reqId++, cap: 5 + m.th * 2, filled: 0 });
        } else this.post(m.name, pick(CHAT_LINES));
      }
    }
    // new members for player-founded clans
    if (c.role === 'Leader' && c.members.length < 20 && t > c.nextJoin) {
      c.nextJoin = t + rint(20000, 60000);
      const names = new Set(c.members.map(m => m.name));
      const free = BOT_NAMES.filter(n => !names.has(n));
      if (free.length) {
        const m = this.makeBot(pick(free));
        c.members.push(m);
        this.system(m.name + ' has joined the clan.');
      }
    }
    // pending donations
    if (c.pending.length) {
      const due = c.pending.filter(p => t >= p.at);
      c.pending = c.pending.filter(p => t < p.at);
      for (const p of due) {
        const room = ccCap() - housingOf(S.cc);
        const per = TROOPS[p.type].housing;
        const qty = Math.min(p.qty, Math.floor(room / per));
        if (qty <= 0) continue;
        S.cc[p.type] = (S.cc[p.type] || 0) + qty;
        S.stats.received += qty;
        const m = c.members.find(x => x.name === p.from);
        if (m) m.donated += qty;
        this.system(p.from + ' donated ' + qty + 'x ' + TROOPS[p.type].name + ' to you.');
      }
    }
    // capital contributions by bots
    if (t > c.nextCapital && c.members.length) {
      c.nextCapital = t + rint(30000, 90000);
      const amt = rint(2, 20) * 100 * Math.max(1, c.capital.level);
      this.addCapital(amt, pick(c.members).name);
    }
    // war progression
    const w = c.war;
    if (w && w.state !== 'ended') {
      if (w.state === 'prep' && t >= w.prepEnd) {
        w.state = 'battle'; w.nextAi = t + 8000; w.nextEnemy = t + 12000;
        this.system('Battle day has begun! You have 2 war attacks.');
      }
      if (w.state === 'battle') {
        if (t >= w.nextAi) {
          w.nextAi = t + rint(15000, 35000);
          const idx = w.roster.findIndex((r, i) => !r.me && (r.used || 0) < 2);
          if (idx >= 0) {
            const r = w.roster[idx];
            r.used = (r.used || 0) + 1;
            // target the highest unclaimed base around their strength
            let target = w.enemy.findIndex(e => e.stars < 3 && e.th <= r.th);
            if (target < 0) target = w.enemy.findIndex(e => e.stars < 3);
            if (target >= 0) {
              const res = this.simAttack(r.th, w.enemy[target].th);
              this.recordWarAttack(target, res.stars, res.pct, r.name);
            }
          }
        }
        if (t >= w.nextEnemy) {
          w.nextEnemy = t + rint(15000, 35000);
          const totalAtt = w.size * 2;
          w.enemyUsed = (w.enemyUsed || 0);
          if (w.enemyUsed < totalAtt) {
            w.enemyUsed++;
            const di = rint(0, w.roster.length - 1);
            const res = this.simAttack(w.enemy[rint(0, w.enemy.length - 1)].th, w.roster[di].th);
            const gain = Math.max(0, res.stars - w.rosterStars[di]);
            w.rosterStars[di] = Math.max(w.rosterStars[di], res.stars);
            w.theirStars += gain;
            w.theirPct = Math.min(100, Math.round((w.theirPct * (w.enemyUsed - 1) + res.pct) / w.enemyUsed));
            w.log.unshift(w.enemyName + ' hit ' + w.roster[di].name + ' ' + '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars));
            if (w.log.length > 30) w.log.pop();
          }
        }
        if (t >= w.end) this.endWar();
      }
    }
  },
};
