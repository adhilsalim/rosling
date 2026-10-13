/* section: a divider between parts of the talk. */
import { Slide, Text, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { variant: string; number?: string; title: string; text?: string };

export default function Section({ values: v }: TemplateProps<Values>) {
  return (
    <Slide variant={v.variant}>
      <div className={s.body}>
        {v.number && <p className={s.num}>{v.number}</p>}
        <Text as="h1" className={s.title} value={v.title} />
        <Text className={s.text} value={v.text} />
      </div>
    </Slide>
  );
}
