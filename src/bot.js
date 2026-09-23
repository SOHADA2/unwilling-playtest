// 자동 조종 봇 — 검증(tools/sim-test.js)과 데모 화면(?demo)용. 모든 역할을 혼자 맡은 입력 하나를 조작한다.
(function (G) {
  'use strict';
  const T = 16;
  // 출구까지 남은 비용 (길 위 칸만, 한 번 계산). 낭떠러지 옆 칸은 비싸게 → 가장자리를 타지 않고 가운데로 간다
  function goalField(lv) {
    if (lv._goal) return lv._goal;
    let mx = -1; for (const row of lv.dist) for (const d of row) if (d > mx) mx = d;
    const f = lv.dist.map(row => row.map(() => 1e9)), q = [];
    const edgy = (r, c) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const t = lv.rows[r + dr] && lv.rows[r + dr][c + dc]; if (t === ' ' || t === ',' || t === 'o') return true; } return false; };
    lv.dist.forEach((row, r) => row.forEach((d, c) => { if (d === mx) { f[r][c] = 0; q.push([r, c]); } }));
    while (q.length) { // 칸이 적어 단순 반복 완화로 충분
      const [r, c] = q.shift();
      for (const [dr, dc] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (!(lv.dist[rr] && lv.dist[rr][cc] >= 0) || lv.rows[rr][cc] === ',') continue; // 다리 옆 허공은 길이 아니다
        const nv = f[r][c] + (edgy(rr, cc) ? 4 : 1);
        if (nv < f[rr][cc]) { f[rr][cc] = nv; q.push([rr, cc]); }
      }
    }
    return (lv._goal = f);
  }
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
      if ((e.k === 'ant' || e.k === 'spit' || e.k === 'queen' || e.k === 'egg') && d < gd) { gd = d; ground = e; }
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
    } else if (room && room.cleared) {
      // 위쪽 문 한가운데로
      let sx = 0, n = 0; const row = g.level.rows[room.topRow]; for (let c = 0; c < g.level.w; c++) if (row[c] === 'D') { sx += c * T + 8; n++; }
      tx = n ? sx / n : (room.x0 + room.x1) / 2; ty = room.topRow * T - 30;
    } else {
      // 계단: 출구(보스 문)까지 남은 거리가 1씩 줄어드는 이웃 칸을 3칸 따라가 목표로 (모퉁이를 제대로 돌고, 막다른 구석에 안 빠진다)
      const lv = g.level, goal = goalField(lv); let r = Math.floor(b.y / T), c = Math.floor(b.x / T);
      const nearEdge = [[-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([dr, dc]) => { const t = lv.rows[r + dr] && lv.rows[r + dr][c + dc]; return t === ','; });
      for (let k = 0; k < (nearEdge ? 1 : 3); k++) {
        let best = goal[r] ? goal[r][c] : 1e9, nx = null;
        for (const [dr, dc] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
          const rr = r + dr, cc = c + dc, t = lv.rows[rr] && lv.rows[rr][cc];
          if (goal[rr] && goal[rr][cc] < best && t && t !== ',') { best = goal[rr][cc]; nx = [rr, cc]; }
        }
        if (!nx) break; r = nx[0]; c = nx[1];
      }
      tx = c * T + 8; ty = r * T + 8;
      // 굴러오는 술통은 옆으로 피한다
      for (const o of g.rollers) if (o.k === 'barrel' && b.y - o.y > -4 && b.y - o.y < 60 && Math.abs(o.x - b.x) < 18) tx = b.x + (b.x >= o.x ? 30 : -30);
    }
    const dx = tx - b.x, dy = ty - b.y;
    if (dx < -4) k.a = true; else if (dx > 4) k.d = true;
    if (dy < -4) k.w = true; else if (dy > 4) k.s = true;
    if (!inRoom) k.sh = true;
    if (g.sab && g.sab.phase === 'on' && g.sab.kind === 'rev') { [k.a, k.d] = [k.d, k.a]; [k.w, k.s] = [k.s, k.w]; } // 조작 반전 중엔 거꾸로 누른다

    // 가는 방향 앞이 구덩이면 점프
    const dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    const ahead = g.tileAtPx(b.x + ux * 14, b.y + uy * 14);
    if (!inRoom && b.z <= 0 && this.jumpCd <= 0 && ahead === ' ') { I.cj++; this.jumpCd = 0.4; }
    // 가는 방향 앞의 들보는 숙여서, 바리케이드는 망치로 (가로·세로 모두)
    for (const o of g.level.obs) {
      if (!o.alive) continue;
      const near = (px, py) => px > o.x0 - 2 && px < o.x1 + 2 && py > o.y0 - 2 && py < o.y1 + 2;
      const soon = near(b.x + ux * 20, b.y + uy * 20) || near(b.x + ux * 10, b.y + uy * 10) || near(b.x, b.y);
      if (o.k === 'beam' && soon) { if (!I._c) I.cc++; k.c = true; }
      if (o.k === 'bar' && soon) this.barAim = [b.x + ux * 30, b.y + uy * 30]; // 조준은 맨 마지막에 (적 조준이 덮어쓰지 않게)
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
    if (this.barAim) { I.mx = this.barAim[0]; I.my = this.barAim[1]; if (this.clickCd <= 0) { I.cl++; this.clickCd = 0.3; } this.barAim = null; }
  };
  G.TUS_BOT = Bot;
})(typeof window !== 'undefined' ? window : globalThis);
