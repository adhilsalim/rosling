/* Phone remote (#/remote): the current and next slide side by side, the speaker notes, the talk timers,
   and swipe (or the Prev / Next buttons) to move. It talks to the same hub as the presenter, so a tap here moves
   the projector. The phone buzzes once when a slide runs over its planned time (Android). */
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { deck } from 'virtual:rosling/deck';
import { Stage, SlideView } from './Stage';
import { useSync, type Dir } from './sync';
import { useNow } from './Timer';
import { clock, elapsed, over } from './time';

export function Remote() {
  const total = deck.slides.length;
  const sync = useSync(total, 'remote');
  const now = useNow(500) + sync.offset;
  const i = Math.min(sync.index, total - 1);
  const slide = deck.slides[i], next = deck.slides[i + 1];
  const talk = now - sync.talkStart, spent = now - sync.slideStart;
  const talkLimit = deck.time * 1000, slideLimit = (slide?.time ?? 0) * 1000;
  const slideOver = sync.presenting && over(spent, slideLimit);

  const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
  const move = (d: Dir) => { if (!sync.connected) return; buzz(12); sync.nav(d); };

  // one long buzz when the current slide goes over its time
  const buzzed = useRef(-1);
  useEffect(() => { if (slideOver && buzzed.current !== i) { buzzed.current = i; buzz([180, 90, 180]); } }, [slideOver, i]);

  // keep the screen on where the browser allows it (it needs https, so often it can't on a local network)
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const ask = () => (navigator as any).wakeLock?.request('screen').then((l: typeof lock) => { lock = l; setAwake(true); }).catch(() => setAwake(false));
    if (!('wakeLock' in navigator)) setAwake(false); else ask();
    const again = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', again);
    return () => { document.removeEventListener('visibilitychange', again); lock?.release(); };
  }, []);

  // swipe left for next, right for previous
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 'next' : 'prev');
  };

  // a Bluetooth clicker or keyboard paired with the phone works too
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) move('next');
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) move('prev');
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  });

  if (!total) return <div className="remote"><p className="remote-empty">This deck has no slides yet.</p></div>;

  return (
    <div className="remote" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="remote-top">
        <span className={'dot' + (sync.connected ? ' on' : '')} />
        <span>{sync.connected ? 'Connected' : 'Reconnecting…'}</span>
        <span className="remote-count"><b>{i + 1}</b> / {total}</span>
      </header>

      <div className="remote-times">
        {sync.presenting ? (
          <>
            <div className={over(talk, talkLimit) ? 'over' : ''}><small>Talk</small>{elapsed(talk, talkLimit)}</div>
            <div className={slideOver ? 'over' : ''}><small>Slide</small>{elapsed(spent, slideLimit)}</div>
          </>
        ) : <div className="waiting"><small>Timers</small>start when you press Present</div>}
        <div><small>Now</small>{clock(new Date(now))}</div>
      </div>

      <div className="remote-slides">
        <figure className="now">
          <figcaption>{i === 0 ? 'First slide' : 'Now'}</figcaption>
          <Stage><SlideView key={i} index={i} mode="remote" /></Stage>
          <p>{slide.title}</p>
        </figure>
        <figure className="up-next">
          <figcaption>Next</figcaption>
          {next ? (
            <><Stage><SlideView key={i + 1} index={i + 1} mode="remote" /></Stage><p>{next.title}</p></>
          ) : (
            <><div className="remote-end">End of the talk</div><p className="none">This is the last slide</p></>
          )}
        </figure>
      </div>

      <div className="remote-notes">{slide.notes ? slide.notes : <span className="none">No notes for this slide.</span>}</div>
      {!awake && <p className="remote-tip">Tip: turn off auto-lock so your screen stays on during the talk.</p>}

      {/* swipe anywhere is the main way to move; the buttons are a fixed-size fallback that also show the ends */}
      <div className="remote-buttons">
        <button type="button" className="prev" onClick={() => move('prev')} disabled={!sync.connected || i === 0} aria-label="Previous slide">‹ Prev</button>
        <button type="button" className="next" onClick={() => move('next')} disabled={!sync.connected || !next} aria-label="Next slide">{next ? 'Next ›' : 'End'}</button>
      </div>
      <p className="remote-hint">Swipe left or right anywhere to move</p>
    </div>
  );
}
