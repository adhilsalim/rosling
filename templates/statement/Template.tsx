/* statement: one big idea on its own. */
import { Slide, Text, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { variant: string; kicker?: string; statement: string; attribution?: string };

export default function Statement({ values: v }: TemplateProps<Values>) {
  return (
    <Slide variant={v.variant}>
      <div className={s.body}>
        <Text className={s.kicker} value={v.kicker} />
        <Text as="h1" className={s.statement} value={v.statement} />
        {v.attribution && <Text className={s.by} value={'— ' + v.attribution} />}
      </div>
    </Slide>
  );
}
