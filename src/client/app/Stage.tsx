/* Stage: fits the fixed 1920×1080 canvas into whatever box it is given (thumbnail, preview,
   full screen, phone). SlideView: draws one slide of the deck with its template, or a clear
   error card when the slide doesn't fit its template. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { deck, components } from 'virtual:rosling/deck';
import { SlideCtx, type Mode, type TimerInfo } from './context';

export const W = 1920, H = 1080;

export function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ s: 0, x: 0, y: 0 });
  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight, s = Math.min(w / W, h / H);
      setFit({ s, x: (w - W * s) / 2, y: (h - H * s) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={'stage-box ' + className}>
      {fit.s > 0 && <div className="stage" style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})` }}>{children}</div>}
    </div>
  );
}

export function SlideView({ index, mode, timer = null }: { index: number; mode: Mode; timer?: TimerInfo | null }) {
  const slide = deck.slides[index];
  if (!slide) return null;
  const Component = components[slide.template];
  return (
    <SlideCtx.Provider value={{ mode, number: index + 1, total: deck.slides.length, config: deck.config, timer }}>
      {slide.errors.length || !Component
        ? <Problems title={`slides/${slide.id}.json`} errors={slide.errors.length ? slide.errors : [`template "${slide.template}" has no component`]} />
        : <Component values={slide.values} />}
    </SlideCtx.Provider>
  );
}

/** Renders a template with its sample values (the gallery). */
export function SampleView({ id, mode = 'gallery' }: { id: string; mode?: Mode }) {
  const t = deck.templates.find((x) => x.id === id);
  const Component = components[id];
  if (!t) return null;
  return (
    <SlideCtx.Provider value={{ mode, number: 1, total: 1, config: deck.config, timer: null }}>
      {Component ? <Component values={t.sample} /> : <Problems title={id} errors={t.errors} />}
    </SlideCtx.Provider>
  );
}

/** Shown in place of a slide that doesn't fit its template, so a mistake is obvious and never silent. */
function Problems({ title, errors }: { title: string; errors: string[] }) {
  return (
    <section className="slide slide-problems" data-mode="page">
      <h1>This slide needs fixing</h1>
      <p className="file">{title}</p>
      <ul>{errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>
      {errors.length > 8 && <p>…and {errors.length - 8} more. Run <code>rosling check</code>.</p>}
    </section>
  );
}
