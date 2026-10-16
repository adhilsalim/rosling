# Getting started: setup, folders, and how to run it

A walkthrough of Rosling for someone opening it for the first time.

## Contents

0. [Basics you need first](#0-basics-you-need-first)
1. [Setup](#1-setup)
2. [The folder structure](#2-the-folder-structure)
3. [How to run it](#3-how-to-run-it)
4. [When something goes wrong](#4-when-something-goes-wrong)
5. [Recap](#5-recap)

---

## 0. Basics you need first

| Word | What it means here |
|---|---|
| **Node.js** | A program that runs JavaScript outside the browser. The `rosling` command is written in it. |
| **npm** | Node's package manager. It downloads libraries and tools, like rosling itself. |
| **CLI** | "Command-line interface": a command you type in the terminal, here `rosling`. |
| **Deck** | One presentation: a folder with a `deck.json` and a `slides/` folder. |
| **Template** | A slide layout with named boxes (title, bullets, image...). A slide fills them in. |
| **Build** | Turning the deck into a finished website in `dist/`, ready to present. |
| **Server** | A program on your laptop that sends the deck to browsers, here `rosling dev` or `rosling present`. |
| **localhost** | "This computer". `http://localhost:3030` is a page served by your own laptop. |

The one idea to hold on to: **two separate things.**

```
rosling                       ← the TOOL: you install it once, from npm
my-talk/                       ← a DECK: you make one per talk, anywhere on your disk
```

The tool reads a deck folder and turns it into a presentation. The framework's own repo (with
`examples/demo/`) is only needed if you want to work on rosling itself.

---

## 1. Setup

You need **Node.js 20.19 or newer**. Check with:

```sh
node -v        # v22.18.0 on this Mac: fine
```

Then install the tool, once:

```sh
npm install -g rosling        # -g: install it for the whole computer, so `rosling` works in any folder
```

And make a deck, in the folder where you keep your talks:

```sh
rosling init my-talk
```

What `rosling init` does:

```
rosling init my-talk
  │
  ├─ 1. makes my-talk/ with deck.json and 3 starter slides (--blank: no slides)
  ├─ 2. adds AGENTS.md (rules for AI agents) and CLAUDE.md (points Claude at AGENTS.md)
  └─ 3. starts a git repository (git init), so the deck can be shared and reviewed
```

To update the tool later: `npm install -g rosling@latest`.

### Working on rosling itself (optional)

Only if you want to change the framework, not just make talks:

```sh
git clone https://github.com/adhilsalim/rosling && cd rosling
npm install        # downloads the libraries (React, Vite, ws...) into node_modules/
npm run demo       # compiles the command (src/node → dist/node) and opens examples/demo
```

> Changing the browser app (`src/client/`), a template or a theme does **not** need a rebuild.
> Vite compiles those every time you run `rosling dev` or `rosling build`. Only `src/node/` does,
> and `npm run demo` rebuilds it for you.

---

## 2. The folder structure

### 2a. A deck (what you work in every day)

```
my-talk/
├── deck.json          the talk: title, theme, planned time, shared values, SLIDE ORDER
├── slides/
│   ├── welcome.json   one small file per slide
│   └── agenda.json
├── assets/            images and videos the slides use
├── templates/         your own templates for this deck (optional)
├── .rosling/packs/    packs downloaded from GitHub (not committed; rosling pack install)
├── AGENTS.md          rules for AI agents (created for you)
├── CLAUDE.md          points Claude at AGENTS.md
└── dist/              the built site (generated, never edit, not committed)
```

**A small example first.** A slide file says which template to use and fills in its boxes:

```json
{
  "template": "core/title-text",
  "time": "2m",
  "notes": "Keep it short.",
  "values": {
    "title": "What we will cover",
    "bullets": ["The problem", "Our idea"]
  }
}
```

That's `slides/agenda.json`. `template` picks the layout, `time` is the planned time (the timer turns
red after it), `notes` are your speaker notes (shown on the phone), and `values` fills the template's boxes.

`deck.json` decides the order. The names in `"slides"` are file names without `.json`
(`"welcome"` → `slides/welcome.json`). Values in `config` can be used in any slide text as `{event}`:

```json
{
  "title": "My talk",
  "theme": "core/plain",
  "time": "30m",
  "config": { "event": "Demo Day 2026" },
  "slides": ["welcome", "agenda"]
}
```

> **JSON is strict:** double quotes around every key and text, no comma after the last item, no
> comments. Write a line break inside text as `\n`. If you slip, `rosling check` points at the exact
> line and column: `c1.json is not valid JSON: ... (line 3 column 34)`.

**In the real repo**, see [examples/demo/deck.json](../examples/demo/deck.json) and
[examples/demo/slides/the-remote.json](../examples/demo/slides/the-remote.json). The second one uses
an image from `examples/demo/assets/remote.svg` just by naming it: `"image": "remote.svg"`.

How the pieces point at each other:

```
deck.json ──"slides": [welcome, agenda]──▶ slides/welcome.json ──template: core/cover──▶ templates/cover/
                                         slides/agenda.json  ──template: core/title-text──▶ templates/title-text/
                                              │
                                              └── image: photo.png ──▶ assets/photo.png
```

### 2b. A template (what a slide fills in)

Each template is a folder with four files. Take [templates/pillars/](../templates/pillars/):

| File | What it is | Who edits it |
|---|---|---|
| `template.json` | The description and the **boxes**: their types and limits (`title: max 70`, `items: 2 to 4`) | whoever designs the template |
| `sample.json` | Example values. The gallery shows them, and `rosling new` starts from them | same |
| `Template.tsx` | The React component that draws the slide | same |
| `style.module.css` | Its styles. They can't leak into other slides | same |

A template's id is `<pack>/<folder>`. The framework's own templates are `core/...`, the ones in a
deck's `templates/` folder are `local/...`, and ones from a pack on GitHub use the name the deck gave
that pack (`rosling pack add github:alice/rosling-pack-minimal` → `minimal/...`).

### 2c. The tool itself (only if you work on the framework)

```
rosling/
├── bin/rosling.js        the command's entry point
├── src/node/              the command and the servers (TypeScript → dist/node by npm run build)
│   ├── cli.ts             reads your command (dev, check, new...) and runs it
│   ├── deck.ts            loads deck.json + slides, finds templates, collects every problem
│   ├── schema.ts          checks a slide's values against its template's boxes
│   ├── vite.ts            turns the deck into something the browser app can import
│   ├── serve.ts           the `dev` and `present` servers
│   ├── remote.ts          the phone remote: WebSocket hub and pairing
│   ├── packs.ts           packs from GitHub: download, check, add, update
│   └── scaffold.ts        init, new slide, new template
├── src/client/            the browser app (React), compiled by Vite when you run it
│   ├── main.tsx           picks the page from the address: viewer, #/remote, #/gallery, #/slide/3
│   ├── api.ts             what templates import: Slide, Text, Media, QrCode
│   └── app/               Viewer (+ presenter mode), Remote, Gallery, sync (shared state), Timer
├── templates/             the 8 core templates
├── themes/plain/          the core theme: colours, fonts, footer
├── examples/demo/         a demo deck using every template
└── docs/                  the plan, this guide, the deck AGENTS.md
```

---

## 3. How to run it

### 3a. Open your deck (2 minutes)

```sh
cd my-talk
rosling dev
```

It prints something like:

```
  My talk · live editing

  Open:  http://localhost:3030/

  Phone remote: open the viewer's Phone remote button and scan its QR code (same Wi-Fi as this computer),
  or open this link on your phone:
  http://192.168.1.3:3030/?k=Xy12...
```

1. Open `http://localhost:3030/` in Chrome. You see the slide list, a big preview and the notes.
2. Click **Phone remote** in the viewer and scan the QR code with your phone. The phone becomes the remote.
3. Open `slides/welcome.json`, change the title and save. The browser updates by itself.
4. Click **Templates** to see the gallery. **Present** (or `P`) starts the talk.

`Ctrl+C` in the terminal stops the server.

### 3b. Add slides

```sh
rosling template list --props                              # which layouts exist, and their boxes
rosling new the-problem --template core/title-text --after welcome --time 2m
```

That creates `slides/the-problem.json` with example text and puts it after `welcome` in `deck.json`.
Edit the text, save, and watch the browser.

### 3c. The day-to-day loop

```
 edit slides/*.json ──save──▶ browser updates (rosling dev)
        ▲                          │
        └──── rosling check ◀───────┘   lists anything that doesn't fit, with the reason
```

A slide that breaks its template's rules shows as a red **"This slide needs fixing"** card, and
`rosling check` prints, for example:

```
  ✗ slide 6 (three-layers): values.items: 5 items, at most 4 fit
  ✗ slide 6 (three-layers): values.items[2].title: 87 characters, at most 40 fit
```

### 3d. On the day of the talk

```sh
cd my-talk
rosling present
```

What happens, in order:

```
rosling present
  │
  ├─ 1. builds the deck into dist/        (always, so you never present an old version)
  ├─ 2. starts a server on your laptop    (no internet needed from here on)
  ├─ 3. prints the address + a pairing link
  │
you open http://localhost:3030, click Phone remote, and scan its QR code with your phone
  │
you press Present (or P)
  ├─ the slide goes full screen, and the talk timer and slide timer start
  ├─ → / Space / the phone's Next button: next slide (the slide timer restarts)
  └─ Esc: stop presenting
```

### 3e. All the commands

| Command | Use it to |
|---|---|
| `rosling init [folder] [--blank]` | start a deck, with AGENTS.md and CLAUDE.md |
| `rosling dev` | edit with a live preview (+ phone remote) |
| `rosling check` | find every slide that doesn't fit its template |
| `rosling new <name> --template <id> [--after <slide>] [--time 2m]` | add a slide |
| `rosling template list [--props]` | see the templates and their boxes |
| `rosling template usage [id]` | see which slides use a template |
| `rosling template new <name>` | make your own template in `templates/<name>` |
| `rosling pack add github:owner/repo` | use templates and themes someone shared on GitHub |
| `rosling pack list` / `install` / `update` | see the deck's packs, download them after cloning, update them |
| `rosling build` | build `dist/` without serving it |
| `rosling present [--no-build]` | build and serve for the talk |

Options for any command: `-d <folder>` picks the deck (default: the folder you're in), `--port 4000`,
`--no-remote` (only this laptop can connect), `--open` (opens the browser for you).

---

## 4. When something goes wrong

| What you see | Why | Fix |
|---|---|---|
| `No deck.json in ...` | You're not in a deck folder | `cd` into it, or add `-d <folder>` |
| `rosling: command not found` | The tool isn't installed | `npm install -g rosling` (or run it once with `npx rosling ...`) |
| The phone shows **"Not paired"** | It opened the address without the code | Scan the QR code again (the code changes every time the server starts) |
| The phone can't load the page at all | It's on a different network, or the Wi-Fi keeps devices apart (hotel and guest Wi-Fi often do) | Same Wi-Fi for both; if that doesn't work, share the phone's hotspot with the laptop |
| macOS asks "Allow incoming connections?" | The server is listening for the phone | Allow it. Without it the phone can't connect |
| The address says `:3031` instead of `:3030` | 3030 was busy, so it took the next free port | Nothing: use the address it printed |
| A red **"This slide needs fixing"** card | The slide doesn't fit its template | Read the reasons on the card, or run `rosling check` |

---

## 5. Recap

- **Install once, then one command per deck:** `npm install -g rosling`, then `rosling init my-talk`. The deck gets `AGENTS.md` and `CLAUDE.md` for AI agents.
- **A deck** is `deck.json` (the order and settings), `slides/*.json` (one small file per slide) and `assets/`.
- **A slide** only names a template and fills in its boxes. **A template** is a folder: its boxes, an example, a component and styles.
- **While editing:** `rosling dev`. Save a file and the browser updates. `rosling check` finds mistakes.
- **At the talk:** `rosling present`, open the address, click **Phone remote** and scan its QR code, press **Present**.
