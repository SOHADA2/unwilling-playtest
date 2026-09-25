// 통신: 방장 = 진실원. 참가자는 입력만 보내고 방장이 스냅샷을 뿌린다.
//  - 'peer'  : 인터넷 너머 친구 (PeerJS / WebRTC P2P, 서버비 0)
//  - 'local' : 같은 PC 창 여러 개로 시험 (BroadcastChannel, 인터넷 불필요)
(function (G) {
  'use strict';
  const PREFIX = 'tus-proto-b3-';

  function HostNet(mode, code, cb) {
    this.mode = mode; this.code = code; this.cb = cb; this.conns = {};
    if (mode === 'local') {
      this.bc = new BroadcastChannel(PREFIX + code);
      this.bc.onmessage = ev => {
        const m = ev.data; if (!m || m.to !== 'host') return;
        if (!this.conns[m.from]) { this.conns[m.from] = true; cb.join(m.from); }
        if (m.msg && m.msg.t === 'bye') { delete this.conns[m.from]; cb.leave(m.from); return; }
        cb.data(m.from, m.msg);
      };
      setTimeout(() => cb.open(code), 0);
    } else {
      if (typeof Peer === 'undefined') { setTimeout(() => cb.error('통신 모듈(PeerJS)을 못 불러왔어요. 인터넷 연결을 확인해 주세요.'), 0); return; }
      this.peer = new Peer(PREFIX + code, { debug: 1 });
      this.peer.on('open', () => cb.open(code));
      this.peer.on('error', e => cb.error(e.type === 'unavailable-id' ? '같은 방 코드가 이미 있어요. 다시 만들어 주세요.' : '연결 오류: ' + e.type));
      this.peer.on('connection', conn => {
        const id = conn.peer;
        conn.on('open', () => { this.conns[id] = conn; cb.join(id); });
        conn.on('data', d => cb.data(id, d));
        conn.on('close', () => { if (this.conns[id]) { delete this.conns[id]; cb.leave(id); } });
        conn.on('error', () => { });
      });
    }
  }
  HostNet.prototype.send = function (id, msg) {
    if (this.mode === 'local') this.bc.postMessage({ from: 'host', to: id, msg });
    else { const c = this.conns[id]; if (c && c.open) c.send(msg); }
  };
  HostNet.prototype.broadcast = function (msg) {
    if (this.mode === 'local') this.bc.postMessage({ from: 'host', to: '*', msg });
    else for (const id in this.conns) { const c = this.conns[id]; if (c && c.open) c.send(msg); }
  };
  HostNet.prototype.close = function () { try { if (this.bc) this.bc.close(); if (this.peer) this.peer.destroy(); } catch (e) { } };

  function ClientNet(mode, code, cb) {
    this.mode = mode; this.cb = cb;
    if (mode === 'local') {
      this.id = 'c' + Math.random().toString(36).slice(2, 8);
      this.bc = new BroadcastChannel(PREFIX + code);
      this.bc.onmessage = ev => { const m = ev.data; if (!m || m.from !== 'host') return; if (m.to === '*' || m.to === this.id) cb.data(m.msg); };
      addEventListener('beforeunload', () => this.send({ t: 'bye' }));
      setTimeout(() => cb.open(), 0);
    } else {
      if (typeof Peer === 'undefined') { setTimeout(() => cb.error('통신 모듈(PeerJS)을 못 불러왔어요. 인터넷 연결을 확인해 주세요.'), 0); return; }
      this.peer = new Peer({ debug: 1 });
      this.peer.on('error', e => cb.error(e.type === 'peer-unavailable' ? '그 방 코드를 찾을 수 없어요.' : '연결 오류: ' + e.type));
      this.peer.on('open', () => {
        this.conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        this.conn.on('open', () => cb.open());
        this.conn.on('data', d => cb.data(d));
        this.conn.on('close', () => cb.close());
      });
    }
  }
  ClientNet.prototype.send = function (msg) {
    if (this.mode === 'local') this.bc.postMessage({ from: this.id, to: 'host', msg });
    else if (this.conn && this.conn.open) this.conn.send(msg);
  };
  ClientNet.prototype.close = function () { try { if (this.bc) this.bc.close(); if (this.peer) this.peer.destroy(); } catch (e) { } };

  G.TUS_NET = { HostNet, ClientNet };
})(typeof window !== 'undefined' ? window : globalThis);
