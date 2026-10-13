/* thank-you: the last slide, with an optional link as a QR code. */
import { Slide, Text, QrCode, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { variant: string; title: string; text?: string; link?: string; link_label: string; contacts?: string[] };

export default function ThankYou({ values: v }: TemplateProps<Values>) {
  return (
    <Slide variant={v.variant}>
      <div className={s.body}>
        <div className={s.words}>
          <Text as="h1" className={s.title} value={v.title} />
          <Text className={s.text} value={v.text} />
          {!!v.contacts?.length && <ul className={s.contacts}>{v.contacts.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        </div>
        {v.link && (
          <div className={s.card}>
            <QrCode className={s.qr} value={v.link} />
            <Text className={s.label} value={v.link_label} />
            <p className={s.url}>{v.link.replace(/^https?:\/\//, '')}</p>
          </div>
        )}
      </div>
    </Slide>
  );
}
