/* cover: the opening slide. The date and venue come from deck.json › config. */
import { Slide, Text, useSlide, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { variant: string; kicker?: string; title: string; subtitle?: string; speakers?: { name: string; role?: string }[] };

/* a field of squares that gets denser toward the right edge (always the same pattern) */
function pixels(cols: number, rows: number, seed = 7) {
  let a = seed;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out: { x: number; y: number; strong: boolean }[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (rnd() < Math.pow((x + 1) / cols, 1.8)) out.push({ x, y, strong: rnd() < 0.7 });
  return out;
}
const FIELD = pixels(12, 22);

export default function Cover({ values: v }: TemplateProps<Values>) {
  const { config } = useSlide();
  const when = [config.date, config.venue].filter(Boolean).join(' · ');
  return (
    <Slide variant={v.variant}>
      <div className={s.field} aria-hidden="true">
        {FIELD.map((p, i) => (
          <i key={i} className={p.strong ? s.strong : ''} style={{ left: p.x * 44, top: p.y * 44, animationDelay: `${(12 - p.x) * 60 + (i % 7) * 40}ms` }} />
        ))}
      </div>
      <div className={s.body}>
        <Text className={s.kicker} value={v.kicker} />
        <Text as="h1" className={s.title} value={v.title} />
        <Text className={s.subtitle} value={v.subtitle} />
        {!!v.speakers?.length && (
          <ul className={s.speakers}>
            {v.speakers.map((p, i) => <li key={i}><Text as="b" value={p.name} /><Text as="span" value={p.role} /></li>)}
          </ul>
        )}
        {when && <p className={s.when}>{when}</p>}
      </div>
    </Slide>
  );
}
