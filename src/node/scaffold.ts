/* Creating things: a new deck, a new slide from a template, a new template of your own.
   Slides start from the template's sample.json, so a new slide is valid from the first second. */
import fs from 'node:fs';
import path from 'node:path';
import { FRAMEWORK_DIR, loadDeck, readJson } from './deck.js';

const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const writeJson = (file: string, data: unknown) => write(file, JSON.stringify(data, null, 2) + '\n');

export function initDeck(dir: string, opts: { blank: boolean; title?: string }) {
  const root = path.resolve(dir);
  if (fs.existsSync(path.join(root, 'deck.json'))) throw new Error(`${root} already has a deck.json`);
  const title = opts.title ?? path.basename(root).replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const starter = opts.blank ? [] : [
    ['welcome', 'core/cover', { title, subtitle: 'What this talk is about, in one line' }],
    ['agenda', 'core/title-text', { title: 'What we will cover', bullets: ['The problem', 'Our idea', 'A live demo', 'What comes next'] }],
    ['thank-you', 'core/thank-you', { title: 'Thank you', text: 'Questions?' }],
  ] as const;
  // what each key means is explained in the deck's AGENTS.md (JSON has no comments)
  writeJson(path.join(root, 'deck.json'), {
    title,
    theme: 'core/plain',
    time: '30m',
    config: { event: 'Event name', date: 'Date', venue: 'Venue' },
    packs: {},
    slides: starter.map(([id]) => id),
  });
  for (const [id, template, values] of starter) writeJson(path.join(root, 'slides', id + '.json'), { template, values });
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
  write(path.join(root, 'assets', '.gitkeep'), '');
  write(path.join(root, 'templates', '.gitkeep'), '');
  // in a folder that already has these (an existing repo), keep the user's own
  const keep = (file: string, text: string) => { if (!fs.existsSync(file)) write(file, text); };
  keep(path.join(root, '.gitignore'), 'dist/\nnode_modules/\n.DS_Store\ncomments.json.lock\n');
  keep(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n');
  keep(path.join(root, 'AGENTS.md'), fs.readFileSync(path.join(FRAMEWORK_DIR, 'docs/DECK-AGENTS.md'), 'utf8'));
  return root;
}

/** Adds a slide to the deck right after `after` (or at the end), filled with `values` or else the template's sample values. */
export function newSlide(deckDir: string, id: string, opts: { template: string; after?: string; time?: string; title?: string; notes?: string; values?: Record<string, unknown> }) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error(`"${id}": use lower-case words joined by dashes, like what-is-an-llm`);
  const deck = loadDeck(deckDir);
  const t = deck.templates.get(opts.template);
  if (!t) throw new Error(`template "${opts.template}" not found. Run "rosling template list" to see them.`);
  const file = path.join(deck.dir, 'slides', id + '.json');
  if (fs.existsSync(file)) throw new Error(`slides/${id}.json already exists`);
  // check everything before writing anything, so a mistake leaves no half-made slide behind
  const deckFile = path.join(deck.dir, 'deck.json');
  const meta = readJson(deckFile);
  const order = Array.isArray(meta.slides) ? meta.slides.map(String) : [];
  const at = opts.after ? order.indexOf(opts.after) : order.length - 1;
  if (opts.after && at < 0) throw new Error(`--after: "${opts.after}" is not in the deck`);

  const sample = opts.values ? { ...opts.values } : readJson(path.join(t.dir, 'sample.json'));
  if (opts.title && 'title' in t.schema && !opts.values) sample.title = opts.title;
  // sample images live next to the template; copy them into the deck's assets so the new slide works
  for (const [key, prop] of Object.entries(opts.values ? {} : t.schema)) {
    const v = sample[key];
    if ((prop.type === 'image' || prop.type === 'video') && typeof v === 'string' && !/^https?:/.test(v)) {
      const src = path.join(t.dir, v), name = `${id}-${path.basename(v)}`;
      if (fs.existsSync(src)) { fs.mkdirSync(path.join(deck.dir, 'assets'), { recursive: true }); fs.copyFileSync(src, path.join(deck.dir, 'assets', name)); sample[key] = name; }
    }
  }
  const doc: Record<string, unknown> = { template: t.id };
  if (opts.time) doc.time = opts.time;
  if (opts.notes) doc.notes = opts.notes;
  doc.values = sample;
  writeJson(file, doc);

  order.splice(at + 1, 0, id);
  writeJson(deckFile, { ...meta, slides: order });
  return { file, position: at + 2 };
}

/** Creates a deck-local template (local/<name>) from a small, working starting point. */
export function newTemplate(deckDir: string, name: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error(`"${name}": use lower-case words joined by dashes`);
  const dir = path.join(path.resolve(deckDir), 'templates', name);
  if (fs.existsSync(dir)) throw new Error(`templates/${name} already exists`);
  const from = path.join(FRAMEWORK_DIR, 'templates', 'title-text');
  for (const f of ['Template.tsx', 'style.module.css', 'sample.json', 'template.json'])
    write(path.join(dir, f), fs.readFileSync(path.join(from, f), 'utf8').replace(/title-text/g, name));
  return dir;
}
