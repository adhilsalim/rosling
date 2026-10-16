/* The `rosling` command. Every command works on the deck in the current folder, or the one given with --deck. */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { loadDeck, allErrors, slidesUsing } from './deck.js';
import { describeSchema } from './schema.js';
import { dev, build, present } from './serve.js';
import { initDeck, newSlide, newTemplate } from './scaffold.js';
import { connect, AGENTS } from './connect.js';
import { mcp } from './mcp.js';
import { addPack, installPacks, updatePacks, removePack, listPacks, checkPack, type Preview } from './packs.js';

const HELP = `rosling: presentations as data

  rosling init [folder] [--blank]          start a deck (--blank: no starter slides)
  rosling dev                              live viewer while you edit, with the phone remote
  rosling check                            check every slide against its template
  rosling build                            build the deck into dist/
  rosling present [--no-build]             build, then serve dist/ for the talk, with the phone remote
  rosling new <name> --template <id>       add a slide, filled with the template's example
        [--after <slide>] [--time 2m] [--title "..."]
  rosling template list [--props]          every template you can use (and how often it is used)
  rosling template usage [id]              which slides use a template
  rosling template new <name>              make your own template in templates/<name>
  rosling pack add github:owner/repo[#tag] use templates and themes from a GitHub repo
        [--as <name>] [--yes]
  rosling pack list                        the packs this deck uses, and what is in them
  rosling pack install                     download the packs deck.json pins (after cloning a deck)
  rosling pack update [name] [--ref <tag>] move packs to the newest commit of their tag or branch
  rosling pack remove <name>               take a pack out of the deck
  rosling pack check [folder]              check a pack you are making before you push it
  rosling connect <agent>                  send viewer comments to your coding agent
                                            (${AGENTS.join(', ')})
  rosling mcp                              the MCP server agents start (connect sets it up): make
                                            and edit decks, and act on review comments

Options
  --deck, -d <folder>   the deck (default: current folder)
  --port <n>            server port (default 3030)
  --no-remote           don't listen on the network (no phone remote)
  --open                open the browser
`;

