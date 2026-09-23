// 화면 흐름 · 입력 · 네트워크 연결 · HUD
(function () {
  'use strict';
  const { TUT_STAGES, TUT_ORDER, Game, ROLE_INFO, ROLES, CARDS, SAB_KIND, PINGS, PROLOGUE_LEN, DT, emptyInput, VW, VH, TUT } = window.TUS;
  const PCOL = ['#ff7a7a', '#6db8ff', '#7be08a', '#ffd257']; // 플레이어 색 (render.js 와 같게)
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const MODE = qs.has('local') ? 'local' : 'peer';
  const DEMO = qs.has('demo');

  let myId = null, isHost = false, net = null, game = null, snap = null, lobby = [], opts = { sabotage: true, shuffle: true, tutorial: true, prologue: true };
  let level = window.TUS_LEVEL.build();
  const rend = new window.TUS_RENDER($('cv'));
  const myIn = emptyInput();
  const bot = DEMO && !qs.has('nobot') ? new window.TUS_BOT() : null;

  { const b = $('build'); if (b && b.textContent.includes('__BUILD__')) b.textContent = '빌드: 로컬'; }
  $('t-mode').innerHTML = MODE === 'local'
    ? '<b>같은 PC 시험 모드</b> — 창을 여러 개 띄워 나란히 두세요(탭은 뒤로 가면 멈춰요).'
    : '같은 PC에서 창 여러 개로 시험하려면 주소 끝에 <kbd>?local</kbd>';
  try { $('nm').value = localStorage.getItem('tus-name') || ''; } catch (e) { }

  function show(id) { for (const s of ['title', 'room', 'play']) $(s).hidden = s !== id; if (id === 'play') fit(); }
  function myName() {
    const n = $('nm').value.trim() || ['너구리', '수달', '고슴도치', '카피바라', '미어캣'][Math.random() * 5 | 0];
    try { localStorage.setItem('tus-name', n); } catch (e) { }
    return n;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nameOf = id => { const p = (snap ? snap.players : lobby).find(p => p.id === id); return p ? p.name : '?'; };

  // ---------------- 로비 ----------------
  $('b-solo').onclick = () => { startSolo(); };
  $('b-host').onclick = () => {
    const name = myName();
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.random() * 23 | 0]).join('');
    isHost = true; myId = 'host'; lobby = [{ id: 'host', name }];
    net = new window.TUS_NET.HostNet(MODE, code, {
      open: c => { $('r-code').textContent = c; renderLobby(); show('room'); },
      error: m => { $('t-err').textContent = m; $('r-err').textContent = m; },
      join: id => { },
      leave: id => {
        lobby = lobby.filter(p => p.id !== id);
        if (game) game.removePlayer(id);
        renderLobby(); pushLobby();
      },
      data: (id, m) => {
        if (!m) return;
        if (m.t === 'hello') {
          if (game || lobby.length >= 4) { net.send(id, { t: 'reject', why: game ? '이미 게임이 시작됐어요.' : '방이 꽉 찼어요 (최대 4명).' }); return; }
          if (!lobby.some(p => p.id === id)) lobby.push({ id, name: String(m.name || '?').slice(0, 8) });
          net.send(id, { t: 'welcome', id });
          renderLobby(); pushLobby();
        } else if (m.t === 'in' && game) game.setInput(id, m.i);
      },
    });
  };
  $('b-join').onclick = () => {
    const code = $('code-in').value.trim().toUpperCase();
    if (code.length !== 4) { $('t-err').textContent = '방 코드 4자리를 넣어 주세요.'; return; }
    const name = myName();
    $('t-err').textContent = '연결 중…';
    net = new window.TUS_NET.ClientNet(MODE, code, {
      open: () => { net.send({ t: 'hello', name }); },
      error: m => { $('t-err').textContent = m; },
      close: () => { $('r-err').textContent = '방장과 연결이 끊겼어요.'; toast('방장과 연결이 끊겼어요', 'wiz'); },
      data: m => {
        if (!m) return;
        if (m.t === 'welcome') { myId = m.id; $('t-err').textContent = ''; $('r-code').textContent = code; show('room'); }
        else if (m.t === 'reject') { $('t-err').textContent = m.why; }
        else if (m.t === 'lobby') { lobby = m.players; opts = m.opts; renderLobby(); }
        else if (m.t === 'snap') { if (!snap || m.s.gen !== snap.gen) lastSeq = 0; snap = m.s; if ($('play').hidden) show('play'); }
      },
    });
  };
  $('code-in').addEventListener('keydown', e => { if (e.key === 'Enter') $('b-join').click(); });
  $('b-leave').onclick = () => location.reload();
  $('o-sab').onchange = $('o-shuf').onchange = $('o-tut').onchange = () => { opts = { sabotage: $('o-sab').checked, shuffle: $('o-shuf').checked, tutorial: $('o-tut').checked, prologue: true }; pushLobby(); };
  $('b-start').onclick = () => {
    game = new Game(lobby, opts);
    game.inputs[myId] = myIn;
    show('play');
  };
  function pushLobby() { if (isHost && net) net.broadcast({ t: 'lobby', players: lobby, opts }); }
  function renderLobby() {
    const li = [];
    for (let i = 0; i < 4; i++) {
      const p = lobby[i];
      li.push(p ? `<li style="border-left:5px solid ${PCOL[i % 4]}"><span>${esc(p.name)}${p.id === myId ? ' (나)' : ''}</span><span style="color:var(--dim)">${p.id === 'host' ? '방장' : '참가'}</span></li>` : '<li class="empty">빈자리</li>');
    }
    $('r-list').innerHTML = li.join('');
    $('r-host-opts').hidden = !isHost; $('r-wait').hidden = isHost;
    if (!isHost) $('r-wait').textContent = `방장이 시작하기를 기다리는 중… (훈련 ${opts.tutorial ? '켬' : '끔'} · 사보타주 ${opts.sabotage ? '켬' : '끔'} · 영혼 셔플 ${opts.shuffle ? '켬' : '끔'})`;
  }
  function startSolo() {
    isHost = true; myId = 'me';
    game = new Game([{ id: 'me', name: myName() }], Object.assign({}, opts, { tutorial: !DEMO && $('t-tut').checked, prologue: !DEMO }));
    game.inputs.me = myIn;
    if (DEMO) { if (!qs.has('intro')) game.state = 'play'; const ff = +qs.get('ff') || 0; for (let i = 0; i < ff * 60; i++) { if (bot) bot.drive(game, myIn, DT); game.step(); if (game.state === 'intro' && !qs.has('intro')) game.state = 'play'; } }
    show('play');
  }
  if (DEMO) setTimeout(startSolo, 50);

  // ---------------- 입력 ----------------
  const KEYMAP = { KeyW: 'w', KeyS: 's', KeyA: 'a', KeyD: 'd', ShiftLeft: 'sh', ShiftRight: 'sh', Space: 'sp', KeyC: 'c', ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };
  let mouseX = null, mouseY = null, dirty = true, lastSendT = 0;
  const playing = () => !$('play').hidden;
  addEventListener('keydown', e => {
    if (e.code === 'KeyM' && document.activeElement.tagName !== 'INPUT') { toggleMute(); return; }
    if (!playing()) return;
    const pk = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
    if (pk != null && !e.repeat) { myIn.pk = pk; myIn.pg++; dirty = true; return; }
    if ((e.code === 'Enter' || e.code === 'Escape') && snap && snap.st === 'prologue') { myIn.sk++; dirty = true; return; }
    if (e.code === 'Enter' && snap && (snap.st === 'intro' || snap.st === 'shuffle')) { myIn.rd++; dirty = true; cache.modal = ''; return; }
    const k = KEYMAP[e.code]; if (!k) return;
    e.preventDefault();
    if (!myIn.k[k]) { myIn.k = Object.assign({}, myIn.k, { [k]: true }); if (k === 'sp') myIn.cj++; if (k === 'c') myIn.cc++; dirty = true; }
    audioOn();
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (!k) return; if (myIn.k[k]) { myIn.k = Object.assign({}, myIn.k, { [k]: false }); dirty = true; } });
  addEventListener('blur', () => { myIn.k = {}; myIn.lb = myIn.rb = 0; dirty = true; });
  const cv = $('cv');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousedown', e => {
    if (!playing() || e.target.closest('#modal') || e.target.id === 'mute') return;
    if (snap && snap.st === 'prologue') { myIn.sk++; dirty = true; audioOn(); return; }
    if (e.button === 0) { myIn.lb = 1; myIn.cl++; }
    if (e.button === 2) { myIn.rb = 1; myIn.cr++; }
    dirty = true; audioOn();
  });
  addEventListener('mouseup', e => { if (e.button === 0) myIn.lb = 0; if (e.button === 2) myIn.rb = 0; dirty = true; });
  addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
  function updateMouseWorld() {
    if (mouseX == null || !snap) return;
    const r = cv.getBoundingClientRect();
    const px = (mouseX - r.left) / r.width * VW, py = (mouseY - r.top) / r.height * VH;
    // 조준 보정: 커서가 적(또는 연습 표적) 그림 근처면 그 적의 발 위치를 정확히 조준
    let best = null, bd = 15;
    if (rend.lv) for (const en of snap.e) {
      if (en[1] === 'rune') continue;
      const p = rend.disp.get('e' + en[0]) || [en[2], en[3], en[4]];
      const q = rend.P(p[0], p[1], rend.hAt(p[1]) + (p[2] || 0) + (en[1] === 'queen' ? 14 : 5));
      const d = Math.hypot(q[0] - px, q[1] - py);
      if (d < bd) { bd = d; best = { w: [p[0], p[1]], s: q }; }
    }
    rend.aimAt = best ? best.s : null;
    // 아니면 몸통 높이(9px) 기준으로 되돌려서, 화면에서 본 방향 그대로 날아가게
    const w = best ? best.w : rend.toWorld(px, py, snap.b[1], 9);
    if (w[0] == null) return;
    const nx = Math.round(w[0] * 10) / 10, ny = Math.round(w[1] * 10) / 10;
    if (nx !== myIn.mx || ny !== myIn.my) { myIn.mx = nx; myIn.my = ny; dirty = true; }
  }
  function sendInput(now) {
    if (isHost || !net || !snap) return;
    if (dirty && now - lastSendT > 30) { lastSendT = now; dirty = false; net.send({ t: 'in', i: myIn }); }
  }

  // ---------------- 화면 크기 ----------------
  function fit() {
    const teamH = $('team').offsetHeight + 16;
    let s = Math.min(innerWidth / VW, (innerHeight - teamH) / VH);
    if (s >= 2) s = Math.floor(s * 2) / 2;
    $('stage').style.width = Math.floor(VW * s) + 'px';
    $('stage').style.height = Math.floor(VH * s) + 'px';
  }
  addEventListener('resize', fit);

  // ---------------- 소리 ----------------
  let AC = null, muted = false;
  try { muted = localStorage.getItem('tus-mute') === '1'; } catch (e) { }
  function audioOn() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume(); music.start(); }
  // 배경음악: 낮게 깔리는 울림 + 드문드문 단조 아르페지오 (보스전은 빠르고 베이스가 뛴다)
  const music = (() => {
    let on = false, cur = 'calm', gain = null, next = 0, step = 0;
    const SCALE = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    function start() {
      if (on || !AC) return; on = true;
      gain = AC.createGain(); gain.gain.value = muted ? 0 : 0.05; gain.connect(AC.destination);
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(gain);
      for (const f of [55, 55.35, 82.4]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = AC.createGain(); g.gain.value = f > 80 ? 0.12 : 0.28; o.connect(g); g.connect(lp); o.start(); }
      next = AC.currentTime + 0.1;
      setInterval(tick, 90);
    }
    function note(f, t, dur, type, vol) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(gain); o.start(t); o.stop(t + dur + 0.05); }
    function tick() {
      if (!gain) return;
      gain.gain.value = muted ? 0 : (cur === 'boss' ? 0.07 : 0.05);
      const spb = cur === 'boss' ? 0.2 : cur === 'eerie' ? 0.7 : 0.42;
      while (next < AC.currentTime + 0.3) {
        step++;
        const chance = cur === 'boss' ? 0.85 : cur === 'eerie' ? 0.35 : cur === 'calm' ? 0.4 : 0.6;
        if (Math.random() < chance) note(SCALE[(Math.random() * SCALE.length) | 0] * (Math.random() < 0.3 ? 2 : 1), next, spb * 1.6, cur === 'boss' ? 'square' : 'triangle', cur === 'boss' ? 0.25 : 0.35);
        if (cur === 'boss' && step % 2 === 0) note(step % 8 < 4 ? 55 : 65.4, next, 0.18, 'square', 0.5);
        if (cur === 'tower' && step % 8 === 0) note(110, next, 0.9, 'sine', 0.5);
        next += spb;
      }
    }
    return { start, mode: m => { cur = m; } };
  })();
  function toggleMute() { muted = !muted; try { localStorage.setItem('tus-mute', muted ? '1' : '0'); } catch (e) { } $('mute').textContent = muted ? '소리 꺼짐 (M)' : '소리 켜짐 (M)'; }
  addEventListener('pointerdown', () => audioOn(), true);
  addEventListener('keydown', () => audioOn(), true);
  $('mute').onclick = toggleMute; $('mute').textContent = muted ? '소리 꺼짐 (M)' : '소리 켜짐 (M)';
  function beep(f0, f1, dur, type, vol) {
    if (!AC || muted) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur);
  }
  function noise(dur, freq, vol, t0) {
    if (!AC || muted) return;
    const t = AC.currentTime + (t0 || 0), n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(AC.destination); src.start(t);
  }
  function pad(freqs, dur, vol, type) {
    if (!AC || muted) return;
    const t = AC.currentTime;
    for (const fq of freqs) {
      const o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sawtooth'; o.frequency.value = fq; o.detune.value = (Math.random() - 0.5) * 12;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      o.connect(lp); lp.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  // 프롤로그 장면 효과음 (prologue.js 의 CUES 이름과 짝)
  const PSFX = {
    boom: () => { beep(90, 30, 1.4, 'sine', 0.22); noise(0.8, 120, 0.25); },
    sparkle: () => { beep(1800 + Math.random() * 900, 2600, 0.12, 'triangle', 0.025); },
    scuttle: () => { for (let i = 0; i < 3; i++) noise(0.03, 3000 + Math.random() * 1500, 0.05, i * 0.05); },
    chant: () => { pad([110, 164.8, 220, 261.6], 3.2, 0.035); beep(220, 330, 3, 'sine', 0.03); },
    surge: () => { beep(200, 900, 0.9, 'sawtooth', 0.05); noise(0.9, 600, 0.12); },
    cozy: () => { pad([261.6, 329.6, 392], 2.2, 0.02, 'triangle'); },
    bicker: () => { const f = 300 + Math.random() * 400; beep(f, f * (Math.random() < 0.5 ? 1.3 : 0.75), 0.12, 'square', 0.035); },
    flicker: () => { noise(0.25, 2000, 0.08); },
    portal: () => { beep(900, 80, 1.2, 'sawtooth', 0.06); noise(1.2, 300, 0.18); },
    grab: s => { (s.players || [1]).forEach((_, i) => { beep(200, 1200, 0.35, 'sawtooth', 0.05); noise(0.35, 1500, 0.1, i * 0.08); }); },
    flash: () => { noise(0.7, 800, 0.3); beep(60, 30, 1.6, 'sine', 0.25); },
    chime: () => { const f = [523.3, 659.3, 784, 1046.5][Math.floor(Math.random() * 4)]; beep(f, f, 0.8, 'triangle', 0.05); beep(f * 2, f * 2, 0.5, 'sine', 0.02); },
    title: () => { pad([110, 130.8, 164.8, 220], 3.4, 0.04); setTimeout(() => beep(880, 880, 1.2, 'triangle', 0.05), 300); },
  };
  const SFX = {
    jump: () => beep(300, 620, 0.12), land: () => beep(120, 60, 0.06, 'triangle', 0.05), shoot: () => beep(900, 500, 0.06, 'square', 0.03),
    spshoot: () => beep(700, 1100, 0.07, 'triangle', 0.04), break: () => { beep(160, 50, 0.18, 'sawtooth', 0.07); beep(90, 40, 0.2, 'square', 0.04); },
    kill: () => beep(500, 120, 0.12, 'square', 0.05), hurt: () => beep(200, 60, 0.25, 'sawtooth', 0.09), block: () => beep(1200, 1500, 0.06, 'triangle', 0.05),
    combo: () => { beep(660, 660, 0.07); setTimeout(() => beep(990, 990, 0.1), 70); }, vote: () => { beep(523, 523, 0.08); setTimeout(() => beep(659, 659, 0.08), 90); setTimeout(() => beep(784, 784, 0.14), 180); },
    sabwarn: () => { beep(300, 150, 0.4, 'sawtooth', 0.06); }, fall: () => beep(600, 80, 0.4, 'triangle', 0.07),
  };

  // ---------------- 이벤트 → 화면 알림 ----------------
  const CAUSE = { pit: '구덩이에 빠짐', edge: '다리에서 떨어짐', bar: '바리케이드에 쾅', beam: '들보에 머리 쿵', collapse: '무너지는 계단에 휩쓸림', ant: '개미에게 물림', shot: '침에 맞음', queen: '여왕에게 들이받힘', log: '통나무에 깔림', barrel: '나무 상자에 치임' };
  const HINT = {
    bar: ['lh', '장애물! 좌클릭 망치로 부숴!'], pit: ['jump', '구덩이! 스페이스로 점프!'], pit3: ['jump', '넓은 구덩이! 달리면서(Shift) 점프해야 넘어요'],
    beam: ['crouch', '낮은 들보! C로 숙이기 — 달리면서 C는 슬라이딩'], ant: ['rh', '개미 병정! 우클릭 마법으로 처치'],
    fly: ['atk', '날개 개미! 마우스로 불꽃 정령을 가까이 대면 자동 공격'], shot: ['def', '날아오는 침! 마우스로 땅 정령 방패를 대서 막아'],
    bridge: ['lr', '꺾인 다리! 앞뒤 + 좌우를 동시에 눌러야 해요'],
    collapse: ['fb', '아래 계단이 무너진다! 계속 위로 올라가요'],
    log: ['lh', '통나무가 굴러온다! 좌클릭으로 부수거나 점프로 넘어요'],
    barrel: ['lr', '나무 상자가 미끄러져 온다! 좌우로 피해요'],
  };
  let lastSeq = 0, hintQ = [], hintT = 0, bannerT = 0;
  function toast(text, cls) {
    const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls;
    const f = $('h-feed'); f.prepend(d);
    while (f.children.length > 4) f.lastChild.remove();
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, 3200);
  }
  function banner(text, small, sec) { $('h-banner').innerHTML = esc(text) + (small ? `<small>${esc(small)}</small>` : ''); $('h-banner').hidden = false; bannerT = sec || 2.5; }
  function roleLabel(r) { return ROLE_INFO[r].part + '(' + ROLE_INFO[r].name + ')'; }
  function handleEvents(s) {
    for (const ev of s.ev) {
      if (ev.s <= lastSeq) continue;
      lastSeq = ev.s;
      rend.event(ev, s);
      if (SFX[ev.type]) SFX[ev.type]();
      switch (ev.type) {
        case 'hurt':
          if (ev.who === 'wizard') toast(`${CAUSE[ev.cause]} — 마법사 탓!`, 'wiz');
          else toast(`${CAUSE[ev.cause]} — ${ROLE_INFO[ev.role].name} 담당 ${nameOf(ev.who)} 탓`);
          break;
        case 'hint': hintQ.push(ev.k); break;
        case 'combo': SFX.combo(); break;
        case 'cleared': toast('출구가 열렸다! 위로!', 'good'); banner('출구가 열렸다!', '위쪽 문으로 올라가세요'); break;
        case 'room': banner('소환실 앞 방', '적을 모두 쓰러뜨리면 문이 열려요'); break;
        case 'wave': toast('적이 몰려온다!'); break;
        case 'bossintro': banner('B3 보스 — 개미 여왕', '마법진 가루를 훔쳐 간 범인', 2.5); break;
        case 'enrage': toast('여왕이 화났다! 더 빨라짐'); break;
        case 'egg': toast('알 주머니! 망치(좌클릭)로 깨지 않으면 부화'); break;
        case 'picked': { const c = CARDS.find(c => c.id === ev.id); toast(`카드 선택: ${c.name}${ev.tie ? ' (동률 → 덜 뽑힌 카드)' : ''}`, 'good'); break; }
        case 'nomana': if (s.roles.rh === myId) toast('마나 부족!'); break;
        case 'sabwarn': break;
        case 'left': toast('한 명이 나갔어요. 역할을 다시 나눴어요.', 'wiz'); break;
        case 'sabswap': toast(`영혼 뒤바뀜! ${nameOf(ev.a)} ↔ ${nameOf(ev.b)} 역할이 잠깐 바뀜`, 'wiz'); break;
        case 'ping': beep(ev.k === 2 ? 300 : 700, ev.k === 2 ? 200 : 900, 0.08, 'square', 0.04); break;
        case 'tutstep': { const q = TUT.find(q => q.id === ev.id); if (q) toast('✓ ' + q.text + ' — ' + tutWho(q, s), 'good'); SFX.combo(); break; }
        case 'tutstage': banner(TUT_STAGES[ev.stage].title, ev.stage === 1 ? '연습용 표적이 나타났어요' : '두 사람이 타이밍을 맞춰야 해요', 1.6); SFX.vote(); break;
        case 'tutdone': banner('훈련 끝!', '아래 계단이 곧 무너진다 — 바리케이드를 부수고 위로!', 3.5); SFX.vote(); break;
      }
    }
  }

  // ---------------- 튜토리얼 ----------------
  const tutWho = (q, s) => [...new Set(q.roles.map(r => s.roles[r]))].map(id => id === myId ? '나' : nameOf(id)).join('+');
  function tutHud(s) {
    const t = s.tut, on = !!(t && t.on && s.st === 'play');
    $('h-tut').hidden = !on; $('h-task').hidden = !on;
    if (!on) return;
    const key = JSON.stringify(t.done) + JSON.stringify(s.roles) + t.stage + t.pause + JSON.stringify(t.act);
    setIf('tut', key, () => {
      const Q = id => TUT.find(q => q.id === id);
      const n = TUT.filter(q => t.done[q.id]).length;
      // 지난 단계는 한 줄로 접고, 지금 단계만 펼치고, 다음 단계는 잠금
      let rows = '';
      TUT_STAGES.forEach((g, gi) => {
        if (gi < t.stage) rows += `<div class="row done"><span class="ck">✓</span><span>${esc(g.title)}</span></div>`;
        else if (gi > t.stage) rows += `<div class="row lock"><span class="ck">·</span><span>${esc(g.title)}</span><span class="who">잠김</span></div>`;
        else {
          rows += `<div class="row stage"><span>${esc(g.title)}</span></div>`;
          for (const id of g.ids) {
            const q = Q(id), me = q.roles.some(r => s.roles[r] === myId), now = t.act.includes(id);
            rows += `<div class="row task${t.done[id] ? ' done' : ''}${me ? ' me' : ''}${now ? ' now' : ''}"><span class="ck">${t.done[id] ? '✓' : now ? '▶' : '·'}</span><span>${esc(q.text)}</span><span class="who">${esc(tutWho(q, s))}</span></div>`;
          }
        }
      });
      $('h-tut').innerHTML = `<div class="tt"><span>몸 적응 훈련</span><span>${n}/${TUT.length}</span></div>` + rows;
      const card = (cls, l1, l2) => { $('h-task').className = 'hud' + (cls ? ' ' + cls : ''); $('h-task').innerHTML = `<div class="l1">${l1}</div><div class="l2">${l2}</div>`; };
      if (t.pause) { card('good', '잘했어요!', '다음: ' + esc(TUT_STAGES[t.stage].title)); return; }
      const mine = t.act.map(Q).find(q => q.roles.some(r => s.roles[r] === myId));
      if (mine) card('', `${t.solo ? (t.cur + 1) + '/' + TUT.length + ' · ' : '내 할 일: '}${esc(mine.text)}`, esc(mine.how));
      else card('wait', '내 과제 끝! 친구들을 기다리는 중', t.act.map(Q).map(q => esc(tutWho(q, s)) + ': ' + esc(q.text)).slice(0, 2).join(' · '));
    });
  }

  // ---------------- HUD ----------------
  const cache = {};
  function setIf(key, val, fn) { if (cache[key] !== val) { cache[key] = val; fn(val); } }
  rend.face($('face'));
  let proT = -1;
  function subtitle(s) {
    const cine = s.st === 'prologue';
    if (!cine) proT = -1;
    $('stage').classList.toggle('cine', cine); $('team').style.visibility = cine ? 'hidden' : '';
    if (!cine) return;
    const P = window.TUS_PROLOGUE, t = P.LEN - s.stT, names = s.players.map(p => p.name).join(', ');
    setIf('sub', P.subtitle(t, names), v => { $('h-sub').textContent = v; });
    // 장면 효과음: 지난 프레임과 이번 프레임 사이에 지나간 신호를 울린다
    if (proT < 0 || t < proT) proT = t - 0.001;
    for (const c of P.CUES) if (c.t > proT && c.t <= t && PSFX[c.s]) PSFX[c.s](s);
    proT = t;
  }
  function hud(s, dt) {
    subtitle(s);
    setIf('hp', s.hp + '/' + s.mhp, v => { $('hp-v').textContent = v; $('hp-f').style.width = (s.hp / s.mhp * 100) + '%'; });
    setIf('mp', s.mp, v => { $('mp-v').textContent = v; $('mp-f').style.width = v + '%'; });
    setIf('xp', s.lv + ':' + s.xp + '/' + s.xpn, () => { $('lv-v').textContent = 'LV' + s.lv; $('xp-v').textContent = s.xp + '/' + s.xpn; $('xp-f').style.width = Math.min(100, s.xp / s.xpn * 100) + '%'; });
    setIf('boss', s.boss ? s.boss.join('/') : '', v => { $('h-boss').hidden = !s.boss; if (s.boss) $('boss-f').style.width = (s.boss[0] / s.boss[1] * 100) + '%'; });
    // 사보타주
    const sab = s.sab[0];
    setIf('sab', sab + s.sab[1], () => {
      $('h-sab').hidden = sab === 'idle';
      const kind = SAB_KIND[s.sab[3]] || SAB_KIND.rev;
      $('sab-l1').textContent = '"' + (kind.lines[s.sab[1]] || kind.lines[0]) + '"';
      $('sab-l2').textContent = sab === 'warn' ? '마법사가 몸을 되찾으려 한다…' : kind.name + '! (이건 마법사 탓)';
    });
    // 힌트
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('h-hint').hidden = true; }
    if (hintT <= 0 && hintQ.length && s.st === 'play') {
      const k = hintQ.shift(), h = HINT[k]; const owner = s.roles[h[0]];
      const me = owner === myId;
      $('h-hint').innerHTML = `<span class="who">[${esc(ROLE_INFO[h[0]].part)} · ${me ? '너야!' : esc(nameOf(owner))}]</span> ${esc(h[1])}`;
      $('h-hint').className = 'hud' + (me ? ' me' : ''); $('h-hint').hidden = false; hintT = 3.6;
    }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('h-banner').hidden = true; }
    // 팀 카드
    const key = JSON.stringify(s.roles) + s.players.map(p => p.id).join();
    setIf('team', key, () => {
      $('team').innerHTML = s.players.map(p => {
        const rs = ROLES.filter(r => s.roles[r] === p.id);
        return `<div class="pc${p.id === myId ? ' me' : ''}" style="border-left-color:${PCOL[p.col || 0]}"><div class="nm">${esc(p.name)}${p.id === myId ? ' (나)' : ''}<span>${rs.length}개 부위</span></div><div class="chips">` +
          rs.map(r => `<span class="chip" data-r="${r}"><i class="eye"></i>${ROLE_INFO[r].part}<kbd>${ROLE_INFO[r].keys}</kbd></span>`).join('') + '</div></div>';
      }).join('') + '<div class="pinghelp">신호: <kbd>1</kbd> 지금! <kbd>2</kbd> 멈춰! <kbd>3</kbd> 니 탓! <kbd>4</kbd> 나이스!</div>';
      fit();
    });
    for (const el of $('team').querySelectorAll('.chip')) { const on = s.act[el.dataset.r] < 0.18; if (el.classList.contains('on') !== on) el.classList.toggle('on', on); }
    tutHud(s);
    modal(s);
  }

  function modal(s) {
    let html = '', key = '';
    if (s.st === 'intro' || s.st === 'shuffle') {
      const mine = ROLES.filter(r => s.roles[r] === myId);
      const el = (s.stTot || 15) - s.stT, rolling = s.st === 'intro' && el < 1.6 && s.players.length > 1;
      const imReady = (s.ready || []).includes(myId);
      key = s.st + JSON.stringify(s.roles) + Math.ceil(s.stT) + (s.ready || []).join() + (rolling ? Math.floor(el * 12) : 'x');
      const title = s.st === 'intro' ? (rolling ? '역할 배정 중…' : '역할 배정 — 누가 어디를 맡았나') : '영혼 셔플! 역할이 바뀌었다';
      const sub = s.st === 'intro' ? ('마법사 한 몸을 나눠 조종한다. 내 부위만 움직일 수 있다.' + (s.tut ? ' 곧 훈련장에서 하나씩 해볼 거예요.' : '')) : '방을 깼더니 영혼이 뒤섞였다. "바뀜" 표시된 부위를 확인하세요.';
      html = `<p class="mt">${title}</p><p class="ms">${sub}</p><canvas id="bodymap" width="440" height="250"></canvas>` +
        (rolling ? '' : `<div class="myroles${mine.length > 1 ? ' many' : ''}">` +
        mine.map(r => `<div class="rolecard"><i class="eye"></i><div><div class="big">${ROLE_INFO[r].part} · ${ROLE_INFO[r].name}</div><div class="tip">${ROLE_INFO[r].tip}</div></div><kbd>${ROLE_INFO[r].keys}</kbd></div>`).join('') + '</div>') +
        `<div class="readyrow">` + s.players.map(p => `<span class="${(s.ready || []).includes(p.id) ? 'on' : ''}" style="border-left:4px solid ${PCOL[p.col || 0]}">${(s.ready || []).includes(p.id) ? '✓ ' : ''}${esc(p.name)}${p.id === myId ? ' (나)' : ''}</span>`).join('') + '</div>' +
        (rolling ? '' : imReady ? '<p class="ms" style="margin-top:10px">준비됨 — 다른 사람을 기다리는 중</p>' : '<button class="btn main" id="b-ready">준비 완료 (Enter)</button>') +
        `<div class="count">${Math.ceil(s.stT)}초 뒤 자동 시작</div>`;
    } else if (s.st === 'vote' && s.vote) {
      const v = s.vote;
      const counts = [0, 0, 0]; for (const id in v.votes) counts[v.votes[id]]++;
      const myVote = myIn.vk === v.id ? myIn.vi : -1;
      key = 'vote' + v.id + counts.join() + myVote + Math.ceil(v.t);
      html = `<p class="mt">레벨 업! LV${s.lv}</p><p class="ms">몸은 하나, 카드도 하나. 다 같이 투표하세요. (동률이면 덜 뽑힌 카드)</p><div class="cards">` +
        v.cards.map((id, i) => { const c = CARDS.find(c => c.id === id); return `<button class="card${myVote === i ? ' mine' : ''}" data-v="${i}"><div class="cn">${c.name}</div><div class="cd">${c.desc}</div><div class="cv">${'■'.repeat(counts[i])}${'□'.repeat(Math.max(0, s.players.length - counts[i]))}</div></button>`; }).join('') +
        `</div><div class="count">${Math.ceil(v.t)}초 남음 · ${Object.keys(v.votes).length}/${s.players.length}명 투표</div>`;
    } else if ((s.st === 'over' || s.st === 'clear') && s.res) {
      const r = s.res;
      key = 'res' + s.gen + r.kind;
      const nm = id => esc((r.rows.find(x => x.id === id) || {}).name || '?');
      html = (r.kind === 'clear'
        ? `<p class="mt" style="color:var(--gold)">B3 클리어!</p><p class="ms">절대마법 재료 획득: 개미가 훔쳐 간 마법가루 · ${r.time}초 · LV${r.lv}<br>다음 층 B2 지하 창고는 준비 중이에요</p>`
        : `<p class="mt" style="color:var(--red)">게임 오버</p><p class="ms">몸이 하나라 체력 0이면 끝. ${r.time}초 버팀 · LV${r.lv}</p>`) +
        `<table class="res"><tr><th>이름</th><th>처치</th><th>부숨</th><th>막음</th><th>합동기술</th><th>니 탓</th></tr>` +
        r.rows.map(x => `<tr><td>${esc(x.name)}</td><td>${x.kills}</td><td>${x.breaks}</td><td>${x.blocks}</td><td>${x.combos}</td><td>${x.blame}</td></tr>`).join('') + '</table>' +
        '<div class="titles">' + (r.mvp ? `<div>MVP — ${nm(r.mvp)}</div>` : '') + (r.blamer && r.rows.length > 1 ? `<div class="b">니 탓 왕 — ${nm(r.blamer)}</div>` : '') + `<div class="w">마법사 탓 — ${r.wizard}회</div></div>` +
        (isHost ? '<button class="btn main" id="b-again">다시 하기</button>' : '<p class="ms" style="margin-top:12px">방장이 다시 시작할 수 있어요</p>');
    }
    const m = $('modal');
    if (!html) { if (!m.hidden) { m.hidden = true; cache.modal = ''; } return; }
    if (cache.modal === key) return;
    cache.modal = key; m.hidden = false; $('modal-box').innerHTML = html;
    $('modal-box').classList.toggle('wide', s.st === 'intro' || s.st === 'shuffle');
    const bm = $('bodymap'); if (bm) drawBodyMap(bm, s);
    const rb = $('b-ready'); if (rb) rb.onclick = () => { myIn.rd++; dirty = true; cache.modal = ''; };
    for (const b of m.querySelectorAll('.card')) b.onclick = () => { myIn.vk = s.vote.id; myIn.vi = +b.dataset.v; dirty = true; cache.modal = ''; };
    const again = $('b-again'); if (again) again.onclick = () => { game.reset(); lastSeq = 0; cache.modal = ''; };
  }

  // ---------------- 몸 지도: 마법사 부위마다 담당자 ----------------
  // 왼쪽 열/오른쪽 열 상자에서 몸의 해당 부위로 선을 긋는다
  const BODY = {
    atk: { side: 0, row: 0 }, lh: { side: 0, row: 1 }, crouch: { side: 0, row: 2 }, lr: { side: 0, row: 3 },
    def: { side: 1, row: 0 }, rh: { side: 1, row: 1 }, jump: { side: 1, row: 2 }, fb: { side: 1, row: 3 },
  };
  let lastRollTick = 0;
  const G_DRAW = (...a) => window.TUS_DRAW_WIZ(...a);
  function drawBodyMap(cv, s) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.imageSmoothingEnabled = false; x.clearRect(0, 0, W, H);
    x.fillStyle = '#0f0c1a'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W / 2, 120, 10, W / 2, 120, 160); g.addColorStop(0, 'rgba(110,90,200,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const rolling = s.st === 'intro' && (s.stTot || 15) - s.stT < 1.6 && s.players.length > 1;
    const owner = {};
    for (const r of ROLES) owner[r] = rolling ? s.players[Math.floor(Math.random() * s.players.length)].id : s.roles[r];
    const pcol = id => { const pl = s.players.find(p => p.id === id); return PCOL[pl ? pl.col || 0 : 0]; };
    // 마법사 (4배, 부위마다 담당자 색으로 살짝 칠함) + 정령 둘
    const hl = {}; for (const r of ['fb', 'lr', 'jump', 'crouch', 'lh', 'rh']) hl[r] = pcol(owner[r]);
    const an = G_DRAW(x, W / 2, H - 14, 4, { hl, hlA: 0.42 });
    an.atk = [W / 2 - 96, 40]; an.def = [W / 2 + 98, 96];
    x.fillStyle = '#1a1426'; x.fillRect(an.atk[0] - 9, an.atk[1] - 9, 18, 18); x.fillStyle = '#ff7b2e'; x.fillRect(an.atk[0] - 8, an.atk[1] - 8, 16, 16); x.fillStyle = '#ffe27a'; x.fillRect(an.atk[0] - 4, an.atk[1] - 2, 8, 7); x.fillStyle = '#1a1426'; x.fillRect(an.atk[0] - 4, an.atk[1] - 1, 2, 2); x.fillRect(an.atk[0] + 2, an.atk[1] - 1, 2, 2);
    x.fillStyle = 'rgba(122,90,58,0.9)'; x.beginPath(); x.arc(an.def[0], an.def[1], 14, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#5fbf5a'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#f4f0e0'; x.fillRect(an.def[0] - 6, an.def[1] - 4, 4, 4); x.fillRect(an.def[0] + 2, an.def[1] - 4, 4, 4);
    if (rolling && performance.now() - lastRollTick > 80) { lastRollTick = performance.now(); beep(900 + Math.random() * 300, 900, 0.03, 'square', 0.02); }
    for (const r of ROLES) {
      const b = BODY[r], bw = 132, bh = 44, bx = b.side ? W - bw - 4 : 4, by = 8 + b.row * 60;
      const pid = owner[r];
      const pl = s.players.find(p => p.id === pid) || { name: '?', col: 0 };
      const col = PCOL[pl.col || 0], me = pid === myId && !rolling;
      const changed = s.st === 'shuffle' && s.prev && s.prev[r] !== s.roles[r];
      // 선: 상자 안쪽 가장자리 → 몸 부위
      const lx = b.side ? bx : bx + bw, ly = by + bh / 2;
      x.strokeStyle = col; x.globalAlpha = 0.8; x.lineWidth = me ? 2 : 1; x.beginPath(); x.moveTo(lx, ly); x.lineTo(an[r][0], an[r][1]); x.stroke(); x.globalAlpha = 1;
      x.fillStyle = '#1a1426'; x.fillRect(an[r][0] - 4, an[r][1] - 4, 8, 8); x.fillStyle = col; x.fillRect(an[r][0] - 3, an[r][1] - 3, 6, 6);
      x.fillStyle = me ? '#34305a' : '#1d1830'; x.fillRect(bx, by, bw, bh);
      x.strokeStyle = me ? '#ffffff' : col; x.lineWidth = me ? 3 : 2; x.strokeRect(bx + 1, by + 1, bw - 2, bh - 2); // 내 부위 = 흰 테두리 (노란 플레이어와 안 헷갈리게)
      x.textAlign = 'left'; x.font = '11px "Galmuri11", monospace'; x.fillStyle = '#a39bc4';
      x.fillText(ROLE_INFO[r].part + ' · ' + ROLE_INFO[r].name, bx + 8, by + 17);
      x.font = '13px "Galmuri11", monospace'; x.fillStyle = col;
      x.fillText(pl.name + (me ? '  (나)' : ''), bx + 8, by + 35);
      if (changed) { x.fillStyle = '#c77dff'; x.fillRect(bx + bw - 36, by + bh - 18, 32, 14); x.fillStyle = '#fff'; x.font = '10px "Galmuri11", monospace'; x.fillText('바뀜', bx + bw - 31, by + bh - 7); }
    }
  }

  // ---------------- 메인 루프 ----------------
  let acc = 0, last = performance.now(), sendT = 0;
  // 한 프레임에서 오류가 나도 루프는 계속 돈다 (예전엔 오류 하나로 화면이 영원히 멈췄다)
  let lastErr = '';
  function frame(now) {
    requestAnimationFrame(frame);
    try { tick(now); } catch (e) {
      const m = String(e && e.message || e);
      if (m !== lastErr) { lastErr = m; console.error(e); try { toast('오류: ' + m, 'wiz'); } catch (_) { } }
    }
  }
  function tick(now) {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (game) {
      if (bot && !window.__botOff) bot.drive(game, myIn, dt);
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 8) { game.step(); acc -= DT; n++; }
      if (n >= 8) acc = 0;
      const s = game.snapshot();
      if (!snap || s.gen !== snap.gen) lastSeq = 0;
      snap = s;
      sendT -= dt;
      if (net && sendT <= 0) { sendT = 0.05; net.broadcast({ t: 'snap', s }); }
    }
    if (snap && playing()) {
      updateMouseWorld();
      handleEvents(snap);
      rend.draw(level, snap, { smooth: !isHost, myId });
      music.mode(snap.st === 'prologue' ? 'eerie' : snap.boss ? 'boss' : (snap.st === 'play' || snap.st === 'vote' || snap.st === 'intro') ? 'tower' : 'calm');
      hud(snap, dt);
    }
    sendInput(now);
  }
  requestAnimationFrame(frame);
  window.__tus = { get game() { return game; }, get snap() { return snap; }, get net() { return net; }, get lobby() { return lobby; }, get myId() { return myId; }, get rend() { return rend; }, get level() { return level; } };
})();
