/* `rosling mcp`: rosling for AI agents (Claude Code, Codex, Gemini CLI, Cursor, Claude Desktop... anything
   that speaks MCP). The agent starts this as a subprocess and talks JSON-RPC over stdin/stdout, one message
   per line. stdout carries only protocol messages; logs go to stderr.

   Two sets of tools: making and editing decks (tools.ts), and the viewer's review comments (here).
   `--deck` is a deck, or a folder of decks; the agent can only touch decks inside it.

   Agents can't be woken from outside, so the agent listens: wait_for_comments blocks until the user
   presses Send all in the viewer, hands the new comments over (marking them working), and the agent
   edits the slide files and calls resolve_comment with a short reply. The viewer shows each step.
   Everything goes through the deck's comments.json, like the rest of rosling. */
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { loadDeck } from './deck.js';
import { DECK_TOOLS, runDeckTool, workspace, deckDir as pickDeck, type Workspace } from './tools.js';
import { readComments, changeComments, commentsFile, MAX_TEXT, type Comment } from './comments.js';

const VERSION = '0.1.0';
const WAIT_DEFAULT = 45;   // seconds; some agents give up on a tool call after 60
const WAIT_MAX = 600;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];   // MCP versions this server speaks, newest first

const INSTRUCTIONS = `Rosling: presentations as data. A slide is a small JSON file that picks a template and fills in its boxes
(values); there is never per-slide code or CSS. To make a talk: create_deck, list_templates, then add_slide / update_slide
for each slide, and check_deck. Ask the user how long each slide should take instead of guessing. Put the event, date and
venue in the deck's config (update_deck) and write {event}, {date}, {venue} in slide text. Text accepts **bold**, *italic*, \`code\`.
The user sees the deck with \`rosling dev --deck <folder>\`.

Review comments: the user pins comments on slides in the rosling viewer and presses Send all. To act on them: call
wait_for_comments (it returns as soon as comments arrive, or empty after a while: then call it again). For each comment:
get_slide, make the change it asks for with update_slide (a slide only fills in its template's values), then call
resolve_comment with one or two plain sentences on what you changed (or why you didn't). Then wait again, until the user
asks you to stop.`;

const deckArg = { deck: { type: 'string', description: 'the deck folder; may be left out after create_deck, when the server was started in a deck, or when there is only one deck' } };
const COMMENT_NAMES = ['wait_for_comments', 'list_comments', 'resolve_comment'];

const COMMENT_TOOLS = [
  {
    name: 'wait_for_comments',
    description: 'Wait for new review comments from the rosling viewer. Returns as soon as the user sends some (they are then marked as being worked on), or an empty list after timeout_seconds. Call it again to keep listening.',
    inputSchema: { type: 'object', properties: { ...deckArg, timeout_seconds: { type: 'number', description: `how long to wait, 1 to ${WAIT_MAX} (default ${WAIT_DEFAULT})` } } },
  },
  {
    name: 'list_comments',
    description: 'Every review comment that is not done yet (sent or being worked on), with its slide. include_done adds the finished ones.',
    inputSchema: { type: 'object', properties: { ...deckArg, include_done: { type: 'boolean' } } },
  },
  {
    name: 'resolve_comment',
    description: 'Mark a review comment as done, with a short reply the user sees on the slide: what you changed, or why you did not.',
    inputSchema: { type: 'object', properties: { ...deckArg, id: { type: 'string' }, reply: { type: 'string' } }, required: ['id', 'reply'] },
  },
];

const TOOLS = [...DECK_TOOLS, ...COMMENT_TOOLS];

const status = (c: Comment) => c.status ?? 'sent';

// a rough place on the slide, so the agent knows which box the comment points at
function where(x: number, y: number) {
  const row = y < 360 ? 'top' : y < 720 ? 'middle' : 'bottom';
  const col = x < 640 ? 'left' : x < 1280 ? 'centre' : 'right';
  return row === 'middle' && col === 'centre' ? 'centre' : `${row} ${col}`;
}

/** A comment with what the agent needs to act on it: the slide's number, title, template and file. */
function describe(deckDir: string, list: Comment[]) {
  const deck = loadDeck(deckDir);
  return list.map((c) => {
    const n = deck.slides.findIndex((s) => s.id === c.slide);
    const s = deck.slides[n];
    return {
      id: c.id,
      comment: c.text,
      status: status(c),
      ...(c.reply ? { reply: c.reply } : {}),
      slide: s ? { number: n + 1, id: s.id, title: s.title, template: s.template, file: `slides/${s.id}.json` } : { id: c.slide, missing: 'this slide is no longer in the deck' },
      point: { x: c.x, y: c.y, of: '1920×1080', where: where(c.x, c.y) },
    };
  });
}

/** Marks every sent comment as working and returns them. Under the lock, so two agents never get the same one. */
function claim(deckDir: string): Comment[] {
  try {
    return changeComments(deckDir, (all) => {
      const claimed = new Date().toISOString();
      const fresh = all.filter((c) => status(c) === 'sent').map((c): Comment => ({ ...c, status: 'working', claimed }));
      if (!fresh.length) return [null, []];
      return [all.map((c) => fresh.find((f) => f.id === c.id) ?? c), fresh];
    });
  } catch { return []; }   // busy or broken: try again on the next look
}

/** Set when the agent cancels the call (or gave up on it): then nothing is claimed for it. */
interface Call { cancelled: boolean }