const { values: o, positionals: args } = parseArgs({
  allowPositionals: true,
  options: {
    deck: { type: 'string', short: 'd' },
    port: { type: 'string', default: '3030' },
    'no-remote': { type: 'boolean', default: false },
    open: { type: 'boolean', default: false },
    'no-build': { type: 'boolean', default: false },
    blank: { type: 'boolean', default: false },
    template: { type: 'string', short: 't' },
    after: { type: 'string' },
    time: { type: 'string' },
    title: { type: 'string' },
    props: { type: 'boolean', default: false },
    as: { type: 'string' },
    ref: { type: 'string' },
    yes: { type: 'boolean', short: 'y', default: false },
    force: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const deckDir = path.resolve(o.deck ?? '.');
const serveOpts = { port: +o.port!, remote: !o['no-remote'], open: o.open! };

function printProblems(errors: string[]) {
  for (const e of errors) console.log(`  ✗ ${e}`);
}

/** Asks yes or no in the terminal; --yes answers yes. */
async function ask(question: string): Promise<boolean> {
  if (o.yes) return true;
  if (!process.stdin.isTTY) throw new Error('there is no terminal to ask in: add --yes to go ahead');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C or a closed terminal means no, so the command can still clean up
  const answer = await new Promise<string>((r) => { rl.on('SIGINT', () => { console.log(); r(''); }); rl.on('close', () => r('')); rl.question(question, r); });
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function showPack(p: Preview) {
  console.log(`\n  github:${p.repo}${p.ref ? ` ${p.ref}` : ''}  (commit ${p.commit.slice(0, 7)})`);
  console.log(`  ${p.name} ${p.version}${p.description ? `: ${p.description}` : ''}`);
  if (p.templates.length) console.log(`  templates: ${p.templates.join(', ')}`);
  if (p.themes.length) console.log(`  themes:    ${p.themes.join(', ')}`);
  console.log(`  ${p.files} files, checked: no problems`);
  if (p.usedBy?.length) console.log(`  used by:   ${p.usedBy.join(', ')}`);
  console.log("\n  A pack's templates are code: they run in your browser when you show the deck.");
}

async function pack(sub: string | undefined, arg: string | undefined) {
  switch (sub) {
    case 'add': {
      if (!arg) throw new Error('usage: rosling pack add github:owner/repo[#tag] [--as <name>]');
      const p = await addPack(deckDir, arg, { as: o.as, confirm: async (p) => { showPack(p); return ask(`  Add it to this deck as "${p.as}"? [y/N] `); } });
      if (!p) { console.log('  Not added.'); return; }
      console.log(`\n  Added "${p.as}". Slides use its templates as ${p.as}/<template>${p.themes.length ? `; the deck can use its theme with "theme": "${p.as}/${p.themes[0]}"` : ''}.`);
      console.log('  deck.json pins this exact commit. Teammates get the same files with: rosling pack install');
      return;
    }
    case 'install':
    case 'update': {
      const r = sub === 'install' ? installPacks(deckDir)
        : await updatePacks(deckDir, arg ? [arg] : [], { ref: o.ref, force: o.force!, confirm: async (p) => { showPack(p); return ask(`  Update "${p.as}" to this? [y/N] `); } });
      for (const l of r.lines) console.log(`  ${l}`);
      if (r.failed) process.exitCode = 1;
      return;
    }
    case 'remove': {
      if (!arg) throw new Error('usage: rosling pack remove <name>');
      console.log(`  ${removePack(deckDir, arg)}`);
      return;
    }
    case 'list': {
      for (const p of listPacks(deckDir)) {
        const what = [p.templates.length && `${p.templates.length} template${p.templates.length === 1 ? '' : 's'}`, p.themes.length && `${p.themes.length} theme${p.themes.length === 1 ? '' : 's'}`].filter(Boolean).join(', ') || 'nothing yet';
        const use = [p.slides && `${p.slides} slide${p.slides === 1 ? '' : 's'}`, p.isTheme && "the deck's theme"].filter(Boolean).join(' and ');
        console.log(`  ${p.name.padEnd(14)} ${p.source}${p.version ? ` · version ${p.version}` : ''}${p.commit ? ` · commit ${p.commit}` : ''}`);
        console.log(`  ${''.padEnd(14)} ${what} · ${use ? `used by ${use}` : 'not used'}`);
        for (const e of p.problems) console.log(`  ${''.padEnd(14)} ✗ ${e}`);
      }
      return;
    }
    case 'check': {
      const dir = path.resolve(arg ?? '.');
      const r = checkPack(dir);
      console.log(`  ${r.name || path.basename(dir)} ${r.version}: ${r.templates.length} template(s), ${r.themes.length} theme(s), ${r.files} files`);
      if (!r.problems.length) { console.log('  ✓ ready to push: others can add it with rosling pack add github:<you>/<repo>'); return; }
      printProblems(r.problems);
      process.exitCode = 1;
      return;
    }
    default:
      throw new Error('usage: rosling pack add | list | install | update | remove | check');
  }
}

async function main() {
  const [cmd, sub, arg] = args;
  if (!cmd || o.help) { console.log(HELP); return; }
  switch (cmd) {
    case 'init': {
      const dir = initDeck(sub ?? '.', { blank: o.blank!, title: o.title });
      console.log(`  Created a deck in ${dir}`);
      // decks are meant to live in git; don't nest a repo inside one that already exists
      if (spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' }).status !== 0)
        spawnSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
      const rel = path.relative(process.cwd(), dir);
      console.log(`\n  Next:\n${rel ? `    cd ${rel}\n` : ''}    rosling dev\n\n  AI agents: the rules are in AGENTS.md (Claude reads them through CLAUDE.md).`);
      return;
    }
    case 'dev': return dev(deckDir, serveOpts);
    case 'mcp': return mcp(deckDir, o.deck === undefined);
    case 'pack': return pack(sub, arg);
    case 'connect': {
      for (const line of connect(deckDir, sub ?? '', o.deck !== undefined)) console.log(line && `  ${line}`);
      return;
    }
    case 'present': return present(deckDir, { ...serveOpts, rebuild: !o['no-build'] });
    case 'build': {
      const errors = await build(deckDir);
      console.log(`  Built ${path.join(deckDir, 'dist')}  (serve it with "rosling present")`);
      if (errors.length) { console.log(`\n  ${errors.length} problem(s) — the deck still builds, but fix these:`); printProblems(errors); }
      return;
    }
    case 'check': {
      const deck = loadDeck(deckDir);
      const errors = allErrors(deck);
      const total = deck.slides.reduce((s, x) => s + x.time, 0);
      console.log(`  ${deck.title}: ${deck.slides.length} slides, planned ${Math.round(total / 60)} of ${Math.round(deck.time / 60)} min`);
      if (deck.time && total > deck.time) console.log(`  ! the slide times add up to more than the talk time`);
      if (!errors.length) { console.log('  ✓ every slide fits its template'); return; }
      printProblems(errors);
      process.exitCode = 1;
      return;
    }
    case 'new': {
      if (!sub || !o.template) throw new Error('usage: rosling new <name> --template <id> [--after <slide>] [--time 2m]');
      const r = newSlide(deckDir, sub, { template: o.template, after: o.after, time: o.time, title: o.title });
      console.log(`  Added slide ${r.position}: ${path.relative(process.cwd(), r.file)}\n  Fill in its values; "rosling check" tells you what is missing.`);
      if (!o.time) console.log('  No --time given: this slide has no planned time.');
      return;
    }
    case 'template': {
      const deck = loadDeck(deckDir);
      if (sub === 'list') {
        for (const t of deck.templates.values()) {
          const n = slidesUsing(deck, t.id).length;
          console.log(`  ${t.id.padEnd(28)} ${n ? `used ${n}×` : 'unused '}  ${t.description}`);
          if (o.props) console.log(describeSchema(t.schema, '      ') + '\n');
          for (const e of t.errors) console.log(`      ✗ ${e}`);
        }
        return;
      }
      if (sub === 'usage') {
        const ids = arg ? [arg] : [...deck.templates.keys()];
        if (arg && !deck.templates.has(arg)) throw new Error(`template "${arg}" not found`);
        for (const id of ids) {
          const used = slidesUsing(deck, id);
          if (!arg && !used.length) continue;
          console.log(`  ${id} (${used.length} slide${used.length === 1 ? '' : 's'})`);
          for (const { n, slide } of used) console.log(`    #${String(n).padEnd(3)} ${slide.id.padEnd(34)} ${slide.title}`);
        }
        if (!arg) {
          const unused = [...deck.templates.keys()].filter((id) => !slidesUsing(deck, id).length);
          if (unused.length) console.log(`  unused: ${unused.join(', ')}`);
        }
        return;
      }
      if (sub === 'new') {
        if (!arg) throw new Error('usage: rosling template new <name>');
        const dir = newTemplate(deckDir, arg);
        console.log(`  Created local/${arg} in ${path.relative(process.cwd(), dir)}\n  Edit template.json (its boxes), Template.tsx and style.module.css; see it in the gallery with "rosling dev".`);
        return;
      }
      throw new Error('usage: rosling template list | usage [id] | new <name>');
    }
    default:
      throw new Error(`unknown command "${cmd}"\n\n${HELP}`);
  }
}

main().catch((e) => { console.error(`  ${(e as Error).message}`); process.exit(1); });
