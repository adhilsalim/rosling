/* Ambient light behind the viewer's preview, like YouTube's ambient mode: a blurred, still copy of the
   slide that spills its colours around the frame.

   On a slide change the new glow fades in on top of whatever is showing, and the layers underneath are
   dropped only once it is fully opaque. Nothing ever jumps, even when slides change faster than the fade. */
import { useEffect, useRef, useState } from 'react';
import { Stage, SlideView } from './Stage';

interface Layer { key: number; index: number; shown: boolean }
const MAX = 4;   // layers kept at once while fades overlap

const KEY = 'rosling:ambient';

/** Ambient light on or off, remembered in this browser (on by default). */
export function useAmbientSetting() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } });
  const toggle = () => setOn((v) => { try { localStorage.setItem(KEY, v ? 'off' : 'on'); } catch { /* private window */ } return !v; });
  return [on, toggle] as const;
}

/** When off, the glow fades out and then stops being drawn. */
export function Ambient({ index, on = true }: { index: number; on?: boolean }) {
  const [layers, setLayers] = useState<Layer[]>([{ key: 0, index, shown: true }]);
  const nextKey = useRef(1);

  useEffect(() => {
    setLayers((l) => {
      if (l[l.length - 1].index === index) return l;
      // at the limit, the top layer (still faint, mid-fade) switches to the new slide; the solid layer below stays
      if (l.length >= MAX) return [...l.slice(0, -1), { ...l[l.length - 1], index }];
      return [...l, { key: nextKey.current++, index, shown: false }];
    });
  }, [index]);

  // start the fade one frame after the layer is drawn at opacity 0, so the browser animates it
  const top = layers[layers.length - 1];
  useEffect(() => {
    if (top.shown) return;
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setLayers((l) => l.map((x) => (x.key === top.key ? { ...x, shown: true } : x)))); });
    return () => cancelAnimationFrame(id);
  }, [top]);

  const settle = (key: number) => setLayers((l) => (l[l.length - 1].key === key && l.length > 1 ? l.slice(-1) : l));

  return (
    <div className={'ambient' + (on ? '' : ' off')} aria-hidden="true">
      {layers.map((x) => (
        <div key={x.key} className={'ambient-layer' + (x.shown ? ' shown' : '')}
          onTransitionEnd={(e) => { if (e.target === e.currentTarget && x.shown) settle(x.key); }}>
          <Stage><SlideView index={x.index} mode="thumb" /></Stage>
        </div>
      ))}
    </div>
  );
}
