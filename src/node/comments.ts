/* Review comments: notes pinned to a point on a slide, like comments in Figma. They live in the deck's
   comments.json (not in the slide files, which stay pure data), so people and agents read the same thing.
   x and y are in slide pixels (the 1920×1080 canvas), so they don't depend on the window size.
   A comment goes sent → working (an agent picked it up through `rosling mcp`) → done (with the agent's reply).
   The dev server and agents' MCP servers are separate processes, so every change to the file happens under a lock. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';

export const COMMENTS_PATH = '/__rosling/comments';
export const MAX_TEXT = 5000;
export const MAX_BATCH = 3;   // comments sent together at most (the viewer collects up to 3, then sends them)
// an agent that took a comment and hasn't answered in this long has probably gone (cancelled, timed out, closed):
// the comment counts as sent again, so the next agent that listens gets it
export const LEASE_MS = 15 * 60 * 1000;

export type Status = 'sent' | 'working' | 'done';
export interface Comment {
  id: string; slide: string; x: number; y: number; text: string; created: string; edited?: string;
  status?: Status;   // missing means sent
  reply?: string;    // what the agent did, set when done
  claimed?: string;  // when an agent took it (status working)
}

export const commentsFile = (deckDir: string) => path.join(path.resolve(deckDir), 'comments.json');

export function readComments(deckDir: string): Comment[] {
  const file = commentsFile(deckDir);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list: Comment[] = Array.isArray(data?.comments) ? data.comments : [];
  const now = Date.now();
  return list.map(({ claimed, ...c }) => (c.status === 'working' && (!claimed || now - Date.parse(claimed) > LEASE_MS)
    ? { ...c, status: 'sent' as const } : claimed ? { ...c, claimed } : c));
}

function writeComments(deckDir: string, comments: Comment[]) {
  const file = commentsFile(deckDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ comments }, null, 2) + '\n');
  fs.renameSync(tmp, file);   // never leave a half-written file behind
}

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Reads, changes and writes comments.json while holding a lock file, so two processes never both
    take the same comment or lose each other's changes. `change` returns the new list (or null to
    leave the file alone) and a result. A lock older than 10 seconds belongs to a process that died. */
export function changeComments<T>(deckDir: string, change: (all: Comment[]) => [Comment[] | null, T]): T {
  const lock = commentsFile(deckDir) + '.lock';
  const start = Date.now();
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) { fs.rmSync(lock, { force: true }); continue; } } catch { continue; }
      if (Date.now() - start > 3000) throw new Error('comments.json is busy, try again');
      pause(15);
    }
  }
  try {
    const [next, result] = change(readComments(deckDir));
    if (next) writeComments(deckDir, next);
    return result;
  } finally { fs.rmSync(lock, { force: true }); }
}

/** The slides listed in deck.json. */
function deckSlides(deckDir: string): string[] {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(path.resolve(deckDir), 'deck.json'), 'utf8'));
    return Array.isArray(meta.slides) ? meta.slides.map(String) : [];
  } catch { return []; }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 64 * 1024) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** What is wrong with one comment from the viewer, or '' when it is fine. */
function check(slides: string[], c: Record<string, unknown>): string {
  if (!c || typeof c !== 'object') return 'each comment must be an object';
  const slide = typeof c.slide === 'string' ? c.slide : '';
  const text = typeof c.text === 'string' ? c.text.trim() : '';
  if (!slides.includes(slide)) return 'no such slide in the deck';
  if (!text || text.length > MAX_TEXT) return `write 1 to ${MAX_TEXT} characters`;
  if (typeof c.x !== 'number' || typeof c.y !== 'number' || !isFinite(c.x) || !isFinite(c.y)) return 'x and y must be numbers';
  return '';
}

