/* The two servers: `rosling dev` (live editing through Vite) and `rosling present` (the built site
   from dist/). Both carry the phone remote hub. With the remote on, the server listens on the local
   network so a phone can reach it; without it (--no-remote), only this machine can. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sirv from 'sirv';
import { createServer, build as viteBuild } from 'vite';
import { viteConfig } from './vite.js';
import { loadDeck, allErrors } from './deck.js';
import { createRemote, pairing, isLocal, type Remote } from './remote.js';
import { commentsHandler } from './comments.js';

export interface ServeOptions { port: number; remote: boolean; open: boolean }

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** Puts the remote's pairing check (and the viewer's pairing info and comments endpoints) in front of the app. */
function withRemote(remote: Remote, port: () => number, deckDir: string, app: Handler): Handler {
  const comments = commentsHandler(deckDir);
  return (req, res) => {
    if (!remote.guard(req, res)) return;
    if (req.url?.startsWith('/__rosling/pair')) {
      // only this machine may ask for the pairing link, so the QR code never leaks to another device
      if (!isLocal(req)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ url: pairing(remote, port())?.url ?? null }));
      return;
    }
    if (comments(req, res)) return;
    app(req, res);
  };
}

function listen(server: http.Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number) => {
      server.once('error', (e: NodeJS.ErrnoException) => (e.code === 'EADDRINUSE' && p < port + 20 ? tryPort(p + 1) : reject(e)));
      server.listen(p, host, () => resolve(p));
    };
    tryPort(port);
  });
}

async function announce(title: string, remote: Remote, port: number, withRemoteOn: boolean, page: string, open: boolean) {
  const local = `http://localhost:${port}/${page}`;
  console.log(`\n  ${title}\n\n  Open:  ${local}`);
  if (withRemoteOn) {
    const p = pairing(remote, port);
    if (p) console.log(`\n  Phone remote: open the viewer's Phone remote button and scan its QR code (same Wi-Fi as this computer),\n  or open this link on your phone:\n  ${p.url}\n  Keep this link private: whoever has it can change your slides.`);
    else console.log('\n  Phone remote: no network found. Connect this computer to Wi-Fi and restart.');
  }
  console.log('');
  if (open) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [local], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  }
}

export async function dev(deckDir: string, opts: ServeOptions) {
  const deck = loadDeck(deckDir);
  const remote = createRemote();
  const server = http.createServer();
  const vite = await createServer({
    ...viteConfig(deckDir),
    appType: 'spa',
    server: { ...viteConfig(deckDir).server, middlewareMode: true, hmr: { server } },
  });
  let port = opts.port;
  server.on('request', withRemote(remote, () => port, deckDir, (req, res) => vite.middlewares(req, res)));
  remote.attach(server);
  port = await listen(server, opts.port, opts.remote ? '0.0.0.0' : '127.0.0.1');
  const problems = allErrors(deck).length;
  await announce(`${deck.title} · live editing${problems ? ` · ${problems} problem(s), run "rosling check"` : ''}`, remote, port, opts.remote, '', opts.open);
}

export async function build(deckDir: string) {
  const errors = allErrors(loadDeck(deckDir));
  await viteBuild(viteConfig(deckDir, { logLevel: 'error' }));
  return errors;
}

export async function present(deckDir: string, opts: ServeOptions & { rebuild: boolean }) {
  const dist = path.join(path.resolve(deckDir), 'dist');
  if (opts.rebuild || !fs.existsSync(path.join(dist, 'index.html'))) {
    console.log('  Building the deck...');
    await build(deckDir);
  }
  const deck = loadDeck(deckDir);
  const remote = createRemote();
  const files = sirv(dist, { dev: true, etag: true });
  let port = opts.port;
  const server = http.createServer(withRemote(remote, () => port, deckDir, (req, res) => files(req, res, () => { res.writeHead(404).end('Not found'); })));
  remote.attach(server);
  port = await listen(server, opts.port, opts.remote ? '0.0.0.0' : '127.0.0.1');
  await announce(`${deck.title} · presenting from dist/`, remote, port, opts.remote, '', opts.open);
}
