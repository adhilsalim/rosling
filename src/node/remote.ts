/* Phone remote: a small WebSocket hub that every open copy of the deck (viewer, presenter, phone)
   connects to. The hub holds the one shared state (current slide, when the talk and the slide
   started), so the laptop and the phone always agree, and a phone button press moves the projector.

   Anyone on the same Wi-Fi could reach the server, so everything that does not come from this
   machine needs the session's secret token: the phone gets it from the pairing link (?k=...), and the
   server then keeps it in a cookie. The link is printed in the terminal and shown as a QR code in
   the viewer, never on the presented slides, so the audience can't take over the talk. */
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

export const WS_PATH = '/__rosling/ws';
const COOKIE = 'rosling_k';

export interface State { index: number; total: number; presenting: boolean; talkStart: number; slideStart: number }

type In =
  | { t: 'hello'; total: number; index?: number }
  | { t: 'goto'; index: number }
  | { t: 'nav'; dir: 'next' | 'prev' | 'first' | 'last' }
  | { t: 'present'; on: boolean };

/** This machine's address on the local network, which the phone uses to reach the server. */
export function lanAddress(): string | null {
  const nets = os.networkInterfaces();
  const order = Object.keys(nets).sort((a, b) => +/^(en|wl|eth)/.test(b) - +/^(en|wl|eth)/.test(a));
  for (const name of order)
    for (const n of nets[name] ?? [])
      if (n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')) return n.address;
  return null;
}

export const isLocal = (req: http.IncomingMessage) => {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
};

export function createRemote() {
  const token = crypto.randomBytes(12).toString('base64url');
  const same = (k: string | undefined | null) =>
    !!k && k.length === token.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(token));
  const cookieToken = (req: http.IncomingMessage) =>
    (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1];
  const allowed = (req: http.IncomingMessage) => isLocal(req) || same(cookieToken(req));

  const state: State = { index: 0, total: 0, presenting: false, talkStart: 0, slideStart: 0 };
  const wss = new WebSocketServer({ noServer: true });
  const roles = new Map<WebSocket, string>();

  function broadcast() {
    const remotes = [...roles.values()].filter((r) => r === 'remote').length;
    const msg = JSON.stringify({ t: 'state', ...state, now: Date.now(), remotes });
    for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  }

  function go(index: number) {
    const max = Math.max(0, state.total - 1);
    const next = Math.max(0, Math.min(max, Math.round(index)));
    if (next !== state.index) { state.index = next; state.slideStart = Date.now(); }
  }

  wss.on('connection', (ws, req) => {
    const role = new URL(req.url ?? '/', 'http://x').searchParams.get('role') === 'remote' ? 'remote' : 'deck';
    roles.set(ws, role);
    let alive = true;
    ws.on('pong', () => { alive = true; });
    const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 15000);
    ws.on('close', () => { clearInterval(ping); roles.delete(ws); broadcast(); });
    ws.on('message', (raw) => {
      let m: In;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.t === 'hello' && role === 'deck' && Number.isInteger(m.total) && m.total >= 0) {
        state.total = m.total;
        // a page opened on a slide (#/6) goes there, unless a talk is running: then the talk wins
        go(!state.presenting && Number.isInteger(m.index) ? m.index! : state.index);
      } else if (m.t === 'goto' && typeof m.index === 'number') go(m.index);
      else if (m.t === 'nav') {
        if (m.dir === 'next') go(state.index + 1);
        else if (m.dir === 'prev') go(state.index - 1);
        else if (m.dir === 'first') go(0);
        else if (m.dir === 'last') go(state.total - 1);
      } else if (m.t === 'present' && role === 'deck') {
        state.presenting = !!m.on;
        if (m.on) state.talkStart = state.slideStart = Date.now();
      } else return;
      broadcast();
    });
    broadcast();
  });

  return {
    token,
    state,
    /** Guards plain HTTP requests. Returns true when the request may go on to the app. */
    guard(req: http.IncomingMessage, res: http.ServerResponse): boolean {
      const url = new URL(req.url ?? '/', 'http://x');
      const k = url.searchParams.get('k');
      if (same(k)) {
        // remember the phone, and drop the token from its address bar
        url.searchParams.delete('k');
        res.writeHead(302, { 'Set-Cookie': `${COOKIE}=${token}; Path=/; SameSite=Strict; HttpOnly`, Location: url.pathname + url.search + '#/remote' });
        res.end();
        return false;
      }
      if (allowed(req)) return true;
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<meta name="viewport" content="width=device-width"><body style="font:18px system-ui;padding:24px">' +
        '<h1>Not paired</h1><p>Scan the QR code from the viewer\'s Phone remote button (or open the link printed in the terminal) to use this device as a remote.</p>');
      return false;
    },
    /** Adds the WebSocket endpoint to an HTTP server. Other upgrades (Vite's hot reload) are left alone. */
    attach(server: http.Server) {
      server.on('upgrade', (req, socket, head) => {
        if (new URL(req.url ?? '/', 'http://x').pathname !== WS_PATH) return;
        if (!allowed(req)) { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      });
    },
    close() { for (const ws of wss.clients) ws.terminate(); wss.close(); },
  };
}

export type Remote = ReturnType<typeof createRemote>;

/** The pairing address for a phone, or null when this machine is on no network. */
export function pairing(remote: Remote, port: number) {
  const ip = lanAddress();
  return ip ? { url: `http://${ip}:${port}/?k=${remote.token}` } : null;
}
