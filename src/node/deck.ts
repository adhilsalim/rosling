/* Loading a deck: deck.json (order, theme, packs, shared values), the slide files in slides/,
   and the templates and themes from every pack. Nothing here throws on a bad slide: problems
   are collected on the slide (slide.errors) or the deck (deck.errors) so the viewer can show them
   and `rosling check` can list them all at once. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSchema, validate, type Asset, type Schema } from './schema.js';

/** The framework's own folder: it is the "core" pack (templates/, themes/) and holds the client app. */
export const FRAMEWORK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A pack in use: its name in this deck, its folder, and where it came from ("github:owner/repo v1.0" or a folder path). */
export interface Pack { name: string; dir: string; source: string; github?: GithubPack }

/** A pack from GitHub, as deck.json pins it: the repo, the tag or branch it follows (none: the default branch),
    and the exact commit. The files are downloaded into .rosling/packs/<name>/ (git-ignored) by `rosling pack`. */
export interface GithubPack { github: string; ref?: string; commit: string }

export const PACKS_DIR = '.rosling/packs';
export const PACK_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.)[A-Za-z0-9._-]{1,100}$/;
export const REF = /^(?!-)(?!.*\.\.)[\w.\/-]{1,200}$/;
export const COMMIT = /^[0-9a-f]{40}$/;

export const packDir = (deckDir: string, name: string) => path.join(path.resolve(deckDir), PACKS_DIR, name);

/** A deck.json packs entry that is a GitHub pack, or null. */
export function githubPack(spec: unknown): GithubPack | null {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  const { github, ref, commit, ...rest } = spec as Record<string, unknown>;
  if (Object.keys(rest).length || typeof github !== 'string' || !REPO.test(github) || typeof commit !== 'string' || !COMMIT.test(commit)) return null;
  if (ref !== undefined && (typeof ref !== 'string' || !REF.test(ref))) return null;
  return { github, commit, ...(ref ? { ref } : {}) };
}

export const describeGithub = (g: GithubPack) => `github:${g.github}${g.ref ? ` ${g.ref}` : ''}`;

