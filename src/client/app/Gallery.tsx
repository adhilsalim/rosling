/* The template gallery (#/gallery): every template the deck can use, drawn with its sample values,
   which slides use it, and the boxes (props) it has. #/gallery/<pack>/<name> opens one template. */
import { deck, type PropData } from 'virtual:rosling/deck';
import { Stage, SampleView } from './Stage';

export function Gallery({ focus }: { focus?: string }) {
  const list = focus ? deck.templates.filter((t) => t.id === focus) : deck.templates;
  const packs = [...new Set(list.map((t) => t.id.split('/')[0]))];
  return (
    <div className="gallery">
      <header className="bar">
        <h1>{focus ? focus : 'Templates'}</h1>
        <nav>{focus && <a href="#/gallery">All templates</a>}<a href="#/">Back to the deck</a></nav>
      </header>
      {!list.length && <p className="gallery-empty">No template called "{focus}".</p>}
      {packs.map((pack) => (
        <section key={pack}>
          <h2>{pack === 'core' ? 'core: built in' : pack === 'local' ? 'local: this deck\'s own' : pack}</h2>
          <div className={'cards' + (focus ? ' single' : '')}>
            {list.filter((t) => t.id.startsWith(pack + '/')).map((t) => (
              <article key={t.id} className="card">
                <a className="card-stage" href={`#/gallery/${t.id}`}><Stage><SampleView id={t.id} /></Stage></a>
                <h3>{t.id}</h3>
                <p>{t.description}</p>
                <p className="used">
                  {t.used.length
                    ? <>Used by {t.used.length} slide{t.used.length > 1 ? 's' : ''}: {t.used.map((n) => <a key={n} href={`#/${n}`}>{deck.slides[n - 1].title} ({n})</a>)}</>
                    : 'Not used in this deck'}
                </p>
                {t.errors.map((e, i) => <p key={i} className="err">{e}</p>)}
                <details open={!!focus}>
                  <summary>Boxes to fill</summary>
                  <Props schema={t.schema} />
                </details>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Props({ schema }: { schema: Record<string, PropData> }) {
  return (
    <dl className="props">
      {Object.entries(schema).map(([name, p]) => {
        const inner = p.type === 'object' ? p.props : p.type === 'list' && p.of?.type === 'object' ? p.of.props : null;
        return (
          <div key={name}>
            <dt><code>{name}</code> {p.type}{p.type === 'list' && p.of ? ` of ${p.of.type}` : ''}{p.type === 'enum' ? `: ${p.values?.join(' | ')}` : ''}
              {p.required && <em> required</em>}{p.max ? <em> max {p.max}</em> : null}</dt>
            {p.description && <dd>{p.description}</dd>}
            {inner && <dd><Props schema={inner} /></dd>}
          </div>
        );
      })}
    </dl>
  );
}
