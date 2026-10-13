/* plain theme footer: the event on the left, the slide number on the right.
   The centre stays empty: the presenter timer appears there. */
import type { FooterProps } from 'rosling';

export default function Footer({ number, config }: FooterProps) {
  return (
    <footer className="slide-footer">
      <div className="event">{config.event ?? ''}</div>
      {number > 0 && <div className="num"><b>{String(number).padStart(2, '0')}</b></div>}
    </footer>
  );
}
