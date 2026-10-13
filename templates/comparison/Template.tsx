/* comparison: two things side by side, one of them highlighted. */
import { Slide, Text, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Side = { label?: string; heading: string; points?: string[] };
type Values = { variant: string; title: string; lede?: string; left: Side; right: Side; highlight: string };

function Column({ side, on }: { side: Side; on: boolean }) {
  return (
    <div className={`${s.col} ${on ? s.on : ''}`}>
      <Text className={s.label} value={side.label} />
      <Text as="h2" className={s.heading} value={side.heading} />
      {!!side.points?.length && <ul className={s.points}>{side.points.map((p, i) => <li key={i}><Text as="span" value={p} /></li>)}</ul>}
    </div>
  );
}

export default function Comparison({ values: v }: TemplateProps<Values>) {
  return (
    <Slide variant={v.variant}>
      <div className="content">
        <Text as="h1" className={s.title} value={v.title} />
        <Text className={s.lede} value={v.lede} />
        <div className={s.cols}>
          <Column side={v.left} on={v.highlight === 'left'} />
          <div className={s.vs} aria-hidden="true">vs</div>
          <Column side={v.right} on={v.highlight === 'right'} />
        </div>
      </div>
    </Slide>
  );
}