async function waitForComments(deckDir: string, seconds: number, call: Call) {
  const until = Date.now() + seconds * 1000;
  let seen = -1;
  for (;;) {
    if (call.cancelled) return text('Cancelled.');
    // look again only when the file changed (cheap stat), or the first time
    const mtime = fs.existsSync(commentsFile(deckDir)) ? fs.statSync(commentsFile(deckDir)).mtimeMs : 0;
    if (mtime !== seen) {
      seen = mtime;
      const got = claim(deckDir);
      if (got.length) return text(`${got.length} new comment${got.length === 1 ? '' : 's'}. Act on each, then call resolve_comment with a short reply.\n\n${JSON.stringify(describe(deckDir, got), null, 2)}`);
    }
    if (Date.now() >= until) return text('No new comments yet. Call wait_for_comments again to keep listening.');
    await new Promise((r) => setTimeout(r, 500));
  }
}

function resolve(deckDir: string, id: unknown, reply: unknown) {
  if (typeof id !== 'string') throw new Error('id must be a string');
  const r = typeof reply === 'string' ? reply.trim() : '';
  if (!r || r.length > MAX_TEXT) throw new Error(`reply: write 1 to ${MAX_TEXT} characters`);
  const found = changeComments(deckDir, (all) => {
    if (!all.some((c) => c.id === id)) return [null, false];
    return [all.map((c) => { if (c.id !== id) return c; const { claimed: _, ...rest } = c; return { ...rest, status: 'done' as const, reply: r }; }), true];
  });
  if (!found) throw new Error(`no comment "${id}" (the user may have deleted it)`);
  return text('Done. The user sees your reply on the slide.');
}

const text = (t: string) => ({ content: [{ type: 'text', text: t }] });

async function callTool(ws: Workspace, name: string, args: Record<string, unknown>, call: Call) {
  const done = runDeckTool(ws, name, args);
  if (done !== null) return text(done);
  if (!COMMENT_NAMES.includes(name)) throw new Error(`unknown tool "${name}"`);
  const deckDir = pickDeck(ws, args.deck);
  switch (name) {
    case 'wait_for_comments': {
      const s = typeof args.timeout_seconds === 'number' && isFinite(args.timeout_seconds) ? args.timeout_seconds : WAIT_DEFAULT;
      return waitForComments(deckDir, Math.max(1, Math.min(WAIT_MAX, s)), call);
    }
    case 'list_comments': {
      const list = readComments(deckDir).filter((c) => args.include_done === true || status(c) !== 'done');
      return text(list.length ? JSON.stringify(describe(deckDir, list), null, 2) : 'No open comments.');
    }
    case 'resolve_comment': return resolve(deckDir, args.id, args.reply);
    default: throw new Error(`unknown tool "${name}"`);
  }
}

/** Started without --deck, the server looks for the deck in the folder the agent started it in and the
    ones above it, like git does, so project configs need no paths. */
function findDeck(from: string) {
  for (let d = path.resolve(from); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'deck.json'))) return d;
    if (path.dirname(d) === d) return from;
  }
}

export function mcp(dir: string, search = false) {
  if (!fs.existsSync(dir)) throw new Error(`${dir} not found (pass --deck <a deck, or a folder for decks>)`);
  const ws = workspace(search ? findDeck(dir) : dir);
  const out = (m: unknown) => process.stdout.write(JSON.stringify(m) + '\n');
  const calls = new Map<number | string, Call>();   // tool calls still running, by request id
  const lines = createInterface({ input: process.stdin });
  // the agent went away: nobody can read an answer now. A wait still running has claimed nothing, and
  // deck changes are synchronous, so leaving at once never cuts a write in half
  lines.on('close', () => process.exit(0));
  lines.on('line', async (line) => {
    if (!line.trim()) return;
    let m: { id?: number | string; method?: string; params?: Record<string, unknown> };
    try { m = JSON.parse(line); } catch { out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'not valid JSON' } }); return; }
    // MCP dropped JSON-RPC batches in 2025-06-18
    if (Array.isArray(m) || !m || typeof m !== 'object') { out({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'send one request per line (no batches)' } }); return; }
    if (m.method === 'notifications/cancelled') {
      const c = calls.get(m.params?.requestId as number | string);
      if (c) c.cancelled = true;
      return;
    }
    if (m.id === undefined || !m.method) return;   // other notifications and replies need no answer
    const ok = (result: unknown) => out({ jsonrpc: '2.0', id: m.id, result });
    const fail = (code: number, message: string) => out({ jsonrpc: '2.0', id: m.id, error: { code, message } });
    switch (m.method) {
      case 'initialize': {
        const asked = m.params?.protocolVersion;
        return ok({
          protocolVersion: typeof asked === 'string' && PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'rosling', version: VERSION },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'tools/call': {
        const p = m.params ?? {};
        const call: Call = { cancelled: false };
        calls.set(m.id, call);
        try {
          const result = await callTool(ws, String(p.name), (p.arguments as Record<string, unknown>) ?? {}, call);
          if (!call.cancelled) ok(result);   // a cancelled request gets no answer
        } catch (e) { if (!call.cancelled) ok({ ...text((e as Error).message), isError: true }); }
        finally { calls.delete(m.id); }
        return;
      }
      default: return fail(-32601, `unknown method ${m.method}`);
    }
  });
  console.error(`rosling mcp: ${ws.current ? `deck ${ws.current}` : `decks in ${ws.root}`}`);
}
