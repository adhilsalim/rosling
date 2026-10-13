/* The talk timer in the centre of the footer (presenter mode only): "talk time | slide time",
   sliding up to the time of day every 10 s. Each time turns red past its planned time. */
import { useEffect, useState } from 'react';
import { useSlideContext } from './context';
import { clock, elapsed, over, showsClock } from './time';

export function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** Wraps each run of digits in <b>, so digits are bright and units are quiet. */
const digits = (s: string) => s.split(/(\d+)/).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p));

export function DeckTimer() {
  const { timer } = useSlideContext();
  if (!timer) return null;
  return <Ticking {...timer} />;
}

function Ticking({ talkStart, slideStart, talkLimit, slideLimit, offset }: NonNullable<ReturnType<typeof useSlideContext>['timer']>) {
  const now = useNow() + offset;
  const talk = now - talkStart, slide = now - slideStart, onClock = showsClock(talk);
  return (
    <div className="deck-timer" aria-hidden="true">
      <div className={'tm-face ' + (onClock ? 'off' : 'on')}>
        <span className={over(talk, talkLimit) ? 'over' : ''}>{digits(elapsed(talk, talkLimit))}</span>
        <span className="tm-sep" />
        <span className={over(slide, slideLimit) ? 'over' : ''}>{digits(elapsed(slide, slideLimit))}</span>
      </div>
      <div className={'tm-face ' + (onClock ? 'on' : 'off')}><span>{digits(clock(new Date(now)))}</span></div>
    </div>
  );
}
