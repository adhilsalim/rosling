# Rosling

<img width="2172" height="724" alt="image" src="https://github.com/user-attachments/assets/2ee6c607-6255-49c4-9570-9d2770a81ba8" />


Presentations as data. A slide is a small JSON file that picks a **template** and fills in its boxes.
Templates are React components with a schema, so every slide is checked, a template fix reaches every
slide at once, and AI agents can build decks reliably. Present from the browser, with talk timers and
your **phone as the remote**.

```json
{
  "template": "core/title-text",
  "time": "2m",
  "notes": "Keep this one short.",
  "values": {
    "title": "What we built and why it matters",
    "bullets": ["A slide is a small JSON file", "`rosling check` catches mistakes before the talk"]
  }
}
```

## Quick start

Requires Node 20.19 or later. New here? Read the walkthrough: [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

```sh
npm install -g rosling         # once: puts the `rosling` command on your PATH

rosling init my-talk           # a new deck, with AGENTS.md for AI agents
cd my-talk
rosling dev                    # live viewer; edit the JSON and watch it update
```

What `rosling init` makes:

```
my-talk/
├── deck.json        the talk: title, theme, time, slide order
├── slides/          welcome.json, agenda.json, thank-you.json
├── assets/          images and videos
├── templates/       your own templates (optional)
├── AGENTS.md        rules and tasks for AI agents (Codex, Cursor, Copilot, Gemini...)
└── CLAUDE.md        points Claude Code at AGENTS.md
```

## Commands

| Command | What it does |
|---|---|
| `rosling init [folder] [--blank]` | Start a deck, with AGENTS.md and CLAUDE.md (`--blank`: no starter slides) |
| `rosling dev` | Live viewer and template gallery while you edit, with the phone remote |
| `rosling check` | Check every slide against its template; exits non-zero on problems |
| `rosling build` | Build the deck into `dist/` |
| `rosling present [--no-build]` | Build, then serve the deck for the talk, with the phone remote |
| `rosling new <name> --template <id> [--after <slide>] [--time 2m]` | Add a slide, filled with the template's example |
| `rosling template list [--props]` | Every template you can use, how often it's used, and its boxes |
| `rosling template usage [id]` | Which slides use a template |
| `rosling template new <name>` | Make your own template in `templates/<name>` |
| `rosling connect <agent>` | Connect an AI agent through MCP (`claude`, `codex`, `gemini`, `cursor`, `claude-desktop`) |

Options: `--deck <folder>` (default: current folder), `--port <n>` (default 3030), `--no-remote`, `--open`.

## AI agents (MCP)

`rosling mcp` is an MCP server that gives an agent tools to **make and edit decks** (`create_deck`,
`list_templates`, `add_slide`, `update_slide`, `move_slide`, `remove_slide`, `check_deck`...) and to act on
**review comments** (below). Every change is checked against the template; one that doesn't fit is not saved.
It works only inside the folder it was given.

For apps that can't run commands, like Claude Desktop, pick a folder for your talks:

```sh
rosling connect claude-desktop --deck ~/talks
```

Restart Claude Desktop and ask *make me a 10-minute talk about ...*. Then `rosling dev --deck ~/talks/<deck>` shows it.

## Review comments for your coding agent

In the viewer, pick **Comment** in the top bar, click a point on a slide and write what should change.
Up to 3 comments wait in the tray; **Send all** hands them to your coding agent. Connect it once per deck:

```sh
rosling connect claude     # or codex, gemini, cursor
```

This registers `rosling mcp` (a small MCP server) with the agent. Start the agent in the deck folder and
ask it to *listen for my slide comments* (in Claude Code: `/rosling-review`). It waits for comments, edits
the slides, and replies; each pin shows whether it is waiting, being worked on, or done, with the reply.
With rosling installed globally the config is just `rosling mcp` and can be committed; from a checkout of
the framework it holds paths for this computer, and `connect` says so.

## Phone remote

`rosling dev` and `rosling present` print a private pairing link in the terminal. The viewer's **Phone remote**
button shows it as a QR code. Scan it with a phone on the same Wi-Fi. The phone shows:

- big **Previous** / **Next** buttons (or swipe, or a Bluetooth clicker paired with the phone);
- the current slide, what's next, and your speaker notes;
- the talk time, the slide time and the clock. They turn red past their planned time, and the phone buzzes (Android).

The laptop, the projector and the phone share one state over a WebSocket, so they always agree.
Only devices that scanned the code can connect. The code is never shown on the slides.
`--no-remote` keeps the server on this computer only.

## Presenting

Press **Present** (or `P`) in the viewer. Keys: → ↓ Space PageDown next, ← ↑ PageUp previous,
Home / End, Esc to stop. The talk and slide timers show in the centre of the footer, and on the phone remote.

## Layout of a deck

```
deck.json          title, theme, talk time, shared values ({event}, {date}...), packs, slide order
slides/*.json      one file per slide
assets/            images and videos
templates/<name>/  the deck's own templates (local/<name>)
```

## Templates and themes

A template is a folder: `template.json` (description and boxes), `sample.json` (example values),
`Template.tsx` and `style.module.css`. Templates use the theme's colour tokens, never fixed colours,
so any template works with any theme. Built-in: `core/cover`, `core/section`, `core/title-text`,
`core/title-image`, `core/comparison`, `core/pillars`, `core/statement`, `core/thank-you`; theme `core/plain`.

Packs of templates and themes from other people are listed in `deck.json › packs` (a folder path or an
installed npm package).

## For AI agents

Every deck gets an `AGENTS.md` ([docs/DECK-AGENTS.md](docs/DECK-AGENTS.md)) with the rules and tasks.
Working on the framework itself: see [AGENTS.md](AGENTS.md).

## Working on Rosling itself

```sh
git clone https://github.com/adhilsalim/rosling && cd rosling
npm install
npm run demo        # build the CLI and open the demo deck (examples/demo)
npm link            # optional: use this checkout as the global `rosling` command
```

`npm publish` builds the CLI first (`prepack`).
