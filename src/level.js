// 마탑 B3층 레벨 데이터. 격자 24칸 x N줄, 한 칸 = 16px.
// 기호: '#' 벽 · '.' 바닥 · ' ' 낭떠러지(구덩이) · 'B' 바리케이드(왼손으로 부숨)
//       'L' 낮은 들보(앉기/슬라이딩) · 'g' 개미 병정 · 'f' 날개 개미 · 'S' 시작점 · 'D' 방 문
//       'R' 통나무 굴리는 곳(아래로 굴러옴) · 'O' 술통 굴리는 곳
// 섹션은 "플레이 순서"(아래 → 위)로 나열하고, 각 섹션 안의 줄은 화면에 보이는 대로(위 → 아래) 적는다.
(function (G) {
  'use strict';
  const T = 16, W = 24;
  const C = s => { if (s.length !== 12) throw new Error('C() 12칸 아님: "' + s + '"'); return '######' + s + '######'; };
  const R = s => { if (s.length !== 22) throw new Error('R() 22칸 아님: "' + s + '"'); return '#' + s + '#'; };
  const WIDE = s => { if (s.length !== 20) throw new Error('WIDE() 20칸 아님'); return '##' + s + '##'; };
  const DOOR = '######DDDDDDDDDDDD######';
  const rep = (row, n) => Array(n).fill(row);

  // 대각선 다리: 아래(오른쪽)에서 위(왼쪽)로 올라간다 → 앞뒤 + 좌우 동시 입력 필요
  function bridge(n, width) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const start = 1 + i;               // 위쪽 줄일수록 왼쪽
      let s = '';
      for (let c = 0; c < 20; c++) s += (c >= start && c < start + width) ? '.' : ' ';
      rows.push(WIDE(s));
    }
    return rows;
  }

  function sections() {
    const stair1 = [
      C('............'),
      C('......O.....'),
      C('............'),
      C('...g......g.'),
      C('............'),
      C('LLLLLLLLLLLL'),
      ...rep(C('............'), 3),
      C('BBBBBBBBBBBB'),
      C('............'),
      C('............'),
      C('.....f......'),
      C('............'),
      C('............'),
      ...rep(C('            '), 3),
      ...rep(C('............'), 3),
      C('....g.......'),
      C('............'),
      C('............'),
      C('LLLLLLLLLLLL'),
      ...rep(C('............'), 3),
      ...rep(C('            '), 2),
      ...rep(C('............'), 3),
      C('BBBBBBBBBBBB'),
      ...rep(C('............'), 4),
      C('.....S......'),
      ...rep(C('............'), 2),
      ...rep('########################', 1),
    ];
    const room1 = [
      DOOR,
      R('......................'),
      R('..##..............##..'),
      R('..##..............##..'),
      ...rep(R('......................'), 5),
      R('..##..............##..'),
      R('..##..............##..'),
      R('......................'),
      DOOR,
    ];
    const stair2 = [
      ...rep(C('............'), 2),
      C('..g......g..'),
      C('............'),
      C('LLLLLLLLLLLL'),
      C('............'),
      C('BBBBBBBBBBBB'),
      ...rep(C('............'), 2),
      C('.f........f.'),
      ...rep(C('............'), 2),
      WIDE('....................'),
      ...bridge(13, 4),
      WIDE('....................'),
      ...rep(C('............'), 2),
      C('...g....g...'),
      C('............'),
      ...rep(C('            '), 3),
      C('.....R......'),
      ...rep(C('............'), 3),
      C('......f.....'),
      ...rep(C('............'), 4),
      C('LLLLLLLLLLLL'),
      ...rep(C('............'), 3),
      C('BBBBBBBBBBBB'),
      ...rep(C('............'), 3),
    ];
    const boss = [
      '########################',
      ...rep(R('......................'), 11),
      DOOR,
    ];
    return [
      { kind: 'stair', rows: stair1 },
      { kind: 'room', rows: room1, waves: [{ ant: 4, fly: 0 }, { ant: 3, fly: 2 }] },
      { kind: 'stair', rows: stair2, bridgeHint: true },
      { kind: 'boss', rows: boss },
    ];
  }

  function build() {
    const secs = sections();
    // 맵은 위 → 아래 순서로 쌓는다 (플레이 순서의 역순)
    const rows = [];
    const marks = [];
    for (let i = secs.length - 1; i >= 0; i--) {
      marks[i] = rows.length;
      rows.push(...secs[i].rows);
    }
    const h = rows.length;
    const grid = rows.map(r => {
      if (r.length !== W) throw new Error('줄 길이 오류: "' + r + '"');
      return r.split('');
    });

    const lv = { T, w: W, h, grid, rows: null, spawns: [], obs: [], rooms: [], doorRows: {}, hints: [], start: null, rollers: [], rowKind: [], hgt: [] };
    // 줄마다 종류(계단/방)와 바닥 높이(px). 계단은 두 줄마다 한 단(3px)씩 높아진다 — 아래에서 위로 올라가는 탑
    secs.forEach((s, i) => { for (let k = 0; k < s.rows.length; k++) lv.rowKind[marks[i] + k] = s.kind === 'stair' ? 'stair' : 'room'; });
    { let hh = 0; for (let r = h - 1; r >= 0; r--) { lv.hgt[r] = hh; if (lv.rowKind[r] === 'stair' && r % 2 === 0) hh += 3; } }

    // 방 메타데이터
    secs.forEach((s, i) => {
      if (s.kind === 'room' || s.kind === 'boss') {
        const top = marks[i], bottom = marks[i] + s.rows.length - 1;
        const room = {
          kind: s.kind, topRow: top, bottomRow: bottom,
          lockY: top * T - 4,
          x0: T, x1: (W - 1) * T, y0: (top + 1) * T, y1: bottom * T,
          waves: s.waves || [], topLocked: true, bottomLocked: false,
          active: false, cleared: false, wave: 0, waveT: 0, bossT: 0,
        };
        lv.rooms.push(room);
      }
    });
    // 방 순서 = 플레이 순서 (아래에 있는 방이 먼저)
    lv.rooms.sort((a, b) => b.bottomRow - a.bottomRow);
    lv.rooms.forEach((room, idx) => {
      if (grid[room.topRow].includes('D')) lv.doorRows[room.topRow] = { room: idx, top: true };
      if (grid[room.bottomRow].includes('D')) lv.doorRows[room.bottomRow] = { room: idx, top: false };
    });

    // 오브젝트·스폰 추출
    let oid = 1;
    const firstSeen = {};
    const seen = (k, y) => { if (firstSeen[k] == null || y > firstSeen[k]) firstSeen[k] = y; };
    for (let r = 0; r < h; r++) {
      const row = grid[r];
      for (let c = 0; c < W; c++) {
        const ch = row[c];
        const cx = c * T + T / 2, cy = r * T + T / 2;
        if (ch === 'g' || ch === 'f') { lv.spawns.push({ k: ch === 'g' ? 'ant' : 'fly', x: cx, y: cy, done: false }); row[c] = '.'; seen(ch === 'g' ? 'ant' : 'fly', r * T); }
        else if (ch === 'S') { lv.start = { x: cx, y: cy }; row[c] = '.'; }
        else if (ch === 'R' || ch === 'O') { lv.rollers.push({ k: ch === 'R' ? 'log' : 'barrel', x: cx, y: cy, row: r, t: 0 }); row[c] = '.'; }
      }
      // 연속된 B / L 은 하나의 오브젝트
      for (const k of ['B', 'L']) {
        let c = 0;
        while (c < W) {
          if (row[c] === k) {
            let e = c; while (e < W && row[e] === k) e++;
            const o = k === 'B'
              ? { id: oid++, k: 'bar', x0: c * T, x1: e * T, y0: r * T + 3, y1: r * T + 13, alive: true }
              : { id: oid++, k: 'beam', x0: c * T, x1: e * T, y0: r * T + 5, y1: r * T + 11, alive: true };
            lv.obs.push(o);
            seen(o.k, r * T);
            for (let i = c; i < e; i++) row[i] = '.';
            c = e;
          } else c++;
        }
      }
    }
    // 구덩이 힌트: 복도 12칸이 전부 낭떠러지인 줄의 연속 길이
    let run = 0, runBottom = -1;
    for (let r = h - 1; r >= -1; r--) {
      const isPit = r >= 0 && grid[r].slice(6, 18).join('') === '            ' && grid[r][5] === '#';
      if (isPit) { if (run === 0) runBottom = r; run++; }
      else if (run > 0) { seen(run >= 3 ? 'pit3' : 'pit', runBottom * T); run = 0; }
    }
    // 대각선 다리 힌트
    secs.forEach((s, i) => { if (s.bridgeHint) { for (let r = marks[i]; r < marks[i] + s.rows.length; r++) { if (grid[r][2] === ' ' || grid[r][3] === ' ') { seen('bridge', r * T); } } } });

    let hid = 1;
    for (const k in firstSeen) lv.hints.push({ id: hid++, k, y: firstSeen[k] });
    lv.rows = grid.map(r => r.join(''));
    return lv;
  }

  G.TUS_LEVEL = { build, T, W };
})(typeof window !== 'undefined' ? window : globalThis);