/** The commit a downloaded pack folder has checked out (we always check out a commit, not a branch), or null. */
export function downloadedCommit(dir: string): string | null {
  try { const head = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8').trim(); return COMMIT.test(head) ? head : null; }
  catch { return null; }
}

export interface Template {
  id: string;               // "<pack>/<name>", e.g. core/title-text
  pack: string;
  name: string;
  dir: string;
  description: string;
  schema: Schema;
  sample: Record<string, unknown>;   // example values from sample.json, already checked
  sampleAssets: string[];
  errors: string[];         // problems in the template itself (bad schema, bad sample, missing file)
}

export interface Theme { id: string; dir: string; css: string; footer: string | null }

export interface Slide {
  id: string;               // file name without .json, e.g. what-is-an-llm
  file: string;
  template: string;
  title: string;            // sidebar label
  time: number;             // planned seconds; 0 means no limit
  notes: string;
  values: Record<string, unknown>;
  assets: string[];         // absolute paths of the images and videos it uses
  errors: string[];
}

export interface Deck {
  dir: string;
  title: string;
  time: number;
  config: Record<string, string>;
  theme: Theme | null;
  packs: Pack[];
  templates: Map<string, Template>;
  themes: Map<string, Theme>;
  slides: Slide[];
  errors: string[];
}

/** Reads a JSON file strictly. A mistake is an error naming the file and, where Node can tell, the line and column. */
export function readJson(file: string): Record<string, unknown> {
  const text = fs.readFileSync(file, 'utf8');
  let data: unknown;
  try { data = JSON.parse(text); }
  catch (e) {
    const msg = (e as Error).message;
    const at = msg.match(/position (\d+)/);
    const where = /line \d+/.test(msg) || !at ? '' : ` (line ${text.slice(0, +at[1]).split('\n').length})`;
    throw new Error(`${path.basename(file)} is not valid JSON: ${msg}${where}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${path.basename(file)}: expected a JSON object { ... }`);
  return data as Record<string, unknown>;
}

/** "1h 5m", "10m", "90s" or a number of seconds → seconds. */
export function parseDuration(v: unknown, where: string, errors: string[]): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
  if (!m || !m[0]) { errors.push(`${where}: "${v}" is not a time (write it like 1h 5m, 10m or 90s)`); return 0; }
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

/** Where each pack named in deck.json lives: a GitHub pack downloaded by `rosling pack`, or a folder
    (a pack you are making yourself). */
function resolvePacks(deckDir: string, packs: unknown, errors: string[]): Pack[] {
  const out: Pack[] = [{ name: 'core', dir: FRAMEWORK_DIR, source: 'built in' }, { name: 'local', dir: deckDir, source: "this deck's own" }];
  if (!packs) return out;
  if (typeof packs !== 'object' || Array.isArray(packs)) { errors.push('deck.json › packs: expected a map of pack names'); return out; }
  for (const [name, spec] of Object.entries(packs as Record<string, unknown>)) {
    const where = `deck.json › packs.${name}`;
    if (name === 'core' || name === 'local') { errors.push(`${where}: "${name}" is reserved`); continue; }
    if (!PACK_NAME.test(name)) { errors.push(`${where}: use lower-case words joined by dashes, like my-brand`); continue; }
    if (typeof spec === 'string' && (spec.startsWith('.') || path.isAbsolute(spec))) {
      const dir = path.resolve(deckDir, spec);
      if (fs.existsSync(dir)) out.push({ name, dir, source: spec });
      else errors.push(`${where}: folder ${spec} not found`);
      continue;
    }
    const g = githubPack(spec);
    if (!g) {
      errors.push(`${where}: expected a GitHub pack {"github": "owner/repo", "ref": "v1.0.0", "commit": "<40-character commit>"} or a folder like "./my-pack". Add packs with: rosling pack add github:owner/repo`);
      continue;
    }
    const dir = packDir(deckDir, name), have = downloadedCommit(dir);
    if (!have) { errors.push(`pack "${name}" (${describeGithub(g)}) is not downloaded: run rosling pack install`); continue; }
    if (have !== g.commit) errors.push(`pack "${name}": the downloaded files are not the commit deck.json pins: run rosling pack install`);
    out.push({ name, dir, source: describeGithub(g), github: g });
  }
  return out;
}

export function loadTemplates(packs: Pack[]): Map<string, Template> {
  const all = new Map<string, Template>();
  for (const pack of packs) {
    const root = path.join(pack.dir, 'templates');
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).sort()) {
      const dir = path.join(root, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const id = `${pack.name}/${name}`;
      const t: Template = { id, pack: pack.name, name, dir, description: '', schema: {}, sample: {}, sampleAssets: [], errors: [] };
      try {
        const meta = readJson(path.join(dir, 'template.json'));
        t.description = String(meta.description ?? '');
        t.schema = normalizeSchema(meta.props, `${id}/template.json`);
      } catch (e) { t.errors.push((e as Error).message); }
      if (!fs.existsSync(path.join(dir, 'Template.tsx'))) t.errors.push(`${id}: Template.tsx is missing`);
      const sampleFile = path.join(dir, 'sample.json');
      if (fs.existsSync(sampleFile)) {
        const r = validate(t.schema, readJson(sampleFile), (a) => assetPath(dir, a, t.sampleAssets, t.errors, `${id}/sample.json`));
        t.sample = r.values;
        t.errors.push(...r.errors.map((e) => `${id}/sample.json › ${e}`));
      } else t.errors.push(`${id}: sample.json is missing (the gallery and agents use it as the example)`);
      all.set(id, t);
    }
  }
  return all;
}

function assetPath(base: string, a: Asset, list: string[], errors: string[], where: string) {
  const file = path.resolve(base, a.file);
  if (!fs.existsSync(file)) errors.push(`${where}: ${a.kind} "${a.file}" not found`);
  else if (!list.includes(file)) list.push(file);
  return file;
}

export function loadThemes(packs: Pack[]): Map<string, Theme> {
  const all = new Map<string, Theme>();
  for (const pack of packs) {
    const root = path.join(pack.dir, 'themes');
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name), css = path.join(dir, 'theme.css'), footer = path.join(dir, 'Footer.tsx');
      if (!fs.existsSync(css)) continue;
      all.set(`${pack.name}/${name}`, { id: `${pack.name}/${name}`, dir, css, footer: fs.existsSync(footer) ? footer : null });
    }
  }
  return all;
}

/** Removes the little bit of markup text values may contain, for labels. */
export const plain = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\s*\n\s*/g, ' ').trim();

