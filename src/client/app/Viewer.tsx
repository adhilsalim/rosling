/* The viewer: slide list on the left, the selected slide in the centre, and presenter mode.

   Keys (overview):  ↑ ↓ select slide · Enter or P present · V mouse · C comment
   Keys (presenter): → ↓ Space PageDown next · ← ↑ PageUp previous · Home / End · Esc exit
   Clicking the preview adds a review comment (Comments.tsx). Clicking never changes slide. Present goes full screen; if the browser refuses (or the page was reloaded
   during a talk), the first key or click goes full screen instead. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { deck } from 'virtual:rosling/deck';
import { Stage, SlideView } from './Stage';
import { useSync, type Dir } from './sync';
import { QrCode } from './parts';
import { CommentLayer, CommentTray, useComments, type Tool } from './Comments';
import { Ambient, useAmbientSetting } from './Ambient';
import { dur } from './time';

const pad = (n: number) => (n < 10 ? '0' : '') + n;

export function Viewer({ start }: { start: number }) {
  const total = deck.slides.length;
  const sync = useSync(total, 'deck', start);
  const [open, setOpen] = useState(false);            // presenter mode shown in this tab
  const [full, setFull] = useState(false);
  const [pairing, setPairing] = useState(false);
  const notes = useComments();
  const [tool, setTool] = useState<Tool>('mouse');
  const [ambient, toggleAmbient] = useAmbientSetting();
  const present = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const i = Math.min(sync.index, total - 1);
  const slide = deck.slides[i];

  // the remote or another tab can end the talk too
  const wasPresenting = useRef(sync.presenting);
  useEffect(() => {
    if (wasPresenting.current && !sync.presenting) setOpen(false);
    // a reload in the middle of a talk comes back into presenter mode (windowed until a key is pressed)
    if (!wasPresenting.current && sync.presenting && sync.connected) setOpen(true);
    wasPresenting.current = sync.presenting;
  }, [sync.presenting, sync.connected]);

  useEffect(() => {
    thumbs.current?.children[i]?.scrollIntoView({ block: 'nearest' });
    history.replaceState(null, '', '#/' + (i + 1));
  }, [i]);

  const goFull = () => { if (!document.fullscreenElement) present.current?.requestFullscreen?.().catch(() => {}); };

  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const startPresenting = () => {
    if (!total) return;
    setOpen(true);
    sync.present(true);
    goFull();
  };
  const stopPresenting = useCallback(() => {
    setOpen(false);
    sync.present(false);
    if (document.fullscreenElement) document.exitFullscreen();
  }, [sync.present]);

  useEffect(() => {
    const onChange = () => {
      setFull(!!document.fullscreenElement);
      if (!document.fullscreenElement && open && full) stopPresenting();   // Esc handled by the browser
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [open, full, stopPresenting]);

  const needsFull = () => {
    if (!open || document.fullscreenElement || !present.current?.requestFullscreen) return false;
    goFull();
    return true;
  };

  onKeyRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const target = e.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    const move = (d: Dir) => sync.nav(d);
    if (open) {
      if (k !== 'Escape' && needsFull()) { e.preventDefault(); return; }
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(k)) move('next');
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) move('prev');
      else if (k === 'Home') move('first');
      else if (k === 'End') move('last');
      else if (k === 'Escape') stopPresenting();
      else return;
    } else {
      if (k === 'ArrowDown') move('next');
      else if (k === 'ArrowUp') move('prev');
      else if ((k === 'Enter' && target === document.body) || k === 'p' || k === 'P') startPresenting();
      else if (k === 'Escape') setPairing(false);
      else if ((k === 'v' || k === 'V') && notes.ready) setTool('mouse');
      else if ((k === 'c' || k === 'C') && notes.ready) setTool('comment');
      else return;
    }
    e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKeyRef.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // show the cursor and the counter briefly when the mouse moves in presenter mode
  const [cursor, setCursor] = useState(false);
  const idle = useRef(0);
  const onMove = () => { setCursor(true); clearTimeout(idle.current); idle.current = window.setTimeout(() => setCursor(false), 1500); };

  if (!total) return <Empty />;

  return (
    <div className="viewer">
      <header className="bar">
        <h1>{deck.title}</h1>
        <nav>
          <button type="button" className="ambient-btn" aria-pressed={ambient} title={`Ambient light: ${ambient ? 'on' : 'off'}`} onClick={toggleAmbient}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" /><path d="M8 .8v2M8 13.2v2M.8 8h2M13.2 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4" /></svg>
            Ambient
          </button>
          {notes.ready && (
            <div className="tools" role="group" aria-label="Tool">
              <button type="button" aria-pressed={tool === 'mouse'} title="Mouse (V)" onClick={() => setTool('mouse')}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v12l3.2-3.1 2.1 4.6 1.9-.9-2.1-4.5H12.5z" /></svg>Mouse
              </button>
              <button type="button" aria-pressed={tool === 'comment'} title="Comment (C)" onClick={() => setTool('comment')}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 1-3.1 12.2L1.5 14.5l.8-3.4A6.5 6.5 0 0 1 8 1.5z" /></svg>Comment
              </button>
            </div>
          )}
          <a href="#/gallery">Templates</a>
          <button type="button" className={'remote-btn' + (sync.remotes ? ' live' : '')} onClick={() => setPairing(true)}>
            Phone remote{sync.remotes ? ` · ${sync.remotes} connected` : ''}
          </button>
          <button type="button" className="present-btn" onClick={startPresenting}>Present</button>
        </nav>
      </header>

      <aside className="thumbs" ref={thumbs}>
        {deck.slides.map((s, j) => (
          <button type="button" key={s.id} className="thumb" aria-current={j === i} onClick={() => sync.goto(j)}>
            <span className="n">{j + 1}</span>
            <span className="box">
              <Stage className={s.errors.length ? 'has-errors' : ''}><SlideView index={j} mode="thumb" /></Stage>
              <span className="label">{s.title}</span>
              {notes.pending.some((p) => p.slide === s.id) && <span className="thumb-badge" title="Unsent comments">{notes.pending.filter((p) => p.slide === s.id).length}</span>}
            </span>
          </button>
        ))}
      </aside>

      <main className="preview">
        {deck.errors.length > 0 && <div className="deck-errors">{deck.errors.map((e, j) => <p key={j}>{e}</p>)}</div>}
        <div className="preview-frame">
          <Ambient index={i} on={ambient} />
          <Stage className="preview-stage"><SlideView index={i} mode="preview" /></Stage>
          {notes.ready && !open && <CommentLayer key={slide.id} slide={slide.id} notes={notes} placing={tool === 'comment'} />}
        </div>
        <div className="meta">
          <span>Slide {i + 1} of {total}</span>
          <span className="path">slides/{slide.id}.json</span>
          <a href={`#/gallery/${slide.template}`}>{slide.template}</a>
          {slide.time > 0 && <span>{dur(slide.time * 1000)}</span>}
        </div>
        {slide.notes && <p className="notes">{slide.notes}</p>}
        {!open && <CommentTray notes={notes} onGoto={sync.goto} />}
      </main>

      <div ref={present} className={'present' + (open ? ' open' : '') + (open && !full ? ' windowed' : '') + (cursor ? ' show-cursor' : '')}
        onClick={needsFull} onMouseMove={onMove} hidden={!open}>
        {open && <Stage><SlideView index={i} mode="present" timer={{ talkStart: sync.talkStart, slideStart: sync.slideStart, offset: sync.offset,
          talkLimit: deck.time * 1000, slideLimit: slide.time * 1000 }} /></Stage>}
        <div className="present-count">{i + 1} / {total}</div>
        <div className="present-hint">Press any key or click for full screen</div>
      </div>

      {pairing && <Pairing remotes={sync.remotes} connected={sync.connected} onClose={() => setPairing(false)} />}
    </div>
  );
}

/** The pairing card: a QR code for the phone. Shown only in the viewer (on the laptop), never on the slides. */
function Pairing({ remotes, connected, onClose }: { remotes: number; connected: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!connected) { setUrl(null); return; }
    fetch('/__rosling/pair').then((r) => r.json()).then((d) => setUrl(d.url)).catch(() => setUrl(null));
  }, [connected]);
  return (
    <div className="dialog-back" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Phone remote" onClick={(e) => e.stopPropagation()}>
        <h2>Use your phone as a remote</h2>
        {url === undefined ? <p>Loading…</p> : url ? (
          <>
            <p>Scan with your phone's camera. It must be on the same Wi-Fi as this computer.</p>
            <QrCode className="pair-qr" value={url} />
            <p className="pair-url">{url}</p>
            <p className="pair-note">Anyone with this code can move your slides: don't show it on the projector.</p>
          </>
        ) : (
          <p>{connected ? 'This computer isn\'t on a network. Connect to Wi-Fi and restart the server.' : 'The phone remote needs the server: run "rosling dev" or "rosling present".'}</p>
        )}
        <p className="pair-status">{remotes ? `${remotes} phone${remotes > 1 ? 's' : ''} connected` : 'No phone connected yet'}</p>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="empty">
      <h1>{deck.title}</h1>
      <p>This deck has no slides yet. Add one with</p>
      <pre>rosling new welcome --template core/cover</pre>
      <p>or browse the <a href="#/gallery">templates</a>.</p>
      {deck.errors.map((e, j) => <p key={j} className="deck-errors">{e}</p>)}
    </div>
  );
}

export { pad };
