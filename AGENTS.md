# AGENTS.md

Instructions for AI agents working on the **framework** (this repository). Rules for working on a
deck are in [docs/DECK-AGENTS.md](docs/DECK-AGENTS.md), which `rosling init` copies into every deck.
The maintainers keep their plan in docs/PLAN.md, which is not in git; read it if it is there.

## The contract

- **Slides are data.** A slide file has only `template`, `title`, `time`, `notes`, `values`. Anything
  else is an error. Never add a way for a slide to carry its own code or CSS.
- **Templates are code with a schema.** `template.json` lists the boxes. `src/node/schema.ts` checks
  values against it. `sample.json` must always pass: the gallery, `rosling new` and agents use it.
- **Themes own the brand.** Templates use tokens (`--fg`, `--muted`, `--accent`, `--accent-soft`,
  `--surface`, `--line`, `--font`, `--font-mono`, `--footer-h`, `--pad-x`, `--pad-top`), never fixed colours.
- **Files on disk are the truth.** Everything (CLI, the coming MCP server) reads and writes the deck's files.

## Layout

```
bin/rosling.js          CLI entry (runs dist/node/cli.js; `npm run build` compiles src/node)
src/node/                Node side: TypeScript, compiled with tsc
  cli.ts                 the `rosling` command
  deck.ts                loads deck.json, slides, packs, templates, themes; collects every problem
  schema.ts              template schemas and value checking
  vite.ts                the virtual module (deck → data + imports) and the Vite config
  serve.ts               `rosling dev` (Vite middleware) and `rosling present` (static dist/)
  remote.ts              phone remote: WebSocket hub, shared state, pairing token and guard
  comments.ts            review comments: GET/POST/PATCH/DELETE /__rosling/comments ↔ the deck's comments.json
  mcp.ts                 `rosling mcp`: stdio MCP server; the comment tools, and the protocol
  tools.ts               its deck tools: create_deck, get/update_deck, list_templates, get/add/update/move/remove_slide, check_deck
  connect.ts             `rosling connect <agent>`: writes that agent's MCP config (and Claude's skill)
  packs.ts               `rosling pack`: packs from GitHub (download, check, add, install, update, remove, list)
  scaffold.ts            init, new slide, new template
src/client/              the browser app, compiled by Vite at run time (not by tsc)
  main.tsx               routes: #/ viewer, #/remote, #/gallery, #/slide/<n>
  api.ts                 what templates import from 'rosling'
  base.css, app.css      slide frame + timer; the app around the slides
  app/                   Viewer (+ presenter), Comments, Ambient, Remote, Gallery, Stage/SlideView, sync, Timer, time
templates/<name>/        the core templates (the framework is the "core" pack)
skills/rosling-review/  the review skill `rosling connect claude` copies into a deck
themes/plain/            the core theme
examples/demo/           a deck that uses every core template
docs/                    DECK-AGENTS.md, GETTING-STARTED.md (and PLAN.md, the maintainers' notes, not in git)
```

## Remote protocol (src/node/remote.ts ↔ src/client/app/sync.ts)

The hub holds `{ index, total, presenting, talkStart, slideStart }`. Clients connect to `/__rosling/ws?role=deck|remote`.

| Client → hub | Effect |
|---|---|
| `{t:'hello', total, index}` (deck) | sets the slide count; goes to `index` unless a talk is running |
| `{t:'goto', index}` | go to a slide (clamped); restarts the slide timer |
| `{t:'nav', dir}` | `next` / `prev` / `first` / `last` |
| `{t:'present', on}` (deck only) | start (resets both timers) or stop the talk |

The hub answers every change with `{t:'state', ...state, now, remotes}` to all clients. `now` lets a
phone with a wrong clock show correct timers. Requests from other machines need the pairing token
(`?k=` once, then a cookie). `/__rosling/pair` answers only this machine.

## MCP deck tools (tools.ts)

