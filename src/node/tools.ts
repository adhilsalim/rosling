/* The deck tools of `rosling mcp`: make a deck, read it, and add, change, move or remove slides.
   They do what the CLI and the deck's AGENTS.md describe, for agents that can't run commands or edit
   files (Claude Desktop, claude.ai) and for agents that do better with checked inputs.

   Every change is checked the way `rosling check` would; a change that leaves its slide (or deck.json)
   broken is undone and the problems are returned, so the files on disk always stay valid. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDeck, allErrors, slidesUsing, readJson, type Deck } from './deck.js';
import { describeSchema } from './schema.js';
import { initDeck, newSlide } from './scaffold.js';
import { listPacks } from './packs.js';

/** Where decks may be: the folder `rosling mcp` was started for (or the one holding it, if it is a deck). */
export interface Workspace { root: string; current: string | null }

export function workspace(dir: string): Workspace {
  const d = fs.realpathSync(path.resolve(dir));
  if (!fs.existsSync(path.join(d, 'deck.json'))) return { root: d, current: null };
  // a deck's neighbours are in reach too (create_deck makes new ones there), unless that would be the home folder or a whole disk
  const up = path.dirname(d);
  const wide = [fs.realpathSync(os.homedir()), path.parse(up).root].includes(up);
  return { root: wide ? d : up, current: d };
}

/** The real path, with symlinks followed, even when its last parts don't exist yet.
    A broken symlink stops the walk, so realpath fails on it instead of something being written through it. */
function real(p: string): string {
  const rest: string[] = [];
  let at = p;
  while (!fs.lstatSync(at, { throwIfNoEntry: false })) { rest.unshift(path.basename(at)); const up = path.dirname(at); if (up === at) break; at = up; }
  return path.join(fs.realpathSync(at), ...rest);
}

/** A path from the agent, inside the workspace. Paths outside it are refused, symlinks included:
    the agent works only where the user said. */
function inside(ws: Workspace, p: string) {
  let full: string;
  try { full = real(path.resolve(ws.root, p)); } catch { throw new Error(`"${p}" is a link to something that doesn't exist`); }
  const rel = path.relative(ws.root, full);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error(`"${p}" is outside ${ws.root}, the folder rosling may change`);
  return full;
}

/** The deck a tool works on: the `deck` argument, else the deck this session made or was started in,
    else the only deck in the workspace. */
export function deckDir(ws: Workspace, arg: unknown) {
  if (typeof arg === 'string' && arg) {
    const d = inside(ws, arg);
    if (!fs.existsSync(path.join(d, 'deck.json'))) throw new Error(`no deck in ${d} (make one with create_deck)`);
    return (ws.current = d);
  }
  if (ws.current && fs.existsSync(path.join(ws.current, 'deck.json'))) return ws.current;
  const decks = fs.readdirSync(ws.root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ws.root, e.name, 'deck.json'))).map((e) => e.name);
  if (decks.length === 1) return (ws.current = path.join(ws.root, decks[0]));
  throw new Error(decks.length
    ? `which deck? Pass "deck": ${decks.join(', ')}`
    : `there is no deck in ${ws.root} yet: make one with create_deck`);
}

const writeJson = (file: string, data: unknown) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const snapshot = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const restore = (file: string, text: string | null) => (text === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, text));

/** Runs a change; if the files it touched end up broken, puts them back and throws the problems. */
function checked(dir: string, files: string[], change: () => void, problems: (deck: Deck) => string[]) {
  const before = files.map(snapshot);
  try {
    change();
    const found = problems(loadDeck(dir));
    if (found.length) throw new Error(`Not saved, it doesn't fit:\n${found.map((e) => `- ${e}`).join('\n')}`);
  } catch (e) {
    files.forEach((f, i) => restore(f, before[i]));
    throw e;
  }
}
const slideProblems = (id: string) => (deck: Deck) => deck.slides.find((s) => s.id === id)?.errors ?? [];

function order(dir: string) {
  const meta = readJson(path.join(dir, 'deck.json'));
  return { meta, slides: Array.isArray(meta.slides) ? meta.slides.map(String) : [] };
}

