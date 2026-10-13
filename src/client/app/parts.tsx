/* The building blocks templates use. See api.ts for the public list. */
import { createContext, useContext, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { useSlideContext, isStill, type SlideContext } from './context';
import { DeckTimer } from './Timer';

/** What every template component receives. V is the shape of its values (from template.json). */
export interface TemplateProps<V = Record<string, unknown>> { values: V }

export interface FooterProps { number: number; total: number; config: Record<string, string>; variant: string }

/** The theme's footer, provided once by the app (it comes from the deck's theme). */
export const FooterCtx = createContext<ComponentType<FooterProps> | null>(null);

/** Where the slide is shown, its number, the shared config values. */
export function useSlide(): SlideContext { return useSlideContext(); }

/** The frame of every slide: the 1920×1080 canvas, the theme variant, the footer and the presenter timer.
    variant is one of the theme's looks: light (default), dark, accent. */
export function Slide({ variant = 'light', className = '', footer = true, children }:
  { variant?: string; className?: string; footer?: boolean; children?: ReactNode }) {
  const ctx = useSlideContext();
  const Footer = useContext(FooterCtx);
  return (
    <section className={`slide ${variant} ${className}`} data-mode={ctx.mode}>
      {children}
      {footer && Footer && <Footer number={ctx.number} total={ctx.total} config={ctx.config} variant={variant} />}
      <DeckTimer />
    </section>
  );
}

/* ---- text: a small, safe subset of markdown ---- */
// **bold**, *italic*, `code`, a line break for a new line, and {key} for a shared value from deck.json › config
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\{[a-zA-Z][\w-]*\}|\n)/g;

function inline(text: string, config: Record<string, string>): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part === '\n') return <br key={i} />;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    const key = part.slice(1, -1);
    return key in config ? config[key] : part;   // unknown keys stay visible as {key}, so they get noticed
  });
}

/** Shows a text value. `as` picks the element (p by default). Empty values render nothing. */
export function Text({ value, as: Tag = 'p', className }: { value?: unknown; as?: keyof HTMLElementTagNameMap; className?: string }) {
  const { config } = useSlideContext();
  if (value == null || value === '') return null;
  const El = Tag as 'p';
  return <El className={className}>{inline(String(value), config)}</El>;
}

/* ---- images and video ---- */
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|$)/i;

/** An image or video from the deck's assets. Videos loop silently, and stay still in thumbnails. */
export function Media({ src, alt = '', className, fit = 'cover' }: { src?: unknown; alt?: string; className?: string; fit?: 'cover' | 'contain' }) {
  const { mode } = useSlideContext();
  if (typeof src !== 'string' || !src) return null;
  const style = { objectFit: fit } as const;
  if (VIDEO.test(src)) {
    const still = isStill(mode) || matchMedia('(prefers-reduced-motion: reduce)').matches;
    return <video className={className} style={style} src={src} muted loop playsInline autoPlay={!still} preload={still ? 'metadata' : 'auto'} aria-label={alt} />;
  }
  return <img className={className} style={style} src={src} alt={alt} draggable={false} />;
}

/** A QR code for a link, drawn locally (works offline). */
export function QrCode({ value, className, dark = '#161616', light = '#ffffff' }: { value?: unknown; className?: string; dark?: string; light?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (typeof value !== 'string' || !value) { setSvg(''); return; }
    let live = true;
    QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark, light } }).then((s) => { if (live) setSvg(s); });
    return () => { live = false; };
  }, [value, dark, light]);
  return <div className={className} role="img" aria-label={typeof value === 'string' ? `QR code for ${value}` : ''} dangerouslySetInnerHTML={{ __html: svg }} />;
}
