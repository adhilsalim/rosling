# Making your own template

A template is a slide layout. Slides pick a template and fill in its boxes. When none of the built-in
templates fits, make your own. It lives in your deck, in `templates/<name>/`, and slides use it as
`local/<name>`.

## With AI

Keep `rosling dev` running, open your agent in the deck folder, and describe the layout: what goes on
the slide, how many of each thing, and roughly how it should look.

> Make a new template called `timeline` that shows 3 to 6 milestones in a row, each with a date and
> a short label. Then use it for a roadmap slide after the agenda.

The deck's `AGENTS.md` tells the agent the rules (use theme colours, keep the footer free, and so on).
Click **Templates** in the preview to see the result, and ask for changes until it looks right.

## By hand

### 1. Create it

```sh
rosling template new timeline
```

This copies a simple working template (`core/title-text`) into `templates/timeline/`. It works right
away, so you can change it one step at a time and watch the preview.

### 2. Say what the slide needs: `template.json`

List the boxes a slide fills in, and their limits. Limits keep text from overflowing the slide.

```json
{
  "description": "A title and 3 to 6 milestones in a row.",
  "props": {
    "title": { "type": "text", "required": true, "max": 70 },
    "items": {
      "type": "list",
      "min": 3,
      "max": 6,
      "of": {
        "type": "object",
        "props": {
          "date": { "type": "text", "required": true, "max": 12 },
          "label": { "type": "text", "max": 40 }
        }
      }
    }
  }
}
```

Box types: `text`, `number`, `boolean`, `url`, `image`, `video` (a file in `assets/`), `enum` (one of
`values`), `list` (of another type), `object` (a group of boxes).

Options: `required`, `default`, `max` (characters for text, items for lists), `min` (items for lists),
`description` (shown to people and to AI agents).

### 3. Give it example values: `sample.json`

The gallery shows these, and `rosling new` starts new slides from them. Use realistic text.

```json
{
  "title": "Where we're going",
  "items": [
    { "date": "Jan", "label": "First users" },
    { "date": "Apr", "label": "Mobile app" },
    { "date": "Sep", "label": "Teams" }
  ]
}
```

### 4. Draw it: `Template.tsx`

A React component. It gets the slide's values and wraps everything in `<Slide>`. Use `<Text>` for
text (it handles `**bold**`, line breaks and `{event}`-style values) and `<Media>` for images and videos.

```tsx
import { Slide, Text, type TemplateProps } from 'rosling';
import s from './style.module.css';

type Values = { title: string; items: { date: string; label?: string }[] };

export default function Timeline({ values: v }: TemplateProps<Values>) {
  return (
    <Slide>
      <div className="content">
        <Text as="h1" className={s.title} value={v.title} />
        <ol className={s.items}>
          {v.items.map((it, i) => (
            <li key={i}>
              <Text as="strong" value={it.date} />
              <Text as="span" value={it.label} />
            </li>
          ))}
        </ol>
      </div>
    </Slide>
  );
}
```

### 5. Style it: `style.module.css`

Use the theme's colours instead of fixed ones, so the template works with any theme:
`--fg`, `--muted`, `--accent`, `--accent-soft`, `--surface`, `--line`, `--font`, `--font-mono`.

```css
.title{font-size:72px;font-weight:300}
.items{display:flex;gap:40px;margin-top:80px;list-style:none}
.items li{flex:1;border-top:4px solid var(--accent);padding-top:20px;font-size:30px}
.items strong{display:block;color:var(--muted)}
```

A few rules:

- Keep the bottom 96px of the slide free: the footer and the talk timer show there.
- Nothing on a slide is clickable.
- Animations should stop for `prefers-reduced-motion`, and show their final state when
  `isStill(useSlide().mode)` is true (used for thumbnails and the phone's previews).

### 6. Check it and use it

```sh
rosling check                                        # every slide still fits its template
rosling new roadmap --template local/timeline        # a new slide with the sample values
```

Click **Templates** in the preview to see it next to the others. For more examples, look at the
built-in templates in this repo's [templates/](../templates/) folder.