function findSlide(dir: string, id: unknown) {
  if (typeof id !== 'string' || !id) throw new Error('"slide" is the slide\'s name, like what-is-an-llm');
  if (!order(dir).slides.includes(id)) throw new Error(`no slide "${id}" in the deck (get_deck lists them)`);
  return { id, file: path.join(dir, 'slides', id + '.json') };
}

function summary(dir: string) {
  const deck = loadDeck(dir);
  const problems = allErrors(deck);
  const planned = deck.slides.reduce((s, x) => s + x.time, 0);
  return {
    deck: dir, title: deck.title, theme: deck.theme?.id ?? null, config: deck.config,
    time: { talk_seconds: deck.time, planned_seconds: planned },
    slides: deck.slides.map((s, i) => ({ number: i + 1, name: s.id, title: s.title, template: s.template, seconds: s.time, problems: s.errors.length })),
    problems,
    view: `run: rosling dev --deck "${dir}"`,
  };
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
/** An object argument, or undefined when left out; anything else is a mistake worth saying. */
function obj(v: unknown, name: string) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`"${name}" must be an object, like {"title": "..."}`);
  return v as Record<string, unknown>;
}
const json = (v: unknown) => JSON.stringify(v, null, 2);

const deckArg = { deck: { type: 'string', description: 'the deck folder; may be left out after create_deck or when the server was started in a deck' } };
const timeDesc = 'planned time like 2m, 90s or 1h 5m';

export const DECK_TOOLS = [
  {
    name: 'create_deck',
    description: 'Start a new presentation in a new folder: deck.json, a few starter slides (unless blank), and AGENTS.md with the rules. Later tools use this deck when "deck" is left out.',
    inputSchema: { type: 'object', required: ['folder'], properties: {
      folder: { type: 'string', description: 'new folder name, like my-talk' },
      title: { type: 'string' }, time: { type: 'string', description: 'length of the talk, like 20m' },
      blank: { type: 'boolean', description: 'no starter slides' },
    } },
  },
  {
    name: 'get_deck',
    description: 'The deck: title, talk time, theme, shared values (config), and every slide in order with its template, time and problem count.',
    inputSchema: { type: 'object', properties: { ...deckArg } },
  },
  {
    name: 'update_deck',
    description: 'Change the deck\'s title, talk time, theme or shared values (config: event, date, venue..., used in slide text as {event}). config keys set to null are removed.',
    inputSchema: { type: 'object', properties: { ...deckArg, title: { type: 'string' }, time: { type: 'string', description: 'length of the talk, like 20m' }, theme: { type: 'string' }, config: { type: 'object' } } },
  },
  {
    name: 'list_templates',
    description: 'Every slide template with its boxes (values a slide fills in: type, required, limits). Give "template" for one template with its example values.',
    inputSchema: { type: 'object', properties: { ...deckArg, template: { type: 'string', description: 'a template id, like core/title-text' } } },
  },
  {
    name: 'list_packs',
    description: 'The packs the deck uses (core, the deck\'s own "local" templates, and packs from GitHub): where each comes from, its templates and themes, and how many slides use it. Adding a pack runs someone else\'s code, so only the user adds one, with: rosling pack add github:owner/repo.',
    inputSchema: { type: 'object', properties: { ...deckArg } },
  },
  {
    name: 'get_slide',
    description: 'One slide\'s file (template, title, time, notes, values), its number, and any problems.',
    inputSchema: { type: 'object', required: ['slide'], properties: { ...deckArg, slide: { type: 'string', description: 'the slide\'s name' } } },
  },
  {
    name: 'add_slide',
    description: 'Add a slide. Without "values" it is filled with the template\'s example, to replace next. Always ask the user how long the slide should take instead of guessing "time".',
    inputSchema: { type: 'object', required: ['name', 'template'], properties: {
      ...deckArg,
      name: { type: 'string', description: 'lower-case words joined by dashes, describing the content: what-is-an-llm' },
      template: { type: 'string', description: 'a template id from list_templates' },
      after: { type: 'string', description: 'the slide to put it after (default: at the end)' },
      values: { type: 'object', description: 'the template\'s boxes' },
      title: { type: 'string', description: 'sidebar label, when the template\'s title text doesn\'t fit' },
      time: { type: 'string', description: timeDesc }, notes: { type: 'string', description: 'speaker notes' },
    } },
  },
  {
    name: 'update_slide',
    description: 'Change a slide. "values" are merged into the current ones (a key set to null is removed) unless replace_values is true. title, time and notes set to "" are removed.',
    inputSchema: { type: 'object', required: ['slide'], properties: {
      ...deckArg, slide: { type: 'string' },
      values: { type: 'object' }, replace_values: { type: 'boolean' },
      template: { type: 'string', description: 'switch to another template (values must fit it)' },
      title: { type: 'string' }, time: { type: 'string', description: timeDesc }, notes: { type: 'string' },
    } },
  },
  {
    name: 'move_slide',
    description: 'Move a slide to another place in the talk.',
    inputSchema: { type: 'object', required: ['slide', 'position'], properties: { ...deckArg, slide: { type: 'string' }, position: { type: 'number', description: '1 is the first slide' } } },
  },
  {
    name: 'remove_slide',
    description: 'Remove a slide from the deck and delete its file.',
    inputSchema: { type: 'object', required: ['slide'], properties: { ...deckArg, slide: { type: 'string' } } },
  },
  {
    name: 'check_deck',
    description: 'Check every slide against its template, like `rosling check`. Lists every problem.',
    inputSchema: { type: 'object', properties: { ...deckArg } },
  },
];

