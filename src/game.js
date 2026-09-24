// 게임 시뮬레이션 — 방장(호스트) PC에서만 돈다. 다른 사람은 입력만 보내고 스냅샷을 받아 그린다.
// DOM 없이 node에서도 돌아가야 한다 (tools/sim-test.js).
(function (G) {
  'use strict';
  const L = G.TUS_LEVEL;
  const T = 16, VW = 416, VH = 234, DT = 1 / 60;
  const WALK = 62, RUN = 108, JUMPV = 160, GRAV = 480, COLLAPSE = 17;

  const MOVE = ['fb', 'lr', 'jump', 'crouch'];
  const ATK = ['lh', 'rh', 'atk', 'def'];
  const ROLES = MOVE.concat(ATK);
  const ROLE_INFO = {
    fb: { name: '앞뒤', part: '오른다리', keys: 'W / S', tip: 'Shift 누르면 달리기' },
    lr: { name: '좌우', part: '왼다리', keys: 'A / D', tip: 'Shift 누르면 달리기' },
    jump: { name: '점프', part: '무릎', keys: 'Space', tip: '달리는 중이면 멀리뛰기' },
    crouch: { name: '앉기', part: '엉덩이', keys: 'C', tip: '달리는 중이면 슬라이딩' },
    lh: { name: '왼손 망치', part: '왼손', keys: '좌클릭', tip: '장애물 부수기 (마우스 방향)' },
    rh: { name: '오른손 마법', part: '오른손', keys: '우클릭', tip: '지상 몬스터 처치 (짧은 사거리)' },
    atk: { name: '공격 정령', part: '불꽃 정령', keys: '마우스', tip: '정령을 공중 몬스터 근처로 → 자동 공격' },
    def: { name: '방어 정령', part: '땅 정령', keys: '마우스', tip: '방패를 투사체 앞에 대기' },
  };
  // 레벨업 카드 — 대부분 '누군가의 부위'를 강화한다 → 투표가 "내 거 뽑아줘" 쟁탈전이 된다
  // rar: common 일반 · rare 희귀 · epic 영웅 · curse 저주(강하지만 대가) / unique: 한 번만 / roles: 강화되는 부위(없으면 모두)
  const CARDS = [
    { id: 'jump2', roles: ['jump'], rar: 'epic', unique: true, name: '이단 점프', desc: '공중에서 Space를 한 번 더 — 두 번 뛴다' },
    { id: 'slideinv', roles: ['crouch'], rar: 'rare', unique: true, name: '무적 슬라이딩', desc: '슬라이딩이 더 길고, 미끄러지는 동안 피해를 안 받는다' },
    { id: 'sprint', roles: ['fb', 'lr'], rar: 'common', name: '질주', desc: '달리기 속도 +25%' },
    { id: 'quake', roles: ['lh'], rar: 'rare', unique: true, name: '대지 강타', desc: '망치 범위 +50%, 맞은 개미는 1초 기절' },
    { id: 'hammer', roles: ['lh'], rar: 'common', name: '무거운 망치', desc: '망치 피해 2배 (여왕에게도)' },
    { id: 'split', roles: ['rh'], rar: 'rare', unique: true, name: '세 갈래 마법', desc: '마법이 부채꼴로 3발씩 나간다' },
    { id: 'pierce', roles: ['rh'], rar: 'rare', unique: true, name: '관통 마법', desc: '마법이 적을 꿰뚫고 날아간다, 사거리 +40%' },
    { id: 'rapid', roles: ['atk'], rar: 'rare', unique: true, name: '속사 불꽃', desc: '정령 공격 속도 2배, 사거리 +40%' },
    { id: 'reflect', roles: ['def'], rar: 'epic', unique: true, name: '반사 방패', desc: '막은 침이 적에게 되돌아간다' },
    { id: 'bigshield', roles: ['def'], rar: 'common', name: '큰 방패', desc: '방패 크기 +50%' },
    { id: 'hp', roles: null, rar: 'common', name: '튼튼한 몸', desc: '최대 체력 +30, 30 회복' },
    { id: 'heal', roles: null, rar: 'common', name: '응급 처치', desc: '체력 50 회복' },
    { id: 'berserk', roles: null, rar: 'curse', unique: true, name: '광폭', desc: '모든 공격 피해 2배 — 대신 사보타주도 2배' },
  ];
  const RAR_W = { common: 5, rare: 3, epic: 1.4, curse: 1 };
  // 몸 적응 훈련(튜토리얼) 과제 — 순서대로 목록에 보인다. role = 담당 역할(합동은 여러 명)
  const TUT = [
    { id: 'fb', roles: ['fb'], text: 'W/S로 앞뒤 걷기', how: 'W = 화면 오른쪽 위(계단 위쪽), S = 왼쪽 아래' },
    { id: 'lr', roles: ['lr'], text: 'A/D로 옆으로 걷기', how: 'A = 화면 왼쪽 위, D = 오른쪽 아래' },
    { id: 'jump', roles: ['jump'], text: 'Space로 점프', how: '스페이스를 한 번 눌러 보세요' },
    { id: 'crouch', roles: ['crouch'], text: 'C로 앉기', how: 'C를 눌러 보세요 (달리면서 누르면 슬라이딩)' },
    { id: 'lh', roles: ['lh'], text: '망치로 연습 상자 부수기', how: '마우스로 상자를 가리키고 좌클릭 (가까이 가야 닿아요)' },
    { id: 'rh', roles: ['rh'], text: '마법으로 허수아비 개미 맞히기', how: '마우스로 개미를 가리키고 우클릭 (사거리가 짧아요)' },
    { id: 'atk', roles: ['atk'], text: '불꽃 정령으로 날개 개미 인형 잡기', how: '마우스로 불꽃 정령을 인형 근처로 옮기면 자동 공격' },
    { id: 'def', roles: ['def'], text: '땅 정령 방패로 침 막기', how: '보라색 룬석이 쏘는 침 앞에 마우스로 방패를 대세요' },
    { id: 'diag', roles: ['fb', 'lr'], text: '[합동] 대각선 이동', how: '앞뒤 담당과 좌우 담당이 동시에 눌러요' },
    { id: 'long', roles: ['jump', 'fb'], text: '[합동] 멀리뛰기', how: '달리면서(Shift) 점프 — 달리는 사람과 점프하는 사람이 타이밍을 맞춰요' },
  ];
  // 사보타주 종류 — 몸 주인(마법사)의 방해. 전부 "마법사 탓"으로 집계된다
  const SAB_KIND = {
    rev: { name: '조작 반전', dur: 3, lines: ['이 자식들아, 내 몸에서 나가!', '내 다리 내놔!', '누가 내 몸으로 장난치는 거야!'] },
    hic: { name: '딸꾹질 — 멋대로 점프', dur: 3.5, lines: ['히끅! 몸이… 히끅!', '딸꾹! 이건 내 탓 아니… 히끅!'] },
    swap: { name: '영혼 뒤바뀜 — 두 사람 역할이 잠깐 바뀜', dur: 5, lines: ['너희 둘, 자리 바꿔 봐라!', '헷갈려 봐라, 이 침입자들!'] },
  };
  const SAB_LINES = SAB_KIND.rev.lines;
  // 훈련 단계: 단계 안에서는 (여럿이면) 각자 동시에, 혼자면 한 과제씩 순서대로
  const TUT_STAGES = [
    { title: '1단계 · 몸 움직이기', ids: ['fb', 'lr', 'jump', 'crouch'] },
    { title: '2단계 · 손과 정령 쓰기', ids: ['lh', 'rh', 'atk', 'def'] },
    { title: '3단계 · 같이 맞추기', ids: ['diag', 'long'] },
  ];
  const TUT_ORDER = TUT_STAGES.flatMap(g => g.ids);
  // 피해 원인 → 다시 띄울 팁 (main.js HINT 키)
  const REHINT = { pit: 'pit', edge: 'bridge', bar: 'bar', beam: 'beam', ant: 'ant', shot: 'shot', log: 'log', barrel: 'barrel', rock: 'rock', wave: 'wave', blade: 'blade', collapse: 'collapse' };
  const PINGS = ['지금!', '멈춰!', '니 탓!', '나이스!'];
  const PROLOGUE_LEN = 26; // prologue.js 의 LEN 과 같게
  const INTRO_T = 15, SHUF_T = 10; // 역할 배정 화면 최대 시간 (모두 '준비 완료'면 바로 시작)

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const r1 = v => Math.round(v * 10) / 10;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // 역할 배정: 이동 4 + 공격 4 를 인원수대로 나눈다. 앞뒤와 좌우는 (2명 이상이면) 반드시 다른 사람.
  function assignRoles(ids) {
    const owner = {};
    const order = shuffle(ids.slice()), n = order.length;
    shuffle(MOVE.slice()).forEach((r, i) => owner[r] = order[i % n]);
    shuffle(ATK.slice()).forEach((r, i) => owner[r] = order[(i + 4) % n]);
    if (n > 1 && owner.fb === owner.lr) {
      const r = MOVE.find(x => owner[x] !== owner.fb);
      const t = owner[r]; owner[r] = owner.lr; owner.lr = t;
    }
    return owner;
  }

  function emptyInput() { return { k: {}, mx: null, my: null, lb: 0, rb: 0, cj: 0, cc: 0, cl: 0, cr: 0, vk: 0, vi: -1, pg: 0, pk: 0, sk: 0, rd: 0 }; }

  function Game(players, opts) {
    this.players = players.map((p, i) => ({ id: p.id, name: p.name, col: i % 4 })); // col = 플레이어 색 번호
    this.opts = Object.assign({ sabotage: true, shuffle: true }, opts || {});
    this.inputs = {};
    this.players.forEach(p => this.inputs[p.id] = emptyInput());
    this.gen = 0;
    this.reset();
  }
  const P = Game.prototype;

  P.reset = function () {
    const lv = this.level = L.build();
    this.gen++;
    this.time = 0; const pro = this.opts.prologue && this.gen === 1; // 다시 하기 때는 프롤로그 생략
    this.state = pro ? 'prologue' : 'intro'; this.stateT = pro ? PROLOGUE_LEN : INTRO_T;
    this.ready = {}; this.rdCnt = {};
    this.pingCnt = {}; this.pingT = {}; this.skipCnt = {};
    this.sabSwap = null; this.hicT = 0;
    for (const p of this.players) { const I = this.inputs[p.id] || emptyInput(); this.pingCnt[p.id] = I.pg || 0; this.skipCnt[p.id] = I.sk || 0; this.rdCnt[p.id] = I.rd || 0; }
    const s = lv.start;
    this.body = { x: s.x, y: s.y, z: 0, vx: 0, vy: 0, vz: 0, stun: 0, inv: 0, slide: 0, landSlide: 0, longJ: false, crouch: false, faceX: 0, faceY: -1, diagT: 0, diagDone: false, safe: [], safeT: 0 };
    this.stats = { mhp: 100, atk: 1, spd: 1, regen: 16, defR: 10, sab: 1, run: 1, lhR: 14, lhDmg: 1, stunHit: false, rhN: 1, pierce: false, rhLife: 0.42, atkCd: 0.5, atkRange: 100, reflect: false, dbl: false, slideInv: false, slideT: 0.55 };
    this.hp = 100; this.mana = 100; this.lv = 1; this.xp = 0; this.xpNeed = 12; this.xpWhy = {}; this.lvUpT = 0;
    this.hurtCnt = {}; this.rehintT = {};
    this.cam = { mode: 'scroll' };
    // 무너지는 계단: 이 y보다 아래(뒤)의 계단 줄은 무너져 있다. 위로 쫓아온다
    this.col = { on: true, d: -2, delay: 3, hinted: false }; // d 보다 가까운(dist 작은) 계단 칸은 무너져 있다
    for (const room of lv.rooms) { room.entryD = this.doorDist(room.bottomRow); room.exitD = this.doorDist(room.topRow); }
    this.rollers = []; this.rollHint = {};
    for (const r of lv.rollers) r.t = 0.5;
    this.traps = []; this.trapHint = {}; this.dirT = null; // 움직임 역할용 함정 (계단 압박 조율기가 깔아 준다)
    this.roomIdx = 0;
    this.enemies = []; this.shots = []; this.eshots = []; this.nextId = 1;
    this.cool = { lh: 0, rh: 0, atk: 0 };
    this.spirit = { ax: s.x - 16, ay: s.y - 18, dx: s.x + 14, dy: s.y - 10, lastA: null, lastD: null };
    this.sab = { phase: 'idle', t: 0, next: 28, line: 0, kind: 'rev' };
    this.vote = null; this.voteSeq = 0; this.pick = {};
    this.events = []; this.seq = 0;
    this.hintsDone = {};
    this.pstats = {};
    this.players.forEach(p => this.pstats[p.id] = { kills: 0, breaks: 0, blocks: 0, combos: 0, blame: 0, solves: 0, causes: {} });
    this.blameWizard = 0; this.underBeam = null; this.underHit = false; this.overPit = false;
    this.lastAct = {};
    this.result = null; this.shuffled = false; this.nomanaT = 0; this.swing = null;
    // 몸 적응 훈련: 켜져 있으면 출발 지점에 연습 표적을 놓고, 다 끝낼 때까지 계단이 안 무너지고 다치지 않는다
    this.tut = null;
    if (this.opts.tutorial) {
      this.tut = { on: true, done: {}, walk: { fb: 0, lr: 0 }, stage: 0, cur: 0, pause: 0, solo: this.players.length === 1 };
      this.col.on = false;
    }
    this.roles = assignRoles(this.players.map(p => p.id));
    this.syncCounts();
  };

  P.removePlayer = function (id) {
    // 나간 사람의 역할은 남은 사람에게 다시 나눈다
    this.players = this.players.filter(p => p.id !== id);
    if (!this.players.length) return;
    this.sabSwap = null;
    this.roles = assignRoles(this.players.map(p => p.id));
    this.syncCounts();
    this.emit('left', { id });
  };

  P.syncCounts = function () {
    this.cnt = {};
    for (const r of ROLES) {
      const I = this.inputs[this.roles[r]] || emptyInput();
      this.cnt[r] = { cj: I.cj, cc: I.cc, cl: I.cl, cr: I.cr };
    }
  };
  P.inp = function (r) { return this.inputs[this.roles[r]] || emptyInput(); };
  P.edge = function (r, f) {
    const I = this.inp(r);
    if (I[f] > this.cnt[r][f]) { this.cnt[r][f] = I[f]; return true; }
    if (I[f] < this.cnt[r][f]) this.cnt[r][f] = I[f];
    return false;
  };
  P.setInput = function (id, data) { if (this.inputs[id] !== undefined || this.players.some(p => p.id === id)) this.inputs[id] = data; };
  P.act = function (r) { this.lastAct[r] = this.time; };
  // 지금 인정되는 과제 (혼자면 한 개, 여럿이면 현재 단계의 남은 것)
  P.tutActive = function () {
    const t = this.tut;
    if (!t || !t.on || t.pause > 0) return [];
    if (t.solo) return [TUT_ORDER[t.cur]];
    return TUT_STAGES[t.stage].ids.filter(id => !t.done[id]);
  };
  P.spawnDummies = function () {
    const s = this.level.start;
    const tr = (k, x, y) => { const e = this.newEnemy(k, x, y, null); e.tr = true; e.hp = k === 'rune' ? 1e9 : 1; if (k === 'fly') { e.z = 20; e.shootT = 1e9; } return e; };
    tr('crate', s.x - 64, s.y - 44);
    tr('ant', s.x + 64, s.y - 44);
    tr('fly', s.x + 8, s.y - 58);
    const rn = tr('rune', s.x + 84, s.y + 12); rn.shootT = 1.5;
    this.emit('dummies', {});
  };
  P.stepTut = function (dt) {
    const t = this.tut; if (!t || !t.on || t.pause <= 0) return;
    t.pause -= dt;
    if (t.pause <= 0 && t.stage === 1 && !this.enemies.some(e => e.tr)) this.spawnDummies();
  };
  P.tutDone = function (id) {
    const t = this.tut;
    if (!t || !t.on || t.done[id] || !this.tutActive().includes(id)) return;
    t.done[id] = true;
    this.emit('tutstep', { id });
    if (t.solo) t.cur++;
    // 단계가 끝나면 잠깐 쉬고("잘했어요!") 다음 단계
    if (TUT_STAGES[t.stage].ids.every(q => t.done[q]) && t.stage < TUT_STAGES.length - 1) {
      t.stage++; t.pause = 1.6; t.walk = { fb: 0, lr: 0 };
      if (t.stage === 2) { this.enemies = this.enemies.filter(e => !e.tr); this.eshots = []; } // 합동 단계엔 표적 치움
      this.emit('tutstage', { stage: t.stage });
    }
    if (TUT.every(q => t.done[q.id])) {
      t.on = false;
      this.enemies = this.enemies.filter(e => !e.tr);
      this.eshots = [];
      this.col.on = true; this.col.delay = 4; this.col.hinted = false;
      this.emit('tutdone', {});
    }
  };
  P.emit = function (type, data) { this.events.push(Object.assign({ s: ++this.seq, t: this.time, type }, data || {})); };
  P.ownerName = function (r) { const p = this.players.find(p => p.id === this.roles[r]); return p ? p.name : '?'; };

  // ---------- 타일 ----------
  P.distAt = function (x, y) { const lv = this.level, r = Math.floor(y / T), c = Math.floor(x / T); return lv.dist[r] && lv.dist[r][c] != null ? lv.dist[r][c] : -1; };
  P.doorDist = function (row) { const lv = this.level; let d = -1; if (!lv.rows[row]) return -1; for (let c = 0; c < lv.w; c++) if (lv.rows[row][c] === 'D' && lv.dist[row][c] >= 0) d = d < 0 ? lv.dist[row][c] : Math.min(d, lv.dist[row][c]); return d; };
  P.bodyDist = function () { const d = this.distAt(this.body.x, this.body.y); if (d >= 0) this.lastBodyD = d; return this.lastBodyD || 0; };
  P.tile = function (c, r) { const lv = this.level; if (r < 0 || r >= lv.h || c < 0 || c >= lv.w) return '#'; return lv.rows[r][c]; };
  P.solidAt = function (c, r) {
    const t = this.tile(c, r);
    if (t === '#' || t === 'o') return true; // 'o' = 난간 너머 허공 (막힘)
    if (t === 'D') { const d = this.level.doorRows[r]; if (!d) return false; const room = this.level.rooms[d.room]; return d.top ? room.topLocked : room.bottomLocked; }
    return false;
  };
  P.tileAtPx = function (x, y) { return this.tile(Math.floor(x / T), Math.floor(y / T)); };
  P.boxHit = function (x, y, hw, hh, forBody) {
    const c0 = Math.floor((x - hw) / T), c1 = Math.floor((x + hw - 0.01) / T), r0 = Math.floor((y - hh) / T), r1_ = Math.floor((y + hh - 0.01) / T);
    for (let r = r0; r <= r1_; r++) for (let c = c0; c <= c1; c++) if (this.solidAt(c, r)) return { k: 'wall' };
    for (const o of this.level.obs) {
      if (!o.alive) continue;
      if (o.k === 'beam' && (!forBody || this.body.crouch)) continue;
      if (x + hw > o.x0 && x - hw < o.x1 && y + hh > o.y0 && y - hh < o.y1) return { k: o.k, o };
    }
    return null;
  };
  P.walkable = function (x, y) {
    if (this.boxHit(x, y, 4, 3, false)) return false;
    const t = this.tileAtPx(x, y); return t !== ' ' && t !== ',';
  };

  // ---------- 피해·넉백 ----------
  P.hurt = function (a, role, cause) {
    const b = this.body;
    if (b.inv > 0 || this.state !== 'play') return false;
    if (this.tut && this.tut.on) return false; // 훈련 중엔 안 다친다
    if (b.slide > 0 && this.stats.slideInv && cause !== 'pit' && cause !== 'edge' && cause !== 'collapse') return false; // 무적 슬라이딩
    this.hp -= a; b.inv = 0.8;
    let who;
    if (this.sab.phase === 'on') { this.blameWizard++; who = 'wizard'; }
    else { who = this.roles[role]; const ps = this.pstats[who]; if (ps) { ps.blame++; ps.causes[cause] = (ps.causes[cause] || 0) + 1; } }
    this.emit('hurt', { a, role, cause, who, x: r1(b.x), y: r1(b.y) });
    // 같은 원인으로 2번째 맞으면 그 담당자에게 팁을 다시 (이후 3번마다, 8초에 한 번까지)
    const hk = REHINT[cause];
    if (hk && who !== 'wizard') {
      const n = this.hurtCnt[cause] = (this.hurtCnt[cause] || 0) + 1;
      if ((n === 2 || (n > 2 && (n - 2) % 3 === 0)) && this.time - (this.rehintT[cause] || -99) > 8) { this.rehintT[cause] = this.time; this.emit('hint', { k: hk, re: 1, pid: who }); }
    }
    return true;
  };
  P.knock = function (nx, ny, pow) { const b = this.body; b.vx = nx * pow; b.vy = ny * pow; b.stun = 0.25; b.slide = 0; };

  // ---------- 메인 스텝 ----------
  P.step = function () {
    // 레벨업 순간: 1초 동안 느려지며 "LEVEL UP!" 연출 → 그 뒤 카드 투표 (갑자기 멈추면 왜 떴는지 모름)
    const dt = this.lvUpT > 0 && this.state === 'play' ? DT * 0.3 : DT;
    this.time += dt;
    this.stepPings();
    if (this.state === 'prologue') {
      // 누구든 넘기기(Enter/클릭)를 누르면 넘어간다
      for (const p of this.players) { const I = this.inputs[p.id]; if (I && I.sk > (this.skipCnt[p.id] || 0)) { this.stateT = 0; this.emit('skip', { pid: p.id }); } }
      this.stateT -= dt;
      if (this.stateT <= 0) { this.state = 'intro'; this.stateT = INTRO_T; this.ready = {}; }
      this.pruneEvents(); return;
    }
    if (this.state === 'intro' || this.state === 'shuffle') {
      // 모두 '준비 완료'를 누르면 1초 뒤 바로 시작
      for (const p of this.players) { const I = this.inputs[p.id]; if (I && (I.rd || 0) > (this.rdCnt[p.id] || 0)) { this.rdCnt[p.id] = I.rd; if (!this.ready[p.id]) { this.ready[p.id] = true; this.emit('ready', { pid: p.id }); } } }
      if (this.players.every(p => this.ready[p.id]) && this.stateT > 1) this.stateT = 1;
      this.stateT -= dt; if (this.stateT <= 0) this.state = 'play'; this.pruneEvents(); return;
    }
    if (this.state === 'vote') { this.stepVote(dt); this.pruneEvents(); return; }
    if (this.state === 'over' || this.state === 'clear') { this.pruneEvents(); return; }
    if (this.hitStop > 0) { this.hitStop -= dt; this.pruneEvents(); return; } // 처치 순간 멈칫 (타격감)
    this.stepBody(dt);
    this.stepCamera(dt);
    this.stepRollers(dt);
    this.stepTraps(dt);
    this.stepSpawns();
    this.stepDirector(dt);
    this.stepAttacks(dt);
    this.stepEnemies(dt);
    this.stepShots(dt);
    this.stepSab(dt);
    this.stepRooms(dt);
    this.stepHints();
    this.stepTut(dt);
    this.mana = Math.min(100, this.mana + this.stats.regen * dt);
    if (this.hp <= 0) { this.hp = 0; this.finish('over'); }
    else if (this.state === 'play' && this.lvUpT > 0) {
      this.body.inv = Math.max(this.body.inv, 0.2); // 연출 중엔 안 다친다
      this.lvUpT -= DT; if (this.lvUpT <= 0) { this.lvUpT = 0; this.startVote(); }
    } else if (this.state === 'play' && this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed; this.lv++; this.xpNeed = Math.round(this.xpNeed * 1.35 + 4);
      this.lvUpT = 1.0;
      this.emit('levelup', { lv: this.lv, x: r1(this.body.x), y: r1(this.body.y) });
    }
    this.pruneEvents();
  };
  P.stepPings = function () {
    for (const p of this.players) {
      const I = this.inputs[p.id]; if (!I) continue;
      if ((I.pg || 0) > (this.pingCnt[p.id] || 0)) {
        this.pingCnt[p.id] = I.pg;
        if (this.time - (this.pingT[p.id] || -9) > 0.6) { this.pingT[p.id] = this.time; this.emit('ping', { pid: p.id, k: Math.max(0, Math.min(3, I.pk | 0)) }); }
      }
    }
  };
  P.pruneEvents = function () { const cut = this.time - 1.5; while (this.events.length && this.events[0].t < cut) this.events.shift(); };

  P.stepBody = function (dt) {
    const b = this.body, st = this.stats;
    const fbI = this.inp('fb'), lrI = this.inp('lr'), cI = this.inp('crouch');
    let my = (fbI.k.s ? 1 : 0) - (fbI.k.w ? 1 : 0);
    let mx = (lrI.k.d ? 1 : 0) - (lrI.k.a ? 1 : 0);
    if (my) this.act('fb');
    if (mx) this.act('lr');
    if (this.tut && this.tut.on) {
      const w = this.tut.walk;
      const act = this.tutActive();
      if (my && act.includes('fb')) { w.fb += dt; if (w.fb > 0.5) this.tutDone('fb'); }
      if (mx && act.includes('lr')) { w.lr += dt; if (w.lr > 0.5) this.tutDone('lr'); }
    }
    const runY = !!fbI.k.sh && my !== 0, runX = !!lrI.k.sh && mx !== 0;
    if (this.sab.phase === 'on' && this.sab.kind === 'rev') { mx = -mx; my = -my; }
    if (b.inv > 0) b.inv -= dt;
    if (b.stun > 0) b.stun -= dt;
    if (b.landSlide > 0) b.landSlide -= dt;
    const grounded = b.z <= 0 && b.vz <= 0;
    const speedNow = Math.hypot(b.vx, b.vy);
    const jumpEdge = this.edge('jump', 'cj');
    const crouchEdge = this.edge('crouch', 'cc');
    const crouchHeld = !!cI.k.c;
    if (crouchHeld || crouchEdge) { this.act('crouch'); this.tutDone('crouch'); }
    if (jumpEdge) this.act('jump');

    // 슬라이딩 = 달리기 + 앉기
    if (b.slide > 0) b.slide -= dt;
    else if (crouchEdge && grounded && b.stun <= 0 && speedNow > WALK * 1.15 * st.spd) {
      b.slide = st.slideT; b.vx *= 1.25; b.vy *= 1.25;
      this.combo('slide', ['crouch', runY ? 'fb' : 'lr']);
    }
    b.crouch = grounded && (crouchHeld || b.slide > 0);
    // 들보 밑에서는 일어설 수 없다 → 숙인 자세 유지 (예전엔 이 판정이 들보를 무시해 몸이 끼었다)
    const underBeam = this.level.obs.some(o => o.alive && o.k === 'beam' && b.x + 5 > o.x0 && b.x - 5 < o.x1 && b.y + 4 > o.y0 && b.y - 4 < o.y1);
    if (underBeam) b.crouch = true;

    if (b.stun > 0) { b.vx = approach(b.vx, 0, 300 * dt); b.vy = approach(b.vy, 0, 300 * dt); }
    else if (b.slide > 0) { b.vx *= (1 - 1.2 * dt); b.vy *= (1 - 1.2 * dt); }
    else {
      const wx = WALK * st.spd, rx = RUN * st.spd * st.run;
      let tvx = mx * (runX ? rx : wx), tvy = my * (runY ? rx : wx);
      if (mx && my) { tvx *= 0.8; tvy *= 0.8; }
      // 화면 기준 이동: W=화면 위, D=화면 오른쪽 → 쿼터뷰 세계 방향으로 돌린다 (계단은 W+D)
      if (this.opts.screenMove) { const sx = tvx, sy = tvy; tvx = (sx + sy) * Math.SQRT1_2; tvy = (sy - sx) * Math.SQRT1_2; }
      if (b.crouch) { tvx *= 0.45; tvy *= 0.45; }
      const acc = grounded ? (b.landSlide > 0 ? 160 : 1100) : 240;
      b.vx = approach(b.vx, tvx, acc * dt); b.vy = approach(b.vy, tvy, acc * dt);
    }
    // 대각선 = 앞뒤 + 좌우 동시
    if (mx && my && b.stun <= 0) { b.diagT += dt; if (b.diagT > 0.5 && !b.diagDone) { b.diagDone = true; if (!this.opts.screenMove) this.combo('diag', ['fb', 'lr']); this.tutDone('diag'); /* 화면 기준에선 계단 오르기가 늘 W+D라 팝업 생략 */ } }
    else { b.diagT = 0; b.diagDone = false; }

    // 딸꾹질 사보타주: 멋대로 튀어 오른다
    if (this.sab.phase === 'on' && this.sab.kind === 'hic' && grounded) {
      this.hicT -= dt;
      if (this.hicT <= 0) { this.hicT = rnd(0.45, 0.9); b.vz = JUMPV * 0.75; this.emit('hic', {}); }
    }
    // 점프 (달리는 중이면 멀리뛰기)
    if (jumpEdge && grounded && b.stun <= 0 && b.slide <= 0 && !underBeam) {
      b.vz = JUMPV; b.crouch = false;
      if (speedNow > WALK * 1.15 * st.spd) {
        b.vx *= 1.3; b.vy *= 1.3; b.longJ = true;
        this.combo('long', ['jump', runY ? 'fb' : 'lr']);
        this.tutDone('long');
      }
      this.emit('jump', {});
      this.tutDone('jump');
    } else if (jumpEdge && !grounded && st.dbl && !b.usedDbl && b.stun <= 0) {
      b.vz = JUMPV * 0.85; b.usedDbl = true; this.emit('jump', {}); this.emit('combo', { kind: 'dbl', x: r1(b.x), y: r1(b.y) });
    }
    if (b.z > 0 || b.vz > 0) {
      b.vz -= GRAV * dt; b.z += b.vz * dt;
      if (b.z <= 0) { b.z = 0; b.vz = 0; b.usedDbl = false; if (b.longJ) { b.landSlide = 0.3; b.longJ = false; } this.emit('land', {}); }
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 5) { b.faceX = b.vx / sp; b.faceY = b.vy / sp; }
    this.moveBody(b.vx * dt, b.vy * dt, sp);

    // 들보 밑 통과: 숙인 채로 들보 아래에 들어갔다가, 부딪히지 않고 위쪽으로 빠져나가면 성공
    const bm = this.level.obs.find(o => o.alive && o.k === 'beam' && b.x + 5 > o.x0 && b.x - 5 < o.x1 && b.y + 4 > o.y0 && b.y - 4 < o.y1);
    if (bm) { if (b.crouch && this.underBeam !== bm.id) { this.underBeam = bm.id; this.underHit = false; } }
    else if (this.underBeam != null) {
      const o = this.level.obs.find(q => q.id === this.underBeam);
      if (o && !this.underHit && b.y < o.y0) this.solve('beam', ['crouch']);
      this.underBeam = null;
    }
    // 구덩이 건너기: 공중에서 낭떠러지 위를 지나 바닥에 내려앉으면 성공
    { const tt = this.tileAtPx(b.x, b.y); if (b.z > 0 && (tt === ' ' || tt === ',')) this.overPit = true; }
    // 구덩이
    const onGround = b.z <= 0 && b.vz <= 0;
    if (onGround && this.overPit) { this.overPit = false; const tt = this.tileAtPx(b.x, b.y); if (tt !== ' ' && tt !== ',' && !this.collapsedAt(b.x, b.y)) this.solve('pit', ['jump']); }
    const tt0 = this.tileAtPx(b.x, b.y);
    if (onGround && (tt0 === ' ' || tt0 === ',' || this.collapsedAt(b.x, b.y))) this.fall();
    else if (onGround) {
      b.safeT -= dt;
      if (b.safeT <= 0) { b.safeT = 0.1; b.safe.push([b.x, b.y]); if (b.safe.length > 12) b.safe.shift(); }
    }
  };

  P.moveBody = function (dx, dy, sp) {
    const b = this.body; let h;
    b.x += dx;
    if ((h = this.boxHit(b.x, b.y, 5, 4, true))) { b.x -= dx; b.vx = 0; this.bump(h, Math.sign(dx), 0, sp); }
    b.y += dy;
    if ((h = this.boxHit(b.x, b.y, 5, 4, true))) { b.y -= dy; b.vy = 0; this.bump(h, 0, Math.sign(dy), sp); }
  };
  P.bump = function (h, sx, sy, sp) {
    if (h.k === 'bar' && sp > 45) { if (this.hurt(5, 'lh', 'bar')) this.knock(-sx, -sy || 1, 120); }
    else if (h.k === 'beam') { this.underHit = true; if (this.hurt(7, 'crouch', 'beam')) this.knock(-sx, -sy || 1, 130); }
  };
  P.fall = function () {
    const b = this.body;
    // 줄 전체가 낭떠러지(구덩이)면 점프 탓, 다리 옆으로 떨어졌으면 좌우 탓
    const isPit = this.tileAtPx(b.x, b.y) === ' '; // ' ' = 구덩이(점프 탓), ',' = 다리 옆(좌우 탓)
    const isCol = this.collapsedAt(b.x, b.y);
    b.inv = 0; // 떨어지면 무적 중이어도 피해
    if (this.sab.phase === 'on') this.sab.t = Math.min(this.sab.t, 0.01); // 몸의 저항은 떨어지면 풀린다 (반전 중 연달아 떨어지는 것 방지)
    if (isCol) this.hurt(12, 'fb', 'collapse');
    else this.hurt(12, isPit ? 'jump' : 'lr', isPit ? 'pit' : 'edge');
    // 조금 전에 서 있던 안전한 곳으로 (무너지는 선보다 충분히 앞)
    let spot = null;
    for (let i = b.safe.length - 1; i >= 0; i--) {
      const s = b.safe[i];
      if (i <= b.safe.length - 4 && this.distAt(s[0], s[1]) >= this.col.d + 3 && this.tileAtPx(s[0], s[1]) === '.') { spot = s; break; }
    }
    if (!spot) spot = this.findSafeAhead();
    b.x = spot[0]; b.y = spot[1]; b.vx = b.vy = 0; b.z = 0; b.vz = 0; b.slide = 0; b.inv = Math.max(b.inv, 1.2);
    b.safe = [];
    this.emit('fall', { x: r1(b.x), y: r1(b.y) });
  };
  P.collapsedAt = function (x, y) {
    const r = Math.floor(y / T), d = this.distAt(x, y);
    return this.level.rowKind[r] === 'stair' && d >= 0 && d < this.col.d;
  };
  P.findSafeAhead = function () {
    const b = this.body; let best = null, bd = 1e9, lo = this.col.d + 3, hi = this.bodyDist() + 6;
    const r0 = Math.floor(b.y / T) - 14, r1_ = Math.floor(b.y / T) + 14;
    for (let r = r0; r <= r1_; r++) for (let c = 0; c < this.level.w; c++) {
      const x = c * T + 8, y = r * T + 8, dd = this.distAt(x, y);
      if (this.tile(c, r) !== '.' || dd < lo || dd > hi || this.boxHit(x, y, 5, 4, true)) continue;
      const d = Math.abs(x - b.x) + Math.abs(y - b.y) * 0.5;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best || [this.level.start.x, this.level.start.y];
  };

  // 담당자가 자기 장애물을 해결했다 → 이름·색으로 "성공!" (결과 화면 '해결' 횟수)
  P.solve = function (k, roles) {
    if (this.state !== 'play') return;
    const ids = [...new Set(roles.map(r => this.roles[r]))];
    ids.forEach(id => { if (this.pstats[id]) this.pstats[id].solves++; });
    this.emit('solve', { k, role: roles[0], pids: ids, x: r1(this.body.x), y: r1(this.body.y) });
  };
  P.combo = function (kind, roles) {
    const ids = [...new Set(roles.map(r => this.roles[r]))];
    ids.forEach(id => { if (this.pstats[id]) this.pstats[id].combos++; });
    this.emit('combo', { kind, x: r1(this.body.x), y: r1(this.body.y) });
  };

  // 카메라는 렌더러가 몸을 따라간다. 여기서는 무너지는 계단만 움직인다
  P.stepCamera = function (dt) {
    const k = this.col, b = this.body;
    if (!k.on) return;
    if (k.delay > 0) { k.delay -= dt; return; }
    if (!k.hinted) { k.hinted = true; this.emit('hint', { k: 'collapse' }); this.emit('collapse', {}); }
    // 너무 멀리 떨어지면 빨라진다 (항상 등 뒤에 있게)
    const gap = this.bodyDist() - k.d; // 몇 칸 뒤에서 쫓아오나
    k.d += (COLLAPSE / T + Math.max(0, gap - 9) * 0.35) * dt;
    const room = this.level.rooms[this.roomIdx];
    if (room && room.entryD >= 0) k.d = Math.min(k.d, room.entryD - 1);
  };

  // ---------- 굴러오는 통나무 · 술통 ----------
  P.stepRollers = function (dt) {
    const b = this.body, lv = this.level;
    if (this.cam.mode === 'scroll') {
      for (const s of lv.rollers) {
        const d = this.distAt(s.x, s.y) - this.bodyDist();
        if (d < 2 || d > 16) continue;
        s.t -= dt;
        if (s.t > 0) continue;
        s.t = s.k === 'log' ? rnd(3.6, 4.6) : rnd(2.0, 2.8);
        if (s.k === 'log') {
          const r = s.row; let c0 = Math.floor(s.x / T), c1 = c0;
          while (this.tile(c0 - 1, r) === '.') c0--;
          while (this.tile(c1 + 1, r) === '.') c1++;
          this.rollers.push({ id: this.nextId++, k: 'log', x0: c0 * T + 2, x1: (c1 + 1) * T - 2, x: (c0 + c1 + 1) * T / 2, y: s.y, vy: 56, rot: 0 });
        } else {
          this.rollers.push({ id: this.nextId++, k: 'barrel', x: s.x + rnd(-40, 40), y: s.y, vy: 70, rot: 0, ph: rnd(0, 6) });
        }
        if (!this.rollHint[s.k]) { this.rollHint[s.k] = 1; this.emit('hint', { k: s.k }); }
      }
    }
    for (const o of this.rollers) {
      o.y += o.vy * dt; o.rot += o.vy * dt / 5;
      if (o.k === 'barrel') { const nx = o.x + Math.sin(o.y / 18 + o.ph) * 14 * dt; if (!this.solidAt(Math.floor((nx + (nx > o.x ? 6 : -6)) / T), Math.floor(o.y / T))) o.x = nx; }
      // 구덩이·무너진 곳으로 떨어지거나 바리케이드에 부딪히면 끝
      const ta = this.tileAtPx(o.x, o.y + 6);
      if (ta === ' ' || ta === ',' || this.collapsedAt(o.x, o.y)) { o.dead = true; this.emit('rollfall', { x: r1(o.x), y: r1(o.y) }); continue; }
      const hitBar = this.level.obs.some(q => q.alive && q.k === 'bar' && o.y + 6 > q.y0 && o.y - 6 < q.y1 && (o.k === 'log' || (o.x > q.x0 && o.x < q.x1)));
      if (hitBar || this.solidAt(Math.floor(o.x / T), Math.floor((o.y + 6) / T))) { o.dead = true; this.emit('break', { x: r1(o.x), y: r1(o.y), roll: 1 }); continue; }
      if (b.z < 9) {
        if (o.k === 'log' && b.x > o.x0 - 4 && b.x < o.x1 + 4 && Math.abs(b.y - o.y) < 8) { o.hit = true; if (this.hurt(8, 'lh', 'log')) this.knock(0, 1, 150); }
        if (o.k === 'barrel' && Math.hypot(b.x - o.x, b.y - o.y) < 11) { o.hit = true; const d = Math.hypot(b.x - o.x, b.y - o.y) || 1; if (this.hurt(6, 'lr', 'barrel')) this.knock((b.x - o.x) / d, 0.8, 140); }
      }
      // 점프로 통나무 넘기 / 옆으로 상자 피하기
      if (o.k === 'log' && !o.hit && !o.done && b.z >= 9 && b.x > o.x0 - 4 && b.x < o.x1 + 4 && Math.abs(b.y - o.y) < 6) { o.done = true; this.solve('logjump', ['jump']); }
      if (o.k === 'barrel' && !o.hit && !o.done && o.y > b.y + 2 && o.y < b.y + 8 && Math.abs(b.x - o.x) < 28) { o.done = true; this.solve('dodge', ['lr']); }
    }
    this.rollers = this.rollers.filter(o => !o.dead);
  };

  P.newEnemy = function (k, x, y, room) {
    const e = { id: this.nextId++, k, x, y, z: 0, hp: 2, room: room == null ? null : room, flash: 0 };
    if (k === 'fly') { e.z = 22; e.t = rnd(0, 6); e.shootT = rnd(1.2, 2.4); e.life = room == null ? 14 : 1e9; e.ax = x; e.ay = y; }
    if (k === 'ant') { e.hit = 0; e.kx = 0; e.ky = 0; }
    if (k === 'egg') { e.hp = 1; e.t = 6; }
    if (k === 'spit') { e.shootT = rnd(0.8, 1.6); e.w = 0; } // 산성 개미 포수: 제자리에서 침 (방패로 막고, 마법·망치로 잡는다)
    this.enemies.push(e);
    return e;
  };
  P.stepSpawns = function () {
    for (const s of this.level.spawns) {
      if (!s.done && this.cam.mode === 'scroll' && this.distAt(s.x, s.y) - this.bodyDist() < 11 && !this.collapsedAt(s.x, s.y)) { s.done = true; this.newEnemy(s.k, s.x, s.y, null); }
    }
  };
  // 계단 압박 조율기: 몸 앞쪽 길에 적을 계속 보충해서 모든 공격 역할이 늘 할 일이 있게 한다
  //   날개 개미 → 불꽃 정령(잡기) + 땅 정령(침 막기) · 개미 떼 → 오른손 마법·왼손 망치 · 산성 포수 → 방패로 버티며 마법으로 처치
  P.pathSpot = function (d0, d1) {
    const lv = this.level, b = this.body;
    if (!lv._byDist) { lv._byDist = {}; lv.dist.forEach((row, r) => row.forEach((d, c) => { if (d >= 0 && lv.rows[r][c] === '.' && lv.rowKind[r] === 'stair') (lv._byDist[d] = lv._byDist[d] || []).push([c * T + 8, r * T + 8]); })); }
    for (let i = 0; i < 12; i++) {
      const list = lv._byDist[Math.round(rnd(d0, d1))]; if (!list) continue;
      const p = list[Math.random() * list.length | 0];
      if (Math.hypot(p[0] - b.x, p[1] - b.y) > 48 && !this.collapsedAt(p[0], p[1]) && !this.boxHit(p[0], p[1], 5, 4, true)) return p;
    }
    return null;
  };
  P.stepDirector = function (dt) {
    if (this.state !== 'play' || this.cam.mode !== 'scroll' || (this.tut && this.tut.on) || this.col.delay > 0) return;
    const room = this.level.rooms[this.roomIdx]; if (room && room.active) return;
    const dr = this.dirT || (this.dirT = { fly: 3, ant: 5, spit: 7, rock: 2, wave: 3.5, blade: 6 });
    const bd = this.bodyDist(), n = this.players.length, free = this.enemies.filter(e => e.room == null && !e.tr);
    const cnt = k => free.filter(e => e.k === k).length;
    for (const k in dr) dr[k] -= dt;
    if (dr.fly <= 0) { dr.fly = rnd(5, 7.5); if (cnt('fly') < (n >= 3 ? 2 : 1) + 1) { const p = this.pathSpot(bd + 6, bd + 10); if (p) this.newEnemy('fly', p[0], p[1] - 20, null); } }
    if (dr.ant <= 0) { dr.ant = rnd(6, 9); if (cnt('ant') < 3) { const p = this.pathSpot(bd + 8, bd + 12); if (p) for (let i = 0; i < 2; i++) this.newEnemy('ant', p[0] + rnd(-6, 6), p[1] + rnd(-6, 6), null); } }
    if (dr.spit <= 0) { dr.spit = rnd(8, 12); if (cnt('spit') < 1) { const p = this.pathSpot(bd + 11, bd + 15); if (p) this.newEnemy('spit', p[0], p[1], null); } }
    // 움직임 역할도 몰아친다: 떨어지는 돌 → 좌우(앞뒤)로 비키기 · 바닥 충격파 → 점프 · 머리 높이 칼날 → 앉기
    const has = k => this.traps.some(t => t.k === k), sl = this.roomIdx === 0 ? 1.3 : 1; // 첫 계단은 조금 느슨하게 (익히는 구간)
    if (dr.rock <= 0) { dr.rock = rnd(3.5, 5.5) * sl; if (!has('rock')) this.dropRocks(); }
    // 충격파는 몸 앞 길에서 터진다 — 몸이 그쪽으로 가는 중이라 고리와 마주친다 (고리는 몸이 있던 곳 너머까지 퍼짐)
    if (dr.wave <= 0) { dr.wave = rnd(5, 7) * sl; if (!has('wave')) { const p = this.pathSpot(bd + 7, bd + 10); if (p) this.addTrap({ k: 'wave', x: p[0], y: p[1], warn: 0.7, r: 0, R: Math.hypot(p[0] - this.body.x, p[1] - this.body.y) + 40 }); } }
    if (dr.blade <= 0) { dr.blade = rnd(5.5, 8) * sl; if (!has('blade')) this.throwBlade(); }
  };

  // ---------- 움직임 역할 함정 ----------
  P.addTrap = function (t) {
    t.id = this.nextId++; t.t = 0; this.traps.push(t);
    this.emit('trap', { k: t.k });
    if (!this.trapHint[t.k]) { this.trapHint[t.k] = 1; this.emit('hint', { k: t.k }); }
    return t;
  };
  // 떨어지는 돌: 몸이 곧 있을 자리(+주변)에 그림자 → 1초 뒤 쿵. 비키면 좌우(또는 앞뒤) 담당의 해결
  P.dropRocks = function () {
    const b = this.body, n = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0), W0 = 1.05;
    for (let i = 0; i < n; i++) {
      const w = W0 + i * 0.3;
      let x = b.x + b.vx * w + (i ? rnd(-30, 30) : 0), y = b.y + b.vy * w + (i ? rnd(-30, 30) : 0);
      if (!this.walkable(x, y) || this.collapsedAt(x, y)) { if (i) continue; x = b.x; y = b.y; }
      this.addTrap({ k: 'rock', x, y, warn: w, threat: false });
    }
  };
  // 머리 높이 마력 칼날: 앞쪽 길의 룬에서 몸이 도착할 자리를 겨눠 날아온다. 붉은 선 예고 → 숙이면(앉기) 머리 위로 지나감
  P.throwBlade = function () {
    const b = this.body, bd = this.bodyDist(), p = this.pathSpot(bd + 6, bd + 9); if (!p) return;
    const warn = 0.8, sp = 170;
    let tx = b.x, ty = b.y;
    for (let i = 0; i < 3; i++) { const ta = warn + Math.hypot(tx - p[0], ty - p[1]) / sp; tx = b.x + b.vx * ta; ty = b.y + b.vy * ta; } // 도착 시각 예측을 몇 번 다듬음
    const L = Math.hypot(tx - p[0], ty - p[1]) || 1, dx = (tx - p[0]) / L, dy = (ty - p[1]) / L;
    this.addTrap({ k: 'blade', sx: p[0], sy: p[1], dx, dy, len: L + 70, sp, x: p[0], y: p[1], warn });
  };
  P.stepTraps = function (dt) {
    const b = this.body;
    for (const t of this.traps) {
      t.t += dt;
      if (t.k === 'rock') {
        const d = Math.hypot(b.x - t.x, b.y - t.y);
        if (d < 11) t.threat = true; // 떨어질 자리 안에 있었다가 빠져나가야 '피했다'
        if (t.t < t.warn) continue;
        t.dead = true; this.emit('rock', { x: r1(t.x), y: r1(t.y) });
        if (d < 11 && b.z < 12) { if (this.hurt(5, 'lr', 'rock')) this.knock(d ? (b.x - t.x) / d : 0, d ? (b.y - t.y) / d : 1, 110); }
        else if (t.threat && d < 48) { const la = r => this.lastAct[r] == null ? -99 : this.lastAct[r]; this.solve('dodge', [la('lr') >= la('fb') ? 'lr' : 'fb']); }
        continue;
      }
      if (t.t < t.warn) continue;
      if (t.k === 'wave') {
        // 바닥을 타고 퍼지는 고리 — 닿을 때 공중에 있으면 성공
        t.r = (t.t - t.warn) * 110;
        if (t.r > t.R) { t.dead = true; continue; }
        const d = Math.hypot(b.x - t.x, b.y - t.y);
        if (!t.hit && !t.done && Math.abs(d - t.r) < 5) {
          if (b.z < 3) { t.hit = true; if (this.hurt(5, 'jump', 'wave')) this.knock(d ? (b.x - t.x) / d : 0, d ? (b.y - t.y) / d : 1, 100); }
          else { t.done = true; this.solve('wave', ['jump']); }
        }
      } else if (t.k === 'blade') {
        const s = (t.t - t.warn) * t.sp;
        if (s > t.len) { t.dead = true; continue; }
        t.x = t.sx + t.dx * s; t.y = t.sy + t.dy * s;
        if (!t.hit && !t.done && Math.hypot(b.x - t.x, b.y - t.y) < 9 && b.z < 16) {
          if (!b.crouch) { t.hit = true; if (this.hurt(5, 'crouch', 'blade')) this.knock(t.dx, t.dy, 90); }
          else { t.done = true; this.solve('duck', ['crouch']); }
        }
      }
    }
    this.traps = this.traps.filter(t => !t.dead);
  };
  P.randomRoomSpot = function (room, minD) {
    const b = this.body;
    for (let i = 0; i < 60; i++) {
      const x = rnd(room.x0 + 16, room.x1 - 16), y = rnd(room.y0 + 16, room.y1 - 16);
      if (Math.hypot(x - b.x, y - b.y) < minD) continue;
      if (this.walkable(x, y)) return [x, y];
    }
    return [(room.x0 + room.x1) / 2, room.y0 + 24];
  };
  P.spawnWave = function (room, w) {
    for (let i = 0; i < w.ant; i++) { const p = this.randomRoomSpot(room, 80); this.newEnemy('ant', p[0], p[1], this.roomIdx); }
    for (let i = 0; i < w.fly; i++) { const p = this.randomRoomSpot(room, 60); this.newEnemy('fly', p[0], Math.min(p[1], room.y0 + 60), this.roomIdx); }
    this.emit('wave', {});
  };

  P.stepRooms = function (dt) {
    const room = this.level.rooms[this.roomIdx]; if (!room) return;
    const b = this.body;
    if (!room.active && !room.cleared) {
      if (b.y + 6 < room.bottomRow * T) {
        room.active = true; room.bottomLocked = true; this.cam.mode = 'room'; this.col.on = false;
        this.rollers = []; this.traps = [];
        // 계단에 남은 적은 정리
        this.enemies = this.enemies.filter(e => e.room != null);
        this.eshots = [];
        if (room.kind === 'boss') { room.bossT = 2.5; this.emit('bossintro', {}); }
        else { room.wave = 0; room.waveT = 1.0; this.emit('room', {}); }
      }
      return;
    }
    if (room.active) {
      if (room.kind === 'boss') {
        if (room.bossT > 0) { room.bossT -= dt; if (room.bossT <= 0) this.spawnQueen(room); }
        return;
      }
      const alive = this.enemies.some(e => e.room === this.roomIdx);
      if (!alive) {
        if (room.waveT > 0) {
          room.waveT -= dt;
          if (room.waveT <= 0) {
            if (room.wave < room.waves.length) { this.spawnWave(room, room.waves[room.wave]); room.wave++; }
            else { room.active = false; room.cleared = true; room.topLocked = false; this.emit('cleared', {}); }
          }
        } else room.waveT = 1.2;
      }
      return;
    }
    if (room.cleared && b.y + 4 < room.topRow * T) {
      this.roomIdx++; this.cam.mode = 'scroll';
      this.col.on = true; this.col.d = room.exitD; this.col.delay = 2.5;
      if (this.opts.shuffle && !this.shuffled && this.players.length > 1) { this.shuffled = true; this.doShuffle(); }
    }
  };

  P.doShuffle = function () {
    this.endSwap();
    const ids = this.players.map(p => p.id);
    let best = null, bs = -1;
    for (let i = 0; i < 16; i++) {
      const r = assignRoles(ids); let ch = 0;
      for (const k of ROLES) if (r[k] !== this.roles[k]) ch++;
      if (ch > bs) { bs = ch; best = r; }
    }
    this.prevRoles = this.roles;
    this.roles = best; this.syncCounts();
    this.state = 'shuffle'; this.stateT = SHUF_T; this.ready = {};
    this.emit('shuffle', {});
  };

  // ---------- 공격 ----------
  P.aim = function (I, ox, oy) {
    const b = this.body;
    if (I.mx != null) { const dx = I.mx - ox, dy = I.my - oy, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
    return [b.faceX, b.faceY];
  };
  P.stepAttacks = function (dt) {
    const b = this.body;
    for (const k in this.cool) this.cool[k] -= dt;
    if (this.nomanaT > 0) this.nomanaT -= dt;
    if (this.swing) { this.swing.t -= dt; if (this.swing.t <= 0) this.swing = null; }
    // 왼손 망치
    if (this.edge('lh', 'cl')) {
      this.act('lh');
      if (this.cool.lh <= 0) {
        this.cool.lh = 0.28;
        const [dx, dy] = this.aim(this.inp('lh'), b.x, b.y);
        const R = this.stats.lhR, hx = b.x + dx * R, hy = b.y + dy * R * 0.85;
        this.swing = { x: r1(hx), y: r1(hy), dx: r1(dx), dy: r1(dy), t: 0.15 };
        this.emit('swing', { x: r1(hx), y: r1(hy), dx: r1(dx), dy: r1(dy) });
        for (const o of this.level.obs) {
          if (!o.alive || o.k !== 'bar') continue;
          const cx = clamp(hx, o.x0, o.x1), cy = clamp(hy, o.y0, o.y1);
          if (Math.hypot(cx - hx, cy - hy) < R) {
            o.alive = false; this.gainXp(1, 'break', cx, cy);
            const pid = this.roles.lh; if (this.pstats[pid]) this.pstats[pid].breaks++;
            this.emit('break', { id: o.id, x: r1(cx), y: r1(cy) });
            this.solve('bar', ['lh']);
          }
        }
        for (const o of this.rollers) {
          const hit = o.k === 'log'
            ? Math.hypot(clamp(hx, o.x0, o.x1) - hx, clamp(hy, o.y - 5, o.y + 5) - hy) < R
            : Math.hypot(o.x - hx, o.y - hy) < R + 6;
          if (hit && !o.dead) {
            o.dead = true; this.gainXp(1, 'break', o.x, o.y);
            const pid = this.roles.lh; if (this.pstats[pid]) this.pstats[pid].breaks++;
            this.emit('break', { x: r1(o.x), y: r1(o.y) });
            this.solve(o.k === 'log' ? 'log' : 'crate', ['lh']);
          }
        }
        this.rollers = this.rollers.filter(o => !o.dead);
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - hx, e.y - hy);
          if ((e.k === 'egg' || e.k === 'crate') && d < R + 6) this.damage(e, 1, 'lh');
          else if ((e.k === 'ant' || e.k === 'spit') && d < R + 2) this.damage(e, 1 * this.stats.atk * this.stats.lhDmg, 'lh');
          else if (e.k === 'queen' && d < R + 16) this.damage(e, 2 * this.stats.atk * this.stats.lhDmg, 'lh');
          if (this.stats.stunHit && e.k === 'ant' && d < R + 12) e.stun = 1; // 대지 강타: 기절
        }
      }
    }
    // 오른손 마법
    const rhI = this.inp('rh');
    const rhFire = this.edge('rh', 'cr') || rhI.rb;
    if (rhFire) {
      this.act('rh');
      if (this.cool.rh <= 0) {
        if (this.mana >= 6) {
          this.cool.rh = 0.28; this.mana -= 6;
          const [dx, dy] = this.aim(rhI, b.x, b.y);
          const n = this.stats.rhN, base = Math.atan2(dy, dx);
          for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.24, ux = Math.cos(a), uy = Math.sin(a); this.shots.push({ k: 'rh', x: b.x + ux * 6, y: b.y + uy * 6, vx: ux * 230, vy: uy * 230, life: this.stats.rhLife, id: this.nextId++, hit: [] }); }
          this.emit('shoot', {});
        } else if (this.nomanaT <= 0) { this.nomanaT = 1; this.emit('nomana', {}); }
      }
    }
    // 정령
    const s = this.spirit;
    const aI = this.inp('atk'), dI = this.inp('def');
    let tax = b.x - 16, tay = b.y - 20;
    if (aI.mx != null) { const dx = aI.mx - b.x, dy = aI.my - b.y, d = Math.hypot(dx, dy); const k = d > 120 ? 120 / d : 1; tax = b.x + dx * k; tay = b.y + dy * k; }
    s.ax += (tax - s.ax) * Math.min(1, 10 * dt); s.ay += (tay - s.ay) * Math.min(1, 10 * dt);
    let tdx = b.x + 14, tdy = b.y - 10;
    if (dI.mx != null) { const dx = dI.mx - b.x, dy = dI.my - (b.y - 6), d = Math.hypot(dx, dy); const k = d > 38 ? 38 / d : 1; tdx = b.x + dx * k; tdy = b.y - 6 + dy * k; }
    s.dx += (tdx - s.dx) * Math.min(1, 14 * dt); s.dy += (tdy - s.dy) * Math.min(1, 14 * dt);
    if (aI.mx !== s.lastA) { s.lastA = aI.mx; this.act('atk'); }
    if (dI.mx !== s.lastD) { s.lastD = dI.mx; this.act('def'); }
    if (this.cool.atk <= 0) {
      let best = null, bd = this.stats.atkRange;
      for (const e of this.enemies) if (e.k === 'fly') { const d = Math.hypot(e.x - s.ax, e.y - e.z - s.ay); if (d < bd && (!e.tr || (d < 30 && this.tutActive().includes('atk')))) { bd = d; best = e; } } // 연습 인형은 정령을 가까이 대야 공격
      if (best && this.mana >= 4) {
        this.cool.atk = this.stats.atkCd; this.mana -= 4;
        const dx = best.x - s.ax, dy = (best.y - best.z) - s.ay, d = Math.hypot(dx, dy) || 1;
        this.shots.push({ k: 'sp', x: s.ax, y: s.ay, vx: dx / d * 250, vy: dy / d * 250, life: 0.9, tgt: best.id, id: this.nextId++ });
        this.emit('spshoot', {});
      }
    }
  };

  // 경험치: 어디서 얼마 얻었는지 보이게(+XP 글자) · 레벨업 카드 창에 "왜 떴는지" 적으려고 이번 레벨 동안의 출처를 센다
  P.gainXp = function (n, why, x, y) {
    this.xp += n; this.xpWhy[why] = (this.xpWhy[why] || 0) + 1;
    this.emit('xp', { n, x: r1(x), y: r1(y) });
  };
  const DUMMY_TASK = { crate: 'lh', ant: 'rh', fly: 'atk', rune: 'def' };
  P.damage = function (e, dmg, role) {
    if (e.dead) return;
    if (e.tr && !this.tutActive().includes(DUMMY_TASK[e.k])) return; // 연습 표적은 자기 차례일 때만 맞는다
    e.hp -= dmg; e.flash = 0.12;
    if (e.k === 'ant') { const b = this.body; const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1; e.hit = 0.15; e.kx = dx / d * 120; e.ky = dy / d * 120; }
    if (e.hp <= 0) {
      e.dead = true;
      const xp = e.tr ? 1 : ({ ant: 3, spit: 4, fly: 4, egg: 1, queen: 0 }[e.k] || 0);
      if (xp) this.gainXp(xp, e.k === 'egg' || e.k === 'crate' ? 'break' : 'kill', e.x, e.y - e.z);
      const pid = this.roles[role];
      if (this.pstats[pid]) { if (e.k === 'egg' || e.k === 'crate') this.pstats[pid].breaks++; else this.pstats[pid].kills++; }
      if (e.tr) this.tutDone(e.k === 'crate' ? 'lh' : e.k === 'ant' ? 'rh' : 'atk');
      this.emit('kill', { k: e.k, x: r1(e.x), y: r1(e.y - e.z) });
      if (!e.tr) this.hitStop = e.k === 'queen' ? 0.35 : 0.06;
      if (e.k === 'ant' || e.k === 'spit' || e.k === 'fly' || e.k === 'egg' || e.k === 'crate') this.solve(e.k === 'fly' ? 'fly' : (e.k === 'ant' || e.k === 'spit') ? 'ant' : 'crate', [role]);
      if (e.k === 'queen') this.finish('clear');
    }
  };

  P.stepShots = function (dt) {
    const b = this.body;
    for (const s of this.shots) {
      if (s.k === 'sp') {
        const t = this.enemies.find(e => e.id === s.tgt && !e.dead);
        if (t) { const dx = t.x - s.x, dy = (t.y - t.z) - s.y, d = Math.hypot(dx, dy) || 1; s.vx += (dx / d * 250 - s.vx) * Math.min(1, 6 * dt); s.vy += (dy / d * 250 - s.vy) * Math.min(1, 6 * dt); }
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) { s.dead = true; continue; }
      if (s.k === 'rh' && this.solidAt(Math.floor(s.x / T), Math.floor(s.y / T))) { s.dead = true; this.emit('poof', { x: r1(s.x), y: r1(s.y) }); continue; }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (s.k === 'rh' && (e.k === 'ant' || e.k === 'spit' || e.k === 'queen')) {
          const r = e.k === 'queen' ? 18 : 8;
          if (Math.hypot(e.x - s.x, e.y - s.y) < r && !(s.hit && s.hit.includes(e.id))) {
            this.damage(e, 1 * this.stats.atk, 'rh'); this.emit('poof', { x: r1(s.x), y: r1(s.y) });
            if (this.stats.pierce && s.hit) { s.hit.push(e.id); continue; } // 관통 마법: 계속 날아감
            s.dead = true; break;
          }
        }
        if (s.k === 'rf' && (e.k === 'ant' || e.k === 'spit' || e.k === 'queen' || e.k === 'fly')) {
          if (Math.hypot(e.x - s.x, (e.y - (e.z || 0)) - s.y) < (e.k === 'queen' ? 20 : 10)) { this.damage(e, 1.5 * this.stats.atk, 'def'); s.dead = true; this.emit('poof', { x: r1(s.x), y: r1(s.y) }); break; }
        }
        if (s.k === 'sp' && e.k === 'fly') {
          if (Math.hypot(e.x - s.x, (e.y - e.z) - s.y) < 9) { this.damage(e, 1 * this.stats.atk, 'atk'); s.dead = true; this.emit('poof', { x: r1(s.x), y: r1(s.y) }); break; }
        }
      }
    }
    this.shots = this.shots.filter(s => !s.dead);
    const sp = this.spirit, R = this.stats.defR;
    for (const s of this.eshots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || this.solidAt(Math.floor(s.x / T), Math.floor(s.y / T))) { s.dead = true; continue; }
      if (Math.hypot(s.x - sp.dx, s.y - sp.dy) < R + 3) {
        s.dead = true;
        const pid = this.roles.def; if (this.pstats[pid]) this.pstats[pid].blocks++;
        this.emit('block', { x: r1(s.x), y: r1(s.y) });
        this.solve('block', ['def']);
        if (this.stats.reflect) this.shots.push({ k: 'rf', x: s.x, y: s.y, vx: -s.vx * 2.4, vy: -s.vy * 2.4, life: 1.2, id: this.nextId++ }); // 반사 방패
        if (this.inp('def').mx != null) this.tutDone('def'); // 마우스로 직접 옮겨 막았을 때만 인정
        continue;
      }
      if (Math.hypot(s.x - b.x, s.y - (b.y - 6)) < 8 && b.z < 14) {
        s.dead = true;
        if (this.hurt(7, 'def', 'shot')) { const d = Math.hypot(s.vx, s.vy) || 1; this.knock(s.vx / d, s.vy / d, 70); }
      }
    }
    this.eshots = this.eshots.filter(s => !s.dead);
  };

  P.fireAt = function (x, y, speed) {
    const b = this.body; const dx = b.x - x, dy = (b.y - 6) - y, d = Math.hypot(dx, dy) || 1;
    this.eshots.push({ x, y, vx: dx / d * speed, vy: dy / d * speed, life: 4, id: this.nextId++ });
    if (!this.hintsDone.shot) { this.hintsDone.shot = 1; this.emit('hint', { k: 'shot' }); }
  };

  P.stepEnemies = function (dt) {
    const b = this.body;
    for (const e of this.enemies) {
      if (e.flash > 0) e.flash -= dt;
      if (e.tr) {
        // 연습 표적: 안 움직이고 안 문다. 룬석만 약한 침을 쏜다 (방패 연습용)
        if (e.k === 'rune' && this.tut && this.tut.on && this.tutActive().includes('def')) {
          e.shootT -= dt;
          if (e.shootT <= 0) { e.shootT = 2.2; const dx = b.x - e.x, dy = (b.y - 6) - (e.y - 12), d = Math.hypot(dx, dy) || 1; this.eshots.push({ x: e.x, y: e.y - 12, vx: dx / d * 50, vy: dy / d * 50, life: 5, id: this.nextId++ }); }
        }
        continue;
      }
      if (e.k === 'ant' && e.stun > 0) { e.stun -= dt; continue; } // 기절: 안 움직이고 안 문다
      if (e.k === 'ant') {
        const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (e.hit > 0) { e.hit -= dt; const nx = e.x + e.kx * dt, ny = e.y + e.ky * dt; if (this.walkable(nx, e.y)) e.x = nx; if (this.walkable(e.x, ny)) e.y = ny; }
        else {
          const sp = 34 * (e.fast ? 1.4 : 1);
          // 막히면 잠깐 옆으로 돌아간다 (기둥 뒤에 끼지 않게)
          let ux = dx / d, uy = dy / d;
          if (e.side > 0) { e.side -= dt; const s = e.sideDir; const px = -uy * s, py = ux * s; ux = px; uy = py; }
          const nx = e.x + ux * sp * dt, ny = e.y + uy * sp * dt;
          const ox = e.x, oy = e.y;
          if (this.walkable(nx, e.y)) e.x = nx;
          if (this.walkable(e.x, ny)) e.y = ny;
          const moved = Math.abs(e.x - ox) + Math.abs(e.y - oy);
          if (moved < sp * dt * 0.3 && !(e.side > 0)) { e.side = 0.7; e.sideDir = Math.random() < 0.5 ? 1 : -1; }
        }
        if (d < 10 && b.z < 10) { if (this.hurt(8, 'rh', 'ant')) this.knock(dx / d, dy / d, 150); }
      } else if (e.k === 'fly') {
        e.t += dt; e.life -= dt;
        let tx, ty;
        if (e.room == null) { tx = e.ax + Math.sin(e.t * 0.9) * 30; ty = e.ay + Math.sin(e.t * 1.3) * 16; if (e.life < 0) ty = e.ay - 320; }
        else { tx = e.ax + Math.sin(e.t * 0.8) * 40; ty = e.ay + Math.cos(e.t * 1.1) * 18; }
        e.x += (tx - e.x) * Math.min(1, 1.6 * dt); e.y += (ty - e.y) * Math.min(1, 1.6 * dt);
        e.shootT -= dt;
        if (e.shootT <= 0 && e.life > 0) { e.shootT = rnd(1.6, 2.3); this.fireAt(e.x, e.y - e.z, 72); }
        if (e.life < 0 && e.y < e.ay - 280) e.dead = true;
      } else if (e.k === 'spit') {
        const d = Math.hypot(b.x - e.x, b.y - e.y);
        if (e.w > 0) { e.w -= dt; if (e.w <= 0) { this.fireAt(e.x, e.y - 8, 88); e.shootT = rnd(1.9, 2.6); } } // 준비 동작(부풀어 오름) 뒤 발사
        else if (d < 190) { e.shootT -= dt; if (e.shootT <= 0) e.w = 0.5; }
        if (d < 10 && b.z < 10) { if (this.hurt(6, 'rh', 'ant')) this.knock((b.x - e.x) / (d || 1), (b.y - e.y) / (d || 1), 120); }
      } else if (e.k === 'egg') {
        e.t -= dt;
        if (e.t <= 0) { e.dead = true; for (let i = 0; i < 2; i++) { const a = this.newEnemy('ant', e.x + rnd(-8, 8), e.y + rnd(-6, 6), e.room); a.fast = true; } this.emit('hatch', { x: r1(e.x), y: r1(e.y) }); }
      } else if (e.k === 'queen') this.stepQueen(e, dt);
      if (e.room == null && !e.tr && (Math.hypot(e.x - b.x, e.y - b.y) > 340 || ((e.k === 'ant' || e.k === 'spit') && this.collapsedAt(e.x, e.y)))) e.dead = true;
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  };

  // ---------- 보스: 개미 여왕 ----------
  P.spawnQueen = function (room) {
    const q = this.newEnemy('queen', (room.x0 + room.x1) / 2, room.y0 + 40, this.roomIdx);
    q.hp = q.max = 90; q.act = 'idle'; q.actT = 1.5; q.seq = []; q.dvx = 0; q.dvy = 0;
    this.emit('queen', {});
  };
  P.stepQueen = function (q, dt) {
    const b = this.body, room = this.level.rooms[q.room];
    if (!q.p2 && q.hp <= q.max / 2) { q.p2 = true; this.emit('enrage', {}); }
    const dx = b.x - q.x, dy = b.y - q.y, d = Math.hypot(dx, dy) || 1;
    q.actT -= dt;
    if (q.act === 'idle') {
      const tx = clamp(b.x, room.x0 + 40, room.x1 - 40), ty = room.y0 + 44;
      q.x += (tx - q.x) * Math.min(1, 0.7 * dt); q.y += (ty - q.y) * Math.min(1, 0.7 * dt);
      if (q.actT <= 0) {
        if (!q.seq.length) q.seq = shuffle(['spit', 'summon', 'charge', 'egg', 'larva']);
        const a = q.seq.pop();
        const rest = q.p2 ? 1.3 : 2.0;
        if (a === 'spit') {
          q.act = 'spitw'; q.actT = 0.55; q.aim = Math.atan2((b.y - 6) - (q.y - 8), b.x - q.x); q.rest = rest;
        } else if (a === 'summon') {
          const n = q.p2 ? 4 : 3;
          for (let i = 0; i < n; i++) this.newEnemy('ant', q.x + rnd(-24, 24), q.y + rnd(8, 20), q.room);
          this.emit('summon', {}); q.actT = rest;
        } else if (a === 'charge') {
          q.act = 'tele'; q.actT = 0.8; q.dvx = dx / d; q.dvy = dy / d; this.emit('tele', {});
        } else if (a === 'egg') {
          const n = q.p2 ? 3 : 2;
          for (let i = 0; i < n; i++) { const p = this.randomRoomSpot(room, 40); this.newEnemy('egg', p[0], p[1], q.room); }
          this.emit('egg', {}); q.actT = rest;
        } else if (a === 'larva') {
          const flies = this.enemies.filter(e => e.k === 'fly').length;
          for (let i = 0; i < 2 && flies + i < 4; i++) this.newEnemy('fly', q.x + (i ? 30 : -30), q.y, q.room);
          this.emit('larva', {}); q.actT = rest;
        }
      }
    } else if (q.act === 'spitw') {
      if (q.actT <= 0) {
        const n = q.p2 ? 7 : 5;
        for (let i = 0; i < n; i++) { const ang = q.aim + (i - (n - 1) / 2) * 0.22; this.eshots.push({ x: q.x, y: q.y - 8, vx: Math.cos(ang) * 80, vy: Math.sin(ang) * 80, life: 4, id: this.nextId++ }); }
        this.emit('spit', {}); q.act = 'idle'; q.actT = q.rest || 2;
      }
    } else if (q.act === 'tele') {
      q.dvx = dx / d; q.dvy = dy / d;
      if (q.actT <= 0) { q.act = 'dash'; q.actT = 0.75; }
    } else if (q.act === 'dash') {
      const sp = q.p2 ? 210 : 180;
      q.x = clamp(q.x + q.dvx * sp * dt, room.x0 + 18, room.x1 - 18);
      q.y = clamp(q.y + q.dvy * sp * dt, room.y0 + 14, room.y1 - 10);
      if (q.actT <= 0) { q.act = 'idle'; q.actT = q.p2 ? 1.2 : 1.8; }
    }
    if (d < 18 && b.z < 12) { if (this.hurt(10, 'lr', 'queen')) this.knock(dx / d, dy / d, 180); }
  };

  // ---------- 사보타주 ----------
  P.stepSab = function (dt) {
    const s = this.sab;
    if (!this.opts.sabotage || (this.tut && this.tut.on)) return;
    if (s.phase === 'idle') {
      s.next -= dt;
      if (s.next <= 0) {
        s.next = rnd(30, 55);
        if (Math.random() < Math.min(0.95, 0.8 * this.stats.sab)) {
          const kinds = ['rev', 'hic'].concat(this.players.length >= 2 ? ['swap'] : []);
          s.kind = kinds[Math.random() * kinds.length | 0];
          s.phase = 'warn'; s.t = 1.2; s.line = Math.random() * SAB_KIND[s.kind].lines.length | 0;
          this.emit('sabwarn', { line: s.line, kind: s.kind });
        }
      }
    } else if (s.phase === 'warn') {
      s.t -= dt;
      if (s.t <= 0) {
        s.phase = 'on'; s.t = SAB_KIND[s.kind].dur; this.hicT = 0.2;
        if (s.kind === 'swap') {
          const ids = shuffle(this.players.map(p => p.id)), a = ids[0], c = ids[1];
          const orig = Object.assign({}, this.roles);
          for (const r of ROLES) { if (this.roles[r] === a) this.roles[r] = c; else if (this.roles[r] === c) this.roles[r] = a; }
          this.sabSwap = { orig, a, b: c }; this.syncCounts();
          this.emit('sabswap', { a, b: c });
        }
        this.emit('sabon', { kind: s.kind });
      }
    }
    else { s.t -= dt; if (s.t <= 0) { s.phase = 'idle'; this.endSwap(); this.emit('saboff', {}); } }
  };
  P.endSwap = function () {
    if (!this.sabSwap) return;
    this.roles = this.sabSwap.orig; this.sabSwap = null; this.syncCounts();
  };

  P.stepHints = function () {
    if (this.tut && this.tut.on) return; // 훈련 중엔 일반 힌트 미룸
    for (const h of this.level.hints) {
      if (!this.hintsDone[h.id] && this.bodyDist() >= h.d - 9) { this.hintsDone[h.id] = 1; this.emit('hint', { k: h.k }); }
    }
  };

  // ---------- 레벨업 투표 ----------
  P.startVote = function () {
    // 등급 가중치로 3장 (한 번만 되는 카드는 다시 안 나옴, 저주는 최대 1장, 체력이 낮으면 회복 카드가 잘 나옴)
    const pool = CARDS.filter(c => !(c.unique && this.pick[c.id]));
    const cards = [];
    while (cards.length < 3 && pool.length) {
      const w = pool.map(c => RAR_W[c.rar] * (c.id === 'heal' && this.hp < this.stats.mhp * 0.5 ? 3 : 1) * (c.rar === 'curse' && cards.some(id => CARDS.find(q => q.id === id).rar === 'curse') ? 0 : 1));
      let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
      while (r > w[i] && i < w.length - 1) { r -= w[i]; i++; }
      cards.push(pool[i].id); pool.splice(i, 1);
    }
    this.vote = { id: ++this.voteSeq, cards, t: 12, votes: {}, why: this.xpWhy || {} };
    this.xpWhy = {};
    this.state = 'vote';
    this.emit('vote', {});
  };
  P.stepVote = function (dt) {
    const v = this.vote;
    v.t -= dt;
    for (const p of this.players) {
      const I = this.inputs[p.id];
      if (I && I.vk === v.id && I.vi >= 0 && I.vi < 3) v.votes[p.id] = I.vi;
    }
    if (Object.keys(v.votes).length >= this.players.length || v.t <= 0) this.resolveVote();
  };
  P.resolveVote = function () {
    const v = this.vote;
    const counts = [0, 0, 0];
    for (const id in v.votes) counts[v.votes[id]]++;
    const max = Math.max(...counts);
    let cand = [0, 1, 2].filter(i => counts[i] === max);
    // 동률이면 지금까지 덜 뽑힌 카드
    const minPick = Math.min(...cand.map(i => this.pick[v.cards[i]] || 0));
    cand = cand.filter(i => (this.pick[v.cards[i]] || 0) === minPick);
    const idx = cand[Math.random() * cand.length | 0];
    const id = v.cards[idx];
    this.applyCard(id);
    this.pick[id] = (this.pick[id] || 0) + 1;
    this.emit('picked', { id, tie: counts.filter(c => c === max).length > 1 && max > 0 });
    this.vote = null; this.state = 'play';
  };
  P.applyCard = function (id) {
    const s = this.stats;
    switch (id) {
      case 'jump2': s.dbl = true; break;
      case 'slideinv': s.slideInv = true; s.slideT = 0.85; break;
      case 'sprint': s.run *= 1.25; break;
      case 'quake': s.lhR = 21; s.stunHit = true; break;
      case 'hammer': s.lhDmg *= 2; break;
      case 'split': s.rhN = 3; break;
      case 'pierce': s.pierce = true; s.rhLife = 0.6; break;
      case 'rapid': s.atkCd = 0.25; s.atkRange = 140; break;
      case 'reflect': s.reflect = true; break;
      case 'bigshield': s.defR *= 1.5; break;
      case 'hp': s.mhp += 30; this.hp = Math.min(s.mhp, this.hp + 30); break;
      case 'heal': this.hp = Math.min(s.mhp, this.hp + 50); break;
      case 'berserk': s.atk *= 2; s.sab *= 2; break;
    }
  };

  P.finish = function (kind) {
    if (this.state === 'over' || this.state === 'clear') return;
    this.state = kind;
    const rows = this.players.map(p => Object.assign({ id: p.id, name: p.name }, this.pstats[p.id]));
    const score = r => r.kills * 2 + r.breaks + r.blocks + r.combos * 2;
    const mvp = rows.slice().sort((a, b) => score(b) - score(a))[0];
    const blamer = rows.slice().sort((a, b) => b.blame - a.blame)[0];
    this.result = { kind, time: Math.round(this.time), rows, mvp: mvp && mvp.id, blamer: blamer && blamer.blame > 0 ? blamer.id : null, wizard: this.blameWizard, lv: this.lv };
    this.emit(kind, {});
  };

  // 카메라가 볼 곳: 방 안이면 방 가운데, 아니면 몸보다 조금 앞(위)
  P.camTarget = function () {
    const room = this.level.rooms[this.roomIdx];
    if (room && room.active) { const cx = (room.x0 + room.x1) / 2, cy = (room.y0 + room.y1) / 2; return [r1(this.body.x + (cx - this.body.x) * 0.35), r1(this.body.y + (cy - this.body.y) * 0.35)]; }
    return [r1(this.body.x - 14), r1(this.body.y - 14)];
  };

  // ---------- 스냅샷 ----------
  P.snapshot = function () {
    const b = this.body, s = this.spirit;
    const act = {};
    for (const r of ROLES) act[r] = this.lastAct[r] != null ? r1(this.time - this.lastAct[r]) : 99;
    return {
      gen: this.gen, st: this.state, stT: r1(this.stateT), time: r1(this.time),
      ct: this.camTarget(),
      col: r1(this.col.d),
      tp: this.traps.map(t => t.k === 'wave' ? [t.id, t.k, r1(t.x), r1(t.y), r1(t.t), t.warn, r1(t.r)]
        : t.k === 'blade' ? [t.id, t.k, r1(t.x), r1(t.y), r1(t.t), t.warn, r1(t.sx), r1(t.sy), r1(t.dx), r1(t.dy), t.len]
        : [t.id, t.k, r1(t.x), r1(t.y), r1(t.t), t.warn]),
      ro: this.rollers.map(o => [o.id, o.k, r1(o.x), r1(o.y), r1(o.rot), o.k === 'log' ? r1(o.x0) : 0, o.k === 'log' ? r1(o.x1) : 0]),
      b: [r1(b.x), r1(b.y), r1(b.z), b.crouch ? 1 : 0, b.slide > 0 ? 1 : 0, b.inv > 0 ? 1 : 0, r1(b.faceX), r1(b.vx)],
      hp: Math.ceil(this.hp), mhp: this.stats.mhp, mp: Math.floor(this.mana), lv: this.lv, xp: this.xp, xpn: this.xpNeed,
      sab: [this.sab.phase, this.sab.line, r1(this.sab.t), this.sab.kind || 'rev'],
      e: this.enemies.map(e => [e.id, e.k, r1(e.x), r1(e.y), r1(e.z), e.flash > 0 ? 1 : 0, e.k === 'queen' ? e.act : (e.k === 'egg' ? r1(e.t) : (e.k === 'spit' && e.w > 0 ? 'w' : 0)), e.tr ? 1 : 0, e.k === 'queen' ? r1(e.act === 'spitw' ? e.aim : Math.atan2(e.dvy || 0, e.dvx || 0)) : 0]),
      sh: this.shots.map(x => [x.id, x.k, r1(x.x), r1(x.y)]),
      es: this.eshots.map(x => [x.id, r1(x.x), r1(x.y)]),
      sp: [r1(s.ax), r1(s.ay), r1(s.dx), r1(s.dy), r1(this.stats.defR)],
      sw: this.swing,
      br: this.level.obs.filter(o => !o.alive).map(o => o.id),
      dr: this.level.rooms.map(r => (r.topLocked ? 1 : 0) + (r.bottomLocked ? 2 : 0)),
      roles: this.roles, prev: this.state === 'shuffle' ? this.prevRoles : null,
      players: this.players,
      act,
      ev: this.events,
      vote: this.vote ? { id: this.vote.id, cards: this.vote.cards, t: r1(this.vote.t), votes: this.vote.votes, why: this.vote.why } : null,
      lu: this.lvUpT > 0 ? r1(this.lvUpT) : 0,
      boss: (() => { const q = this.enemies.find(e => e.k === 'queen'); return q ? [Math.max(0, Math.ceil(q.hp)), q.max] : null; })(),
      res: this.result,
      ready: Object.keys(this.ready || {}), stTot: this.state === 'shuffle' ? SHUF_T : INTRO_T,
      sm: this.opts.screenMove ? 1 : 0,
      tut: this.tut ? { on: this.tut.on, done: this.tut.done, stage: this.tut.stage, solo: this.tut.solo, cur: this.tut.cur, pause: this.tut.pause > 0 ? 1 : 0, act: this.tutActive() } : null,
    };
  };

  G.TUS = { TUT_STAGES, TUT_ORDER, SAB_KIND, PINGS, PROLOGUE_LEN, TUT, Game, assignRoles, ROLES, MOVE, ATK, ROLE_INFO, CARDS, SAB_LINES, T, VW, VH, DT, emptyInput };
})(typeof window !== 'undefined' ? window : globalThis);
