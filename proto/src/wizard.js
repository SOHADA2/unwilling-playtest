// 마법사 몸 그리기 — 부위별로 따로 그린다 (다리 둘·무릎·엉덩이·방패 든 왼손·지팡이 든 오른손·머리·모자)
// 누가 어느 부위를 맡았는지 보이도록, 누른 부위는 그 사람 색으로 빛난다.
// 게임 화면(S=1)과 역할 배정 몸 지도(S=5)가 같은 함수를 쓴다 → 부위 위치가 항상 일치.
(function (G) {
  'use strict';
  const K = '#1a1426';
  const C = {
    pants: '#2a3470', knee: '#4a5cb0', boot: '#5b3a22', robe: '#3553c4', robeD: '#243a92', maze: '#8fc0ff', belt: '#c89a3a',
    skin: '#f4c9a3', blush: '#e8988a', hat: '#3565d8', hatD: '#2447a8', dot: '#f6c945',
    shield: '#45b04f', shieldD: '#2d7f36', chev: '#e04a4a', staff: '#a9aec0', candy: '#e04a4a',
  };

  // ctx 에 (X, Y)=발바닥 가운데 기준으로 그린다. o: { faceL, walk(0~1 위상, 없으면 서 있음), crouch, slide, air, lh(0~1 휘두름), rh(0~1 시전), hl:{부위:색} }
  // 돌려주는 값: 부위별 화면 좌표 (몸 지도 선 긋기용)
  G.TUS_DRAW_WIZ = function (x, X, Y, S, o) {
    o = o || {};
    const flip = o.faceL ? -1 : 1;
    // 로컬 사각형(오른쪽 보는 기준) → 화면
    const rect = (lx, ly, w, h, col) => {
      const sx = flip > 0 ? lx : -(lx + w);
      x.fillStyle = col; x.fillRect(Math.round(X + sx * S), Math.round(Y + ly * S), Math.ceil(w * S), Math.ceil(h * S));
    };
    const pt = (lx, ly) => [X + lx * flip * S, Y + ly * S];
    // 부위를 테두리 → 색 순서로 그리는 도우미 (hl 이 있으면 덧칠)
    const part = (name, rects) => {
      for (const r of rects) rect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2, K);
      for (const r of rects) rect(r[0], r[1], r[2], r[3], r[4]);
      const hc = o.hl && o.hl[name];
      if (hc) { x.globalAlpha = o.hlA == null ? 0.6 : o.hlA; for (const r of rects) rect(r[0], r[1], r[2], r[3], hc); x.globalAlpha = 1; }
    };
    const crouch = !!(o.crouch || o.slide), air = !!o.air;
    const legH = crouch ? 5 : air ? 6 : 9;
    const ph = o.walk != null && !crouch && !air ? o.walk * Math.PI * 2 : null;
    const liftL = ph != null ? Math.max(0, Math.sin(ph)) * 2 : air ? 2 : 0, liftR = ph != null ? Math.max(0, -Math.sin(ph)) * 2 : air ? 1 : 0;
    const swL = ph != null ? Math.cos(ph) * 1.2 : 0;
    const yTop = -26 + (crouch ? 6 : 0) - (air ? 0 : 0), yBot = -legH + 1;

    // 다리: 왼다리(뒤, 음수 x) · 오른다리(앞)
    const leg = (lx, lift) => [[lx, -legH - lift, 4, legH - 2, C.pants], [lx, -3 - lift, 5, 3, C.boot], [lx + 1, -legH / 2 - lift - 1, 2, 2, C.knee]];
    const L = leg(-6 + swL, liftL), Rg = leg(1 - swL, liftR);
    part('lr', L); part('fb', Rg);
    // 무릎(점프): 두 무릎 표시를 따로 칠한다
    if (o.hl && o.hl.jump) { x.globalAlpha = 0.9; rect(-5 + swL, -legH / 2 - liftL - 1, 3, 3, o.hl.jump); rect(2 - swL, -legH / 2 - liftR - 1, 3, 3, o.hl.jump); x.globalAlpha = 1; }

    // 로브(몸통): 아래로 갈수록 넓어짐
    const robe = [];
    for (let y = yTop; y <= yBot; y++) { const hw = Math.round(6 + (y - yTop) * 3 / Math.max(1, yBot - yTop)); robe.push([-hw, y, hw * 2, 1, C.robe]); }
    part('robe', robe);
    for (let y = yTop; y <= yBot; y++) { const hw = Math.round(6 + (y - yTop) * 3 / Math.max(1, yBot - yTop)); rect(hw - 2, y, 2, 1, C.robeD); }
    rect(-6, yTop + 6, 12, 1, C.belt); rect(-1, yTop + 6, 2, 2, C.dot);
    rect(-3, yTop + 9, 4, 1, C.maze); rect(0, yTop + 9, 1, 4, C.maze); rect(-4, yTop + 12, 5, 1, C.maze); rect(3, yTop + 10, 1, 5, C.maze);
    // 엉덩이(앉기): 로브 뒤쪽 아래
    const butt = [[-9, yBot - 5, 5, 5, C.robeD]];
    if (o.hl && o.hl.crouch) { x.globalAlpha = 0.75; for (const r of butt) rect(r[0], r[1], r[2], r[3], o.hl.crouch); x.globalAlpha = 1; }

    // 머리 · 모자
    part('head', [[-4, yTop - 7, 9, 7, C.skin]]);
    rect(0, yTop - 5, 1, 2, K); rect(3, yTop - 5, 1, 2, K); rect(-2, yTop - 3, 2, 1, C.blush);
    const hat = [[-9, yTop - 9, 19, 2, C.hatD]];
    for (let r = 0; r < 12; r++) { const w = Math.max(2, Math.round(14 - r * 1.1)), x0 = Math.round(-7 + r * 0.55 + (r > 8 ? (r - 8) * 0.9 : 0)); hat.push([x0, yTop - 10 - r, w, 1, C.hat]); }
    part('hat', hat);
    rect(-4, yTop - 13, 2, 2, C.dot); rect(2, yTop - 15, 2, 2, C.dot); rect(-1, yTop - 18, 2, 2, C.dot); rect(1, yTop - 11, 2, 1, C.dot);

    // 오른손 + 지팡이 (시전하면 들어 올리고 끝이 빛남)
    const up = (o.rh || 0) * 4;
    part('rh', [[5, yTop + 3, 3, 7, C.robe], [5, yTop + 10 - up, 3, 2, C.skin], [8, yTop - 16 - up, 1, 26, C.staff], [6, yTop - 22 - up, 6, 6, C.candy]]);
    rect(8, yTop - 20 - up, 2, 1, '#fff'); rect(9, yTop - 19 - up, 1, 2, '#fff');
    // 왼손 + 방패 (망치질하면 앞으로 내지름)
    const pk = (o.lh || 0) * 7;
    part('lh', [[-8 + pk * 0.5, yTop + 3, 3, 7, C.robe], [-8 + pk * 0.5, yTop + 10, 3, 2, C.skin], [-15 + pk, yTop + 2 - pk * 0.3, 8, 11, C.shield]]);
    rect(-14 + pk, yTop + 4 - pk * 0.3, 6, 2, C.chev); rect(-13 + pk, yTop + 7 - pk * 0.3, 4, 2, C.chev); rect(-12 + pk, yTop + 5 - pk * 0.3, 2, 1, C.dot);

    return {
      fb: pt(3 - swL, -3 - liftR), lr: pt(-4 + swL, -3 - liftL), jump: pt(0, -legH / 2 - 1), crouch: pt(-7, yBot - 3),
      lh: pt(-11 + pk, yTop + 7), rh: pt(9, yTop - 19 - up), head: pt(0, yTop - 4), top: pt(0, yTop - 24),
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
