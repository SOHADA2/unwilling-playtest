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
  const CARDS = [
    { id: 'atk', name: '공격력 UP', desc: '모든 공격 피해 +35%' },
    { id: 'spd', name: '이동속도 UP', desc: '걷기·달리기 +12%' },
    { id: 'hp', name: '최대체력 UP', desc: '최대 체력 +25, 25 회복' },
    { id: 'mana', name: '마나 회복 UP', desc: '마나 회복 +40%' },
    { id: 'shield', name: '방어정령 크기 UP', desc: '방패 반지름 +40%' },
    { id: 'sab', name: '마법사 달래기', desc: '사보타주 확률 -40%' },
    { id: 'heal', name: '응급 처치', desc: '체력 50 회복' },
  ];
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
    this.stats = { mhp: 100, atk: 1, spd: 1, regen: 16, defR: 10, sab: 1 };
    this.hp = 100; this.mana = 100; this.lv = 1; this.xp = 0; this.xpNeed = 12;
    this.cam = { mode: 'scroll' };
    // 무너지는 계단: 이 y보다 아래(뒤)의 계단 줄은 무너져 있다. 위로 쫓아온다
    this.col = { on: true, y: s.y + 3 * T, delay: 3, hinted: false };
    this.rollers = []; this.rollHint = {};
    for (const r of lv.rollers) r.t = 0.5;
    this.roomIdx = 0;
    this.enemies = []; this.shots = []; this.eshots = []; this.nextId = 1;
    this.cool = { lh: 0, rh: 0, atk: 0 };
    this.spirit = { ax: s.x - 16, ay: s.y - 18, dx: s.x + 14, dy: s.y - 10, lastA: null, lastD: null };
    this.sab = { phase: 'idle', t: 0, next: 28, line: 0, kind: 'rev' };
    this.vote = null; this.voteSeq = 0; this.pick = {};
    this.events = []; this.seq = 0;
    this.hintsDone = {};
    this.pstats = {};
    this.players.forEach(p => this.pstats[p.id] = { kills: 0, breaks: 0, blocks: 0, combos: 0, blame: 0 });
    this.blameWizard = 0;
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
  P.tile = function (c, r) { const lv = this.level; if (r < 0 || r >= lv.h || c < 0 || c >= lv.w) return '#'; return lv.rows[r][c]; };
  P.solidAt = function (c, r) {
    const t = this.tile(c, r);
    if (t === '#') return true;
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
    return this.tileAtPx(x, y) !== ' ';
  };

  // ---------- 피해·넉백 ----------
  P.hurt = function (a, role, cause) {
    const b = this.body;
    if (b.inv > 0 || this.state !== 'play') return false;
    if (this.tut && this.tut.on) return false; // 훈련 중엔 안 다친다
    this.hp -= a; b.inv = 0.8;
    let who;
    if (this.sab.phase === 'on') { this.blameWizard++; who = 'wizard'; }
    else { who = this.roles[role]; if (this.pstats[who]) this.pstats[who].blame++; }
    this.emit('hurt', { a, role, cause, who, x: r1(b.x), y: r1(b.y) });
    return true;
  };
  P.knock = function (nx, ny, pow) { const b = this.body; b.vx = nx * pow; b.vy = ny * pow; b.stun = 0.25; b.slide = 0; };

  // ---------- 메인 스텝 ----------
  P.step = function () {
    const dt = DT;
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
    this.stepBody(dt);
    this.stepCamera(dt);
    this.stepRollers(dt);
    this.stepSpawns();
    this.stepAttacks(dt);
    this.stepEnemies(dt);
    this.stepShots(dt);
    this.stepSab(dt);
    this.stepRooms(dt);
    this.stepHints();
    this.stepTut(dt);
    this.mana = Math.min(100, this.mana + this.stats.regen * dt);
    if (this.hp <= 0) { this.hp = 0; this.finish('over'); }
    else if (this.state === 'play' && this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed; this.lv++; this.xpNeed = Math.round(this.xpNeed * 1.35 + 4);
      this.startVote();
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
      b.slide = 0.55; b.vx *= 1.25; b.vy *= 1.25;
      this.combo('slide', ['crouch', runY ? 'fb' : 'lr']);
    }
    const wasCrouch = b.crouch;
    b.crouch = grounded && (crouchHeld || b.slide > 0);
    // 들보 밑에서 일어서면 낀다 → 계속 숙인 상태 유지
    if (wasCrouch && !b.crouch) { b.crouch = true; if (!this.boxHit(b.x, b.y, 5, 4, true)) b.crouch = false; }

    if (b.stun > 0) { b.vx = approach(b.vx, 0, 300 * dt); b.vy = approach(b.vy, 0, 300 * dt); }
    else if (b.slide > 0) { b.vx *= (1 - 1.2 * dt); b.vy *= (1 - 1.2 * dt); }
    else {
      const wx = WALK * st.spd, rx = RUN * st.spd;
      let tvx = mx * (runX ? rx : wx), tvy = my * (runY ? rx : wx);
      if (mx && my) { tvx *= 0.8; tvy *= 0.8; }
      if (b.crouch) { tvx *= 0.45; tvy *= 0.45; }
      const acc = grounded ? (b.landSlide > 0 ? 160 : 1100) : 240;
      b.vx = approach(b.vx, tvx, acc * dt); b.vy = approach(b.vy, tvy, acc * dt);
    }
    // 대각선 = 앞뒤 + 좌우 동시
    if (mx && my && b.stun <= 0) { b.diagT += dt; if (b.diagT > 0.5 && !b.diagDone) { b.diagDone = true; this.combo('diag', ['fb', 'lr']); this.tutDone('diag'); } }
    else { b.diagT = 0; b.diagDone = false; }

    // 딸꾹질 사보타주: 멋대로 튀어 오른다
    if (this.sab.phase === 'on' && this.sab.kind === 'hic' && grounded) {
      this.hicT -= dt;
      if (this.hicT <= 0) { this.hicT = rnd(0.45, 0.9); b.vz = JUMPV * 0.75; this.emit('hic', {}); }
    }
    // 점프 (달리는 중이면 멀리뛰기)
    if (jumpEdge && grounded && b.stun <= 0 && b.slide <= 0) {
      b.vz = JUMPV; b.crouch = false;
      if (speedNow > WALK * 1.15 * st.spd) {
        b.vx *= 1.3; b.vy *= 1.3; b.longJ = true;
        this.combo('long', ['jump', runY ? 'fb' : 'lr']);
        this.tutDone('long');
      }
      this.emit('jump', {});
      this.tutDone('jump');
    }
    if (b.z > 0 || b.vz > 0) {
      b.vz -= GRAV * dt; b.z += b.vz * dt;
      if (b.z <= 0) { b.z = 0; b.vz = 0; if (b.longJ) { b.landSlide = 0.3; b.longJ = false; } this.emit('land', {}); }
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 5) { b.faceX = b.vx / sp; b.faceY = b.vy / sp; }
    this.moveBody(b.vx * dt, b.vy * dt, sp);

    // 구덩이
    const onGround = b.z <= 0 && b.vz <= 0;
    if (onGround && (this.tileAtPx(b.x, b.y) === ' ' || this.collapsedAt(b.y))) this.fall();
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
    else if (h.k === 'beam') { if (this.hurt(7, 'crouch', 'beam')) this.knock(-sx, -sy || 1, 130); }
  };
  P.fall = function () {
    const b = this.body;
    // 줄 전체가 낭떠러지(구덩이)면 점프 탓, 다리 옆으로 떨어졌으면 좌우 탓
    const row = Math.floor(b.y / T);
    const rowStr = this.level.rows[row] || '';
    const isPit = rowStr.slice(6, 18) === '            ';
    const isCol = this.collapsedAt(b.y);
    b.inv = 0; // 떨어지면 무적 중이어도 피해
    if (isCol) this.hurt(12, 'fb', 'collapse');
    else this.hurt(12, isPit ? 'jump' : 'lr', isPit ? 'pit' : 'edge');
    // 조금 전에 서 있던 안전한 곳으로 (무너지는 선보다 충분히 앞)
    let spot = null;
    for (let i = b.safe.length - 1; i >= 0; i--) {
      const s = b.safe[i];
      if (i <= b.safe.length - 4 && !this.collapsedAt(s[1] + 40) && this.tileAtPx(s[0], s[1]) !== ' ') { spot = s; break; }
    }
    if (!spot) spot = this.findSafeAhead();
    b.x = spot[0]; b.y = spot[1]; b.vx = b.vy = 0; b.z = 0; b.vz = 0; b.slide = 0; b.inv = Math.max(b.inv, 1.2);
    b.safe = [];
    this.emit('fall', { x: r1(b.x), y: r1(b.y) });
  };
  P.collapsedAt = function (y) {
    const r = Math.floor(y / T);
    return this.level.rowKind[r] === 'stair' && y > this.col.y;
  };
  P.findSafeAhead = function () {
    const b = this.body; let best = null, bd = 1e9;
    const r1_ = Math.min(Math.floor((this.col.y - 40) / T), Math.floor(b.y / T) + 2), r0 = r1_ - 10;
    for (let r = r0; r <= r1_; r++) for (let c = 0; c < this.level.w; c++) {
      const x = c * T + 8, y = r * T + 8;
      if (this.tile(c, r) !== '.' || this.boxHit(x, y, 5, 4, true) || this.collapsedAt(y + 40)) continue;
      const d = Math.abs(x - b.x) + Math.abs(y - b.y) * 0.5;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best || [this.level.start.x, this.level.start.y];
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
    const gap = k.y - b.y;
    k.y -= (COLLAPSE + Math.max(0, gap - 140) * 0.6) * dt;
    const room = this.level.rooms[this.roomIdx];
    if (room) k.y = Math.max(k.y, (room.bottomRow + 1) * T);
  };

  // ---------- 굴러오는 통나무 · 술통 ----------
  P.stepRollers = function (dt) {
    const b = this.body, lv = this.level;
    if (this.cam.mode === 'scroll') {
      for (const s of lv.rollers) {
        const d = b.y - s.y;
        if (d < 24 || d > 250) continue;
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
      if (this.tileAtPx(o.x, o.y + 6) === ' ' || this.collapsedAt(o.y)) { o.dead = true; this.emit('rollfall', { x: r1(o.x), y: r1(o.y) }); continue; }
      const hitBar = this.level.obs.some(q => q.alive && q.k === 'bar' && o.y + 6 > q.y0 && o.y - 6 < q.y1 && (o.k === 'log' || (o.x > q.x0 && o.x < q.x1)));
      if (hitBar || this.solidAt(Math.floor(o.x / T), Math.floor((o.y + 6) / T))) { o.dead = true; this.emit('break', { x: r1(o.x), y: r1(o.y), roll: 1 }); continue; }
      if (b.z < 9) {
        if (o.k === 'log' && b.x > o.x0 - 4 && b.x < o.x1 + 4 && Math.abs(b.y - o.y) < 8) { if (this.hurt(8, 'lh', 'log')) this.knock(0, 1, 150); }
        if (o.k === 'barrel' && Math.hypot(b.x - o.x, b.y - o.y) < 11) { const d = Math.hypot(b.x - o.x, b.y - o.y) || 1; if (this.hurt(6, 'lr', 'barrel')) this.knock((b.x - o.x) / d, 0.8, 140); }
      }
    }
    this.rollers = this.rollers.filter(o => !o.dead);
  };

  P.newEnemy = function (k, x, y, room) {
    const e = { id: this.nextId++, k, x, y, z: 0, hp: 2, room: room == null ? null : room, flash: 0 };
    if (k === 'fly') { e.z = 22; e.t = rnd(0, 6); e.shootT = rnd(1.2, 2.4); e.life = room == null ? 14 : 1e9; e.ax = x; e.ay = y; }
    if (k === 'ant') { e.hit = 0; e.kx = 0; e.ky = 0; }
    if (k === 'egg') { e.hp = 1; e.t = 6; }
    this.enemies.push(e);
    return e;
  };
  P.stepSpawns = function () {
    for (const s of this.level.spawns) {
      if (!s.done && this.cam.mode === 'scroll' && s.y >= this.body.y - 170 && !this.collapsedAt(s.y)) { s.done = true; this.newEnemy(s.k, s.x, s.y, null); }
    }
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
        this.rollers = [];
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
      this.col.on = true; this.col.y = (room.topRow + 1) * T; this.col.delay = 2.5;
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
        const hx = b.x + dx * 14, hy = b.y + dy * 12;
        this.swing = { x: r1(hx), y: r1(hy), dx: r1(dx), dy: r1(dy), t: 0.15 };
        this.emit('swing', { x: r1(hx), y: r1(hy), dx: r1(dx), dy: r1(dy) });
        const R = 14;
        for (const o of this.level.obs) {
          if (!o.alive || o.k !== 'bar') continue;
          const cx = clamp(hx, o.x0, o.x1), cy = clamp(hy, o.y0, o.y1);
          if (Math.hypot(cx - hx, cy - hy) < R) {
            o.alive = false; this.xp += 1;
            const pid = this.roles.lh; if (this.pstats[pid]) this.pstats[pid].breaks++;
            this.emit('break', { id: o.id, x: r1(cx), y: r1(cy) });
          }
        }
        for (const o of this.rollers) {
          const hit = o.k === 'log'
            ? Math.hypot(clamp(hx, o.x0, o.x1) - hx, clamp(hy, o.y - 5, o.y + 5) - hy) < R
            : Math.hypot(o.x - hx, o.y - hy) < R + 6;
          if (hit && !o.dead) {
            o.dead = true; this.xp += 1;
            const pid = this.roles.lh; if (this.pstats[pid]) this.pstats[pid].breaks++;
            this.emit('break', { x: r1(o.x), y: r1(o.y) });
          }
        }
        this.rollers = this.rollers.filter(o => !o.dead);
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - hx, e.y - hy);
          if ((e.k === 'egg' || e.k === 'crate') && d < R + 6) this.damage(e, 1, 'lh');
          else if (e.k === 'ant' && d < R + 2) this.damage(e, 1 * this.stats.atk, 'lh');
          else if (e.k === 'queen' && d < R + 16) this.damage(e, 2 * this.stats.atk, 'lh');
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
          this.shots.push({ k: 'rh', x: b.x + dx * 6, y: b.y + dy * 6, vx: dx * 230, vy: dy * 230, life: 0.42, id: this.nextId++ });
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
      let best = null, bd = 100;
      for (const e of this.enemies) if (e.k === 'fly') { const d = Math.hypot(e.x - s.ax, e.y - e.z - s.ay); if (d < bd && (!e.tr || (d < 30 && this.tutActive().includes('atk')))) { bd = d; best = e; } } // 연습 인형은 정령을 가까이 대야 공격
      if (best && this.mana >= 4) {
        this.cool.atk = 0.5; this.mana -= 4;
        const dx = best.x - s.ax, dy = (best.y - best.z) - s.ay, d = Math.hypot(dx, dy) || 1;
        this.shots.push({ k: 'sp', x: s.ax, y: s.ay, vx: dx / d * 250, vy: dy / d * 250, life: 0.9, tgt: best.id, id: this.nextId++ });
        this.emit('spshoot', {});
      }
    }
  };

  const DUMMY_TASK = { crate: 'lh', ant: 'rh', fly: 'atk', rune: 'def' };
  P.damage = function (e, dmg, role) {
    if (e.dead) return;
    if (e.tr && !this.tutActive().includes(DUMMY_TASK[e.k])) return; // 연습 표적은 자기 차례일 때만 맞는다
    e.hp -= dmg; e.flash = 0.12;
    if (e.k === 'ant') { const b = this.body; const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1; e.hit = 0.15; e.kx = dx / d * 120; e.ky = dy / d * 120; }
    if (e.hp <= 0) {
      e.dead = true;
      const xp = e.tr ? 1 : ({ ant: 3, fly: 4, egg: 1, queen: 0 }[e.k] || 0);
      this.xp += xp;
      const pid = this.roles[role];
      if (this.pstats[pid]) { if (e.k === 'egg' || e.k === 'crate') this.pstats[pid].breaks++; else this.pstats[pid].kills++; }
      if (e.tr) this.tutDone(e.k === 'crate' ? 'lh' : e.k === 'ant' ? 'rh' : 'atk');
      this.emit('kill', { k: e.k, x: r1(e.x), y: r1(e.y - e.z) });
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
        if (s.k === 'rh' && (e.k === 'ant' || e.k === 'queen')) {
          const r = e.k === 'queen' ? 18 : 8;
          if (Math.hypot(e.x - s.x, e.y - s.y) < r) { this.damage(e, 1 * this.stats.atk, 'rh'); s.dead = true; this.emit('poof', { x: r1(s.x), y: r1(s.y) }); break; }
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
        if (e.room == null) { tx = e.ax + Math.sin(e.t * 0.9) * 28; ty = b.y - 84 + Math.sin(e.t * 1.3) * 10; if (e.life < 0) ty = b.y - 320; }
        else { tx = e.ax + Math.sin(e.t * 0.8) * 40; ty = e.ay + Math.cos(e.t * 1.1) * 18; }
        e.x += (tx - e.x) * Math.min(1, 1.6 * dt); e.y += (ty - e.y) * Math.min(1, 1.6 * dt);
        e.shootT -= dt;
        if (e.shootT <= 0 && e.life > 0) { e.shootT = rnd(2.2, 3.0); this.fireAt(e.x, e.y - e.z, 72); }
        if (e.life < 0 && e.y < b.y - 280) e.dead = true;
      } else if (e.k === 'egg') {
        e.t -= dt;
        if (e.t <= 0) { e.dead = true; for (let i = 0; i < 2; i++) { const a = this.newEnemy('ant', e.x + rnd(-8, 8), e.y + rnd(-6, 6), e.room); a.fast = true; } this.emit('hatch', { x: r1(e.x), y: r1(e.y) }); }
      } else if (e.k === 'queen') this.stepQueen(e, dt);
      if (e.room == null && (e.y > b.y + 260 || (e.k === 'ant' && this.collapsedAt(e.y)))) e.dead = true;
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
          const n = q.p2 ? 7 : 5, base = Math.atan2((b.y - 6) - (q.y - 8), b.x - q.x);
          for (let i = 0; i < n; i++) { const ang = base + (i - (n - 1) / 2) * 0.22; this.eshots.push({ x: q.x, y: q.y - 8, vx: Math.cos(ang) * 80, vy: Math.sin(ang) * 80, life: 4, id: this.nextId++ }); }
          this.emit('spit', {}); q.actT = rest;
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
      if (!this.hintsDone[h.id] && h.y >= this.body.y - 150 && h.y <= this.body.y + 24) { this.hintsDone[h.id] = 1; this.emit('hint', { k: h.k }); }
    }
  };

  // ---------- 레벨업 투표 ----------
  P.startVote = function () {
    const cards = shuffle(CARDS.slice()).slice(0, 3).map(c => c.id);
    this.vote = { id: ++this.voteSeq, cards, t: 12, votes: {} };
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
    if (id === 'atk') s.atk *= 1.35;
    else if (id === 'spd') s.spd *= 1.12;
    else if (id === 'hp') { s.mhp += 25; this.hp = Math.min(s.mhp, this.hp + 25); }
    else if (id === 'mana') s.regen *= 1.4;
    else if (id === 'shield') s.defR *= 1.4;
    else if (id === 'sab') s.sab *= 0.6;
    else if (id === 'heal') this.hp = Math.min(s.mhp, this.hp + 50);
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
    return [r1(this.body.x), r1(this.body.y - 36)];
  };

  // ---------- 스냅샷 ----------
  P.snapshot = function () {
    const b = this.body, s = this.spirit;
    const act = {};
    for (const r of ROLES) act[r] = this.lastAct[r] != null ? r1(this.time - this.lastAct[r]) : 99;
    return {
      gen: this.gen, st: this.state, stT: r1(this.stateT), time: r1(this.time),
      ct: this.camTarget(),
      col: r1(this.col.y),
      ro: this.rollers.map(o => [o.id, o.k, r1(o.x), r1(o.y), r1(o.rot), o.k === 'log' ? r1(o.x0) : 0, o.k === 'log' ? r1(o.x1) : 0]),
      b: [r1(b.x), r1(b.y), r1(b.z), b.crouch ? 1 : 0, b.slide > 0 ? 1 : 0, b.inv > 0 ? 1 : 0, r1(b.faceX), r1(b.vx)],
      hp: Math.ceil(this.hp), mhp: this.stats.mhp, mp: Math.floor(this.mana), lv: this.lv, xp: this.xp, xpn: this.xpNeed,
      sab: [this.sab.phase, this.sab.line, r1(this.sab.t), this.sab.kind || 'rev'],
      e: this.enemies.map(e => [e.id, e.k, r1(e.x), r1(e.y), r1(e.z), e.flash > 0 ? 1 : 0, e.k === 'queen' ? e.act : (e.k === 'egg' ? r1(e.t) : 0), e.tr ? 1 : 0]),
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
      vote: this.vote ? { id: this.vote.id, cards: this.vote.cards, t: r1(this.vote.t), votes: this.vote.votes } : null,
      boss: (() => { const q = this.enemies.find(e => e.k === 'queen'); return q ? [Math.max(0, Math.ceil(q.hp)), q.max] : null; })(),
      res: this.result,
      ready: Object.keys(this.ready || {}), stTot: this.state === 'shuffle' ? SHUF_T : INTRO_T,
      tut: this.tut ? { on: this.tut.on, done: this.tut.done, stage: this.tut.stage, solo: this.tut.solo, cur: this.tut.cur, pause: this.tut.pause > 0 ? 1 : 0, act: this.tutActive() } : null,
    };
  };

  G.TUS = { TUT_STAGES, TUT_ORDER, SAB_KIND, PINGS, PROLOGUE_LEN, TUT, Game, assignRoles, ROLES, MOVE, ATK, ROLE_INFO, CARDS, SAB_LINES, T, VW, VH, DT, emptyInput };
})(typeof window !== 'undefined' ? window : globalThis);