export function runDeckTool(ws: Workspace, name: string, a: Record<string, unknown>): string | null {
  switch (name) {
    case 'create_deck': {
      const folder = str(a.folder);
      if (!folder) throw new Error('"folder" is required, like my-talk');
      if (fs.existsSync(path.join(ws.root, 'deck.json'))) throw new Error(`this server works on ${ws.root} only; start it in a folder for talks to make new decks`);
      const dir = inside(ws, folder);
      // never write a deck over someone's files
      if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} already has files in it: pick a new folder name`);
      initDeck(dir, { blank: a.blank === true, title: str(a.title) });
      if (str(a.time)) {
        const file = path.join(dir, 'deck.json');
        checked(dir, [file], () => writeJson(file, { ...readJson(file), time: str(a.time) }), (d) => d.errors);
      }
      // like `rosling init`: decks live in git, but never nest a repo inside another
      if (spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' }).status !== 0)
        spawnSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
      ws.current = dir;
      return `Created the deck. Next: list_templates, then add_slide and update_slide; set the event, date and venue with update_deck.\n\n${json(summary(dir))}`;
    }
    case 'get_deck': return json(summary(deckDir(ws, a.deck)));
    case 'check_deck': {
      const problems = allErrors(loadDeck(deckDir(ws, a.deck)));
      return problems.length ? `${problems.length} problem(s):\n${problems.map((e) => `- ${e}`).join('\n')}` : 'Every slide fits its template.';
    }
    case 'update_deck': {
      const dir = deckDir(ws, a.deck), file = path.join(dir, 'deck.json');
      const before = new Set(loadDeck(dir).errors);
      checked(dir, [file], () => {
        const meta = readJson(file);
        for (const k of ['title', 'time', 'theme'] as const) if (str(a[k])) meta[k] = str(a[k]);
        const config = obj(a.config, 'config');
        if (config) {
          const next = { ...((meta.config && typeof meta.config === 'object' ? meta.config : {}) as Record<string, unknown>) };
          for (const [k, v] of Object.entries(config)) {
            if (v === null) delete next[k];
            else if (['string', 'number', 'boolean'].includes(typeof v)) next[k] = String(v);
            else throw new Error(`config.${k}: a shared value is text, like "JSConf 2026"`);
          }
          meta.config = next;
        }
        writeJson(file, meta);
      }, (d) => d.errors.filter((e) => !before.has(e)));
      return json(summary(dir));
    }
    case 'list_templates': {
      const deck = loadDeck(deckDir(ws, a.deck));
      const id = str(a.template);
      if (id) {
        const t = deck.templates.get(id);
        if (!t) throw new Error(`no template "${id}" (list_templates without "template" lists them)`);
        return `${t.id}: ${t.description}\n\nBoxes:\n${describeSchema(t.schema)}\n\nExample values:\n${json(t.sample)}`;
      }
      return [...deck.templates.values()].map((t) =>
        `${t.id} (used ${slidesUsing(deck, t.id).length}×): ${t.description}\n${describeSchema(t.schema)}`).join('\n\n');
    }
    case 'list_packs': return json(listPacks(deckDir(ws, a.deck)));
    case 'get_slide': {
      const dir = deckDir(ws, a.deck), { id, file } = findSlide(dir, a.slide);
      const deck = loadDeck(dir), n = deck.slides.findIndex((s) => s.id === id);
      return json({ number: n + 1, file: `slides/${id}.json`, slide: readJson(file), problems: deck.slides[n].errors });
    }
    case 'add_slide': {
      const dir = deckDir(ws, a.deck), id = str(a.name) ?? '', deckFile = path.join(dir, 'deck.json');
      const file = path.join(dir, 'slides', id + '.json');
      const values = obj(a.values, 'values');
      checked(dir, [deckFile, file], () => {
        newSlide(dir, id, { template: str(a.template) ?? '', after: str(a.after), time: str(a.time), notes: str(a.notes), values });
        if (str(a.title)) { const doc = readJson(file); writeJson(file, { template: doc.template, title: str(a.title), ...doc }); }
      }, slideProblems(id));
      const n = order(dir).slides.indexOf(id) + 1;
      return `Added slide ${n}, ${id}${values ? '' : ', filled with the template\'s example values: replace them with update_slide'}.${str(a.time) ? '' : ' It has no planned time: ask the user how long it should take.'}\n\n${json(readJson(file))}`;
    }
    case 'update_slide': {
      const dir = deckDir(ws, a.deck), { id, file } = findSlide(dir, a.slide);
      checked(dir, [file], () => {
        const doc = readJson(file);
        if (str(a.template)) doc.template = str(a.template);
        for (const k of ['title', 'time', 'notes'] as const)
          if (typeof a[k] === 'string') { if ((a[k] as string).trim()) doc[k] = a[k]; else delete doc[k]; }
        const values = obj(a.values, 'values');
        if (values) {
          const next = a.replace_values === true ? {} : { ...((doc.values && typeof doc.values === 'object' ? doc.values : {}) as Record<string, unknown>) };
          for (const [k, v] of Object.entries(values)) if (v === null) delete next[k]; else next[k] = v;
          doc.values = next;
        }
        // keep the usual key order, so files stay easy to read
        const { template, title, time, notes, values: v, ...rest } = doc;
        writeJson(file, { template, title, time, notes, values: v, ...rest });
      }, slideProblems(id));
      return json(readJson(file));
    }
    case 'move_slide': {
      const dir = deckDir(ws, a.deck), { id } = findSlide(dir, a.slide);
      const { meta, slides } = order(dir);
      if (typeof a.position !== 'number' || !Number.isInteger(a.position)) throw new Error('"position" is a whole number, 1 for the first slide');
      const to = Math.max(1, Math.min(slides.length, a.position));
      const rest = slides.filter((s) => s !== id);
      rest.splice(to - 1, 0, id);
      writeJson(path.join(dir, 'deck.json'), { ...meta, slides: rest });
      return `Moved ${id} to slide ${to}.`;
    }
    case 'remove_slide': {
      const dir = deckDir(ws, a.deck), { id, file } = findSlide(dir, a.slide);
      const { meta, slides } = order(dir);
      writeJson(path.join(dir, 'deck.json'), { ...meta, slides: slides.filter((s) => s !== id) });
      fs.rmSync(file, { force: true });
      return `Removed ${id}. The deck has ${slides.length - 1} slide(s).`;
    }
    default: return null;
  }
}