export function loadDeck(deckDir: string): Deck {
  const dir = path.resolve(deckDir);
  const errors: string[] = [];
  const deckFile = path.join(dir, 'deck.json');
  if (!fs.existsSync(deckFile))
    throw new Error(fs.existsSync(path.join(dir, 'deck.yaml')) ? `${dir} has a deck.yaml: decks are JSON now (deck.json)` : `No deck.json in ${dir}. Run "rosling init" to start a deck.`);
  let meta: Record<string, unknown> = {};
  try { meta = readJson(deckFile); } catch (e) { errors.push((e as Error).message); }

  const packs = resolvePacks(dir, meta.packs, errors);
  const templates = loadTemplates(packs);
  const themes = loadThemes(packs);
  const themeId = String(meta.theme ?? 'core/plain');
  const theme = themes.get(themeId) ?? null;
  if (!theme) errors.push(`deck.json › theme: "${themeId}" not found (available: ${[...themes.keys()].join(', ')})`);

  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries((meta.config as Record<string, unknown>) ?? {})) config[k] = String(v);

  const order = Array.isArray(meta.slides) ? meta.slides.map(String) : [];
  if (!Array.isArray(meta.slides)) errors.push('deck.json › slides: expected a list of slide file names');
  const seen = new Set<string>();
  const slides = order.map((id) => {
    if (seen.has(id)) errors.push(`deck.json › slides: "${id}" is listed twice`);
    seen.add(id);
    return loadSlide(dir, id, templates);
  });

  // slide files that exist but are not in the deck: easy to miss, so say so
  const slidesDir = path.join(dir, 'slides');
  if (fs.existsSync(slidesDir))
    for (const f of fs.readdirSync(slidesDir))
      if (f.endsWith('.json') && !seen.has(f.slice(0, -5))) errors.push(`slides/${f} is not listed in deck.json › slides`);
      else if (/\.ya?ml$/.test(f)) errors.push(`slides/${f}: slide files are JSON now (slides/${f.replace(/\.ya?ml$/, '.json')})`);

  return {
    dir, title: String(meta.title ?? 'Untitled deck'), time: parseDuration(meta.time, 'deck.json › time', errors),
    config, theme, packs, templates, themes, slides, errors,
  };
}

function loadSlide(deckDir: string, id: string, templates: Map<string, Template>): Slide {
  const file = path.join(deckDir, 'slides', id + '.json');
  const slide: Slide = { id, file, template: '', title: id, time: 0, notes: '', values: {}, assets: [], errors: [] };
  if (!fs.existsSync(file)) { slide.errors.push(`slides/${id}.json not found`); return slide; }
  let raw: Record<string, unknown>;
  try { raw = readJson(file); } catch (e) { slide.errors.push((e as Error).message); return slide; }
  // a slide may only choose a template and fill it: anything else is a mistake worth pointing out
  for (const k of Object.keys(raw))
    if (!['template', 'title', 'time', 'notes', 'values'].includes(k))
      slide.errors.push(`"${k}" is not allowed in a slide (use: template, title, time, notes, values)`);
  slide.template = String(raw.template ?? '');
  slide.time = parseDuration(raw.time, 'time', slide.errors);
  slide.notes = String(raw.notes ?? '').trim();
  const t = templates.get(slide.template);
  if (!t) {
    slide.errors.push(raw.template ? `template "${slide.template}" not found` : 'missing "template"');
    return slide;
  }
  const r = validate(t.schema, raw.values, (a) => assetPath(path.join(deckDir, 'assets'), a, slide.assets, slide.errors, `values (${a.file})`));
  slide.values = r.values;
  slide.errors.push(...r.errors);
  // sidebar label: the slide's own title, else its template's first required text (title, statement...)
  const texts = Object.entries(t.schema).filter(([, p]) => p.type === 'text').sort(([, a], [, b]) => +!!b.required - +!!a.required);
  const label = raw.title ?? texts.map(([k]) => r.values[k]).find((x) => typeof x === 'string' && x);
  slide.title = typeof label === 'string' && label ? plain(label) : id;
  return slide;
}

/** The slides that use a template, with their 1-based position in the deck. */
export function slidesUsing(deck: Deck, templateId: string) {
  return deck.slides.map((s, i) => ({ n: i + 1, slide: s })).filter((x) => x.slide.template === templateId);
}

export function allErrors(deck: Deck): string[] {
  const out = deck.errors.map((e) => `deck: ${e}`);
  const used = new Set(deck.slides.map((s) => s.template));
  for (const t of deck.templates.values()) if (used.has(t.id)) out.push(...t.errors.map((e) => `template ${e}`));
  deck.slides.forEach((s, i) => out.push(...s.errors.map((e) => `slide ${i + 1} (${s.id}): ${e}`)));
  return out;
}
