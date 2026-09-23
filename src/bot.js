// 자동 조종 봇 — 검증(tools/sim-test.js)과 데모 화면(?demo)용. 모든 역할을 혼자 맡은 입력 하나를 조작한다.
(function (G) {
  'use strict';
  const T = 16;
  function Bot() { this.jumpCd = 0; this.clickCd = 0; }
  Bot.prototype.drive = function (g, I, dt) {
    const b = g.body;
    const k = I.k = { w: false, s: false, a: false, d: false, sh: false, sp: false, c: false };
    this.jumpCd -= dt; this.clickCd -= dt;
    if (g.state === 'vote' && g.vote) { I.vk = g.vote.id; I.vi = 0; return; }
    if (g.state !== 'play') return;
    const room = g.level.rooms[g.roomIdx];
    const inRoom = room && room.active;
    let tx = b.x, ty = b.y - 40;

    // 조준: 가장 가까운 지상 적 / 공중 적
    let ground = null, gd = 1e9, air = null, ad = 1e9;
    for (const e of g.enemies) {
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if ((e.k === 'ant' || e.k === 'queen' || e.k === 'egg') && d < gd) { gd = d; ground = e; }
      if (e.k === 'fly' && d < ad) { ad = d; air = e; }
    }
    if (inRoom) {
      if (ground) {
        // 적과 거리를 유지하며 쏜다
        const dx = b.x - ground.x, dy = b.y - ground.y, d = Math.hypot(dx, dy) || 1;
        const want = ground.k === 'egg' ? 10 : 60;
        const ox = ground.x + dx / d * want, oy = ground.y + dy / d * want;
        tx = ox + Math.sin(g.time * 1.3) * 20; ty = oy;
      } else if (air) { tx = air.x; ty = air.y + 50; }
      else { tx = (room.x0 + room.x1) / 2; ty = room.y0 - 20; }
    } else if (room && room.cleared) { tx = (room.x0 + room.x1) / 2; ty = room.topRow * T - 30; }
    else {
      // 계단: 바로 위 줄에서 가장 가까운 바닥 칸으로
      const r = Math.floor((b.y - 20) / T);
      let best = null, bd = 1e9;
      for (let c = 0; c < g.level.w; c++) {
        const t = g.tile(c, r);
        if (t === '.' || t === 'D') { const d = Math.abs(c * T + 8 - b.x); if (d < bd) { bd = d; best = c * T + 8; } }
      }
      tx = best == null ? 192 : best; ty = b.y - 40;
      // 굴러오는 술통은 옆으로 피한다
      for (const o of g.rollers) if (o.k === 'barrel' && b.y - o.y > -4 && b.y - o.y < 60 && Math.abs(o.x - b.x) < 18) tx = b.x + (b.x >= o.x ? 30 : -30);
    }
    const dx = tx - b.x, dy = ty - b.y;
    if (dx < -4) k.a = true; else if (dx > 4) k.d = true;
    if (dy < -4) k.w = true; else if (dy > 4) k.s = true;
    if (!inRoom) k.sh = true;

    // 구덩이 앞이면 점프
    if (!inRoom && b.z <= 0 && this.jumpCd <= 0 && g.tileAtPx(b.x, b.y - 14) === ' ') { I.cj++; this.jumpCd = 0.4; }
    // 들보 앞이면 슬라이딩 / 숙이기
    for (const o of g.level.obs) {
      if (!o.alive) continue;
      const above = b.y - o.y1;
      if (o.k === 'beam' && above > -8 && above < 22 && b.x > o.x0 && b.x < o.x1) { if (!I._c) I.cc++; k.c = true; }
      if (o.k === 'bar' && above > -2 && above < 22 && this.clickCd <= 0) { I.mx = b.x; I.my = b.y - 30; I.cl++; this.clickCd = 0.3; }
    }
    I._c = k.c;
    // 굴러오는 통나무는 망치로
    for (const o of g.rollers) if (o.k === 'log' && b.y - o.y > 0 && b.y - o.y < 30 && this.clickCd <= 0) { I.mx = b.x; I.my = o.y; I.cl++; this.clickCd = 0.25; }
    // 오른손: 지상 적 / 정령: 공중 적 (마우스가 하나라 번갈아 조준)
    const flip = Math.floor(g.time * 3) % 2 === 0;
    if (air && (flip || !ground)) { I.mx = air.x; I.my = air.y - 22; I.rb = 0; }
    else if (ground && gd < 110) {
      I.mx = ground.x; I.my = ground.y; I.rb = ground.k === 'egg' ? 0 : 1;
      if ((ground.k === 'egg' || ground.k === 'queen') && gd < 34 && this.clickCd <= 0) { I.cl++; this.clickCd = 0.3; }
    } else { I.rb = 0; if (this.clickCd > 0.1 && I.mx == null) { I.mx = b.x; I.my = b.y - 30; } }
    // 적 투사체가 가까우면 마우스를 그쪽으로 (방어 정령)
    let near = null, nd = 50;
    for (const s of g.eshots) { const d = Math.hypot(s.x - b.x, s.y - b.y); if (d < nd) { nd = d; near = s; } }
    if (near) { I.mx = near.x; I.my = near.y; }
  };
  G.TUS_BOT = Bot;
})(typeof window !== 'undefined' ? window : globalThis);
