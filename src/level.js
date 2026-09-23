// 마탑 B3층 레벨 — 탑 안을 지그재그로 감아 오르는 계단. 격자 36칸 x N줄, 한 칸 = 16px.
// 기호: '#' 탑 외벽 · 'o' 난간 너머 허공(못 지나감, 떨어지지도 않음) · '.' 바닥
//       ' ' 구덩이(점프로 넘기, 빠지면 점프 담당 탓) · ',' 다리 옆 낭떠러지(빠지면 좌우 담당 탓)
//       'B'/'b' 바리케이드 가로/세로(왼손 망치) · 'L'/'l' 낮은 들보 가로/세로(앉기·슬라이딩)
//       'g' 개미 병정 · 'f' 날개 개미 · 'S' 시작점 · 'D' 방 문 · 'R' 통나무 굴리는 곳 · 'O' 상자 미끄러뜨리는 곳
// 섹션은 "플레이 순서"(아래 → 위)로 나열하고, 섹션 안에서는 좌표로 조각한다(위 → 아래 줄 번호).
// 높이: 시작점에서 길을 따라 걸은 거리(BFS)로 정한다 — 계단 칸마다 한 단(STEP px)씩 높아지고, 방은 평평하다.
(function (G) {
  'use strict';
  const T = 16, W = 36, STEP = 4;

  function blank(h, ch) { return Array.from({ length: h }, () => Array(W).fill(ch || 'o')); }
  function carve(g, r0, r1, c0, c1, ch) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch; }
  function put(g, r, c, ch) { g[r][c] = ch; }

  function sections() {
    // ---------- 계단 1: 시작 방 → 오른쪽 계단(위로) → 층계참 → 왼쪽으로 가로 계단 → 층계참 → 왼쪽 계단(위로) ----------
    const s1 = blank(44);
    carve(s1, 0, 43, 0, 1, '#');                 // 탑 외벽
    carve(s1, 36, 42, 20, 33, '.');              // 시작 방 (훈련장)
    carve(s1, 22, 35, 24, 29, '.');              // 계단 A (위로)
    carve(s1, 15, 21, 22, 31, '.');              // 층계참 A
    carve(s1, 16, 20, 8, 21, '.');               // 계단 B (왼쪽으로)
    carve(s1, 12, 21, 2, 7, '.');                // 층계참 B
    carve(s1, 0, 11, 2, 7, '.');                 // 계단 C (위로)
    put(s1, 40, 26, 'S');
    carve(s1, 33, 33, 24, 29, 'B');              // 바리케이드
    carve(s1, 29, 30, 24, 29, ' ');              // 구덩이 (2줄)
    carve(s1, 26, 26, 24, 29, 'L');              // 들보
    put(s1, 24, 25, 'g'); put(s1, 24, 28, 'g');
    put(s1, 22, 27, 'O');                        // 상자가 계단 A를 미끄러져 내려온다
    put(s1, 17, 26, 'f');
    carve(s1, 16, 20, 18, 18, 'b');              // 세로 바리케이드 (가로 계단)
    carve(s1, 16, 20, 13, 14, ' ');              // 구덩이 (2칸)
    carve(s1, 16, 20, 10, 10, 'l');              // 세로 들보
    put(s1, 18, 16, 'g');
    carve(s1, 9, 9, 2, 7, 'L');
    carve(s1, 5, 7, 2, 7, ' ');                  // 넓은 구덩이 (3줄 — 달려서 점프)
    put(s1, 2, 3, 'g'); put(s1, 2, 6, 'g');

    // ---------- 방 1: 아래 문(왼쪽) → 위 문(오른쪽) ----------
    const r1 = blank(13, '#');
    carve(r1, 1, 11, 1, 34, '.');
    for (const [rr, cc] of [[3, 6], [3, 28], [8, 6], [8, 28]]) carve(r1, rr, rr + 1, cc, cc + 1, '#');
    carve(r1, 0, 0, 26, 31, 'D');
    carve(r1, 12, 12, 2, 7, 'D');

    // ---------- 계단 2: 오른쪽 계단(위로, 통나무) → 층계참 → 왼쪽으로 가다 꺾인 다리 → 층계참 → 왼쪽 계단(위로) ----------
    const s2 = blank(46);
    carve(s2, 0, 45, 0, 1, '#');
    carve(s2, 28, 45, 26, 31, '.');              // 계단 D (위로)
    carve(s2, 21, 27, 24, 33, '.');              // 층계참 D
    carve(s2, 22, 26, 16, 23, '.');              // 계단 E (왼쪽으로)
    carve(s2, 11, 26, 8, 15, ',');               // 꺾인 다리 둘레 낭떠러지
    for (let i = 0; i < 10; i++) carve(s2, 25 - i, 25 - i, 12 - Math.floor(i / 2), 15 - Math.floor(i / 2), '.'); // 왼쪽 위로 비스듬한 다리
    carve(s2, 6, 16, 2, 9, '.');                 // 층계참 E
    carve(s2, 0, 5, 2, 7, '.');                  // 계단 F (위로)
    put(s2, 29, 28, 'R');                        // 통나무가 계단 D를 굴러 내려온다
    carve(s2, 36, 36, 26, 31, 'L');
    carve(s2, 42, 42, 26, 31, 'B');
    put(s2, 32, 28, 'f');
    put(s2, 23, 29, 'f');
    carve(s2, 22, 26, 20, 20, 'b');
    put(s2, 10, 4, 'g'); put(s2, 10, 7, 'g');
    carve(s2, 2, 3, 2, 7, ' ');

    // ---------- 보스방 ----------
    const bs = blank(13, '#');
    carve(bs, 1, 11, 1, 34, '.');
    carve(bs, 12, 12, 2, 7, 'D');

    return [
      { kind: 'stair', rows: s1, circles: [[18, 26.5], [16.5, 4.5]] },
      { kind: 'room', rows: r1, waves: [{ ant: 4, fly: 0 }, { ant: 3, fly: 2 }] },
      { kind: 'stair', rows: s2, circles: [[24, 28.5], [11, 5.5]] },
      { kind: 'boss', rows: bs },
    ];
  }

  function build() {
    const secs = sections();
    // 맵은 위 → 아래 순서로 쌓는다 (플레이 순서의 역순)
    const grid = [], marks = [];
    for (let i = secs.length - 1; i >= 0; i--) { marks[i] = grid.length; grid.push(...secs[i].rows.map(r => r.slice())); }
    const h = grid.length;
    const lv = { T, w: W, h, STEP, grid, rows: null, spawns: [], obs: [], rooms: [], doorRows: {}, hints: [], start: null, rollers: [], rowKind: [], circles: [], dist: null, th: null };
    secs.forEach((s, i) => {
      for (let k = 0; k < s.rows.length; k++) lv.rowKind[marks[i] + k] = s.kind === 'stair' ? 'stair' : 'room';
      for (const [rr, cc] of s.circles || []) lv.circles.push({ x: cc * T + 8, y: (marks[i] + rr) * T + 8 });
    });

    // 방 메타데이터
    secs.forEach((s, i) => {
      if (s.kind === 'room' || s.kind === 'boss') {
        const top = marks[i], bottom = marks[i] + s.rows.length - 1;
        lv.rooms.push({
          kind: s.kind, topRow: top, bottomRow: bottom, lockY: top * T - 4,
          x0: T, x1: (W - 1) * T, y0: (top + 1) * T, y1: bottom * T,
          waves: s.waves || [], topLocked: true, bottomLocked: false, active: false, cleared: false, wave: 0, waveT: 0, bossT: 0,
        });
      }
    });
    lv.rooms.sort((a, b) => b.bottomRow - a.bottomRow);
    lv.rooms.forEach((room, idx) => {
      if (grid[room.topRow].includes('D')) lv.doorRows[room.topRow] = { room: idx, top: true };
      if (grid[room.bottomRow].includes('D')) lv.doorRows[room.bottomRow] = { room: idx, top: false };
    });

    // 오브젝트 · 스폰 추출
    let oid = 1;
    for (let r = 0; r < h; r++) for (let c = 0; c < W; c++) {
      const ch = grid[r][c], cx = c * T + T / 2, cy = r * T + T / 2;
      if (ch === 'g' || ch === 'f') { lv.spawns.push({ k: ch === 'g' ? 'ant' : 'fly', x: cx, y: cy, done: false }); grid[r][c] = '.'; }
      else if (ch === 'S') { lv.start = { x: cx, y: cy }; grid[r][c] = '.'; }
      else if (ch === 'R' || ch === 'O') { lv.rollers.push({ k: ch === 'R' ? 'log' : 'barrel', x: cx, y: cy, row: r, t: 0 }); grid[r][c] = '.'; }
    }
    // 가로 조각(B, L) · 세로 조각(b, l) → 하나의 오브젝트
    for (let r = 0; r < h; r++) for (const k of ['B', 'L']) {
      let c = 0;
      while (c < W) {
        if (grid[r][c] === k) {
          let e = c; while (e < W && grid[r][e] === k) e++;
          lv.obs.push(k === 'B' ? { id: oid++, k: 'bar', x0: c * T, x1: e * T, y0: r * T + 3, y1: r * T + 13, alive: true }
            : { id: oid++, k: 'beam', x0: c * T, x1: e * T, y0: r * T + 5, y1: r * T + 11, alive: true });
          for (let i = c; i < e; i++) grid[r][i] = '.';
          c = e;
        } else c++;
      }
    }
    for (let c = 0; c < W; c++) for (const k of ['b', 'l']) {
      let r = 0;
      while (r < h) {
        if (grid[r][c] === k) {
          let e = r; while (e < h && grid[e][c] === k) e++;
          lv.obs.push(k === 'b' ? { id: oid++, k: 'bar', x0: c * T + 3, x1: c * T + 13, y0: r * T, y1: e * T, alive: true, vert: true }
            : { id: oid++, k: 'beam', x0: c * T + 5, x1: c * T + 11, y0: r * T, y1: e * T, alive: true, vert: true });
          for (let i = r; i < e; i++) grid[i][c] = '.';
          r = e;
        } else r++;
      }
    }

    // 길을 따라 걸은 거리(dist)와 바닥 높이(th): 시작점에서 BFS. 계단 칸은 한 칸마다 STEP 높아지고 방은 평평
    const passable = ch => ch === '.' || ch === 'D' || ch === ' ' || ch === ',';
    const dist = Array.from({ length: h }, () => Array(W).fill(-1));
    const th = Array.from({ length: h }, () => Array(W).fill(0));
    const sc = Math.floor(lv.start.x / T), sr = Math.floor(lv.start.y / T);
    const q = [[sr, sc]]; dist[sr][sc] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const [r, c] = q[qi];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= h || nc < 0 || nc >= W || dist[nr][nc] >= 0 || !passable(grid[nr][nc])) continue;
        dist[nr][nc] = dist[r][c] + 1;
        q.push([nr, nc]);
      }
    }
    // 높이: 계단은 '오르는 방향'으로만 한 칸마다 한 단. 폭 방향·층계참·방은 평평.
    //  칸마다 가로/세로로 이어진 바닥 길이를 재서 긴 쪽이 계단 방향, 둘 다 7칸 이상이면 층계참(평평)
    const run = (r, c, dr, dc) => { let n = 0, a = r, b = c; while (grid[a] && passable(grid[a][b])) { n++; a += dr; b += dc; } return n; };
    const axis = Array.from({ length: h }, () => Array(W).fill(null));
    for (let r = 0; r < h; r++) for (let c = 0; c < W; c++) {
      if (!passable(grid[r][c]) || lv.rowKind[r] !== 'stair') continue;
      const hr = run(r, c, 0, 1) + run(r, c, 0, -1) - 1, vr = run(r, c, 1, 0) + run(r, c, -1, 0) - 1;
      axis[r][c] = Math.min(hr, vr) >= 7 ? 'flat' : vr > hr ? 'v' : 'h';
    }
    // 0-1 BFS: 오르는 방향 이동만 비용 1
    const hu = Array.from({ length: h }, () => Array(W).fill(Infinity));
    const dq = [[sr, sc]]; hu[sr][sc] = 0;
    while (dq.length) {
      const [r, c] = dq.shift();
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= h || nc < 0 || nc >= W || !passable(grid[nr][nc])) continue;
        const ax = axis[nr][nc], w = (ax === 'v' && dr !== 0) || (ax === 'h' && dc !== 0) ? 1 : 0;
        if (hu[r][c] + w < hu[nr][nc]) { hu[nr][nc] = hu[r][c] + w; if (w) dq.push([nr, nc]); else dq.unshift([nr, nc]); }
      }
    }
    for (let r = 0; r < h; r++) for (let c = 0; c < W; c++) th[r][c] = isFinite(hu[r][c]) ? hu[r][c] * STEP : 0;
    lv.dist = dist; lv.th = th;

    // 힌트: 처음 만나는 장애물 종류마다 (거리 기준)
    const first = {};
    const seen = (k, d) => { if (d >= 0 && (first[k] == null || d < first[k])) first[k] = d; };
    const dAt = (x, y) => { const r = Math.floor(y / T), c = Math.floor(x / T); return dist[r] && dist[r][c] != null ? dist[r][c] : -1; };
    for (const s of lv.spawns) seen(s.k, dAt(s.x, s.y));
    for (const o of lv.obs) seen(o.k, dAt((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2));
    // 구덩이: 이어진 ' ' 덩어리의 길이(거리 폭)로 보통/넓은 구분
    const vis = new Set();
    for (let r = 0; r < h; r++) for (let c = 0; c < W; c++) {
      if (grid[r][c] !== ' ' || vis.has(r * W + c)) continue;
      let mn = 1e9, r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1; const st = [[r, c]]; vis.add(r * W + c);
      while (st.length) { const [a, b] = st.pop(); if (dist[a][b] >= 0) mn = Math.min(mn, dist[a][b]); r0 = Math.min(r0, a); r1 = Math.max(r1, a); c0 = Math.min(c0, b); c1 = Math.max(c1, b); for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const na = a + dr, nb = b + dc; if (grid[na] && grid[na][nb] === ' ' && !vis.has(na * W + nb)) { vis.add(na * W + nb); st.push([na, nb]); } } }
      // 길 방향 폭 = 가로·세로 중 짧은 쪽 (계단 폭 방향은 길다)
      seen(Math.min(r1 - r0, c1 - c0) + 1 >= 3 ? 'pit3' : 'pit', mn);
    }
    for (let r = 0; r < h; r++) for (let c = 0; c < W; c++) if (grid[r][c] === ',') { let d = -1; for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const v = dist[r + dr] && dist[r + dr][c + dc]; if (v >= 0 && grid[r + dr][c + dc] === '.') d = d < 0 ? v : Math.min(d, v); } seen('bridge', d); }
    let hid = 1;
    for (const k in first) lv.hints.push({ id: hid++, k, d: first[k] });
    lv.rows = grid.map(r => r.join(''));
    return lv;
  }

  G.TUS_LEVEL = { build, T, W };
})(typeof window !== 'undefined' ? window : globalThis);
