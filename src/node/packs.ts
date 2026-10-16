/* Packs from GitHub: templates and themes someone keeps in a GitHub repo, for any deck to use.
   `rosling pack add github:owner/repo#v1.0.0` downloads one commit with git (so private repos work with the
   user's own git login), checks it (checkPack), asks, and pins that exact commit in deck.json. The files go to
   .rosling/packs/<name>/ in the deck, which git ignores; `rosling pack install` downloads the pinned commits
   again, like npm install does from a lock file. A pack's name is the deck's choice, so two packs that both
   call themselves "minimal" can be used side by side (--as). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  FRAMEWORK_DIR, PACK_NAME, REPO, REF, packDir, githubPack, describeGithub, downloadedCommit,
  loadDeck, loadTemplates, loadThemes, readJson, allErrors, type GithubPack,
} from './deck.js';

export const MANIFEST = 'rosling-pack.json';
export const VERSION = String(readJson(path.join(FRAMEWORK_DIR, 'package.json')).version);
const MAX_FILES = 2000, MAX_BYTES = 50 * 1024 * 1024;
// what a pack's code may import: everything else would need an npm install, which packs never get
const IMPORTS = new Set(['rosling', 'react', 'react/jsx-runtime']);

/** github:owner/repo, owner/repo or https://github.com/owner/repo, each with an optional #tag-or-branch. */
export function parseSpec(spec: string): { repo: string; ref?: string } {
  const m = spec.trim().match(/^(?:github:|https:\/\/github\.com\/)?([^#\s]+?)(?:\.git)?\/?(?:#(.+))?$/);
  const repo = m?.[1], ref = m?.[2];
  if (!repo || !REPO.test(repo) || (ref !== undefined && !REF.test(ref)))
    throw new Error(`"${spec}": write a GitHub pack as github:owner/repo, or github:owner/repo#v1.0.0 for a tag or branch`);
  return { repo, ...(ref ? { ref } : {}) };
}

// ---- downloading ----

const NO_HOOKS = path.join(os.tmpdir(), 'rosling-no-hooks');   // a folder that doesn't exist: git runs no hooks

function git(args: string[], cwd: string) {
  const r = spawnSync('git', ['-c', `core.hooksPath=${NO_HOOKS}`, '-c', 'advice.detachedHead=false', ...args],
    { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });   // never stop to ask for a password
  if (r.error) throw new Error('packs are downloaded with git, and git is not installed (https://git-scm.com)');
  if (r.status !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
  return r.stdout.trim();
}

/** Downloads one commit of a GitHub repo (a tag, a branch, HEAD or a commit) into a new folder; returns the commit. */
function download(repo: string, want: string, into: string): string {
  fs.mkdirSync(into, { recursive: true });
  git(['init', '-q'], into);
  try { git(['fetch', '-q', '--depth', '1', `https://github.com/${repo}.git`, want], into); }
  catch (e) {
    const msg = (e as Error).message;
    if (/couldn't find remote ref|not our ref|unadvertised object/i.test(msg)) throw new Error(`github:${repo} has no tag, branch or commit "${want}"`);
    if (/terminal prompts disabled|could not read username|authentication failed|repository not found|not found|403|does not appear to be a git repository|correct access rights/i.test(msg))
      throw new Error(`couldn't download github:${repo}: it doesn't exist, or it is private and git has no GitHub login on this computer (one way: gh auth setup-git)`);
    throw new Error(`couldn't download github:${repo}: ${(msg.split('\n').find((l) => l.startsWith('fatal:')) ?? msg).replace(/^fatal:\s*/, '')}`);
  }
  git(['checkout', '-q', 'FETCH_HEAD'], into);
  return git(['rev-parse', 'HEAD'], into);
}

// downloads go to a folder next to the packs first, and move into place only once checked (and agreed to)
function staging(deckDir: string) {
  const root = path.join(path.resolve(deckDir), '.rosling');
  // a download left behind by a run that was killed (closed terminal): gone after 10 minutes
  for (const d of [root, path.join(root, 'packs')]) {
    let names: string[] = [];
    try { names = fs.readdirSync(d); } catch { continue; }   // none yet
    for (const n of names)
      if (/^tmp-|\.old-/.test(n) && Date.now() - fs.statSync(path.join(d, n)).mtimeMs > 10 * 60 * 1000) fs.rmSync(path.join(d, n), { recursive: true, force: true });
  }
  return path.join(root, `tmp-${crypto.randomBytes(4).toString('hex')}`);
}

function moveInto(from: string, dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.renameSync(from, dir);
}

// ---- checking ----

export interface PackReport { name: string; version: string; description: string; templates: string[]; themes: string[]; files: number; problems: string[] }

/** Everything wrong with a pack folder (empty problems: it is fine to use). Also what `rosling pack check` runs for pack authors. */
export function checkPack(dir: string): PackReport {
  const root = path.resolve(dir);
  const r: PackReport = { name: '', version: '', description: '', templates: [], themes: [], files: 0, problems: [] };
  const p = r.problems;
  // the manifest marks a repo as a pack, and says which rosling versions it was made for
  try {
    const m = readJson(path.join(root, MANIFEST));
    r.name = typeof m.name === 'string' ? m.name : '';
    r.version = typeof m.version === 'string' ? m.version : '';
    r.description = typeof m.description === 'string' ? m.description : '';
    if (!PACK_NAME.test(r.name)) p.push(`${MANIFEST} › name: use lower-case words joined by dashes, like minimal`);
    if (!r.version) p.push(`${MANIFEST} › version: write the pack's version, like "1.0.0"`);
    if (typeof m.rosling !== 'string' || !m.rosling.trim()) p.push(`${MANIFEST} › rosling: write the rosling versions it works with, like ">=${VERSION}"`);
    else if (!satisfies(VERSION, m.rosling)) p.push(`it needs rosling ${m.rosling}, and this is rosling ${VERSION}`);
  } catch (e) {
    p.push(fs.existsSync(path.join(root, MANIFEST)) ? (e as Error).message : `no ${MANIFEST}: a pack has one at the top of its repo`);
  }
  // every file: no links (they could point anywhere on this computer), a sane size, and only allowed imports
  let bytes = 0, links = false;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (d === root && e.name === '.git') continue;
      const f = path.join(d, e.name), rel = path.relative(root, f).split(path.sep).join('/');
      if (e.isSymbolicLink()) { p.push(`${rel} is a link; packs can't contain links`); links = true; }
      else if (e.isDirectory()) walk(f);
      else if (e.isFile()) {
        r.files++;
        bytes += fs.statSync(f).size;
        if (/^(templates|themes)\//.test(rel) && /\.(tsx?|jsx?|mjs|css)$/.test(e.name)) checkImports(root, f, rel, p);
      }
    }
  };
  walk(root);
  if (r.files > MAX_FILES || bytes > MAX_BYTES) p.push(`it is too big: ${r.files} files, ${Math.round(bytes / 1e6)} MB (at most ${MAX_FILES} files and ${MAX_BYTES / 1e6} MB)`);
  if (links) return r;
  // the templates and themes, checked the same way as the core ones
  const pack = { name: r.name || 'pack', dir: root, source: '' };
  for (const t of loadTemplates([pack]).values()) { r.templates.push(t.name); p.push(...t.errors.map((e) => `template ${e}`)); }
  const themes = loadThemes([pack]), themesDir = path.join(root, 'themes');
  if (fs.existsSync(themesDir))
    for (const e of fs.readdirSync(themesDir, { withFileTypes: true }))
      if (e.isDirectory()) { if (themes.has(`${pack.name}/${e.name}`)) r.themes.push(e.name); else p.push(`themes/${e.name} has no theme.css`); }
  if (!r.templates.length && !r.themes.length) p.push('it has no templates/ or themes/');
  return r;
}

function checkImports(root: string, file: string, rel: string, p: string[]) {
  const text = fs.readFileSync(file, 'utf8');
  const inside = (spec: string) => { const t = path.resolve(path.dirname(file), spec); return t.startsWith(root + path.sep); };
  if (file.endsWith('.css')) {
    // files in the pack, inline data and web fonts (https) are fine; nothing else on this computer
    for (const m of text.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)|url\(\s*['"]?([^'")\s]+)/g)) {
      const u = (m[1] ?? m[2])!;
      if (/^(data:|https:\/\/|#)/.test(u)) continue;
      if (u.startsWith('/') || /^[a-z][\w+.-]*:/i.test(u) || !inside(u)) p.push(`${rel}: "${u}" is not a file in the pack`);
    }
    return;
  }
  for (const m of text.matchAll(/\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*([^)]*)\)/g)) {
    let spec = m[1] ?? m[2];
    if (m[3] !== undefined) {
      const lit = m[3].trim().match(/^['"]([^'"]+)['"]$/);
      if (!lit) { p.push(`${rel}: import(...) of a computed name; a pack may only import fixed files`); continue; }
      spec = lit[1];
    }
    if (IMPORTS.has(spec!) || (/^\.\.?\//.test(spec!) && inside(spec!))) continue;
    p.push(`${rel}: imports "${spec}"; a pack may import only rosling, react and its own files`);
  }
}

/** A small version-range check: "1.2.3", ">=0.1.0", "^0.1.0", "~1.2.0", ">=0.1 <2", "a || b", "*". */
export function satisfies(version: string, range: string): boolean {
  const num = (s: string) => s.split('.').slice(0, 3).map((x) => parseInt(x, 10) || 0).concat([0, 0, 0]).slice(0, 3);
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const v = num(version.replace(/^v/, ''));
  return range.split('||').some((alt) => alt.trim().split(/\s+/).every((c) => {
    if (!c || c === '*') return true;
    const m = c.match(/^(\^|~|>=|<=|>|<|=)?v?(\d+(?:\.\d+){0,2})$/);
    if (!m) return false;
    const w = num(m[2]), d = cmp(v, w);
    switch (m[1]) {
      case '^': return d >= 0 && cmp(v, w[0] ? [w[0] + 1, 0, 0] : [0, w[1] + 1, 0]) < 0;
      case '~': return d >= 0 && cmp(v, [w[0], w[1] + 1, 0]) < 0;
      case '>=': return d >= 0;
      case '<=': return d <= 0;
      case '>': return d > 0;
      case '<': return d < 0;
      default: return d === 0;
    }
  }));
}

const notUsable = (repo: string, problems: string[]) => `github:${repo} can't be used as a pack:\n${problems.map((x) => `    ✗ ${x}`).join('\n')}`;

// ---- deck.json ----

const deckFile = (deckDir: string) => path.join(path.resolve(deckDir), 'deck.json');
const readMeta = (deckDir: string) => readJson(deckFile(deckDir));
const writeMeta = (deckDir: string, meta: Record<string, unknown>) => fs.writeFileSync(deckFile(deckDir), JSON.stringify(meta, null, 2) + '\n');
const packsOf = (meta: Record<string, unknown>) =>
  (meta.packs && typeof meta.packs === 'object' && !Array.isArray(meta.packs) ? meta.packs : {}) as Record<string, unknown>;

/** deck.json with one pack set (or removed, with undefined), keeping the order of its keys. */
function withPack(meta: Record<string, unknown>, name: string, value: GithubPack | undefined) {
  const packs = { ...packsOf(meta) };
  if (value) packs[name] = value; else delete packs[name];
  if ('packs' in meta) return { ...meta, packs };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) { if (k === 'slides') out.packs = packs; out[k] = v; }
  if (!('packs' in out)) out.packs = packs;
  return out;
}

// the downloaded packs are not part of the deck's own files
function ensureIgnored(deckDir: string) {
  const file = path.join(path.resolve(deckDir), '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (text.split('\n').some((l) => /^\/?\.rosling\/?$/.test(l.trim()))) return;
  fs.writeFileSync(file, text + (text && !text.endsWith('\n') ? '\n' : '') + '.rosling/\n');
}

function checkName(name: string, packs: Record<string, unknown>, repo: string) {
  const other = `${repo.split('/')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${name}`;
  if (!PACK_NAME.test(name)) throw new Error(`"${name}": a pack's name is lower-case words joined by dashes, like my-brand`);
  if (name === 'core' || name === 'local') throw new Error(`"${name}" is reserved: choose another name with --as, like --as ${other}`);
  if (name in packs) {
    const g = githubPack(packs[name]);
    throw new Error(`this deck already has a pack called "${name}" (${g ? describeGithub(g) : String(packs[name])}): choose another name for this one with --as, like --as ${other}`);
  }
}

// ---- the commands ----

export interface Preview extends PackReport { repo: string; ref?: string; commit: string; as: string; usedBy?: string[] }
type Confirm = (p: Preview) => Promise<boolean>;

/** Downloads, checks, asks, then adds the pack to deck.json pinned to the commit it got. Null when the user said no. */
export async function addPack(deckDir: string, spec: string, opts: { as?: string; confirm: Confirm }): Promise<Preview | null> {
  const { repo, ref } = parseSpec(spec);
  const meta = readMeta(deckDir), packs = packsOf(meta);
  for (const [n, s] of Object.entries(packs))
    if (githubPack(s)?.github.toLowerCase() === repo.toLowerCase()) throw new Error(`github:${repo} is already in this deck as "${n}". For a newer version: rosling pack update ${n}`);
  if (opts.as !== undefined) checkName(opts.as, packs, repo);
  const tmp = staging(deckDir);
  try {
    const commit = download(repo, ref ?? 'HEAD', tmp);
    const report = checkPack(tmp);
    if (report.problems.length) throw new Error(notUsable(repo, report.problems));
    const as = opts.as ?? report.name;
    checkName(as, packs, repo);
    const preview: Preview = { ...report, repo, ...(ref ? { ref } : {}), commit, as };
    if (!(await opts.confirm(preview))) return null;
    moveInto(tmp, packDir(deckDir, as));
    writeMeta(deckDir, withPack(meta, as, { github: repo, ...(ref ? { ref } : {}), commit }));
    ensureIgnored(deckDir);
    return preview;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** Downloads every GitHub pack whose files are missing or not the pinned commit (after a clone, or a teammate's update). */
export function installPacks(deckDir: string): { lines: string[]; failed: boolean } {
  const lines: string[] = [];
  let failed = false, any = false;
  for (const [name, spec] of Object.entries(packsOf(readMeta(deckDir)))) {
    const g = githubPack(spec);
    if (!g) continue;
    any = true;
    const dir = packDir(deckDir, name);
    if (downloadedCommit(dir) === g.commit) { lines.push(`✓ ${name}: already downloaded`); continue; }
    const tmp = staging(deckDir);
    try {
      if (download(g.github, g.commit, tmp) !== g.commit) throw new Error(`GitHub sent a different commit than ${g.commit}`);
      const report = checkPack(tmp);
      if (report.problems.length) throw new Error(notUsable(g.github, report.problems));
      moveInto(tmp, dir);
      lines.push(`✓ ${name}: downloaded ${describeGithub(g)} (commit ${g.commit.slice(0, 7)})`);
    } catch (e) { failed = true; lines.push(`✗ ${name}: ${(e as Error).message}`); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  if (!any) lines.push('This deck has no GitHub packs.');
  else ensureIgnored(deckDir);
  return { lines, failed };
}

/** Moves GitHub packs to the newest commit of their tag or branch (or to a new one with ref). An update that
    would give the deck new problems is undone, unless force. */
export async function updatePacks(deckDir: string, names: string[], opts: { ref?: string; force: boolean; confirm: Confirm }): Promise<{ lines: string[]; failed: boolean }> {
  if (opts.ref !== undefined && !REF.test(opts.ref)) throw new Error(`"${opts.ref}" is not a tag or branch name`);
  const packs = packsOf(readMeta(deckDir));
  const todo = names.length ? names : Object.keys(packs).filter((n) => githubPack(packs[n]));
  if (opts.ref && todo.length !== 1) throw new Error('--ref changes one pack: name it, like rosling pack update minimal --ref v2.0.0');
  for (const n of todo) if (!githubPack(packs[n])) throw new Error(n in packs ? `"${n}" is a folder, not a GitHub pack: there is nothing to update` : `this deck has no pack called "${n}"`);
  if (!todo.length) return { lines: ['This deck has no GitHub packs.'], failed: false };
  const lines: string[] = [];
  let failed = false;
  for (const name of todo) {
    const metaText = fs.readFileSync(deckFile(deckDir), 'utf8');
    const meta = readMeta(deckDir), g = githubPack(packsOf(meta)[name])!;
    const ref = opts.ref ?? g.ref, tmp = staging(deckDir), dir = packDir(deckDir, name);
    try {
      const commit = download(g.github, ref ?? 'HEAD', tmp);
      if (commit === g.commit && ref === g.ref) { lines.push(`✓ ${name}: already the newest${ref ? ` ${ref}` : ''}`); continue; }
      const report = checkPack(tmp);
      if (report.problems.length) throw new Error(notUsable(g.github, report.problems));
      const before = loadDeck(deckDir);
      const usedBy = before.slides.filter((s) => s.template.startsWith(name + '/')).map((s) => s.id);
      if (!(await opts.confirm({ ...report, repo: g.github, ...(ref ? { ref } : {}), commit, as: name, usedBy }))) { lines.push(`- ${name}: left as it was`); continue; }
      // swap in the new files, then see what the deck thinks; undo if it got worse
      const old = `${dir}.old-${crypto.randomBytes(4).toString('hex')}`;
      const had = fs.existsSync(dir);
      if (had) fs.renameSync(dir, old);
      moveInto(tmp, dir);
      writeMeta(deckDir, withPack(meta, name, { github: g.github, ...(ref ? { ref } : {}), commit }));
      const was = new Set(allErrors(before));
      const fresh = allErrors(loadDeck(deckDir)).filter((e) => !was.has(e));
      if (fresh.length && !opts.force) {
        fs.rmSync(dir, { recursive: true, force: true });
        if (had) fs.renameSync(old, dir);
        fs.writeFileSync(deckFile(deckDir), metaText);
        failed = true;
        lines.push(`✗ ${name}: not updated, because the new version would give the deck these problems:\n${fresh.map((x) => `    ✗ ${x}`).join('\n')}\n    Fix the slides first, or update anyway with --force and fix them after.`);
        continue;
      }
      fs.rmSync(old, { recursive: true, force: true });
      lines.push(`✓ ${name}: ${g.commit.slice(0, 7)} → ${commit.slice(0, 7)}${report.version ? ` (version ${report.version})` : ''}${fresh.length ? `, with ${fresh.length} new problem(s): see rosling check` : ''}`);
    } catch (e) { failed = true; lines.push(`✗ ${name}: ${(e as Error).message}`); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  return { lines, failed };
}

/** Takes a pack out of the deck. Refused while slides (or the deck's theme) still use it. A folder pack's folder is left alone. */
export function removePack(deckDir: string, name: string): string {
  const meta = readMeta(deckDir), packs = packsOf(meta);
  if (!(name in packs)) throw new Error(`this deck has no pack called "${name}"`);
  const deck = loadDeck(deckDir);
  const using = deck.slides.filter((s) => s.template.startsWith(name + '/')).map((s) => s.id);
  if (using.length) throw new Error(`${using.length} slide${using.length === 1 ? ' uses' : 's use'} pack "${name}" (${using.join(', ')}): give ${using.length === 1 ? 'it' : 'them'} another template first`);
  if (String(meta.theme ?? '').startsWith(name + '/')) throw new Error(`the deck's theme (${meta.theme}) comes from pack "${name}": change deck.json › theme first`);
  const g = githubPack(packs[name]);
  writeMeta(deckDir, withPack(meta, name, undefined));
  const spec = String(packs[name]);
  if (!g) return spec.startsWith('.') || path.isAbsolute(spec) ? `Removed "${name}" from deck.json. Its folder (${spec}) is yours, so it was left alone.` : `Removed "${name}" from deck.json.`;
  fs.rmSync(packDir(deckDir, name), { recursive: true, force: true });
  return `Removed "${name}" and its downloaded files.`;
}

export interface PackRow {
  name: string; source: string; version: string; commit?: string;
  templates: string[]; themes: string[]; slides: number; isTheme: boolean; problems: string[];
}

/** Every pack the deck can use, including core and the deck's own (local), and any it lists but can't load. */
export function listPacks(deckDir: string): PackRow[] {
  const deck = loadDeck(deckDir);
  const mine = (id: string, name: string) => id.startsWith(name + '/');
  const problemsOf = (name: string) => deck.errors.filter((e) => e.includes(`pack "${name}"`) || e.includes(`packs.${name}:`));
  const rows: PackRow[] = deck.packs.map((p) => {
    let version = p.name === 'core' ? VERSION : '';
    if (p.name !== 'core' && p.name !== 'local') try { version = String(readJson(path.join(p.dir, MANIFEST)).version ?? ''); } catch { /* a folder pack may have none yet */ }
    return {
      name: p.name, source: p.source, version, ...(p.github ? { commit: p.github.commit.slice(0, 7) } : {}),
      templates: [...deck.templates.values()].filter((t) => t.pack === p.name).map((t) => t.name),
      themes: [...deck.themes.keys()].filter((id) => mine(id, p.name)).map((id) => id.slice(p.name.length + 1)),
      slides: deck.slides.filter((s) => mine(s.template, p.name)).length,
      isTheme: !!deck.theme && mine(deck.theme.id, p.name),
      problems: problemsOf(p.name),
    };
  });
  for (const [name, spec] of Object.entries(packsOf(readMeta(deckDir)))) {
    if (rows.some((r) => r.name === name)) continue;
    const g = githubPack(spec);
    rows.push({ name, source: g ? describeGithub(g) : String(spec), version: '', templates: [], themes: [], slides: 0, isTheme: false, problems: problemsOf(name) });
  }
  return rows;
}
