/* The `rosling` command. Every command works on the deck in the current folder, or the one given with --deck. */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { loadDeck, allErrors, slidesUsing } from './deck.js';
import { describeSchema } from './schema.js';
import { dev, build, present } from './serve.js';
import { initDeck, newSlide, newTemplate } from './scaffold.js';
import { connect, AGENTS } from './connect.js';
import { mcp } from './mcp.js';

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
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const deckDir = path.resolve(o.deck ?? '.');
const serveOpts = { port: +o.port!, remote: !o['no-remote'], open: o.open! };

function printProblems(errors: string[]) {
  for (const e of errors) console.log(`  ✗ ${e}`);
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
