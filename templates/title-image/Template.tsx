/* title-image: words on one side, a picture or video on the other. */
import { Slide, Text, Media, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { variant: string; title: string; lede?: string; bullets?: string[]; image: string; alt?: string; caption?: string; side: string; fit: 'cover' | 'contain' };

export default function TitleImage({ values: v }: TemplateProps<Values>) {
  return (
    <Slide variant={v.variant}>
      <div className={`${s.body} ${v.side === 'left' ? s.left : ''}`}>
        <div className={s.words}>
          <Text as="h1" className={s.title} value={v.title} />
          <Text className={s.lede} value={v.lede} />
          {!!v.bullets?.length && <ul className={s.bullets}>{v.bullets.map((b, i) => <li key={i}><Text as="span" value={b} /></li>)}</ul>}
        </div>
        <figure className={s.figure}>
          <div className={s.frame}><Media src={v.image} alt={v.alt} fit={v.fit} className={s.media} /></div>
          <Text as="figcaption" className={s.caption} value={v.caption} />
        </figure>
      </div>
    </Slide>
  );
}
