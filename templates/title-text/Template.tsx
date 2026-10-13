/* title-text: a title, an optional lede and bullet points. */
import { Slide, Text, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { variant: string; title: string; lede?: string; bullets?: string[] };

export default function TitleText({ values: v }: TemplateProps<Values>) {
  return (
    <Slide variant={v.variant}>
      <div className="content">
        <Text as="h1" className={s.title} value={v.title} />
        <Text className={s.lede} value={v.lede} />
        {!!v.bullets?.length && (
          <ul className={s.bullets}>
            {v.bullets.map((b, i) => <li key={i} style={{ animationDelay: `${150 + i * 110}ms` }}><Text as="span" value={b} /></li>)}
          </ul>
        )}
      </div>
    </Slide>
  );
}
