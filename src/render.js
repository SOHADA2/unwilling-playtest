// 아이소메트릭(쿼터뷰) 픽셀 렌더러 — 스냅샷 + 레벨만 보고 그린다 (호스트든 참가자든 같은 코드).
// 세계 좌표(x, y, 높이 z)는 2D 그대로이고, 그릴 때만 쿼터뷰로 바꾼다: 화면 = (x − y, (x + y) / 2 − 높이)
// → 앞(W, 세계 −y)은 화면 오른쪽 위, 계단은 두 줄마다 한 단씩 높아져 대각선으로 올라간다.
(function (G) {
  'use strict';
  const T = 16, VW = 416, VH = 234;

  const PAL = {
    K: '#1a1426', H: '#3565d8', h: '#2447a8', Y: '#f6c945', S: '#f4c9a3', R: '#3553c4', r: '#243a92', M: '#8fc0ff', B: '#5b3a22',
    a: '#c2553a', A: '#8e2f1f', G: '#45b04f', g: '#2d7f36', X: '#e04a4a', W: '#ffffff',
  };
  const WIZ = [
    '......KK......',
    '.....KHHK.....',
    '.....KHYK.....',
    '....KHHHHK....',
    '....KHYHhK....',
    '...KHHHHHhK...',
    '...KHYHHYhK...',
    '..KHHHHHHHhK..',
    '.KKKKKKKKKKKK.',
    '...KSSSSSSK...',
    '...KSKSSKSK...',
    '...KSSSSSSK...',
    '..KRRRRRRRRK..',
    '.KRMMRRRMMRRK.',
    '.KRMRRMRRMRRK.',
    '.KRMMMMRMMRrK.',
    '.KRRRRMRRRRrK.',
    '.KrRMMMMMRrrK.',
    '..KKKKKKKKKK..',
    '...KBK..KBK...',
  ];
  const SHIELD = ['KKKKK', 'KGGGK', 'KXYXK', 'KGXGK', '.KGK.', '..K..'];
  const ANT = [
    '..K....K..',
    '...K..K...',
    '.KKK.KKKK.',
    'KaaKKaaaaK',
    'KAAKKAAAAK',
    '.KKK.KKKK.',
    '.K.K..K.K.',
  ];
  function sprite(map, pal) {
    const w = map[0].length, h = map.length;
    const c = mk(w, h), x = c.getContext('2d');
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ch = map[j][i]; if (ch !== '.' && pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }
    return c;
  }
  function mk(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

  function Renderer(canvas) {
    this.c = canvas; this.x = canvas.getContext('2d');
    this.x.imageSmoothingEnabled = false;
    this.spr = {
      wiz: sprite(WIZ, PAL), shield: sprite(SHIELD, PAL),
      ant: sprite(ANT, PAL), antHit: sprite(ANT, Object.assign({}, PAL, { a: '#ffffff', A: '#ffe0e0' })),
    };
    this.gen = -1; this.fx = []; this.pops = []; this.shake = 0; this.flash = 0;
    this.disp = new Map(); this.lastT = 0;
    this.camX = null; this.camY = 0; this.ox = 0; this.oy = 0; this.lastCol = null; this.faceL = false; this.prevBX = null;
  }
  const P = Renderer.prototype;

  // ---------- 좌표 ----------
  P.hAt = function (y) { const lv = this.lv, r = Math.max(0, Math.min(lv.h - 1, Math.floor(y / T))); return lv.hgt[r] || 0; };
  P.P = function (x, y, z) { return [Math.round(x - y - this.ox), Math.round((x + y) / 2 - z - this.oy)]; };
  // 화면 픽셀 → 세계 좌표 (마우스 조준용). 높이는 몸이 서 있는 바닥 기준으로 근사
  P.toWorld = function (px, py, refY) {
    const sx = px + this.ox, sy = py + this.oy + this.hAt(refY);
    return [sy + sx / 2, sy - sx / 2];
  };

  // ---------- 도형 ----------
  P.poly = function (pts, fill) { const x = this.x; x.fillStyle = fill; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.closePath(); x.fill(); };
  // 세계 상자 [x0,x1]×[y0,y1], 바닥 높이 e 에서 H 만큼 솟음. 보이는 면 = 윗면·왼앞면(y1쪽)·오른앞면(x1쪽)
  P.box = function (x0, y0, x1, y1, e, H, top, lf, rf) {
    const A = this.P(x0, y0, e + H), B = this.P(x1, y0, e + H), C = this.P(x1, y1, e + H), D = this.P(x0, y1, e + H);
    const Cb = this.P(x1, y1, e), Db = this.P(x0, y1, e), Bb = this.P(x1, y0, e);
    if (lf) this.poly([D, C, Cb, Db], lf);
    if (rf) this.poly([B, C, Cb, Bb], rf);
    if (top) this.poly([A, B, C, D], top);
  };

  // ---------- 이벤트 → 효과 ----------
  P.event = function (ev, s) {
    const add = (x, y, n, col, sp, life, g, z0) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random()); this.fx.push({ x, y, z: z0 || 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: g ? 50 + Math.random() * 70 : 0, g, col, life, t: life }); } };
    const pop = (text, x, y, col, big) => this.pops.push({ text, x, y, col, t: 1.1, big });
    switch (ev.type) {
      case 'break': add(ev.x, ev.y, 14, '#b07a3f', 50, 0.7, true, 6); this.shake = Math.max(this.shake, 2); break;
      case 'kill': add(ev.x, ev.y, 10, ev.k === 'fly' ? '#d9ecff' : (ev.k === 'egg' ? '#efe3c8' : '#9be15a'), 45, 0.6, true, 6); if (ev.k === 'queen') { add(ev.x, ev.y, 60, '#f2c94c', 80, 1.4, true, 10); this.shake = 6; } break;
      case 'block': add(ev.x, ev.y, 8, '#e8d27a', 45, 0.35, false, 8); break;
      case 'poof': add(ev.x, ev.y, 4, '#7fe3ff', 20, 0.25, false, 10); break;
      case 'hurt': this.shake = Math.max(this.shake, 3); this.flash = 0.25; pop('-' + ev.a, ev.x, ev.y, '#ff6b6b'); break;
      case 'land': if (s) add(s.b[0], s.b[1], 4, '#6b6190', 18, 0.3, false, 1); break;
      case 'combo': pop({ diag: '대각선!', long: '멀리뛰기!', slide: '슬라이딩!' }[ev.kind], ev.x, ev.y, '#ffe27a', true); break;
      case 'hatch': add(ev.x, ev.y, 8, '#efe3c8', 35, 0.4, true, 4); break;
      case 'enrage': this.shake = 5; break;
      case 'fall': add(ev.x, ev.y, 8, '#cdb8ff', 25, 0.5, false, 4); break;
      case 'rollfall': add(ev.x, ev.y, 6, '#8a5a2b', 30, 0.5, true, 4); break;
      case 'collapse': this.shake = 3; break;
    }
  };

  // ---------- 메인 ----------
  P.draw = function (lv, s, opt) {
    this.lv = lv;
    const x = this.x, now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const dt = Math.min(0.05, this.lastT ? now - this.lastT : 0.016); this.lastT = now;
    this.smooth = !!opt.smooth;
    const k = Math.min(1, dt * 16);
    if (s.gen !== this.gen) { this.gen = s.gen; this.disp.clear(); this.fx = []; this.pops = []; this.camX = null; }

    // 카메라: 목표 지점을 부드럽게 따라간다
    const ct = s.ct, th = this.hAt(ct[1]);
    const tx = ct[0] - ct[1], ty = (ct[0] + ct[1]) / 2 - th;
    if (this.camX == null) { this.camX = tx; this.camY = ty; }
    const ck = Math.min(1, dt * 5);
    this.camX += (tx - this.camX) * ck; this.camY += (ty - this.camY) * ck;
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake * 2; sy = (Math.random() - 0.5) * this.shake * 2; this.shake = Math.max(0, this.shake - dt * 20); }
    const sab = s.sab[0];
    if (sab === 'on') sx += Math.sin(now * 20) * 1.2;
    this.ox = Math.round(this.camX - VW / 2 + sx); this.oy = Math.round(this.camY - VH / 2 + 10 + sy);

    // 배경
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#07060d'; x.fillRect(0, 0, VW, VH);

    // 무너지는 계단 먼지
    if (this.lastCol != null && s.col < this.lastCol - 0.5) {
      for (let i = 0; i < 2; i++) this.fx.push({ x: 96 + Math.random() * 192, y: s.col + 4, z: this.hAt(s.col) + 1, vx: (Math.random() - .5) * 20, vy: 10, vz: -20 - Math.random() * 30, g: false, col: Math.random() < .5 ? '#4a4262' : '#2f2942', life: 1, t: 1, fallZ: true });
    }
    this.lastCol = s.col;

    const broken = new Set(s.br);
    const list = [];
    this.tiles(s, now, list);

    // 문 창살
    lv.rooms.forEach((room, i) => {
      const st = s.dr[i] || 0;
      for (const [bit, row] of [[1, room.topRow], [2, room.bottomRow]]) {
        if (!(st & bit) || !lv.doorRows[row]) continue;
        for (let c = 0; c < lv.w; c++) if (lv.rows[row][c] === 'D') {
          const e = lv.hgt[row];
          list.push({ d: (c + row) * T + 16, f: () => { for (let i = 0; i < 4; i++) this.box(c * T + i * 4 + 1, row * T + 7, c * T + i * 4 + 3, row * T + 9, e, 20, '#a19db8', '#56536a', '#6d6a80'); } });
        }
      }
    });
    // 바리케이드 · 들보 (16px 조각마다 깊이 정렬)
    for (const o of lv.obs) {
      if (broken.has(o.id)) continue;
      const e = lv.hgt[Math.floor(o.y0 / T)];
      if (Math.abs(o.y0 - s.b[1]) > 420) continue;
      for (let xx = o.x0; xx < o.x1; xx += T) {
        const x1 = Math.min(o.x1, xx + T), last = x1 >= o.x1, first = xx === o.x0;
        if (o.k === 'bar') list.push({ d: xx + 8 + o.y1, f: () => this.barricade(xx, o.y0, x1, o.y1, e, first, last) });
        else list.push({ d: xx + 8 + o.y1, f: () => this.beamSeg(xx, o.y0, x1, o.y1, e, first, last) });
      }
    }
    // 굴러오는 것
    for (const r of s.ro) {
      const p = this.sm('r' + r[0], r[2], r[3], 0, k);
      const e = this.hAt(p[1]);
      if (r[1] === 'log') {
        const x0 = r[5], x1 = r[6];
        for (let xx = x0; xx < x1; xx += T) { const xe = Math.min(x1, xx + T); list.push({ d: xx + 8 + p[1] + 5, f: () => this.logSeg(xx, p[1], xe, e, r[4], xx === x0, xe >= x1) }); }
        this.shadowRect(x0, p[1], x1, e);
      } else {
        list.push({ d: p[0] + p[1] + 6, f: () => this.barrel(p[0], p[1], e, r[4]) });
        this.shadow(p[0], p[1], e, 6, 0);
      }
    }
    // 몸
    const b = s.b;
    const bp = this.sm('b', b[0], b[1], b[2], opt.smooth ? Math.min(1, dt * 20) : 1);
    if (this.prevBX != null) { const dsx = (bp[0] - bp[1]) - this.prevBX; if (dsx < -0.3) this.faceL = true; else if (dsx > 0.3) this.faceL = false; }
    this.prevBX = bp[0] - bp[1];
    const be = this.hAt(bp[1]);
    this.shadow(bp[0], bp[1], be, 6, bp[2]);
    list.push({ d: bp[0] + bp[1], f: () => this.wizard(bp, b, s, now, be) });
    // 적
    for (const en of s.e) {
      const p = this.sm('e' + en[0], en[2], en[3], en[4], k);
      const e = this.hAt(p[1]);
      this.shadow(p[0], p[1], e, en[1] === 'queen' ? 16 : 5, p[2]);
      list.push({ d: p[0] + p[1] + (en[1] === 'fly' ? 40 : 0), f: () => this.enemy(en[1], p, en, now, e) });
    }
    list.sort((a, c) => a.d - c.d).forEach(o => o.f());

    // 정령
    const sp = s.sp;
    const ap = this.sm('spa', sp[0], sp[1], 0, Math.min(1, dt * 25)), dp = this.sm('spd', sp[2], sp[3], 0, Math.min(1, dt * 25));
    this.spiritAtk(ap[0], ap[1], this.hAt(ap[1]) + 18, now);
    this.spiritDef(dp[0], dp[1], this.hAt(dp[1]) + 8, sp[4], now);
    // 투사체
    for (const p of s.sh) {
      const q = this.P(p[2], p[3], this.hAt(p[3]) + 10);
      if (p[1] === 'rh') { x.fillStyle = '#2a9bd8'; x.fillRect(q[0] - 2, q[1] - 2, 5, 5); x.fillStyle = '#bff3ff'; x.fillRect(q[0] - 1, q[1] - 1, 3, 3); }
      else { x.fillStyle = '#ff7b2e'; x.fillRect(q[0] - 2, q[1] - 2, 4, 4); x.fillStyle = '#ffe27a'; x.fillRect(q[0] - 1, q[1] - 1, 2, 2); }
    }
    for (const p of s.es) { const q = this.P(p[1], p[2], this.hAt(p[2]) + 8); x.fillStyle = '#1a1426'; x.fillRect(q[0] - 3, q[1] - 3, 6, 6); x.fillStyle = '#9be15a'; x.fillRect(q[0] - 2, q[1] - 2, 4, 4); x.fillStyle = '#e4ffb8'; x.fillRect(q[0] - 1, q[1] - 2, 1, 1); }
    // 망치 휘두르기
    if (s.sw) {
      const w = s.sw, c0 = this.P(bp[0], bp[1], be + 8), q = this.P(w.x, w.y, this.hAt(w.y) + 6);
      const a = Math.atan2(q[1] - c0[1], q[0] - c0[0]);
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2;
      x.beginPath(); x.arc(c0[0], c0[1], 16, a - 1.1, a + 1.1); x.stroke();
      x.fillStyle = '#9aa0b0'; x.fillRect(q[0] - 3, q[1] - 3, 6, 5);
    }
    // 파티클
    this.fx = this.fx.filter(p => (p.t -= dt) > 0);
    for (const p of this.fx) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) { p.vz -= 260 * dt; p.z = Math.max(this.hAt(p.y), p.z + p.vz * dt); }
      else if (p.fallZ) { p.z += p.vz * dt; }
      const q = p.g ? this.P(p.x, p.y, p.z) : this.P(p.x, p.y, (p.fallZ ? 0 : this.hAt(p.y)) + p.z);
      x.globalAlpha = Math.min(1, p.t / p.life * 1.5); x.fillStyle = p.col; x.fillRect(q[0], q[1], 2, 2);
    }
    x.globalAlpha = 1;
    // 글자 팝업
    this.pops = this.pops.filter(p => (p.t -= dt) > 0);
    x.textAlign = 'center';
    for (const p of this.pops) {
      const q = this.P(p.x, p.y, this.hAt(p.y) + 30 + (1.1 - p.t) * 18);
      x.font = (p.big ? '12px' : '10px') + ' "Galmuri11", "Galmuri9", monospace';
      x.globalAlpha = Math.min(1, p.t * 2);
      x.fillStyle = '#1a1426'; x.fillText(p.text, q[0] + 1, q[1] + 1);
      x.fillStyle = p.col; x.fillText(p.text, q[0], q[1]);
    }
    x.globalAlpha = 1;

    // 화면 효과: 가장자리 어둡게 + 사보타주 + 피격
    const vg = x.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.62);
    vg.addColorStop(0, 'rgba(7,6,13,0)'); vg.addColorStop(1, 'rgba(7,6,13,0.7)');
    x.fillStyle = vg; x.fillRect(0, 0, VW, VH);
    if (sab === 'on') { x.fillStyle = 'rgba(120,40,200,0.18)'; x.fillRect(0, 0, VW, VH); }
    if (sab === 'warn' && Math.floor(now * 8) % 2) { x.fillStyle = 'rgba(160,80,255,0.12)'; x.fillRect(0, 0, VW, VH); }
    if (this.flash > 0) { this.flash -= dt; x.fillStyle = 'rgba(255,40,40,' + (this.flash * 0.8).toFixed(2) + ')'; x.fillRect(0, 0, VW, VH); }
    if (s.hp < s.mhp * 0.3 && s.st === 'play') { const a = 0.15 + Math.sin(now * 5) * 0.08; x.fillStyle = 'rgba(180,0,0,' + a.toFixed(2) + ')'; x.fillRect(0, 0, VW, 3); x.fillRect(0, VH - 3, VW, 3); x.fillRect(0, 0, 3, VH); x.fillRect(VW - 3, 0, 3, VH); }
  };

  P.sm = function (id, x, y, z, k) {
    if (!this.smooth) return [x, y, z];
    let d = this.disp.get(id);
    if (!d || Math.abs(d[0] - x) + Math.abs(d[1] - y) > 60) { d = [x, y, z]; this.disp.set(id, d); return d; }
    d[0] += (x - d[0]) * k; d[1] += (y - d[1]) * k; d[2] += (z - d[2]) * k;
    return d;
  };

  // ---------- 타일 ----------
  P.tiles = function (s, now, list) {
    const lv = this.lv, col = s.col;
    const g = (c, r) => (r < 0 || r >= lv.h || c < 0 || c >= lv.w) ? '#' : lv.rows[r][c];
    const isFloor = t => t === '.' || t === 'D';
    const isOpen = t => isFloor(t) || t === ' ';
    const colRow = r => lv.rowKind[r] === 'stair' && r * T + 8 > col;
    // 보이는 줄 범위: 카메라가 보는 줄 기준
    const midR = Math.floor(s.ct[1] / T), r0 = Math.max(0, midR - 34), r1 = Math.min(lv.h - 1, midR + 30);
    for (let r = r0; r <= r1; r++) {
      const e = lv.hgt[r] || 0;
      // 무너짐: 계단 줄이 선보다 뒤면 떨어지는 중(48px 안) 또는 사라짐
      let drop = 0, alpha = 1, warn = 0;
      if (lv.rowKind[r] === 'stair') {
        const over = r * T + 8 - col;
        if (over > 0) { if (over > 56) continue; drop = over * over / 20; alpha = Math.max(0, 1 - over / 56); }
        else if (over > -32) { drop = (Math.floor(now * 30 + r) % 2) ? 1 : 0; warn = (1 + over / 32) * (0.55 + 0.45 * Math.sin(now * 12)); }
      }
      const ee = e - drop;
      this.x.globalAlpha = alpha;
      for (let c = 0; c < lv.w; c++) {
        const t = g(c, r), n = hash(c, r);
        const px = c * T, py = r * T;
        const q = this.P(px, py, ee);
        if (q[0] < -40 || q[0] > VW + 40 || q[1] < -60 || q[1] > VH + 40) continue;
        if (isFloor(t)) {
          const stair = lv.rowKind[r] === 'stair';
          let top = stair ? (r % 2 === 0 ? '#554c72' : '#4a4264') : ((c + r) % 2 ? '#463e5e' : '#4c4366');
          if (n > 0.93) top = '#433b5a';
          this.box(px, py, px + T, py + T, ee, 0, top, null, null);
          if (warn > 0) this.box(px, py, px + T, py + T, ee, 0, 'rgba(255,80,50,' + (warn * 0.35).toFixed(2) + ')', null, null);
          // 계단 단 (다음 줄이 더 낮으면 앞면)
          const e2 = lv.hgt[r + 1];
          if (e2 != null && e2 < e && isFloor(g(c, r + 1))) this.box(px, py + T, px + T, py + T, e2 - drop, e - e2, null, '#2f2942', null);
          // 낭떠러지 옆면
          if (g(c, r + 1) === ' ' || (colRow(r + 1) && !colRow(r))) this.box(px, py, px + T, py + T, ee - 14, 14, null, '#241f33', null);
          if (g(c + 1, r) === ' ') this.box(px, py, px + T, py + T, ee - 14, 14, null, null, '#2c263d');
          if (t === 'D') { const m = this.P(px + 8, py + 8, ee); this.x.fillStyle = 'rgba(205,184,255,0.25)'; this.x.fillRect(m[0] - 1, m[1], 3, 1); }
        } else if (t === '#') {
          const behind = isOpen(g(c + 1, r)) || isOpen(g(c, r + 1)) || isOpen(g(c + 1, r + 1));
          const front = isOpen(g(c - 1, r)) || isOpen(g(c, r - 1)) || isOpen(g(c - 1, r - 1));
          if (behind) {
            const torch = isFloor(g(c + 1, r)) && !isFloor(g(c, r + 1)) && r % 5 === 0;
            const al = alpha;
            list.push({ d: (c + r + 1) * T, f: () => { this.x.globalAlpha = al; this.wall(px, py, ee, 30, n, torch, now); this.x.globalAlpha = 1; } });
          } else if (front) this.box(px, py, px + T, py + T, ee, 5, '#2a2440', '#3b3452', '#443c5c');
        }
      }
      this.x.globalAlpha = 1;
    }
    // 시작 지점: 개미가 가루를 훔쳐 가 끊어진 소환 마법진
    const st = lv.start, se = this.hAt(st.y), x = this.x;
    x.strokeStyle = 'rgba(205,184,255,0.5)'; x.lineWidth = 1;
    for (const [rad, a0, a1] of [[22, 0.9, Math.PI * 2 + 0.2], [15, 1.4, Math.PI * 2 + 0.6]]) {
      x.beginPath();
      for (let a = a0; a <= a1; a += 0.1) { const q = this.P(st.x + Math.cos(a) * rad, st.y + Math.sin(a) * rad, se); if (a === a0) x.moveTo(q[0], q[1]); else x.lineTo(q[0], q[1]); }
      x.stroke();
    }
    x.fillStyle = '#1a1426'; [[14, 6], [18, 10], [11, 11]].forEach(p => { const q = this.P(st.x + p[0], st.y + p[1], se); x.fillRect(q[0], q[1], 2, 1); });
  };
  P.wall = function (px, py, e, H, n, torch, now) {
    this.box(px, py, px + T, py + T, e, H, n < 0.1 ? '#2e2745' : '#2a2440', '#3b3452', '#4a4262');
    const x = this.x;
    // 벽돌 줄
    for (let k = 7; k < H; k += 7) { const a = this.P(px + T, py, e + k), b = this.P(px + T, py + T, e + k); x.fillStyle = '#3d3654'; x.fillRect(Math.min(a[0], b[0]), a[1], 1, 1); x.strokeStyle = '#3f3857'; x.lineWidth = 1; x.beginPath(); x.moveTo(a[0], a[1] + 0.5); x.lineTo(b[0], b[1] + 0.5); x.stroke(); }
    if (torch) {
      const q = this.P(px + T, py + 8, e + 18), f = Math.floor(now * 10 + px) % 2;
      const gl = x.createRadialGradient(q[0], q[1], 1, q[0], q[1], 34);
      gl.addColorStop(0, 'rgba(255,170,80,0.28)'); gl.addColorStop(1, 'rgba(255,170,80,0)');
      x.fillStyle = gl; x.fillRect(q[0] - 34, q[1] - 34, 68, 68);
      x.fillStyle = '#5b3a22'; x.fillRect(q[0] - 1, q[1], 2, 5);
      x.fillStyle = '#ff9d3b'; x.fillRect(q[0] - 1, q[1] - 3 - f, 3, 3 + f);
      x.fillStyle = '#ffe27a'; x.fillRect(q[0], q[1] - 2, 1, 2);
    }
  };
  P.barricade = function (x0, y0, x1, y1, e, first, last) {
    this.box(x0, y0, x1, y1, e, 13, '#b07a3f', '#8a5a2b', '#6b431f');
    const x = this.x;
    // 판자 줄 + 부술 수 있다는 X 표시 (왼앞면)
    const m = this.P(x0, y1, e + 6), m2 = this.P(x1, y1, e + 6);
    x.strokeStyle = '#6b431f'; x.lineWidth = 1; x.beginPath(); x.moveTo(m[0], m[1] + 0.5); x.lineTo(m2[0], m2[1] + 0.5); x.stroke();
    if (Math.floor(x0 / T) % 3 === 1) {
      const a = this.P(x0 + 3, y1, e + 11), b = this.P(x1 - 3, y1, e + 2), c = this.P(x0 + 3, y1, e + 2), d = this.P(x1 - 3, y1, e + 11);
      x.strokeStyle = '#e8d27a'; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.moveTo(c[0], c[1]); x.lineTo(d[0], d[1]); x.stroke();
    }
  };
  P.beamSeg = function (x0, y0, x1, y1, e, first, last) {
    if (first) this.box(x0, y0 + 1, x0 + 3, y1 - 1, e, 18, '#5a3a1e', '#3a2614', '#4a2f18');
    if (last) this.box(x1 - 3, y0 + 1, x1, y1 - 1, e, 18, '#5a3a1e', '#3a2614', '#4a2f18');
    this.box(x0, y0, x1, y1, e + 13, 5, '#7a5230', '#5a3a1e', '#4a2f18');
    // 위험 줄무늬
    const a = this.P(x0 + 4, y1, e + 15), b = this.P(x0 + 10, y1, e + 15);
    this.x.fillStyle = '#e8d27a'; this.x.fillRect(a[0], a[1], Math.max(2, b[0] - a[0]), 1);
  };
  P.logSeg = function (x0, y, x1, e, rot, first, last) {
    this.box(x0, y - 5, x1, y + 5, e, 9, '#a8743a', '#8a5a2b', '#6b431f');
    const ph = ((rot % 6) + 6) % 6;
    const a = this.P(x0, y - 5 + ph * 1.6, e + 9), b = this.P(x1, y - 5 + ph * 1.6, e + 9);
    this.x.strokeStyle = '#6b431f'; this.x.lineWidth = 1; this.x.beginPath(); this.x.moveTo(a[0], a[1] + 0.5); this.x.lineTo(b[0], b[1] + 0.5); this.x.stroke();
    if (last) { const c = this.P(x1, y, e + 5); this.x.fillStyle = '#d9a766'; this.x.fillRect(c[0] - 2, c[1] - 3, 4, 5); this.x.fillStyle = '#8a5a2b'; this.x.fillRect(c[0] - 1, c[1] - 1, 2, 1); }
  };
  P.barrel = function (wx, wy, e, rot) {
    this.box(wx - 6, wy - 6, wx + 6, wy + 6, e, 12, '#b07a3f', '#8a5a2b', '#6b431f');
    const f = Math.floor(rot) % 2;
    for (const z of [3 + f, 9 - f]) { const a = this.P(wx - 6, wy + 6, e + z), b = this.P(wx + 6, wy + 6, e + z), c = this.P(wx + 6, wy - 6, e + z); this.x.strokeStyle = '#3a3350'; this.x.lineWidth = 1; this.x.beginPath(); this.x.moveTo(a[0], a[1] + 0.5); this.x.lineTo(b[0], b[1] + 0.5); this.x.lineTo(c[0], c[1] + 0.5); this.x.stroke(); }
  };
  P.shadow = function (wx, wy, e, r, z) {
    const q = this.P(wx, wy, e), s = Math.max(0.4, 1 - z / 60), x = this.x;
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(q[0], q[1] + 1, r * s + 1, (r * s) / 2 + 0.5, 0, 0, Math.PI * 2); x.fill();
  };
  P.shadowRect = function (x0, y, x1, e) {
    const a = this.P(x0, y - 5, e), b = this.P(x1, y - 5, e), c = this.P(x1, y + 7, e), d = this.P(x0, y + 7, e);
    this.poly([a, b, c, d], 'rgba(0,0,0,0.3)');
  };

  // ---------- 캐릭터 ----------
  P.wizard = function (p, b, s, now, e) {
    const x = this.x;
    const inv = b[5], crouch = b[3], slide = b[4], faceL = this.faceL;
    if (inv && Math.floor(now * 14) % 2 && s.st === 'play') return;
    const moving = Math.abs(b[7]) > 5;
    const q = this.P(p[0], p[1], e + p[2]);
    const bob = moving && p[2] <= 0 && !crouch ? (Math.floor(now * 8) % 2) : 0;
    const X = q[0], Y = q[1] - bob;
    const h = crouch ? 14 : 20;
    x.save();
    if (faceL) { x.translate(X, 0); x.scale(-1, 1); x.translate(-X, 0); }
    if (!slide) {
      x.fillStyle = '#1a1426'; x.fillRect(X + 6, Y - h + 3, 3, h - 3);
      x.fillStyle = '#a9aec0'; x.fillRect(X + 7, Y - h + 4, 1, h - 5);
      x.fillStyle = '#1a1426'; x.fillRect(X + 4, Y - h - 3, 7, 7);
      x.fillStyle = '#e04a4a'; x.fillRect(X + 5, Y - h - 2, 5, 5);
      x.fillStyle = '#ffffff'; x.fillRect(X + 6, Y - h - 1, 1, 1); x.fillRect(X + 7, Y - h, 2, 1); x.fillRect(X + 8, Y - h + 1, 1, 1);
    }
    x.drawImage(this.spr.wiz, X - 7, Y - h, 14, h);
    x.drawImage(this.spr.shield, X - 10, Y - h + 9);
    if (slide) { x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(X - 12, Y - 3, 4, 1); x.fillRect(X - 14, Y - 6, 4, 1); }
    x.restore();
    if (s.sab[0] === 'on') { x.fillStyle = '#c77dff'; x.fillRect(X - 1, Y - h - 6 - (Math.floor(now * 6) % 2), 2, 2); }
  };

  P.enemy = function (kind, p, en, now, e) {
    const x = this.x, q = this.P(p[0], p[1], e + p[2]), X = q[0], Y = q[1], hit = en[5];
    if (kind === 'ant') {
      x.drawImage(hit ? this.spr.antHit : this.spr.ant, X - 5, Y - 7 + (Math.floor(now * 10 + en[0]) % 2));
    } else if (kind === 'fly') {
      const flap = Math.floor(now * 16 + en[0]) % 2;
      x.fillStyle = 'rgba(217,236,255,0.8)';
      x.fillRect(X - 9, Y - 10 - flap * 2, 6, 3); x.fillRect(X + 3, Y - 10 - flap * 2, 6, 3);
      x.drawImage(hit ? this.spr.antHit : this.spr.ant, X - 5, Y - 7);
    } else if (kind === 'egg') {
      const t = en[6], pulse = t < 2 ? (Math.floor(now * 8) % 2) : 0;
      x.fillStyle = '#1a1426'; x.beginPath(); x.ellipse(X, Y - 5, 6 + pulse, 7 + pulse, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = hit ? '#ffffff' : '#efe3c8'; x.beginPath(); x.ellipse(X, Y - 5, 5 + pulse, 6 + pulse, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#c9a97a'; x.fillRect(X - 2, Y - 8, 1, 4); x.fillRect(X + 1, Y - 6, 1, 3);
    } else if (kind === 'queen') {
      const act = en[6];
      const tele = act === 'tele' && Math.floor(now * 12) % 2;
      const o = '#1a1426', body = hit ? '#ffffff' : '#7a2418', light = hit ? '#ffe0e0' : '#a8392a';
      x.fillStyle = o; x.beginPath(); x.ellipse(X, Y - 4, 15, 10, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = body; x.beginPath(); x.ellipse(X, Y - 4, 14, 9, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = light; x.fillRect(X - 10, Y - 8, 20, 2); x.fillRect(X - 8, Y - 3, 16, 2);
      x.fillStyle = o; x.beginPath(); x.ellipse(X, Y - 16, 8, 6, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = body; x.beginPath(); x.ellipse(X, Y - 16, 7, 5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = o; x.beginPath(); x.ellipse(X, Y - 25, 7, 6, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = light; x.beginPath(); x.ellipse(X, Y - 25, 6, 5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ffe27a'; x.fillRect(X - 4, Y - 27, 2, 2); x.fillRect(X + 2, Y - 27, 2, 2);
      x.fillStyle = '#f2c94c'; x.fillRect(X - 5, Y - 33, 10, 3); x.fillRect(X - 5, Y - 35, 2, 2); x.fillRect(X - 1, Y - 36, 2, 3); x.fillRect(X + 3, Y - 35, 2, 2);
      x.fillStyle = o; for (let i = -1; i <= 1; i++) { x.fillRect(X - 16, Y - 14 + i * 5, 6, 1); x.fillRect(X + 10, Y - 14 + i * 5, 6, 1); }
      if (tele) { x.strokeStyle = '#ff4d4d'; x.lineWidth = 1; x.strokeRect(X - 18, Y - 38, 36, 38); }
    }
  };

  P.spiritAtk = function (wx, wy, z, now) {
    const x = this.x, f = Math.floor(now * 10) % 2;
    const q = this.P(wx, wy, z + Math.sin(now * 4) * 1.5), X = q[0], Y = q[1];
    x.fillStyle = '#1a1426'; x.fillRect(X - 4, Y - 4, 8, 8);
    x.fillStyle = '#ff7b2e'; x.fillRect(X - 3, Y - 3, 6, 6); x.fillRect(X - 1, Y - 6 - f, 2, 3);
    x.fillStyle = '#ffe27a'; x.fillRect(X - 2, Y - 1, 4, 3);
    x.fillStyle = '#1a1426'; x.fillRect(X - 2, Y - 1, 1, 1); x.fillRect(X + 1, Y - 1, 1, 1);
  };
  P.spiritDef = function (wx, wy, z, R, now) {
    const x = this.x, q = this.P(wx, wy, z), X = q[0], Y = q[1];
    x.fillStyle = 'rgba(26,20,38,0.9)'; x.beginPath(); x.ellipse(X, Y, R + 1, R + 1, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(122,90,58,0.92)'; x.beginPath(); x.ellipse(X, Y, R, R, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#5fbf5a'; x.lineWidth = 1; x.beginPath(); x.ellipse(X, Y, R - 1, R - 1, 0, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#f4f0e0'; x.fillRect(X - 3, Y - 2, 2, 2); x.fillRect(X + 1, Y - 2, 2, 2);
    x.fillStyle = '#1a1426'; x.fillRect(X - 2, Y - 1, 1, 1); x.fillRect(X + 2, Y - 1, 1, 1);
  };

  // HUD용: 마법사 얼굴 작은 그림
  P.face = function (cv) {
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    x.drawImage(this.spr.wiz, 0, 0, 14, 12, 0, 0, cv.width, cv.width * 12 / 14);
  };

  G.TUS_RENDER = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
