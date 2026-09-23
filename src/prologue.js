// 프롤로그 컷신 (기획서 3.2) — 장면 시간표 · 자막 · 효과음 신호 · 그리기
// 1 마법진 그리기 → 2 개미가 가루를 훔쳐 감 → 3 영창 → 4 현실에서 투닥이던 친구들이 끌려감 → 5 조용한 실패 → 6 제목
// 길이(LEN)는 game.js 의 PROLOGUE_LEN 과 같아야 한다.
(function (G) {
  'use strict';
  const W = 416, H = 234, LB = 20, LEN = 26;
  const PCOL = ['#ff7a7a', '#6db8ff', '#7be08a', '#ffd257'];
  const HAIR = ['#3a2a22', '#1a1426', '#8a5a2b', '#c9a060'];

  const SCENES = [
    { id: 'ritual', t0: 0, t1: 5, sub: () => '어둡고 음침한 마탑 지하 3층. 한 마법사가 소환 마법진을 그리고 있었다.' },
    { id: 'ants', t0: 5, t1: 9.5, sub: () => '…그런데 개미들이 마법진의 가루를 한 알, 한 알 날라 가고 있었다.' },
    { id: 'chant', t0: 9.5, t1: 13, sub: () => '마법진이 지워진 줄도 모르고, 마법사는 영창을 시작했다.' },
    { id: 'real', t0: 13, t1: 18.5, sub: n => `같은 시각, 현실 세계. 오늘도 투닥거리던 ${n} 앞에 —` },
    { id: 'souls', t0: 18.5, t1: 22.5, sub: () => '소환은… 조용했다. 그리고 실패했다. 모두의 영혼이 마법사 한 몸에 빨려 들어갔다.' },
    { id: 'title', t0: 22.5, t1: 26, sub: () => '소환을 취소하려면 탑 꼭대기에서 절대마법을 써야 한다. 함께. (니들이랑)' },
  ];
  // 효과음 신호: t초에 s 소리 (main.js 가 합성해서 낸다)
  const CUES = [{ t: 0.05, s: 'boom' }];
  for (let t = 0.8; t < 4.6; t += 0.45) CUES.push({ t, s: 'sparkle' });
  for (let t = 5.3; t < 9.2; t += 0.3) CUES.push({ t, s: 'scuttle' });
  CUES.push({ t: 9.6, s: 'chant' }, { t: 11.9, s: 'surge' }, { t: 13.05, s: 'cozy' });
  for (let t = 13.5; t < 15.3; t += 0.34) CUES.push({ t, s: 'bicker' });
  CUES.push({ t: 15.4, s: 'flicker' }, { t: 15.6, s: 'portal' }, { t: 16.6, s: 'grab' }, { t: 18.55, s: 'flash' });
  for (let t = 19.2; t < 21.9; t += 0.55) CUES.push({ t, s: 'chime' });
  CUES.push({ t: 22.6, s: 'title' });

  const sceneAt = t => SCENES.find(q => t < q.t1) || SCENES[SCENES.length - 1];
  const subtitle = (t, names) => sceneAt(t).sub(names);

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

  // 현실 세계 친구 (8x14 픽셀) — 옷 = 플레이어 색, 머리색은 번호마다 다르게
  const PERSON = [
    '..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SESSES.', '.SSSSSS.', '..SMMS..',
    '.CCCCCC.', 'CCCCCCCC', 'SCCCCCCS', 'SCCCCCCS', '.PPPPPP.', '.PP..PP.', '.PP..PP.', '.BB..BB.',
  ];
  const PERSON_UP = [ // 끌려갈 때 팔을 번쩍
    'S.HHHH.S', 'SHHHHHHS', 'SHSSSSHS', 'CSESSESC', 'CSSSSSSC', 'C.SOOS.C',
    '.CCCCCC.', '.CCCCCC.', '.CCCCCC.', '.CCCCCC.', '.PPPPPP.', '.PP..PP.', 'PP....PP', 'BB....BB',
  ];
  const personCache = {};
  function personSprite(col, hair, up) {
    const key = col + hair + up;
    if (personCache[key]) return personCache[key];
    const map = up ? PERSON_UP : PERSON, c = mk(8, 14), x = c.getContext('2d');
    const pal = { H: hair, S: '#f4c9a3', E: '#1a1426', M: '#c2553a', O: '#1a1426', C: col, P: '#2e3350', B: '#1a1426' };
    map.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
    return (personCache[key] = c);
  }

  const R = G.TUS_RENDER.prototype;
  R.prologue = function (s, now) {
    const x = this.x, t = LEN - s.stT, sc = sceneAt(t), u = Math.max(0, t - sc.t0), d = sc.t1 - sc.t0;
    const pls = s.players && s.players.length ? s.players : [{ name: '?', col: 0 }];
    if (!this.logoImg && typeof Image !== 'undefined') { this.logoImg = new Image(); this.logoImg.src = 'assets/logo.png?v=mudsuiiy'; }
    x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    // 천천히 다가가는 카메라
    const z = 1 + (u / d) * 0.05;
    let shx = 0, shy = 0;
    if (this.proShake > 0) { shx = (Math.random() - 0.5) * this.proShake; shy = (Math.random() - 0.5) * this.proShake; this.proShake *= 0.9; }
    x.save(); x.translate(W / 2 + shx, H / 2 + shy); x.scale(z, z); x.translate(-W / 2, -H / 2);
    this['pro_' + sc.id](x, u, d, now, pls);
    x.restore();
    // 영화 띠 + 장면 전환 페이드
    x.fillStyle = '#000'; x.fillRect(0, 0, W, LB); x.fillRect(0, H - LB, W, LB);
    const f = Math.max(0, 1 - u / 0.45, sc.id === 'title' ? 0 : 1 - (d - u) / 0.45);
    if (f > 0) { x.fillStyle = 'rgba(0,0,0,' + Math.min(1, f).toFixed(2) + ')'; x.fillRect(0, 0, W, H); }
  };

  // ---------- 공용 그리기 ----------
  function glow(x, cx, cy, r, c) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); x.globalCompositeOperation = 'source-over'; }
  function dungeon(x, now) {
    const g = x.createLinearGradient(0, 0, 0, 150); g.addColorStop(0, '#0d0a18'); g.addColorStop(1, '#1b1630'); x.fillStyle = g; x.fillRect(0, 0, W, 150);
    for (let j = 0; j < 7; j++) for (let i = -1; i < 10; i++) {
      const bx = i * 48 + (j % 2) * 24, by = 18 + j * 19, n = hash(i, j);
      x.fillStyle = n < 0.15 ? '#1a1528' : '#221c36'; x.fillRect(bx, by, 45, 16);
      x.fillStyle = '#2a2342'; x.fillRect(bx, by, 45, 1);
    }
    // 바닥: 소실점으로 모이는 판석
    const fg = x.createLinearGradient(0, 150, 0, H); fg.addColorStop(0, '#171329'); fg.addColorStop(1, '#241d3a'); x.fillStyle = fg; x.fillRect(0, 150, W, H - 150);
    x.strokeStyle = '#2e2745'; x.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const y = 150 + k * k * 3.2; x.beginPath(); x.moveTo(0, y + 0.5); x.lineTo(W, y + 0.5); x.stroke(); }
    for (let i = -8; i <= 8; i++) { x.beginPath(); x.moveTo(208 + i * 16, 150); x.lineTo(208 + i * 90, H); x.stroke(); }
    // 책장 · 사슬
    x.fillStyle = '#2c1c10'; x.fillRect(14, 52, 64, 98); x.fillStyle = '#1a100a'; for (let r = 0; r < 4; r++) x.fillRect(18, 58 + r * 23, 56, 19);
    const books = ['#7a2418', '#2447a8', '#c89a3a', '#2d7f36', '#5a2a80'];
    for (let r = 0; r < 4; r++) for (let b = 0; b < 9; b++) { const hh = 11 + ((hash(b, r) * 7) | 0); x.fillStyle = books[(b + r) % 5]; x.fillRect(19 + b * 6, 77 + r * 23 - hh, 5, hh); }
    for (const cx of [330, 372]) { x.fillStyle = '#4a4262'; for (let k = 0; k < 9; k++) x.fillRect(cx + (k % 2), 20 + k * 7, 2, 5); }
  }
  function candle(x, cx, cy, now, i) {
    const f = Math.floor(now * 9 + i * 3) % 2;
    x.fillStyle = '#d9cbb0'; x.fillRect(cx - 2, cy - 8, 4, 8); x.fillStyle = '#a89878'; x.fillRect(cx + 1, cy - 8, 1, 8);
    x.fillStyle = '#ff9d3b'; x.fillRect(cx - 1, cy - 12 - f, 2, 3 + f); x.fillStyle = '#ffe27a'; x.fillRect(cx, cy - 11, 1, 2);
    glow(x, cx, cy - 11, 30, 'rgba(255,160,70,0.22)');
  }
  function rune(x, cx, cy, k, col) {
    x.fillStyle = col; const p = (k * 7) % 4;
    if (p === 0) { x.fillRect(cx - 1, cy - 2, 1, 5); x.fillRect(cx - 2, cy, 3, 1); }
    else if (p === 1) { x.fillRect(cx - 2, cy - 2, 4, 1); x.fillRect(cx, cy - 2, 1, 5); }
    else if (p === 2) { x.fillRect(cx - 2, cy - 1, 1, 3); x.fillRect(cx + 1, cy - 1, 1, 3); x.fillRect(cx - 2, cy + 1, 4, 1); }
    else { x.fillRect(cx - 2, cy - 2, 1, 1); x.fillRect(cx - 1, cy - 1, 1, 1); x.fillRect(cx, cy, 1, 1); x.fillRect(cx + 1, cy + 1, 1, 1); x.fillRect(cx + 1, cy - 2, 1, 1); }
  }
  // 바닥 마법진: from~to 각도만 그린다. gap = [a0, a1] 은 지워진 곳
  function magicCircle(x, cx, cy, rx, ry, to, alpha, gap, red) {
    const col = 'rgba(205,184,255,' + alpha.toFixed(2) + ')';
    const arc = (r1, r2, a0, a1, lw, c) => { x.strokeStyle = c; x.lineWidth = lw; x.beginPath(); x.ellipse(cx, cy, r1, r2, 0, a0, a1); x.stroke(); };
    const seg = (r1, r2, lw, c) => {
      if (!gap) { arc(r1, r2, 0, to, lw, c); return; }
      arc(r1, r2, 0, Math.min(to, gap[0]), lw, c);
      if (to > gap[1]) arc(r1, r2, gap[1], to, lw, c);
    };
    seg(rx, ry, 2, col); seg(rx * 0.7, ry * 0.7, 1, col);
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * Math.PI * 2 + 0.17; if (a > to || (gap && a > gap[0] && a < gap[1])) continue;
      rune(x, Math.round(cx + Math.cos(a) * rx * 0.85), Math.round(cy + Math.sin(a) * ry * 0.85), k, col);
    }
    // 오각형 별
    x.strokeStyle = 'rgba(205,184,255,' + (alpha * 0.6).toFixed(2) + ')'; x.lineWidth = 1; x.beginPath();
    for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; if (a % (Math.PI * 2) > to && to < Math.PI * 2) break; const px = cx + Math.cos(a) * rx * 0.7, py = cy + Math.sin(a) * ry * 0.7; k ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
    if (gap && red) arc(rx, ry, gap[0], gap[1], 2, 'rgba(255,70,70,' + red.toFixed(2) + ')');
  }
  function bubble(x, bx, by, text, typed) {
    const s = typed == null ? text : text.slice(0, Math.floor(typed));
    x.font = '11px "Galmuri11", monospace'; x.textAlign = 'center';
    const w = x.measureText(text).width + 12;
    x.fillStyle = '#1a1426'; x.fillRect(bx - w / 2 - 1, by - 14, w + 2, 18);
    x.fillStyle = '#f4f0e0'; x.fillRect(bx - w / 2, by - 13, w, 16);
    x.fillRect(bx - 3, by + 3, 6, 3); x.fillRect(bx - 1, by + 6, 2, 2);
    x.fillStyle = '#1a1426'; x.textAlign = 'left'; x.fillText(s, bx - w / 2 + 6, by);
  }
  R.proWizard = function (x, cx, cy, sc, pose, eye, now) {
    x.drawImage(this.spr.wiz, Math.round(cx - 7 * sc), Math.round(cy - 20 * sc), 14 * sc, 20 * sc);
    const up = pose === 'up';
    const sx = cx + 8 * sc, top = up ? cy - 30 * sc : cy - 17 * sc;
    x.fillStyle = '#a9aec0'; x.fillRect(Math.round(sx), Math.round(top), sc, Math.round((up ? 22 : 17) * sc));
    x.fillStyle = '#1a1426'; x.fillRect(Math.round(sx - 1.5 * sc), Math.round(top - 4 * sc), 4 * sc, 4 * sc);
    x.fillStyle = '#e04a4a'; x.fillRect(Math.round(sx - sc), Math.round(top - 3.5 * sc), 3 * sc, 3 * sc);
    x.fillStyle = '#ffffff'; x.fillRect(Math.round(sx), Math.round(top - 2.5 * sc), sc, sc);
    if (up) glow(x, sx + sc / 2, top - 2 * sc, 60, 'rgba(200,120,255,0.3)');
    if (eye) { x.fillStyle = eye; x.fillRect(Math.round(cx - 3 * sc), Math.round(cy - 10 * sc), sc, sc); x.fillRect(Math.round(cx + 1 * sc), Math.round(cy - 10 * sc), sc, sc); glow(x, cx, cy - 10 * sc, 24, 'rgba(255,255,255,0.25)'); }
  };

  // ---------- 장면 ----------
  R.pro_ritual = function (x, u, d, now) {
    dungeon(x, now);
    const cx = 262, cy = 182, rx = 104, ry = 30, k = Math.min(1, u / 4.2), to = k * Math.PI * 2;
    magicCircle(x, cx, cy, rx, ry, to, 0.85);
    const la = to, lx = cx + Math.cos(la) * rx, ly = cy + Math.sin(la) * ry;
    if (k < 1) { glow(x, lx, ly, 18, 'rgba(230,210,255,0.6)'); x.fillStyle = '#fff'; x.fillRect(Math.round(lx) - 1, Math.round(ly) - 1, 2, 2); }
    [[0.3, 0], [1.5, 1], [2.7, 2], [3.9, 3], [5.1, 4]].forEach(([a, i]) => candle(x, cx + Math.cos(a) * rx * 1.12, cy + Math.sin(a) * ry * 1.12 + 2, now, i));
    this.proWizard(x, 140, 176, 3, 'down', null, now);
    // 손에서 흩뿌려지는 가루
    for (let i = 0; i < 16; i++) {
      const p = ((now * 1.2 + i / 16) % 1), hx = 166, hy = 132;
      const px = hx + (lx - hx) * p, py = hy + (ly - hy) * p - Math.sin(p * Math.PI) * 26;
      x.fillStyle = i % 3 ? 'rgba(230,214,255,0.9)' : 'rgba(170,130,255,0.9)'; x.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
    glow(x, cx, cy, 130, 'rgba(160,100,255,' + (0.06 + k * 0.1).toFixed(2) + ')');
    glow(x, 150, 120, 80, 'rgba(110,150,255,0.12)');
  };
  R.pro_ants = function (x, u, d, now) {
    // 돌바닥 클로즈업
    x.fillStyle = '#16122a'; x.fillRect(0, 0, W, H);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 14; i++) {
      const n = hash(i + 40, j), px = i * 34 - (j % 2) * 17, py = j * 30;
      x.fillStyle = n < 0.2 ? '#1c1732' : '#211b3a'; x.fillRect(px + 1, py + 1, 32, 28);
      if (n > 0.85) { x.fillStyle = '#16122a'; x.fillRect(px + 6, py + 10, 12, 1); x.fillRect(px + 17, py + 11, 1, 6); }
    }
    const cx = 190, cy = 305, rx = 250, ry = 186; // 원의 윗부분이 화면 가운데를 가로지르게
    const g0 = 4.95, gap = [g0, g0 + 0.05 + (u / d) * 0.32]; // 양수 각도여야 호가 제대로 끊긴다
    magicCircle(x, cx, cy, rx, ry, Math.PI * 2, 0.9, gap, 0);
    // 지워진 자리 흩어진 가루
    for (let i = 0; i < 30; i++) { const a = gap[0] + hash(i, 5) * (gap[1] - gap[0]), rr = 1 + (hash(i, 9) - 0.5) * 0.04; x.fillStyle = 'rgba(205,184,255,0.5)'; x.fillRect(Math.round(cx + Math.cos(a) * rx * rr), Math.round(cy + Math.sin(a) * ry * rr), 1, 1); }
    glow(x, 250, 140, 200, 'rgba(160,100,255,0.12)');
    // 가루 한 알씩 들고 줄지어 가는 개미
    const gx = cx + Math.cos(gap[1]) * rx, gy = cy + Math.sin(gap[1]) * ry;
    for (let i = 0; i < 9; i++) {
      const p = ((u * 0.23 + i / 9) % 1), ax = gx - 10 + p * (W + 30 - gx), ay = gy - 4 + p * 60 + Math.sin(p * 9 + i) * 4;
      const bob = Math.floor(now * 12 + i) % 2;
      x.drawImage(this.spr.ant, Math.round(ax), Math.round(ay) + bob, 30, 21);
      x.fillStyle = '#1a1426'; x.fillRect(Math.round(ax) + 10, Math.round(ay) - 7 + bob, 8, 7);
      x.fillStyle = '#e6d6ff'; x.fillRect(Math.round(ax) + 11, Math.round(ay) - 6 + bob, 6, 5);
      glow(x, ax + 14, ay - 4, 12, 'rgba(200,170,255,0.35)');
    }
  };
  R.pro_chant = function (x, u, d, now) {
    dungeon(x, now);
    const cx = 262, cy = 182, rx = 104, ry = 30, pulse = 0.6 + Math.sin(now * 9) * 0.3;
    const red = Math.floor(now * 8) % 2 ? 0.95 : 0.2;
    magicCircle(x, cx, cy, rx, ry, Math.PI * 2, Math.min(1, 0.7 + pulse * 0.3), [0.35, 0.95], red);
    [[0.3, 0], [1.5, 1], [2.7, 2], [3.9, 3], [5.1, 4]].forEach(([a, i]) => candle(x, cx + Math.cos(a) * rx * 1.12, cy + Math.sin(a) * ry * 1.12 + 2, now, i));
    // 떠오르는 룬
    for (let i = 0; i < 14; i++) {
      const p = ((u * 0.5 + i / 14) % 1), a = hash(i, 3) * Math.PI * 2;
      if (a > 0.35 && a < 0.95) continue;
      x.globalAlpha = 1 - p; rune(x, Math.round(cx + Math.cos(a) * rx * 0.85), Math.round(cy + Math.sin(a) * ry * 0.85 - p * 70), i, '#e0c8ff'); x.globalAlpha = 1;
    }
    if (u > 2.4) this.proShake = Math.max(this.proShake || 0, 2);
    this.proWizard(x, 140, 176, 3, 'up', null, now);
    bubble(x, 150, 70, '오너라… 전설의 용사여!', u * 14);
    glow(x, cx, cy, 150, 'rgba(180,110,255,' + (0.12 + pulse * 0.1 + u * 0.03).toFixed(2) + ')');
  };
  R.pro_real = function (x, u, d, now, pls) {
    // 밤의 방: 벽지 · 창문(달·도시 불빛) · 책상(모니터) · 나무 바닥
    x.fillStyle = '#2b2438'; x.fillRect(0, 0, W, 160);
    for (let i = 0; i < 26; i++) { x.fillStyle = i % 2 ? '#2e2740' : '#29223a'; x.fillRect(i * 16, 0, 8, 160); }
    x.fillStyle = '#4a3326'; x.fillRect(0, 160, W, H - 160);
    for (let i = 0; i < 8; i++) { x.fillStyle = '#3a271c'; x.fillRect(0, 164 + i * 9, W, 1); }
    x.fillStyle = '#1a1426'; x.fillRect(22, 34, 90, 70);
    const sky = x.createLinearGradient(0, 36, 0, 102); sky.addColorStop(0, '#0e1638'); sky.addColorStop(1, '#2a2a58'); x.fillStyle = sky; x.fillRect(25, 37, 84, 64);
    x.fillStyle = '#f4f0d0'; x.fillRect(86, 44, 9, 9); x.fillStyle = '#0e1638'; x.fillRect(89, 44, 6, 6);
    for (let i = 0; i < 14; i++) { x.fillStyle = hash(i, 2) < 0.5 ? '#ffd28a' : '#9fd4ff'; x.fillRect(27 + ((hash(i, 4) * 78) | 0), 80 + ((hash(i, 6) * 18) | 0), 1, 1); }
    x.fillStyle = '#1a1426'; x.fillRect(22, 68, 90, 3); x.fillRect(65, 34, 3, 70);
    x.fillStyle = '#5a3f2a'; x.fillRect(236, 128, 150, 9); x.fillStyle = '#3a271c'; x.fillRect(244, 137, 6, 40); x.fillRect(372, 137, 6, 40);
    x.fillStyle = '#1a1426'; x.fillRect(286, 92, 54, 36); x.fillStyle = '#3f7fc0'; x.fillRect(289, 95, 48, 28); x.fillStyle = '#6fb0e8'; x.fillRect(292, 98, 20, 3); x.fillRect(292, 104, 32, 2); x.fillRect(292, 109, 26, 2);
    x.fillStyle = '#1a1426'; x.fillRect(309, 128, 8, 2);
    x.fillStyle = '#c2553a'; x.fillRect(352, 116, 14, 12); x.fillStyle = '#f6c945'; x.fillRect(355, 119, 8, 4);
    glow(x, 313, 110, 90, 'rgba(90,160,255,0.16)');
    glow(x, 200, 20, 220, 'rgba(255,190,120,0.10)');
    // 불 깜빡임 · 천장 포털
    if (u > 2.4 && u < 3.0 && Math.floor(now * 14) % 2) { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, W, H); }
    const portal = u > 2.6 ? Math.min(1, (u - 2.6) / 0.6) : 0;
    if (portal > 0) {
      for (let k = 0; k < 6; k++) { x.strokeStyle = 'rgba(' + (150 + k * 15) + ',90,255,' + (0.8 - k * 0.1).toFixed(2) + ')'; x.lineWidth = 2; x.beginPath(); x.ellipse(208, 18, (30 + k * 18) * portal, (6 + k * 4) * portal, 0, now * (k % 2 ? 2 : -2), now * (k % 2 ? 2 : -2) + Math.PI * 1.6); x.stroke(); }
      glow(x, 208, 18, 160 * portal, 'rgba(170,100,255,0.35)');
    }
    // 친구들
    const n = pls.length, lines = ['니가 해!', '아 왜 나야', '너 때문이잖아', '조용히 좀 해!'];
    const grab = u > 3.4, lift = grab ? Math.pow(u - 3.4, 2) * 260 : 0;
    if (grab && u < 3.6) this.proShake = 4;
    pls.forEach((pl, i) => {
      const px = n === 1 ? 190 : 80 + i * (220 / (n - 1)), py = 206;
      const yy = py - lift * (1 + i * 0.15), col = PCOL[pl.col || 0];
      const spr = personSprite(col, HAIR[i % 4], grab);
      const jitter = !grab && Math.floor(now * 6 + i) % 2 ? 1 : 0;
      x.drawImage(spr, Math.round(px - 12), Math.round(yy - 42) - jitter, 24, 42);
      x.font = '10px "Galmuri11", monospace'; x.textAlign = 'center'; x.fillStyle = col; x.fillText(pl.name, px, yy - 48);
      if (!grab && u < 2.4 && Math.floor(u * 1.6 + i) % 2 === 0) bubble(x, px, yy - 60, lines[(i + Math.floor(u * 1.6)) % 4]);
      if (portal > 0.5) {
        // 포털에서 내려와 머리를 움켜쥐는 손
        const hy = Math.min(yy - 44, 18 + (u - 2.9) * 260);
        x.fillStyle = 'rgba(150,90,230,0.85)'; x.fillRect(px - 4, 18, 8, Math.max(0, hy - 30));
        x.fillStyle = 'rgba(150,90,230,0.95)'; x.fillRect(px - 9, hy - 14, 18, 10); for (let f = 0; f < 4; f++) x.fillRect(px - 9 + f * 5, hy - 4, 3, 7);
        x.fillStyle = 'rgba(225,200,255,0.9)'; x.fillRect(px - 2, 18, 1, Math.max(0, hy - 30));
      }
      if (grab) { x.fillStyle = 'rgba(255,255,255,0.5)'; for (let m = 0; m < 3; m++) x.fillRect(px - 16 + m * 14, yy + 4 + m * 5, 1, 12); }
    });
  };
  R.pro_souls = function (x, u, d, now, pls) {
    dungeon(x, now);
    x.fillStyle = 'rgba(7,6,13,0.45)'; x.fillRect(0, 0, W, H);
    magicCircle(x, 208, 184, 104, 30, Math.PI * 2, 0.25, [0.35, 0.95], 0);
    const n = pls.length;
    let eye = null;
    pls.forEach((pl, i) => {
      const st = 0.3 + i * 0.35, p = Math.min(1, Math.max(0, (u - st) / 2.2)), col = PCOL[pl.col || 0];
      if (p >= 1) { eye = col; return; }
      if (u < st) return;
      for (let tr = 6; tr >= 0; tr--) {
        const q = Math.max(0, p - tr * 0.025), a = i / n * Math.PI * 2 + q * 7, r = 150 * (1 - q);
        const wx = 208 + Math.cos(a) * r, wy = 120 + Math.sin(a) * r * 0.45;
        x.globalAlpha = tr ? 0.5 - tr * 0.06 : 1; x.fillStyle = col; const sz = tr ? 3 : 6; x.fillRect(Math.round(wx - sz / 2), Math.round(wy - sz / 2), sz, sz);
        if (!tr) { x.fillStyle = '#fff'; x.fillRect(Math.round(wx) - 1, Math.round(wy) - 1, 2, 2); x.font = '10px "Galmuri11", monospace'; x.textAlign = 'center'; x.fillStyle = col; x.fillText(pl.name, wx, wy - 8); glow(x, wx, wy, 26, 'rgba(255,255,255,0.2)'); }
      }
      x.globalAlpha = 1;
    });
    const all = u > 0.3 + (n - 1) * 0.35 + 2.2;
    if (all) eye = PCOL[pls[Math.floor(now * 4) % n].col || 0];
    const tremble = eye ? (Math.random() - 0.5) * 2 : 0;
    this.proWizard(x, 208 + tremble, 178, 3, 'down', eye, now);
    glow(x, 208, 130, 110, 'rgba(120,150,255,0.14)');
    if (u < 0.6) { x.fillStyle = 'rgba(255,255,255,' + (1 - u / 0.6).toFixed(2) + ')'; x.fillRect(0, 0, W, H); }
  };
  R.pro_title = function (x, u, d, now, pls) {
    x.fillStyle = '#07060d'; x.fillRect(0, 0, W, H);
    glow(x, 208, 110, 200, 'rgba(120,80,220,0.22)');
    for (let i = 0; i < 40; i++) { const px = hash(i, 1) * W, py = (hash(i, 2) * H - u * 8 * (1 + hash(i, 3))) % H; x.fillStyle = 'rgba(200,180,255,0.5)'; x.fillRect(Math.round(px), Math.round((py + H) % H), 1, 1); }
    const a = Math.min(1, u / 0.8);
    x.globalAlpha = a;
    if (this.logoImg && this.logoImg.complete && this.logoImg.naturalWidth) {
      x.imageSmoothingEnabled = true; const w = 230, h = w * this.logoImg.naturalHeight / this.logoImg.naturalWidth;
      x.drawImage(this.logoImg, 208 - w / 2, 26, w, h); x.imageSmoothingEnabled = false;
    } else { x.font = '24px "Galmuri14", monospace'; x.textAlign = 'center'; x.fillStyle = '#ece8ff'; x.fillText('THE UNWILLING SUMMONED', 208, 100); }
    x.font = '16px "Galmuri14", "Galmuri11", monospace'; x.textAlign = 'center'; x.fillStyle = '#ece8ff'; x.fillText('소환되고 싶지 않아', 208, 182);
    x.font = '12px "Galmuri11", monospace'; x.fillStyle = '#c77dff'; x.fillText('(니들이랑)', 208, 199);
    x.globalAlpha = 1;
  };

  G.TUS_PROLOGUE = { LEN, SCENES, CUES, subtitle };
})(typeof window !== 'undefined' ? window : globalThis);
