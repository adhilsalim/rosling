/* Review comments on the viewer's preview, like Figma: pick the Comment tool, click a point on the slide,
   write, press Add. Added comments wait as dashed pins (up to 3, on any slides); the tray under the
   preview counts them, Send all saves them together and Discard all drops them. Unsent ones are kept in
   this browser until sent. Any comment, sent or not, can be opened to edit or delete it.
   With the Mouse tool, clicks on the slide do nothing; the pins stay visible and can still be opened.
   Comments are saved by the server in the deck's comments.json (src/node/comments.ts). Positions are
   in slide pixels (1920×1080), and pins are placed in percent, so they stay put at any window size.
   Sent comments go to the user's coding agent through `rosling mcp` (src/node/mcp.ts): each one shows
   whether it waits for the agent, the agent is on it, or it is done (with the agent's reply).
   Shown only in the overview, never while presenting. */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { deck } from 'virtual:rosling/deck';
import { W, H } from './Stage';

export type Status = 'sent' | 'working' | 'done';
export interface Comment { id: string; slide: string; x: number; y: number; text: string; created: string; edited?: string; status?: Status; reply?: string }
export const statusOf = (c: Comment): Status => c.status ?? 'sent';
export interface Pending { key: string; slide: string; x: number; y: number; text: string }

export const MAX_PENDING = 3;   // the server takes at most 3 at a time too
const API = '/__rosling/comments';
const STORE = 'rosling:pending-comments';
const POLL = 2000;   // ms between looks at comments.json while the agent has some

function loadPending(): Pending[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || '[]');
    // drop comments on slides that are gone since
    return Array.isArray(list) ? list.filter((p) => deck.slides.some((s) => s.id === p.slide)).slice(0, MAX_PENDING) : [];
  } catch { return []; }
}

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong, try again');
  return d;
}

/** The deck's comments, and the ones added here but not sent yet.
    `ready` is false when there is no server to save them (a plain static copy). */
export function useComments() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [pending, setPending] = useState<Pending[]>(loadPending);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const load = () => fetch(API).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { setComments(d.comments ?? []); setReady(true); }).catch(() => {});
  useEffect(() => { load(); }, []);
  // the agent changes comments.json from its own process: look again while it has work, and when the window comes back
  const busy = comments.some((c) => statusOf(c) !== 'done');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { addEventListener('focus', load); return () => removeEventListener('focus', load); }, []);
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(pending)); } catch { /* private window */ } }, [pending]);

  /* ---- unsent: only in this browser ---- */
  const add = (c: Omit<Pending, 'key'>) => {
    setError('');
    setPending((all) => (all.length >= MAX_PENDING ? all : [...all, { ...c, key: Math.random().toString(36).slice(2) }]));
  };
  const editPending = (key: string, text: string) => setPending((all) => all.map((p) => (p.key === key ? { ...p, text } : p)));
  const removePending = (key: string) => { setError(''); setPending((all) => all.filter((p) => p.key !== key)); };
  const discardAll = () => { setError(''); setPending([]); };
  const sendAll = async () => {
    if (!pending.length || sending) return;
    setSending(true);
    setError('');
    try {
      const d = await call(API, 'POST', { comments: pending.map(({ slide, x, y, text }) => ({ slide, x, y, text })) });
      setComments((all) => [...all, ...(d.comments as Comment[])]);
      setPending([]);
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  };

  /* ---- sent: changed in comments.json ---- */
  const url = (id: string) => `${API}/${encodeURIComponent(id)}`;
  const edit = async (id: string, text: string) => {
    const c: Comment = await call(url(id), 'PATCH', { text });
    setComments((all) => all.map((x) => (x.id === id ? c : x)));
  };
  const remove = async (id: string) => {
    await call(url(id), 'DELETE');
    setComments((all) => all.filter((x) => x.id !== id));
  };

  return { comments, pending, ready, sending, error, add, editPending, removePending, discardAll, sendAll, edit, remove,
    full: pending.length >= MAX_PENDING };
}

export type Comments = ReturnType<typeof useComments>;

const at = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
// near the right or bottom edge, the bubble opens towards the slide's centre so it stays on screen
const side = (x: number, y: number) => (x > W * 0.65 ? ' left' : '') + (y > H * 0.6 ? ' up' : '');

export type Tool = 'mouse' | 'comment';