const send = (res: http.ServerResponse, code: number, data: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

/** The comments API. Returns false for other requests.
    GET    /__rosling/comments        every comment
    POST   /__rosling/comments        add 1 to 3: { comments: [{ slide, x, y, text }] }, saved whole or not at all
    PATCH  /__rosling/comments/<id>   change the text: { text }
    DELETE /__rosling/comments/<id>   remove one */
export function commentsHandler(deckDir: string) {
  return (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;
    if (pathname.startsWith(COMMENTS_PATH + '/')) {
      let id: string;
      try { id = decodeURIComponent(pathname.slice(COMMENTS_PATH.length + 1)); }
      catch { send(res, 400, { error: 'bad comment id' }); return true; }
      one(deckDir, id, req, res);
      return true;
    }
    if (pathname !== COMMENTS_PATH) return false;
    if (req.method === 'GET') {
      try { send(res, 200, { comments: readComments(deckDir) }); }
      catch (e) { send(res, 500, { error: `comments.json: ${(e as Error).message}` }); }
      return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'use GET or POST' }); return true; }
    // JSON only: a browser can't send that from another site without asking first, so web pages can't post here
    if (!req.headers['content-type']?.startsWith('application/json')) { send(res, 415, { error: 'send JSON' }); return true; }
    readBody(req).then((body) => {
      let m: Record<string, unknown>;
      try { m = JSON.parse(body); } catch { send(res, 400, { error: 'not valid JSON' }); return; }
      const list = m.comments;
      if (!Array.isArray(list) || !list.length || list.length > MAX_BATCH) { send(res, 400, { error: `send 1 to ${MAX_BATCH} comments` }); return; }
      const added: Comment[] = [];
      const slides = deckSlides(deckDir);
      for (const c of list as Record<string, unknown>[]) {
        const problem = check(slides, c);
        if (problem) { send(res, 400, { error: problem }); return; }
        added.push({
          id: 'c-' + crypto.randomBytes(4).toString('hex'),
          slide: c.slide as string,
          x: Math.round(Math.max(0, Math.min(1920, c.x as number))),
          y: Math.round(Math.max(0, Math.min(1080, c.y as number))),
          text: (c.text as string).trim(),
          created: new Date().toISOString(),
          status: 'sent',
        });
      }
      changeComments(deckDir, (all) => [[...all, ...added], null]);
      send(res, 201, { comments: added });
    }).catch((e) => send(res, 400, { error: (e as Error).message }));
    return true;
  };
}

/** PATCH (new text) or DELETE one comment by its id. */
function one(deckDir: string, id: string, req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') { send(res, 405, { error: 'use PATCH or DELETE' }); return; }
  if (req.method === 'PATCH' && !req.headers['content-type']?.startsWith('application/json')) { send(res, 415, { error: 'send JSON' }); return; }
  readBody(req).then((body) => {
    let text = '';
    if (req.method === 'PATCH') {
      let m: Record<string, unknown>;
      try { m = JSON.parse(body); } catch { send(res, 400, { error: 'not valid JSON' }); return; }
      text = typeof m.text === 'string' ? m.text.trim() : '';
      if (!text || text.length > MAX_TEXT) { send(res, 400, { error: `write 1 to ${MAX_TEXT} characters` }); return; }
    }
    const result = changeComments(deckDir, (all): [Comment[] | null, Comment | null | 'deleted'] => {
      const i = all.findIndex((c) => c.id === id);
      if (i < 0) return [null, null];
      if (req.method === 'DELETE') return [all.filter((_, j) => j !== i), 'deleted'];
      // changed text is new feedback: it goes back to the agent
      const { reply: _r, claimed: _c, ...rest } = all[i];
      const c: Comment = { ...rest, text, edited: new Date().toISOString(), status: 'sent' };
      return [all.map((x, j) => (j === i ? c : x)), c];
    });
    if (!result) send(res, 404, { error: 'that comment is gone' });
    else send(res, 200, result === 'deleted' ? { deleted: id } : result);
  }).catch((e) => send(res, 400, { error: (e as Error).message }));
}
