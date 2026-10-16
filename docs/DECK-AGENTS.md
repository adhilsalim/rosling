# AGENTS.md

Instructions for AI agents working on this slide deck. It is built with
[Rosling](https://github.com/adhilsalim/rosling).

## The one rule

**A slide only fills in a template. It never changes one.**
A slide is a small JSON file: which template, and the values for that template's boxes.
There is no per-slide HTML, CSS or JavaScript. If a slide needs something a template can't do,
use another template, or add an option to a template (see "Templates" below). Never work around it.

## Layout

```
deck.json          title, theme, planned talk time, shared values (config), packs, and the slide order
slides/<name>.json one file per slide
assets/            images and videos the slides use
templates/<name>/  this deck's own templates (ids local/<name>)
.rosling/packs/    packs downloaded from GitHub (git-ignored; don't edit, rosling pack install replaces them)
dist/              the built site (generated, don't edit)
```

The `rosling` command comes from `npm install -g rosling`. If it isn't installed, ask the user to
install it, or use `npx rosling <command>`. Never edit rosling's own files: its templates are
shared by every deck.

All data files are strict JSON: double quotes, no trailing commas, no comments.
`rosling check` names the file, line and column of any mistake.

`deck.json`:

```json
{
  "title": "My talk",
  "theme": "core/plain",
  "time": "30m",
  "config": { "event": "Demo Day 2026", "date": "29 September 2026", "venue": "Kochi" },
  "packs": {},
  "slides": ["welcome", "agenda", "thank-you"]
}
```

| Key | Meaning |
|---|---|
| `theme` | `<pack>/<theme>`; `core/plain` is built in |
| `time` | planned length of the talk: `1h 5m`, `30m`, `90s`. The presenter timer turns red after it |
| `config` | shared values; any slide text can use them as `{event}`, `{date}`, `{venue}` |
| `packs` | packs of templates and themes from GitHub, pinned to a commit (`rosling pack add` writes them), or `"name": "./folder"` |
| `slides` | the order of the talk; each name is a file in `slides/` (`welcome` → `slides/welcome.json`) |

A slide file, `slides/agenda.json`:

```json
{
  "template": "core/title-text",
  "time": "2m",
  "notes": "What to say here.\nA second line of notes.",
  "values": {
    "title": "What we built",
    "bullets": ["First point", "Second point"]
  }
}
```

| Key | Meaning |
|---|---|
| `template` | `<pack>/<template>` |
| `title` | optional sidebar label; defaults to the template's title text |
| `time` | planned time: `1h 5m`, `10m`, `90s`. Omit it for no limit |
| `notes` | speaker notes, shown on the phone remote and in the viewer |
| `values` | the template's boxes, exactly as its `template.json` lists them |

Text values accept `**bold**`, `*italic*`, `` `code` ``, `\n` for a line break, and `{event}`-style shared
values from `deck.json › config`. Never type the event name, date or venue into a slide: use `{event}`,
`{date}`, `{venue}`.

## Tasks

### Add a slide
1. `rosling template list --props` shows every template and its boxes. Pick the one that fits.
2. `rosling new <name> --template <id> --after <slide>` creates `slides/<name>.json`, filled with the
   template's example, and adds it to `deck.json` in the right place. Names are lower-case words
   joined by dashes, describing the content (`what-is-an-llm`).
3. Replace every example value with real content. Put images in `assets/` and write real `alt` text.
4. **Ask the user how long the slide should take** and set `time`. Never guess or copy another slide's time.

### Edit, reorder or remove slides
- Edit values in `slides/<name>.json`. Keep within the limits in template.json (`max` characters or items).
- Reorder by moving names in `deck.json › slides`. Don't rename files to reorder.
- Remove a slide by deleting its name from `deck.json` and deleting its file.

### Templates
- `rosling template usage <id>` lists the slides that use a template. Check them after changing it.
- To make a new layout: `rosling template new <name>` creates `templates/<name>/` (id `local/<name>`):
  - `template.json`: the description and the boxes (props) with their types and limits
  - `sample.json`: realistic example values (the gallery and `rosling new` use them)
  - `Template.tsx`: the React component. Wrap it in `<Slide>`, use `<Text>`, `<Media>`, `<QrCode>`
    from `'rosling'`
  - `style.module.css`: its styles, using the theme's tokens (`--fg`, `--muted`, `--accent`,
    `--accent-soft`, `--surface`, `--line`, `--font`, `--font-mono`), never fixed colours
- Keep the footer area (bottom 96px) and the centre of the footer free: the presenter timer shows there.
- Nothing on a slide is clickable. Animations must respect `prefers-reduced-motion`, and show their final
  state when `isStill(useSlide().mode)` is true (thumbnails and the phone's previews).

### Packs
- `rosling pack list` shows the packs this deck uses, their templates and themes, and which slides use them.
  Templates from a pack are `<pack>/<template>`; mixing packs in one deck is fine.
- If `rosling check` says a pack is not downloaded, run `rosling pack install`.
- A pack is someone else's code. Add one (`rosling pack add github:owner/repo`) only when the user asks
  for it, and let them confirm. Never edit the files in `.rosling/packs/`.

## Checking your work

Run `rosling check`. It lists every slide that doesn't fit its template, with the reason. Fix all of them.
Then look at the slides: `rosling dev` and open the address it prints, or `#/slide/<n>` for one slide.

## MCP tools

If the `rosling` MCP server is connected, its tools do the tasks above with checked inputs: `get_deck`,
`list_templates`, `list_packs`, `add_slide`, `update_slide`, `move_slide`, `remove_slide`, `check_deck`. A change that
doesn't fit its template is not saved, and the tool says why. Use them when they are there; the rules above still apply.

## Review comments

The user can pin comments on slides in the viewer and press **Send all**. If the `rosling` MCP server
is connected (`rosling connect <claude|codex|gemini|cursor>` sets it up), act on them:

1. Call `wait_for_comments`. It returns when comments arrive, or empty after a while: call it again.
2. For each comment, open the slide file it names. `point.where` says which part of the slide the pin
   is on. Make the change it asks for, within the rules above. If it is unclear, or a template can't
   do it, don't guess: say so in the reply.
3. Run `rosling check`, then call `resolve_comment` with one or two plain sentences: what you changed,
   or why you didn't. The user reads the reply on the slide.
4. Wait again, until the user tells you to stop.

## Presenting

`rosling present` builds the deck and serves it (`--no-build` reuses the last build). It prints a pairing link, and the viewer's Phone remote button shows it as a QR code: scan it with a phone on the same
Wi-Fi to use the phone as a remote (next/previous, notes, timers). The link is private.