/** A text box for writing or editing a comment: Enter submits, Shift+Enter is a new line, Esc cancels. */
function Editor({ initial = '', submitLabel, busy, note, onSubmit, onCancel }:
  { initial?: string; submitLabel: string; busy?: boolean; note?: string; onSubmit: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  const ok = !!text.trim() && !busy;
  const submit = () => { if (ok) onSubmit(text.trim()); };
  return (
    <form className="comment-editor" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea ref={input} value={text} rows={3} placeholder="Add a comment" aria-label="Comment"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }} />
      <div className="comment-actions">
        {note && <span className="comment-count">{note}</span>}
        <button type="button" className="comment-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="comment-send" disabled={!ok}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}

/** One pin and, when open, its bubble: read, edit or delete. Unsent comments change at once; sent ones go to the server. */
function Pin({ x, y, label, pending, status, reply, text, when, open, onToggle, onEdit, onDelete }: {
  x: number; y: number; label: string; pending: boolean; status?: Status; reply?: string; text: string; when: string; open: boolean;
  onToggle: () => void; onEdit: (text: string) => void | Promise<void>; onDelete: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'read' | 'edit' | 'confirm'>('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!open) { setMode('read'); setError(''); } }, [open]);

  const run = async (job: () => void | Promise<void>, after: () => void) => {
    setBusy(true); setError('');
    try { await job(); after(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="comment-pin-wrap" style={at(x, y)}>
      <button type="button" className={'comment-pin' + (pending ? ' pending' : ` ${status}`)} aria-label={`${pending ? 'Unsent comment' : 'Comment'} ${label}${status ? `, ${STATUS[status]}` : ''}`}
        aria-expanded={open} onClick={onToggle}>{label}</button>
      {open && (
        <div className={'comment-bubble' + side(x, y)}>
          {mode === 'edit' ? (
            <Editor initial={text} submitLabel="Save" busy={busy} onCancel={() => setMode('read')}
              onSubmit={(t) => (t === text ? setMode('read') : run(() => onEdit(t), () => setMode('read')))} />
          ) : (
            <>
              <p className="comment-text">{text}</p>
              <p className="comment-when">{when}</p>
              {status === 'done' ? (
                <div className="comment-reply"><span>Agent</span><p>{reply || 'Done.'}</p></div>
              ) : status && <p className={'comment-status ' + status}>{STATUS[status]}</p>}
              {mode === 'confirm' ? (
                <div className="comment-actions">
                  <span className="comment-count">Delete this comment?</span>
                  <button type="button" className="comment-cancel" onClick={() => setMode('read')}>Keep</button>
                  <button type="button" className="comment-danger" disabled={busy} onClick={() => run(onDelete, () => {})}>{busy ? 'Deleting…' : 'Delete'}</button>
                </div>
              ) : (
                <div className="comment-actions">
                  <button type="button" className="comment-cancel" onClick={() => setMode('edit')}>Edit</button>
                  {/* an unsent comment is only a draft: delete it straight away */}
                  <button type="button" className="comment-cancel danger" onClick={() => (pending ? onDelete() : setMode('confirm'))}>Delete</button>
                </div>
              )}
            </>
          )}
          {error && <p className="comment-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<Status, string> = { sent: 'Waiting for your agent', working: 'Your agent is working on it', done: 'Done' };

const stamp = (c: Comment) => (c.edited ? `Edited ${new Date(c.edited).toLocaleString()}` : new Date(c.created).toLocaleString());

export function CommentLayer({ slide, notes, placing }: { slide: string; notes: Comments; placing: boolean }) {
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const sent = notes.comments.filter((c) => c.slide === slide);
  const waiting = notes.pending.filter((p) => p.slide === slide);

  useEffect(() => { if (!placing) setDraft(null); }, [placing]);   // back to the mouse: drop the comment being written

  const place = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;   // clicks on a pin or the bubble don't place a new comment
    setOpenId(null);
    if (!placing || notes.full || notes.sending) return;
    const r = e.currentTarget.getBoundingClientRect();
    setDraft({ x: Math.round(((e.clientX - r.left) / r.width) * W), y: Math.round(((e.clientY - r.top) / r.height) * H) });
  };

  const toggle = (id: string) => { setDraft(null); setOpenId(openId === id ? null : id); };
  const hint = !placing || draft ? undefined : notes.full ? `Send your ${MAX_PENDING} comments to add more` : 'Click to comment';

  return (
    <div className={'comment-layer' + (placing ? (notes.full ? ' full' : ' placing') : '')} onClick={place} title={hint}>
      {sent.map((c, n) => (
        <Pin key={c.id} x={c.x} y={c.y} label={String(n + 1)} pending={false} status={statusOf(c)} reply={c.reply} text={c.text} when={stamp(c)}
          open={openId === c.id} onToggle={() => toggle(c.id)}
          onEdit={(t) => notes.edit(c.id, t)} onDelete={async () => { await notes.remove(c.id); setOpenId(null); }} />
      ))}
      {waiting.map((p, n) => (
        <Pin key={p.key} x={p.x} y={p.y} label={String(sent.length + n + 1)} pending text={p.text} when="Not sent yet"
          open={openId === p.key} onToggle={() => toggle(p.key)}
          onEdit={(t) => notes.editPending(p.key, t)} onDelete={() => { notes.removePending(p.key); setOpenId(null); }} />
      ))}
      {draft && (
        <div className="comment-pin-wrap" style={at(draft.x, draft.y)}>
          <span className="comment-pin draft" aria-hidden="true">+</span>
          <div className={'comment-bubble' + side(draft.x, draft.y)}>
            <Editor submitLabel="Add" note={`${notes.pending.length + 1} of ${MAX_PENDING}`} onCancel={() => setDraft(null)}
              onSubmit={(text) => { notes.add({ slide, x: draft.x, y: draft.y, text }); setDraft(null); }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The tray under the preview: how many comments wait, where they are, Discard all and Send all. */
export function CommentTray({ notes, onGoto }: { notes: Comments; onGoto: (index: number) => void }) {
  const [confirm, setConfirm] = useState(false);
  const n = notes.pending.length;
  useEffect(() => { if (!n) setConfirm(false); }, [n]);
  const agent = useAgentState(notes.comments);
  if (!n && !notes.error) return agent.shown ? <AgentTray {...agent} /> : null;
  const slides = [...new Set(notes.pending.map((p) => deck.slides.findIndex((s) => s.id === p.slide)))].filter((i) => i >= 0).sort((a, b) => a - b);
  return (
    <div className="comment-tray" role="status">
      <span className="tray-dots" aria-hidden="true">
        {Array.from({ length: MAX_PENDING }, (_, j) => <i key={j} className={j < n ? 'on' : ''} />)}
      </span>
      {confirm ? (
        <span className="tray-text"><b>Discard {n === 1 ? 'this comment' : `all ${n} comments`}?</b> They haven't been sent.</span>
      ) : (
        <span className="tray-text">
          <b>{n} comment{n === 1 ? '' : 's'}</b> added
          {slides.length > 0 && <> on slide{slides.length > 1 ? 's' : ''} {slides.map((i, k) => (
            <span key={i}>{k === 0 ? '' : k === slides.length - 1 ? ' and ' : ', '}<button type="button" className="tray-slide" title={`Go to slide ${i + 1}`} onClick={() => onGoto(i)}>{i + 1}</button></span>
          ))}</>}
          {notes.full && ' · limit reached'}
        </span>
      )}
      {notes.error && !confirm && <span className="tray-error">{notes.error}</span>}
      {confirm ? (
        <>
          <button type="button" className="tray-ghost" onClick={() => setConfirm(false)}>Keep</button>
          <button type="button" className="tray-danger" onClick={() => { notes.discardAll(); setConfirm(false); }}>Discard</button>
        </>
      ) : (
        <>
          {n > 0 && <button type="button" className="tray-ghost" disabled={notes.sending} onClick={() => setConfirm(true)}>Discard all</button>}
          <button type="button" className="tray-send" disabled={!n || notes.sending} onClick={notes.sendAll}>
            {notes.sending ? 'Sending…' : 'Send all'}
          </button>
        </>
      )}
    </div>
  );
}

/** What the agent is doing with the sent comments, and a short "finished" note when it is done with all of them. */
function useAgentState(comments: Comment[]) {
  const waiting = comments.filter((c) => statusOf(c) === 'sent').length;
  const working = comments.filter((c) => statusOf(c) === 'working').length;
  const open = waiting + working;
  const [finished, setFinished] = useState(0);
  const [stale, setStale] = useState(false);
  const before = useRef(open);
  useEffect(() => {
    if (before.current > 0 && open === 0) setFinished(before.current);
    if (open) setFinished(0);
    before.current = open;
  }, [open]);
  useEffect(() => { if (!finished) return; const t = setTimeout(() => setFinished(0), 6000); return () => clearTimeout(t); }, [finished]);
  // nobody picked them up for a while: probably no agent is listening
  useEffect(() => {
    setStale(false);
    if (!waiting || working) return;
    const t = setTimeout(() => setStale(true), 10000);
    return () => clearTimeout(t);
  }, [waiting, working]);
  return { waiting, working, finished, stale, shown: open > 0 || finished > 0 };
}

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

function AgentTray({ waiting, working, finished, stale }: ReturnType<typeof useAgentState>) {
  const [help, setHelp] = useState(false);
  useEffect(() => { if (!stale) setHelp(false); }, [stale]);
  return (
    <div className="comment-tray agent" role="status">
      {help && (
        <div className="tray-help">
          <b>Connect your coding agent</b>
          <ol>
            <li>In the deck folder, run <code>rosling connect claude</code> (or <code>codex</code>, <code>gemini</code>, <code>cursor</code>).</li>
            <li>Start the agent there and ask it to <i>listen for my slide comments</i> (in Claude Code: <code>/rosling-review</code>).</li>
          </ol>
          <span>Your comments are saved, so the agent picks them up as soon as it starts listening.</span>
        </div>
      )}
      {finished ? (
        <span className="tray-done" aria-hidden="true">✓</span>
      ) : (
        <span className={'tray-spin' + (working ? ' on' : '')} aria-hidden="true" />
      )}
      <span className="tray-text">
        {finished ? <><b>Your agent finished</b> {plural(finished, 'comment')}</>
          : working ? <><b>Your agent is working</b> on {plural(working, 'comment')}{waiting ? ` · ${waiting} waiting` : ''}</>
          : <><b>Sent {plural(waiting, 'comment')}</b> · {stale ? 'no agent has picked them up yet' : 'waiting for your agent'}</>}
      </span>
      {stale && !working && !finished && (
        <button type="button" className="tray-ghost" aria-expanded={help} onClick={() => setHelp((h) => !h)}>{help ? 'Close' : 'How to connect'}</button>
      )}
    </div>
  );
}
