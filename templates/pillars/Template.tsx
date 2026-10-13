/* pillars: two to four ideas of equal weight. */
import { Slide, Text, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { variant: string; title: string; lede?: string; items: { title: string; text?: string }[] };

export default function Pillars({ values: v }: TemplateProps<Values>) {
  return (
    <Slide variant={v.variant}>
      <div className="content">
        <Text as="h1" className={s.title} value={v.title} />
        <Text className={s.lede} value={v.lede} />
        <div className={s.items} style={{ gridTemplateColumns: `repeat(${v.items.length}, 1fr)` }}>
          {v.items.map((it, i) => (
            <div key={i} className={s.item} style={{ animationDelay: `${120 + i * 120}ms` }}>
              <span className={s.num}>{String(i + 1).padStart(2, '0')}</span>
              <Text as="h3" className={s.head} value={it.title} />
              <Text className={s.text} value={it.text} />
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}