`--deck` is a deck or a folder of decks; tools may only touch paths inside that folder (inside the deck's
parent, when it is a deck, unless that parent is the home folder or a disk root). Paths are compared after
following symlinks. Without `--deck`, the server finds the deck from its working folder upwards, like git,
so project configs (`.mcp.json`, `.gemini/settings.json`) need no paths. `create_deck` refuses folders
that already have files. Every write is checked with `loadDeck` and undone if its slide (or deck.json) ends
up with problems, so a tool call never leaves a broken file. Tools reuse `scaffold.ts`, like the CLI.

## Packs (packs.ts, deck.ts › resolvePacks)

A pack is a GitHub repo with `rosling-pack.json` (name, version, `rosling` version range) and `templates/`
and/or `themes/`. `deck.json › packs` maps the deck's own name for it (that is what template ids use, so two
packs both called "minimal" can coexist) to `{ github, ref?, commit }`, or to a folder for a pack being made.
`pack add` downloads one commit with the user's git (`fetch --depth 1`, no hooks, no password prompts) into
`.rosling/tmp-*`, runs `checkPack`, asks, then moves it to `.rosling/packs/<name>/` (git-ignored) and pins the
commit. `checkPack` refuses links, imports other than `rosling`, `react` and the pack's own files (packs
never get an npm install), CSS pointing outside the pack (https web fonts are fine), and broken templates.
`loadDeck` only checks that the downloaded commit (`.git/HEAD`) is the pinned one. `pack update` undoes an
update that adds problems to `rosling check`. Adding a pack is never an MCP tool: it runs someone else's code.

## Review comments ↔ coding agents (comments.ts, mcp.ts, Comments.tsx)

A comment in `comments.json` goes `sent` (Send all in the viewer) → `working` (`wait_for_comments`
handed it to an agent) → `done` (the agent called `resolve_comment` with a `reply`). Editing a comment
sets it back to `sent`. Every read-modify-write of comments.json goes through `changeComments` (a lock
file), because the dev server and any number of MCP servers change it from separate processes. A
`working` comment whose `claimed` time is over 15 minutes old counts as `sent` again (the agent that took
it is gone); a cancelled `wait_for_comments` claims nothing. Agents can't be woken from outside, so the agent listens: `wait_for_comments`
blocks until there are sent comments, or returns empty after `timeout_seconds` (default 45; some
agents give up on a tool call after 60). The viewer polls the file while any comment isn't done.
The MCP server writes only protocol messages to stdout; log to stderr.

## Checking your work

```sh
npm run build && npx tsc -p tsconfig.client.json         # compile the CLI, type-check the app and templates
node bin/rosling.js check -d examples/demo              # every demo slide fits its template
node bin/rosling.js dev -d examples/demo                # look at it; #/gallery, #/remote, #/slide/3
```

Headless screenshot of one slide (the page is laid out at a shorter height than the capture, so it
may look slightly scaled; that is a headless quirk):

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-prefers-reduced-motion --window-size=1920,1167 --virtual-time-budget=4000 \
  --screenshot=/tmp/slide.png "http://localhost:3030/#/slide/1"
```

Users install rosling from npm (`npm install -g rosling`), so the framework runs from inside
`node_modules/`. After changing `vite.ts`, `scaffold.ts` or `package.json › files`, test it that way:

```sh
npm pack --pack-destination /tmp/o && npm install -g --prefix /tmp/o/g /tmp/o/rosling-*.tgz
cd /tmp/o && g/bin/rosling init my-talk && cd my-talk && ../g/bin/rosling check && ../g/bin/rosling dev
```

After changing a core template, check every slide that uses it (`rosling template usage core/<name>`)
and its gallery card. After changing `base.css` or the theme, check every template.

## Style

- Plain words in UI text and comments. Comments explain intent, briefly.
- Compact one-line CSS rules grouped under `/* ---- section ---- */` comments.
- Nothing on a slide is clickable. Every animation respects `prefers-reduced-motion`.
- The footer centre stays empty: the presenter timer draws there.
