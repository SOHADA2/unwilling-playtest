// 프롤로그 컷신 (기획서 3.2) — 장면 시간표 · 자막 · 효과음 신호 · 그리기
// 1 마법진 그리기 → 2 개미가 가루를 훔쳐 감 → 3 영창 → 4 현실에서 투닥이던 친구들이 끌려감 → 5 조용한 실패 → 6 제목
// 길이(LEN)는 game.js 의 PROLOGUE_LEN 과 같아야 한다.
//
// '영상 느낌' 연출: 게임 화면(416x234)과 따로, 컷신 전용 고해상도 캔버스(960x540)에 그린다.
//  · 겹 패럴랙스(먼 배경=흐림 / 중간 / 가까운 전경=크게 흐림) + 가감속 카메라
//  · 빛줄기 · 번짐(블룸) · 렌즈 플레어 · 색수차 · 장면별 색 보정 · 비네팅 · 필름 입자 · 영화 띠
//  · 무거운 배경은 장면마다 한 번만 그려 캐시 (매 프레임 흐림 필터를 걸지 않게)
(function (G) {
  'use strict';
  const W = 960, H = 540, LB = 58, LEN = 26;
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
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

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

  // ---------- 공용 그리기 ----------
  function glow(x, cx, cy, r, c) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); const o = x.globalCompositeOperation; x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); x.globalCompositeOperation = o; }
  // 위에서 비스듬히 내려오는 먼지 낀 빛줄기
  function rays(x, ox, oy, ang, spread, len, n, col, now) {
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread, w = 18 + hash(i, 3) * 26, fl = 0.6 + Math.sin(now * 0.7 + i * 1.7) * 0.4;
      const ex = ox + Math.cos(a) * len, ey = oy + Math.sin(a) * len, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      const g = x.createLinearGradient(ox, oy, ex, ey); g.addColorStop(0, col.replace('A', (0.16 * fl).toFixed(3))); g.addColorStop(1, col.replace('A', '0'));
      x.fillStyle = g; x.beginPath(); x.moveTo(ox, oy); x.lineTo(ex + nx, ey + ny); x.lineTo(ex - nx, ey - ny); x.closePath(); x.fill();
    }
    x.restore();
  }
  function rune(x, cx, cy, k, col, s) {
    s = s || 2; x.fillStyle = col; const p = (k * 7) % 4, R = (a, b, w, h) => x.fillRect(cx + a * s, cy + b * s, w * s, h * s);
    if (p === 0) { R(-1, -2, 1, 5); R(-2, 0, 3, 1); } else if (p === 1) { R(-2, -2, 4, 1); R(0, -2, 1, 5); }
    else if (p === 2) { R(-2, -1, 1, 3); R(1, -1, 1, 3); R(-2, 1, 4, 1); } else { R(-2, -2, 1, 1); R(-1, -1, 1, 1); R(0, 0, 1, 1); R(1, 1, 1, 1); R(1, -2, 1, 1); }
  }
  // 바닥 마법진 (to = 그려진 각도, gap = 지워진 곳, red = 틈이 붉게 깜빡임)
  function magicCircle(x, cx, cy, rx, ry, to, alpha, gap, red, lw) {
    lw = lw || 3;
    const col = a => 'rgba(215,190,255,' + (alpha * a).toFixed(3) + ')';
    const arc = (r1, r2, a0, a1, w, c) => { if (a1 <= a0) return; x.strokeStyle = c; x.lineWidth = w; x.beginPath(); x.ellipse(cx, cy, r1, r2, 0, a0, a1); x.stroke(); };
    const seg = (r1, r2, w, a) => { if (!gap) { arc(r1, r2, 0, to, w, col(a)); return; } arc(r1, r2, 0, Math.min(to, gap[0]), w, col(a)); if (to > gap[1]) arc(r1, r2, gap[1], to, w, col(a)); };
    x.save(); x.shadowColor = 'rgba(180,120,255,0.9)'; x.shadowBlur = 14;
    seg(rx, ry, lw, 1); seg(rx * 0.72, ry * 0.72, lw * 0.6, 0.8);
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2 + 0.13; if (a > to || (gap && a > gap[0] && a < gap[1])) continue; rune(x, Math.round(cx + Math.cos(a) * rx * 0.86), Math.round(cy + Math.sin(a) * ry * 0.86), k, col(0.95), Math.max(1, Math.round(lw / 1.5))); }
    x.strokeStyle = col(0.55); x.lineWidth = lw * 0.5; x.beginPath();
    for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; const px = cx + Math.cos(a) * rx * 0.72, py = cy + Math.sin(a) * ry * 0.72; k ? x.lineTo(px, py) : x.moveTo(px, py); }
    if (to >= Math.PI * 2 - 0.01) x.stroke();
    if (gap && red) { x.shadowColor = 'rgba(255,40,40,1)'; arc(rx, ry, gap[0], gap[1], lw, 'rgba(255,70,70,' + red.toFixed(2) + ')'); }
    x.restore();
  }
  function candle(x, cx, cy, s, now, i) {
    const f = Math.sin(now * 13 + i * 2) * 0.5 + Math.sin(now * 7.3 + i) * 0.5;
    x.fillStyle = '#e6d8bd'; x.fillRect(cx - 3 * s, cy - 12 * s, 6 * s, 12 * s); x.fillStyle = '#b8a888'; x.fillRect(cx + 1.5 * s, cy - 12 * s, 1.5 * s, 12 * s);
    x.fillStyle = '#ff9d3b'; x.beginPath(); x.ellipse(cx, cy - 16 * s - f * s, 2.6 * s, (5 + f) * s, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff2b0'; x.beginPath(); x.ellipse(cx, cy - 15 * s, 1.2 * s, 2.6 * s, 0, 0, Math.PI * 2); x.fill();
    glow(x, cx, cy - 15 * s, 60 * s, 'rgba(255,150,60,0.28)');
  }
  function bubble(x, bx, by, text, typed, size) {
    size = size || 22; const s = typed == null ? text : text.slice(0, Math.floor(typed));
    x.font = size + 'px "Galmuri11", monospace'; x.textAlign = 'left';
    const w = x.measureText(text).width + size;
    x.fillStyle = '#1a1426'; x.fillRect(bx - w / 2 - 3, by - size - 9, w + 6, size + 18);
    x.fillStyle = '#f4f0e0'; x.fillRect(bx - w / 2, by - size - 6, w, size + 12);
    x.fillRect(bx - 6, by + 6, 12, 6); x.fillRect(bx - 3, by + 12, 6, 4);
    x.fillStyle = '#1a1426'; x.fillText(s, bx - w / 2 + size / 2, by);
  }
  // 픽셀 스프라이트를 선명하게 크게
  const px = (x, img, cx, by, s, flip) => { x.save(); x.imageSmoothingEnabled = false; if (flip) { x.translate(cx, 0); x.scale(-1, 1); x.translate(-cx, 0); } x.drawImage(img, Math.round(cx - img.width * s / 2), Math.round(by - img.height * s), img.width * s, img.height * s); x.restore(); };

  // ---------- 캐시되는 배경 ----------
  function dungeonBG(blur) {
    const c = mk(W + 160, H + 90), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, '#0b0816'); g.addColorStop(0.62, '#1c1632'); g.addColorStop(1, '#120e22'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    // 벽돌
    for (let j = 0; j < 12; j++) for (let i = -1; i < 16; i++) {
      const bx = i * 78 + (j % 2) * 39, by = 10 + j * 30, n = hash(i + 7, j);
      x.fillStyle = n < 0.18 ? '#191429' : n > 0.9 ? '#2a2342' : '#221c37'; x.fillRect(bx, by, 74, 26);
      x.fillStyle = 'rgba(255,255,255,0.04)'; x.fillRect(bx, by, 74, 2);
      if (n > 0.8) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx + 10, by + 10, 22, 2); x.fillRect(bx + 30, by + 12, 2, 10); }
    }
    // 큰 아치 두 개
    for (const ax of [260, 820]) { x.fillStyle = '#0a0714'; x.beginPath(); x.moveTo(ax - 110, 380); x.lineTo(ax - 110, 150); x.arc(ax, 150, 110, Math.PI, 0); x.lineTo(ax + 110, 380); x.fill(); x.strokeStyle = '#3a3052'; x.lineWidth = 8; x.stroke(); }
    // 룬 문양 (벽)
    for (let k = 0; k < 6; k++) rune(x, 520 + k * 22, 120, k, 'rgba(199,125,255,0.5)', 3);
    // 바닥: 소실점으로 모이는 판석
    const fg = x.createLinearGradient(0, 380, 0, c.height); fg.addColorStop(0, '#1a1530'); fg.addColorStop(1, '#2b2345'); x.fillStyle = fg; x.fillRect(0, 380, c.width, c.height - 380);
    x.strokeStyle = 'rgba(60,50,90,0.9)'; x.lineWidth = 2;
    for (let k = 0; k < 8; k++) { const y = 380 + k * k * 4.4; x.beginPath(); x.moveTo(0, y); x.lineTo(c.width, y); x.stroke(); }
    for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(c.width / 2 + i * 34, 380); x.lineTo(c.width / 2 + i * 190, c.height); x.stroke(); }
    // 책장
    x.fillStyle = '#2c1c10'; x.fillRect(30, 160, 150, 220); x.fillStyle = '#150d07'; for (let r = 0; r < 5; r++) x.fillRect(40, 172 + r * 42, 130, 34);
    const books = ['#7a2418', '#2447a8', '#c89a3a', '#2d7f36', '#5a2a80', '#8a5a2b'];
    for (let r = 0; r < 5; r++) for (let b = 0; b < 14; b++) { const hh = 22 + ((hash(b, r) * 10) | 0); x.fillStyle = books[(b + r * 2) % 6]; x.fillRect(42 + b * 9, 206 + r * 42 - hh, 8, hh); x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(42 + b * 9, 206 + r * 42 - hh, 2, hh); }
    // 사슬
    for (const cx of [700, 760]) { x.fillStyle = '#4a4262'; for (let k = 0; k < 16; k++) x.fillRect(cx + (k % 2) * 3, k * 13, 5, 10); }
    if (blur) { const b = mk(c.width, c.height), bx = b.getContext('2d'); bx.filter = 'blur(' + blur + 'px)'; bx.drawImage(c, 0, 0); return b; }
    return c;
  }
  function floorCloseBG() {
    const c = mk(W + 260, H + 60), x = c.getContext('2d');
    x.fillStyle = '#130f22'; x.fillRect(0, 0, c.width, c.height);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 12; i++) {
      const n = hash(i + 40, j), bx = i * 118 - (j % 2) * 59, by = j * 74 - 20;
      x.fillStyle = n < 0.2 ? '#1a1530' : '#211a3a'; x.fillRect(bx + 3, by + 3, 112, 68);
      x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(bx + 3, by + 3, 112, 3);
      if (n > 0.82) { x.fillStyle = '#0e0b1a'; x.fillRect(bx + 20, by + 30, 40, 3); x.fillRect(bx + 58, by + 32, 3, 22); }
    }
    // 멀수록(위) 흐리게: 위쪽 절반만 흐린 사본을 덮는다
    const b = mk(c.width, c.height), bx = b.getContext('2d'); bx.filter = 'blur(4px)'; bx.drawImage(c, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0)');
    const m = mk(c.width, c.height), mx2 = m.getContext('2d'); mx2.drawImage(b, 0, 0); mx2.globalCompositeOperation = 'destination-in'; mx2.fillStyle = g; mx2.fillRect(0, 0, c.width, c.height);
    x.drawImage(m, 0, 0);
    return c;
  }
  function roomBG() {
    const c = mk(W + 160, H + 90), x = c.getContext('2d');
    x.fillStyle = '#2b2234'; x.fillRect(0, 0, c.width, 420);
    for (let i = 0; i < 40; i++) { x.fillStyle = i % 2 ? '#2f2640' : '#281f38'; x.fillRect(i * 28, 0, 14, 420); }
    x.fillStyle = '#3e2a20'; x.fillRect(0, 420, c.width, c.height - 420);
    for (let i = 0; i < 12; i++) { x.fillStyle = '#2e1f17'; x.fillRect(0, 426 + i * 16, c.width, 2); }
    // 창문: 밤하늘 · 달 · 도시 야경
    x.fillStyle = '#120e1a'; x.fillRect(60, 80, 260, 200);
    const sky = x.createLinearGradient(0, 84, 0, 276); sky.addColorStop(0, '#0b1230'); sky.addColorStop(1, '#2a2458'); x.fillStyle = sky; x.fillRect(66, 86, 248, 188);
    x.fillStyle = '#f4f0d0'; x.beginPath(); x.arc(260, 124, 18, 0, Math.PI * 2); x.fill(); x.fillStyle = '#0b1230'; x.beginPath(); x.arc(268, 118, 16, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 12; i++) { const bx = 66 + i * 21, bh = 40 + hash(i, 9) * 70; x.fillStyle = '#0a0a18'; x.fillRect(bx, 274 - bh, 19, bh); for (let w = 0; w < 10; w++) if (hash(i, w) > 0.55) { x.fillStyle = hash(w, i) > 0.5 ? '#ffd28a' : '#9fd4ff'; x.fillRect(bx + 3 + (w % 3) * 5, 278 - bh + Math.floor(w / 3) * 9, 3, 4); } }
    x.fillStyle = '#120e1a'; x.fillRect(60, 176, 260, 6); x.fillRect(186, 80, 6, 200);
    // 포스터 · 책상 · 모니터 · 과자
    x.fillStyle = '#c2553a'; x.fillRect(420, 90, 90, 120); x.fillStyle = '#f6c945'; x.fillRect(432, 104, 66, 30); x.fillStyle = '#1a1426'; x.fillRect(440, 150, 50, 6);
    x.fillStyle = '#5a3f2a'; x.fillRect(560, 300, 360, 18); x.fillStyle = '#3a271c'; x.fillRect(576, 318, 14, 110); x.fillRect(890, 318, 14, 110);
    x.fillStyle = '#1a1426'; x.fillRect(640, 196, 160, 104); x.fillStyle = '#3f7fc0'; x.fillRect(648, 204, 144, 84);
    x.fillStyle = '#6fb0e8'; for (let k = 0; k < 5; k++) x.fillRect(660, 216 + k * 14, 40 + hash(k, 1) * 80, 5);
    x.fillStyle = '#1a1426'; x.fillRect(710, 300, 20, 6);
    x.fillStyle = '#c2553a'; x.fillRect(830, 262, 38, 38); x.fillStyle = '#f6c945'; x.fillRect(838, 270, 22, 10);
    return c;
  }

  // 필름 입자
  function grainTex() { const c = mk(256, 256), x = c.getContext('2d'), d = x.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; } x.putImageData(d, 0, 0); return c; }

  const R = G.TUS_RENDER.prototype;
  R.prologue = function (s, now) {
    // 게임 캔버스는 검게, 실제 그림은 컷신 전용 캔버스(this.cine)에
    const low = this.x; low.setTransform(1, 0, 0, 1, 0, 0); low.fillStyle = '#000'; low.fillRect(0, 0, low.canvas.width, low.canvas.height);
    const cv = this.cine; if (!cv) return;
    const x = cv.getContext('2d'), t = LEN - s.stT, sc = sceneAt(t), u = Math.max(0, t - sc.t0), d = sc.t1 - sc.t0;
    const pls = s.players && s.players.length ? s.players : [{ name: '?', col: 0 }];
    if (!this.logoImg && typeof Image !== 'undefined') { this.logoImg = new Image(); this.logoImg.src = 'assets/logo.png?v=mudubld9'; }
    const C = this.cineCache || (this.cineCache = {});
    if (!C.grain) { C.grain = grainTex(); C.dunFar = dungeonBG(1.6); C.floor = floorCloseBG(); C.room = roomBG(); }
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    let shx = 0, shy = 0;
    if (this.proShake > 0) { shx = (Math.random() - 0.5) * this.proShake; shy = (Math.random() - 0.5) * this.proShake; this.proShake *= 0.9; }
    this.cx = x; this.cam = { sx: shx, sy: shy };
    this['cine_' + sc.id](x, u, d, now, pls, C);
    // 후처리: 색 보정 · 비네팅 · 필름 입자 · 영화 띠 · 페이드
    const grade = { ritual: 'rgba(90,40,160,0.10)', ants: 'rgba(120,60,200,0.08)', chant: 'rgba(150,40,160,0.12)', real: 'rgba(255,150,80,0.06)', souls: 'rgba(70,120,255,0.10)', title: 'rgba(90,40,160,0.08)' }[sc.id];
    x.globalCompositeOperation = 'overlay'; x.fillStyle = grade; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over';
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    const gx = -Math.floor(Math.random() * 256), gy = -Math.floor(Math.random() * 256);
    for (let yy = gy; yy < H; yy += 256) for (let xx = gx; xx < W; xx += 256) x.drawImage(C.grain, xx, yy);
    x.fillStyle = '#000'; x.fillRect(0, 0, W, LB); x.fillRect(0, H - LB, W, LB);
    const f = Math.max(0, 1 - u / 0.45, sc.id === 'title' ? 0 : 1 - (d - u) / 0.45);
    if (f > 0) { x.fillStyle = 'rgba(0,0,0,' + Math.min(1, f).toFixed(2) + ')'; x.fillRect(0, 0, W, H); }
  };

  // 카메라: 층마다 패럴랙스 배율(p)이 다르다. zoom·pan 은 장면 함수가 준다
  function layer(x, cam, p, fn) {
    x.save();
    x.translate(W / 2 + cam.sx * p, H / 2 + cam.sy * p); x.scale(1 + (cam.z - 1) * p, 1 + (cam.z - 1) * p); x.translate(-W / 2 - cam.px * p, -H / 2 - cam.py * p);
    fn(); x.restore();
  }
  // 색수차: 방금 그린 화면을 빨강/파랑으로 살짝 어긋나게 겹친다
  function aberration(x, amt) {
    if (amt <= 0) return;
    const c = x.canvas, tmp = R._abTmp || (R._abTmp = mk(W, H)), tx = tmp.getContext('2d');
    tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, W, H); tx.drawImage(c, 0, 0);
    x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.35;
    x.filter = 'sepia(1) saturate(8) hue-rotate(-50deg)'; x.drawImage(tmp, -amt, 0);
    x.filter = 'sepia(1) saturate(8) hue-rotate(170deg)'; x.drawImage(tmp, amt, 0);
    x.restore(); x.filter = 'none';
  }

  // ---------- 장면 ----------
  R.cine_ritual = function (x, u, d, now, pls, C) {
    const k = ease(u / d), cam = Object.assign({ z: lerp(1.0, 1.1, k), px: lerp(-30, 30, k), py: 0 }, this.cam);
    layer(x, cam, 0.35, () => x.drawImage(C.dunFar, -80, -45));
    rays(x, 180, -40, 1.15, 0.12, 700, 5, 'rgba(170,150,255,A)', now);
    layer(x, cam, 1, () => {
      x.translate(0, -30); // 마법진이 아래 영화 띠에 잘리지 않게
      const cx = 590, cy = 440, rx = 250, ry = 66, ck = Math.min(1, u / 4.2), to = ck * Math.PI * 2;
      glow(x, cx, cy, 300, 'rgba(150,90,255,' + (0.05 + ck * 0.14).toFixed(2) + ')');
      magicCircle(x, cx, cy, rx, ry, to, 0.95, null, 0, 4);
      const lx = cx + Math.cos(to) * rx, ly = cy + Math.sin(to) * ry;
      if (ck < 1) { glow(x, lx, ly, 46, 'rgba(240,220,255,0.7)'); x.fillStyle = '#fff'; x.fillRect(lx - 3, ly - 3, 6, 6); }
      [[0.3, 0], [1.5, 1], [2.7, 2], [3.9, 3], [5.1, 4]].forEach(([a, i]) => candle(x, cx + Math.cos(a) * rx * 1.12, cy + Math.sin(a) * ry * 1.12 + 6, 2.2, now, i));
      px(x, this.spr.wiz, 330, 455, 9);
      x.fillStyle = '#a9aec0'; x.fillRect(386, 290, 8, 165); x.fillStyle = '#1a1426'; x.fillRect(372, 262, 36, 36); x.fillStyle = '#e04a4a'; x.fillRect(376, 266, 28, 28); x.fillStyle = '#fff'; x.fillRect(384, 272, 8, 8);
      glow(x, 330, 300, 150, 'rgba(110,150,255,0.14)');
      // 손끝에서 흩뿌려지는 가루 (포물선)
      for (let i = 0; i < 40; i++) { const p = ((now * 0.9 + i / 40) % 1), hx = 380, hy = 330, qx = lerp(hx, lx, p), qy = lerp(hy, ly, p) - Math.sin(p * Math.PI) * 70; x.fillStyle = i % 3 ? 'rgba(235,220,255,0.95)' : 'rgba(180,140,255,0.95)'; x.fillRect(qx, qy, 2, 2); }
    });
    // 가까운 전경: 크게 흐린 촛불과 사슬
    layer(x, cam, 1.6, () => { x.save(); x.filter = 'blur(6px)'; candle(x, 60, 560, 5, now, 9); x.fillStyle = '#2a2240'; for (let k2 = 0; k2 < 10; k2++) x.fillRect(930 + (k2 % 2) * 6, k2 * 34 - 40, 14, 26); x.restore(); x.filter = 'none'; });
    this.cineMotes(x, now, 'rgba(230,220,255,');
  };
  R.cine_ants = function (x, u, d, now, pls, C) {
    const k = ease(u / d), cam = Object.assign({ z: 1.05, px: lerp(-60, 90, k), py: 0 }, this.cam);
    layer(x, cam, 0.8, () => x.drawImage(C.floor, -130, -30));
    layer(x, cam, 1, () => {
      const cx = 420, cy = 820, rx = 760, ry = 500, g0 = 5.0, gap = [g0, g0 + 0.03 + (u / d) * 0.16];
      glow(x, 480, 330, 420, 'rgba(150,90,255,0.10)');
      magicCircle(x, cx, cy, rx, ry, Math.PI * 2, 1, gap, 0, 7);
      for (let i = 0; i < 60; i++) { const a = gap[0] + hash(i, 5) * (gap[1] - gap[0]), rr = 1 + (hash(i, 9) - 0.5) * 0.05; x.fillStyle = 'rgba(215,190,255,0.6)'; x.fillRect(cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr, 3, 3); }
      const gx = cx + Math.cos(gap[1]) * rx, gy = cy + Math.sin(gap[1]) * ry;
      for (let i = 0; i < 10; i++) {
        const p = ((u * 0.16 + i / 10) % 1), ax = gx - 40 + p * 900, ay = gy + 20 + p * 170 + Math.sin(p * 9 + i) * 10, bob = Math.floor(now * 12 + i) % 2 * 3;
        px(x, this.spr.ant, ax, ay + bob, 7);
        x.fillStyle = '#1a1426'; x.fillRect(ax - 12, ay - 64 + bob, 24, 22); x.fillStyle = '#efe2ff'; x.fillRect(ax - 9, ay - 61 + bob, 18, 16);
        glow(x, ax, ay - 53 + bob, 40, 'rgba(210,180,255,0.45)');
      }
    });
    // 전경: 초점 밖에서 지나가는 큰 개미
    layer(x, cam, 1.5, () => { x.save(); x.filter = 'blur(7px)'; const p = (u / d), ax = lerp(1100, -200, p); px(x, this.spr.ant, ax, 640, 20); x.restore(); x.filter = 'none'; });
    this.cineMotes(x, now, 'rgba(210,190,255,');
  };
  R.cine_chant = function (x, u, d, now, pls, C) {
    const k = ease(u / d), cam = Object.assign({ z: lerp(1.18, 1.34, k), px: -160, py: 40 }, this.cam);
    layer(x, cam, 0.35, () => x.drawImage(C.dunFar, -80, -45));
    const pulse = 0.6 + Math.sin(now * 9) * 0.3;
    layer(x, cam, 1, () => {
      x.translate(0, -30); // 마법진이 아래 영화 띠에 잘리지 않게
      const cx = 590, cy = 440, rx = 250, ry = 66;
      glow(x, cx, cy, 340, 'rgba(180,90,255,' + (0.14 + pulse * 0.1 + u * 0.03).toFixed(2) + ')');
      magicCircle(x, cx, cy, rx, ry, Math.PI * 2, Math.min(1, 0.7 + pulse * 0.3), [0.35, 0.95], Math.floor(now * 8) % 2 ? 1 : 0.25, 4);
      for (let i = 0; i < 26; i++) { const p = ((u * 0.45 + i / 26) % 1), a = hash(i, 3) * Math.PI * 2; if (a > 0.35 && a < 0.95) continue; x.globalAlpha = 1 - p; rune(x, cx + Math.cos(a) * rx * 0.85, cy + Math.sin(a) * ry * 0.85 - p * 220, i, '#e8d6ff', 3); x.globalAlpha = 1; }
      [[0.3, 0], [1.5, 1], [2.7, 2], [3.9, 3], [5.1, 4]].forEach(([a, i]) => candle(x, cx + Math.cos(a) * rx * 1.12, cy + Math.sin(a) * ry * 1.12 + 6, 2.2, now + i, i));
      px(x, this.spr.wiz, 330, 455, 9);
      // 치켜든 지팡이 + 렌즈 플레어
      x.fillStyle = '#a9aec0'; x.fillRect(388, 170, 8, 200); x.fillStyle = '#1a1426'; x.fillRect(374, 136, 36, 36); x.fillStyle = '#e04a4a'; x.fillRect(378, 140, 28, 28); x.fillStyle = '#fff'; x.fillRect(386, 146, 8, 8);
      const fl = 0.5 + u / d * 0.5;
      glow(x, 392, 154, 180, 'rgba(210,140,255,' + (0.35 * fl).toFixed(2) + ')'); glow(x, 392, 154, 40, 'rgba(255,255,255,0.6)');
      x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,220,255,' + (0.25 * fl).toFixed(2) + ')'; x.fillRect(392 - 260 * fl, 152, 520 * fl, 3); x.restore();
      for (const [dx2, rr, a] of [[120, 14, 0.18], [230, 26, 0.12], [330, 9, 0.2]]) glow(x, 392 + dx2, 154 + dx2 * 0.4, rr, 'rgba(180,140,255,' + a + ')');
      bubble(x, 300, 110, '오너라… 전설의 용사여!', u * 14);
      // 바람선
      x.strokeStyle = 'rgba(220,200,255,0.25)'; x.lineWidth = 2; for (let i = 0; i < 8; i++) { const yy = 200 + i * 40, off = (now * 400 + i * 97) % 1200 - 200; x.beginPath(); x.moveTo(off, yy); x.lineTo(off + 120, yy - 8); x.stroke(); }
    });
    if (u > 2.4) this.proShake = Math.max(this.proShake || 0, 6);
    aberration(x, u > 2.6 ? (u - 2.6) * 8 : 0);
  };
  R.cine_real = function (x, u, d, now, pls, C) {
    const grab = u > 3.4, k = ease(u / d);
    const cam = Object.assign({ z: lerp(1.02, grab ? 1.16 : 1.08, k), px: lerp(-20, 20, k), py: grab ? -20 : 0 }, this.cam);
    layer(x, cam, 0.6, () => x.drawImage(C.room, -80, -45));
    glow(x, 720, 250, 260, 'rgba(90,160,255,0.16)'); glow(x, 480, 0, 500, 'rgba(255,190,120,0.10)');
    const portal = u > 2.6 ? Math.min(1, (u - 2.6) / 0.6) : 0;
    layer(x, cam, 1, () => {
      if (portal > 0) {
        rays(x, 480, 10, Math.PI / 2, 0.22, 560, 7, 'rgba(190,120,255,A)', now);
        for (let r2 = 0; r2 < 8; r2++) { x.strokeStyle = 'rgba(' + (150 + r2 * 12) + ',90,255,' + (0.9 - r2 * 0.09).toFixed(2) + ')'; x.lineWidth = 5; x.beginPath(); x.ellipse(480, 30, (60 + r2 * 40) * portal, (10 + r2 * 8) * portal, 0, now * (r2 % 2 ? 2 : -2), now * (r2 % 2 ? 2 : -2) + Math.PI * 1.6); x.stroke(); }
        glow(x, 480, 30, 380 * portal, 'rgba(170,100,255,0.45)');
      }
      const n = pls.length, lines = ['니가 해!', '아 왜 나야', '너 때문이잖아', '조용히 좀 해!'];
      const lift = grab ? Math.pow(u - 3.4, 2) * 620 : 0;
      pls.forEach((pl, i) => {
        const cx = n === 1 ? 460 : 250 + i * (440 / (n - 1)), by = 490;
        const yy = by - lift * (1 + i * 0.12), col = PCOL[pl.col || 0], spr = personSprite(col, HAIR[i % 4], grab);
        if (grab) for (let g2 = 1; g2 <= 3; g2++) { x.globalAlpha = 0.18; px(x, spr, cx, yy + g2 * 34, 8); } // 끌려가는 잔상
        x.globalAlpha = 1;
        const jitter = !grab && Math.floor(now * 6 + i) % 2 ? 2 : 0;
        px(x, spr, cx, yy - jitter, 8);
        x.font = '20px "Galmuri11", monospace'; x.textAlign = 'center'; x.fillStyle = '#1a1426'; x.fillText(pl.name, cx + 2, yy - 122); x.fillStyle = col; x.fillText(pl.name, cx, yy - 124);
        if (!grab && u < 2.4 && Math.floor(u * 1.6 + i) % 2 === 0) bubble(x, cx, yy - 150, lines[(i + Math.floor(u * 1.6)) % 4], null, 18);
        if (portal > 0.5) {
          const hy = Math.min(yy - 108, 30 + (u - 2.9) * 700);
          x.fillStyle = 'rgba(150,90,230,0.9)'; x.fillRect(cx - 10, 30, 20, Math.max(0, hy - 50));
          x.fillStyle = 'rgba(165,105,245,0.97)'; x.fillRect(cx - 24, hy - 50, 48, 30); for (let f2 = 0; f2 < 4; f2++) x.fillRect(cx - 24 + f2 * 13, hy - 20, 9, 22);
          x.fillStyle = 'rgba(235,215,255,0.9)'; x.fillRect(cx - 4, 30, 3, Math.max(0, hy - 50));
          glow(x, cx, hy - 30, 60, 'rgba(190,130,255,0.4)');
        }
      });
    });
    if (u > 2.4 && u < 3.0 && Math.floor(now * 14) % 2) { x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 0, W, H); }
    if (grab && u < 3.7) { this.proShake = 10; aberration(x, 6); }
  };
  R.cine_souls = function (x, u, d, now, pls, C) {
    const k = ease(u / d), cam = Object.assign({ z: lerp(1.1, 1.3, k), px: -110, py: 30 }, this.cam);
    layer(x, cam, 0.35, () => { x.drawImage(C.dunFar, -80, -45); });
    x.fillStyle = 'rgba(5,4,12,0.55)'; x.fillRect(0, 0, W, H);
    const n = pls.length; let eye = null;
    layer(x, cam, 1, () => {
      x.translate(0, -30); // 마법진이 아래 영화 띠에 잘리지 않게
      magicCircle(x, 590, 440, 250, 66, Math.PI * 2, 0.25, [0.35, 0.95], 0, 4);
      pls.forEach((pl, i) => {
        const st = 0.3 + i * 0.3, p = Math.min(1, Math.max(0, (u - st) / 2.2)), col = PCOL[pl.col || 0];
        if (p >= 1) { eye = col; return; }
        if (u < st) return;
        const pos = q => { const a = i / n * Math.PI * 2 + q * 7, r = 420 * (1 - q); return [330 + Math.cos(a) * r, 290 + Math.sin(a) * r * 0.5]; };
        // 긴 꼬리
        x.save(); x.globalCompositeOperation = 'lighter'; x.strokeStyle = col; x.lineCap = 'round';
        for (let tr = 12; tr > 0; tr--) { const a0 = pos(Math.max(0, p - tr * 0.012)), a1 = pos(Math.max(0, p - (tr - 1) * 0.012)); x.globalAlpha = (1 - tr / 12) * 0.8; x.lineWidth = 14 * (1 - tr / 12) + 2; x.beginPath(); x.moveTo(a0[0], a0[1]); x.lineTo(a1[0], a1[1]); x.stroke(); }
        x.restore();
        const q = pos(p); glow(x, q[0], q[1], 60, 'rgba(255,255,255,0.35)'); x.fillStyle = '#fff'; x.beginPath(); x.arc(q[0], q[1], 7, 0, Math.PI * 2); x.fill();
        x.font = '20px "Galmuri11", monospace'; x.textAlign = 'center'; x.fillStyle = col; x.fillText(pl.name, q[0], q[1] - 18);
      });
      if (u > 0.3 + (n - 1) * 0.3 + 2.2) eye = PCOL[pls[Math.floor(now * 4) % n].col || 0];
      const tr = eye ? (Math.random() - 0.5) * 6 : 0;
      px(x, this.spr.wiz, 330 + tr, 455, 9);
      if (eye) { x.fillStyle = eye; x.fillRect(330 - 18 + tr, 365, 9, 9); x.fillRect(330 + 9 + tr, 365, 9, 9); glow(x, 330, 370, 90, 'rgba(255,255,255,0.35)'); } // 눈: 스프라이트 10행 5·8열
      glow(x, 330, 300, 200, 'rgba(120,150,255,0.18)');
    });
    if (u < 0.7) { x.fillStyle = 'rgba(255,255,255,' + (1 - u / 0.7).toFixed(2) + ')'; x.fillRect(0, 0, W, H); aberration(x, (0.7 - u) * 14); }
  };
  R.cine_title = function (x, u, d, now, pls, C) {
    x.fillStyle = '#07060d'; x.fillRect(0, 0, W, H);
    glow(x, W / 2, H / 2 - 30, 520, 'rgba(120,80,230,0.28)');
    rays(x, W / 2, -60, Math.PI / 2, 0.16, 640, 7, 'rgba(170,140,255,A)', now);
    for (let i = 0; i < 90; i++) { const pxx = hash(i, 1) * W, py = ((hash(i, 2) * H - u * 24 * (1 + hash(i, 3))) % H + H) % H; x.fillStyle = 'rgba(210,190,255,' + (0.3 + hash(i, 4) * 0.5).toFixed(2) + ')'; x.fillRect(pxx, py, 2, 2); }
    const a = ease(u / 0.9), z = lerp(1.08, 1, ease(u / d));
    x.save(); x.globalAlpha = a; x.translate(W / 2, H / 2); x.scale(z, z); x.translate(-W / 2, -H / 2);
    if (this.logoImg && this.logoImg.complete && this.logoImg.naturalWidth) {
      x.imageSmoothingEnabled = true; const w = 560, h = w * this.logoImg.naturalHeight / this.logoImg.naturalWidth;
      x.shadowColor = 'rgba(170,120,255,0.9)'; x.shadowBlur = 30; x.drawImage(this.logoImg, W / 2 - w / 2, 70, w, h); x.shadowBlur = 0;
      // 빛이 쓸고 지나감
      const sw = ((u - 0.6) / 1.4) * (W + 400) - 200;
      if (sw > -200 && sw < W + 200) { x.globalCompositeOperation = 'lighter'; const g = x.createLinearGradient(sw - 80, 0, sw + 80, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(W / 2 - w / 2, 70, w, h); x.globalCompositeOperation = 'source-over'; }
    }
    x.textAlign = 'center'; x.font = '34px "Galmuri14", "Galmuri11", monospace'; x.fillStyle = '#ece8ff'; x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = 8; x.fillText('소환되고 싶지 않아', W / 2, 408);
    x.font = '22px "Galmuri11", monospace'; x.fillStyle = '#d29bff'; x.fillText('(니들이랑)', W / 2, 442); x.shadowBlur = 0;
    x.restore();
  };
  // 공중에 떠다니는 먼지 (빛 속에서 반짝)
  R.cineMotes = function (x, now, col) {
    for (let i = 0; i < 60; i++) { const px2 = ((hash(i, 11) * W + now * (6 + hash(i, 12) * 10)) % W), py = ((hash(i, 13) * H - now * (4 + hash(i, 14) * 8)) % H + H) % H, a = 0.3 + Math.sin(now * 2 + i) * 0.25; x.fillStyle = col + a.toFixed(2) + ')'; x.fillRect(px2, py, 2, 2); }
  };

  G.TUS_PROLOGUE = { LEN, SCENES, CUES, subtitle };
})(typeof window !== 'undefined' ? window : globalThis);
