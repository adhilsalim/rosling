# Rosling: the plan, in simple words

This is the plan for turning an existing conference slide deck into a reusable framework that
anyone (a person or an AI agent) can use to build presentations.

## Contents

0. [Basics you need first](#0-basics-you-need-first)
1. [Why we are changing it](#1-why-we-are-changing-it)
2. [The big idea: slides are just data](#2-the-big-idea-slides-are-just-data)
3. [The four building blocks](#3-the-four-building-blocks)
4. [How you use it: the commands](#4-how-you-use-it-the-commands)
5. [How AI agents use it: the MCP server](#5-how-ai-agents-use-it-the-mcp-server)
6. [Your phone is the remote](#6-your-phone-is-the-remote)
7. [Sharing templates with other people](#7-sharing-templates-with-other-people)
8. [Which slides use a template?](#8-which-slides-use-a-template)
9. [Where things live: the repos](#9-where-things-live-the-repos)
10. [The order we build it in](#10-the-order-we-build-it-in)
11. [Still to decide](#11-still-to-decide)
12. [Recap](#12-recap)

---

## 0. Basics you need first

| Word | What it means here | Everyday analogy |
|---|---|---|
| **Template** | A slide *layout*: where the title goes, where the picture goes, how it looks. | A blank form with labelled boxes. |
| **Slide** | One page of the talk, made by filling a template with your words and pictures. | The form after you fill it in. |
| **Theme** | The brand look: colours, fonts, logo, footer. | The company letterhead the form is printed on. |
| **Pack** | A bundle of templates (and maybe a theme) that you can share and install. | An app you download from an app store. |
| **Deck** | The whole presentation: which slides, in what order, how long each one takes. | The table of contents of a book. |
| **Schema** | A list of the boxes a template has, and what kind of thing goes in each (text, list, image...). | The rules printed on the form: "Date: DD/MM/YYYY". |
| **CLI** | Commands you type in the terminal, like `rosling build`. | A remote control for the framework. |
| **MCP server** | A standard way for AI agents (Claude, Cursor...) to call the framework's actions as tools. | A remote control built for AI agents. |
| **React** | A popular library for building web pages out of reusable pieces called *components*. | Lego bricks for web pages. |
| **JSON** | A strict text format for data. A mistake is always an error with a line number, never a silently different value. | A form where every box must be filled in exactly right. |
| **WebSocket** | A connection between a browser and a server that stays open, so either side can send a message at any time. | A phone call, instead of sending letters. |

---

## 1. Why we are changing it

People liked the current deck because:

- each slide is its own folder, so several presenters could work at once;
- AI agents could follow `AGENTS.md` and add slides easily;
- the presenter app has keyboard navigation and talk and slide timers;
- there is a gallery of ready-made templates.

We keep all of that. What goes wrong today is **copying**:

```
Today: making a slide = COPY the template folder, then edit it

template/demo-ticket ──copy──▶ slides/build-with-the-cli       (identical copy)
                     ──copy──▶ slides/build-in-the-web-ui
                     ──copy──▶ slides/build-with-the-sdk

Fix a bug in template/demo-ticket → none of the 3 copies get the fix ❌
```

We also found slides that quietly became *different* layouts after copying.
`real-incidents` still says it comes from `pillars`, but it's really a newspaper-clippings layout.
Nobody can tell that from the outside.

---

## 2. The big idea: slides are just data

**A slide may only fill in a template's boxes. It never changes the template's code or styles.**

A slide becomes a small text file:

```json
{
  "template": "acme/demo-ticket",
  "time": "10m",
  "notes": "Don't make them follow along; point at the QR code.",
  "values": {
    "title": "Watch the agent\nbuild an app",
    "steps": [
      "Describe the app in one sentence",
      "The agent writes the code and tests",
      "The agent deploys it"
    ],
    "link": "https://example.com/demo"
  }
}
```

(`slides/build-with-the-cli.json`: `template` picks the layout, `time` is the planned time,
`values` fills the boxes.)

✅ **Allowed** in a slide: text, lists, images, videos, links, time, speaker notes, and the options the template offers.

❌ **Not allowed** in a slide: its own CSS, its own JavaScript, or its own layout.

**"But I need something different!"** Then you either:
1. use an **option** the template already has (for example `background: video`), or
2. ask for a **new option** on the template, or
3. make a **new template** (see [section 7](#7-sharing-templates-with-other-people)).

What we gain:

| | Today (copy) | New (data) |
|---|---|---|
| Fix a template | Only future copies get it | Every slide gets it at once |
| Wrong or missing text | Found when it's on the projector | Found the moment the file is saved |
| Reviewing a change | Big HTML and CSS diffs | A few lines of JSON |
| AI agent adds a slide | Copies files, rewrites paths | Fills in the boxes, gets checked |
| Needs React knowledge? | n/a | Only to *make* templates, not to make slides |

---

## 3. The four building blocks

```
┌──────────────────────────────────────────────────────────────┐
│ DECK  (deck.json)                                            │
│   theme: acme                 packs: acme, my-own            │
│   slides, in order: welcome, what-is-an-llm, ...             │
│                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│   │ SLIDE (data) │  │ SLIDE (data) │  │ SLIDE (data) │  ...  │
│   │ template: A  │  │ template: B  │  │ template: A  │       │
│   │ values: ...  │  │ values: ...  │  │ values: ...  │       │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
└──────────┼─────────────────┼─────────────────┼───────────────┘
           ▼                 ▼                 ▼
   ┌───────────────┐ ┌───────────────┐   TEMPLATES (code, with a schema)
   │ TEMPLATE A    │ │ TEMPLATE B    │   they come from PACKS
   └───────┬───────┘ └───────┬───────┘
           └────────┬────────┘
                    ▼
           ┌─────────────────┐
           │ THEME           │  colours, fonts, logo, footer
           └─────────────────┘
```

One rule makes sharing possible: **templates never hard-code a brand.**
They ask the theme for colours, fonts and the logo. So a template made by someone else
automatically shows up in *your* colours with *your* logo.

What a template contains:

```
demo-ticket/
├── template.json      name, version, description, and the schema (its boxes)
├── Template.tsx       the React component that draws it
├── style.module.css   its styles (can't leak into other slides)
├── sample.json        example values: used in the gallery, as a guide, and as a test
└── preview.png        a picture of it, generated automatically
```

---

## 4. How you use it: the commands

One command-line tool, `rosling`:

| Command | What it does |
|---|---|
| `rosling init my-deck` | Start a new deck: starter slides, AGENTS.md and CLAUDE.md for agents |
| `rosling init my-deck --blank` | Start from scratch: plain theme, no templates |
| `rosling init my-deck --from github:someone/pack` (planned) | Start from someone else's pack |
| `rosling dev` | Open the live viewer and gallery while you edit |
| `rosling check` | Check every slide: missing values, text overflowing, footer overlap |
| `rosling build` | Make the finished presentation site in `dist/` (works offline) |
| `rosling present` | Open the built deck in presenter mode |

What happens from writing to presenting:

```
write/edit slide files ──▶ rosling check ──▶ rosling build ──▶ rosling present
      (you or an agent)     (catches mistakes)  (static site)    (timers, full screen)
```

The presenter app keeps everything that works today (keyboard only, talk and slide timers,
and adds a phone remote, speaker notes, a view of the next slide, and PDF export.

---

## 5. How AI agents use it: the MCP server

`rosling mcp` starts an MCP server, so any AI agent can use the framework as tools:

| Tool | What the agent can do |
|---|---|
| `list_templates`, `get_template_schema` | See which layouts exist and which boxes they have |
| `create_slide`, `update_slide`, `move_slide` | Add, edit or reorder slides by filling in values |
| `add_asset` | Put an image or video into the deck |
| `find_slides_by_template` | See which slides use a template |
| `render_slide` | Get a screenshot, so the agent can *see* its own work |
| `check_deck` | Run the same checks as `rosling check` |
| `add_template_pack` | Install a pack, **only after you confirm** |

It's built in three layers, so people and agents always work on the same files:

```
   You (terminal)        AI agent
        │                   │
        ▼                   ▼
   ┌─────────┐        ┌────────────┐
   │   CLI   │        │ MCP server │     two ways in...
   └────┬────┘        └─────┬──────┘
        └────────┬──────────┘
                 ▼
         ┌──────────────┐
         │ core library │                ...one engine
         └──────┬───────┘
                ▼
       plain files in your git repo      (never hidden inside the server)
```

**Making a *template*** is real code (layout, styles, animation). The agent does that with normal
file editing, following `AGENTS.md`, starting from `rosling template new`.
The MCP server then checks and previews it.

---

## 6. Your phone is the remote

`rosling dev` and `rosling present` print a QR code. Scan it with your phone (same Wi-Fi as the laptop)
and the phone becomes the clicker:

```
   ┌─────────────────────────┐
   │ ● Connected      7 / 9  │
   │ TALK 12m 4s  SLIDE 1m 2s│   ← turn red past the planned time; the phone buzzes
   │ ┌─────────────────────┐ │
   │ │   (the live slide)  │ │
   │ └─────────────────────┘ │
   │ Your phone is the clicker│
   │ Next: The rule          │
   │ ┌─────────────────────┐ │
   │ │ your speaker notes  │ │
   │ └─────────────────────┘ │
   │ [ ‹ ] [    Next ›     ] │   ← or swipe, or a Bluetooth clicker
   └─────────────────────────┘
```

How it works: the laptop runs a small server. The laptop's browser, the projector and the phone
all connect to it over a **WebSocket** (a connection that stays open, so a tap reaches the laptop
instantly). The server keeps the **one shared state**: which slide, and when the talk and the slide started.
So everyone always agrees.

```
 phone ──"next"──▶ server (holds: slide 7, timers) ──"slide 8"──▶ laptop + projector
                                                   └────────────▶ phone (updates too)
```

| Safety rule | Why |
|---|---|
| Only devices that scanned the QR code can connect | Anyone on the same Wi-Fi could otherwise change your slides |
| The QR code shows in the terminal and the viewer, never on the slides | So the audience can't scan it off the projector |
| The phone can move slides, but can't start or stop the talk | Starting needs the laptop (full screen needs a click there) |
| `--no-remote` keeps the server on the laptop only | For when you don't want it |

---

## 7. Sharing templates with other people

Templates can come from four places:

| Where from | Example name | How you get it |
|---|---|---|
| Built into the framework | `core/title-text` | Always there |
| Someone else's pack | `acme/demo-ticket` | `rosling template add github:...` |
| Your own, just for this deck | `local/clippings` | `rosling template new clippings` |
| Your own, shared with others | `adhil/clippings` | `rosling template publish` |

Your deck says which pack versions it uses, so everyone on the team gets the same ones:

```json
{
  "theme": "acme/default",
  "packs": { "acme": "github:adhilsalim/rosling-pack-acme#v1.2.0" }
}
```

**Using someone's template, but you want to change it?** You have two choices:

| | **Depend** (the default) | **Eject** |
|---|---|---|
| Command | `rosling template add ...` | `rosling template eject acme/demo-ticket --as local/my-ticket` |
| Can you change it? | ❌ Only through its options | ✅ It's now your own copy |
| Get the author's fixes? | ✅ By upgrading | ❌ You're on your own |
| Is the fork visible? | n/a | ✅ It has a new name, so everyone can see it |

Upgrading a pack (`rosling template upgrade`) re-checks **only** the slides that use the
changed templates, and shows screenshots of what changed.

⚠️ A template is code, so installing a pack runs someone else's code. The tool always shows
what's inside and asks before installing.

---

## 8. Which slides use a template?

Every slide names its template, so this is a simple lookup:

```
$ rosling template usage acme/demo-ticket
acme/demo-ticket (3 slides)
  #25  build-with-the-cli     Watch the agent build an app
  #26  build-in-the-web-ui    Build it in the web UI
  #28  build-with-the-sdk     Build it with the SDK
```

You can see the same thing in the gallery ("Used by 3 slides") and through the MCP tool.
It also keeps you safe:

- ✅ before changing a template, you know exactly which slides to look at;
- ❌ deleting a template that slides still use is refused;
- ⚠️ renaming a template's box lists the slides that now need fixing.

---

## 9. Where things live: the repos

```
adhilsalim/rosling                      the engine, CLI, MCP server,
                                         a plain theme, and core/* templates (no brand)

adhilsalim/rosling-pack-acme  (name TBD) the Acme theme (colours, fonts, logo, footer)
                                         and acme/* templates (demo-ticket, action, ...)

the summit deck                          deck.json + slide files, uses the acme pack
```

The Acme look lives in **its own pack repo**, not in the framework.
That way we use the sharing system ourselves from the first day, the same way anyone else would.

---

## 10. The order we build it in

```
Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─▶ Phase 4 ─▶ Phase 5 ─▶ Phase 6
contracts  engine     templates  CLI + MCP  sharing    move the summit deck
```

| # | Phase | What gets built | Done when |
|---|---|---|---|
| 1 | **Contracts** | The file formats: slide file, `template.json` schema, theme tokens, `deck.json` with packs | We can write the summit deck down on paper in the new format |
| 2 | **Engine** | React viewer, presenter mode, timers, offline build, template-usage lookup | One template renders and presents offline |
| 3 | **Templates and themes** | Brand-neutral `core` templates + the `acme` pack | Every current layout exists as a template |
| 4 | **CLI + MCP** | `rosling` commands, then the MCP server on top | An agent can build a small deck by itself |
| 5 | **Sharing** | add, new, eject, upgrade, publish | Someone else installs and uses our pack |
| 6 | **Migrate the summit deck** | Rewrite the 35 slides as data, compare screenshots with the old deck | The old and new decks look the same |

**Progress (29 September 2026):**

| Phase | Status |
|---|---|
| 1. Contracts | ✅ Slide files, `template.json` schemas, theme tokens, `deck.json` with packs (folders and npm packages) |
| 2. Engine | ✅ React viewer, presenter mode, timers, **phone remote**, offline build served by `rosling present`, template usage |
| 3. Templates and themes | 🟡 8 brand-neutral `core` templates and the `plain` theme. The `acme` pack is still to do |
| 4. CLI + MCP | 🟡 CLI done (`init`, `dev`, `check`, `build`, `present`, `new`, `template list/usage/new`), installable with `npm install -g rosling` (tested from a packed tarball; not published to npm yet). The MCP server is still to do |
| 5. Sharing | ⬜ `template add`, `eject`, `upgrade`, `publish` (packs can already be *used* from a folder or npm) |
| 6. Migrate the summit deck | ⬜ |

Working offline: the built site is served by `rosling present` from the laptop (no internet needed),
because a React build doesn't open straight from a file.

---

## 11. Still to decide

| Question | Suggestion |
|---|---|
| Name and visibility of the Acme pack repo | `adhilsalim/rosling-pack-acme` |

---

## 12. Recap

- **Keep** what people loved: one file per slide, templates, agent-friendly rules, the presenter app.
- **Slides are data**: a template name + values + assets. No per-slide code, so no silent copies.
- **Templates are code** with a schema, they use the theme's brand, and they're shared in versioned **packs**.
- **One engine, two ways in**: the `rosling` CLI for people, an MCP server for AI agents, both working on plain files in git.
- You can **use, eject, create and share** templates, or **start from scratch**.
- You can always see **which slides use a template**.
- The **Acme look is its own pack**, so the framework stays brand-free.
- Your **phone is the remote**: scan a QR code, get next/previous, notes and timers, kept in step over a WebSocket.
- Build order: **contracts → engine → templates → CLI + MCP → sharing → move the summit deck**.
