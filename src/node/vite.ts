/* The bridge between a deck on disk and the React app: a virtual module ("virtual:rosling/deck")
   that holds the deck as data and imports the theme, every template component and every asset,
   so Vite can bundle them. The app itself (src/client) never reads files. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { InlineConfig, Plugin, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { FRAMEWORK_DIR, loadDeck, type Deck } from './deck.js';

const ID = 'virtual:rosling/deck';
const RESOLVED = '\0' + ID;
const require = createRequire(import.meta.url);
const pkgDir = (name: string) => path.dirname(require.resolve(name + '/package.json'));

/** JavaScript source for the virtual module. Asset paths inside the data become imports, so they are bundled. */
export function deckModule(deck: Deck): string {
  const lines: string[] = [];
  const assets = new Map<string, string>();
  const asset = (file: string) => {
    if (!assets.has(file)) { const id = `a${assets.size}`; assets.set(file, id); lines.push(`import ${id} from ${JSON.stringify(file + '?url')};`); }
  };
  if (deck.theme) lines.push(`import ${JSON.stringify(deck.theme.css)};`);
  lines.push(deck.theme?.footer ? `import Footer from ${JSON.stringify(deck.theme.footer)};` : 'const Footer = null;');

  const templates = [...deck.templates.values()].filter((t) => fs.existsSync(path.join(t.dir, 'Template.tsx')));
  templates.forEach((t, i) => lines.push(`import T${i} from ${JSON.stringify(path.join(t.dir, 'Template.tsx'))};`));
  for (const s of deck.slides) s.assets.forEach(asset);
  for (const t of templates) t.sampleAssets.forEach(asset);

  const data = {
    title: deck.title,
    time: deck.time,
    config: deck.config,
    errors: deck.errors,
    packs: deck.packs.map((p) => ({ name: p.name, source: p.source })),
    slides: deck.slides.map((s) => ({ id: s.id, template: s.template, title: s.title, time: s.time, notes: s.notes, values: s.values, errors: s.errors })),
    templates: [...deck.templates.values()].map((t) => ({
      id: t.id, description: t.description, schema: t.schema, sample: t.sample, errors: t.errors,
      used: deck.slides.map((s, i) => (s.template === t.id ? i + 1 : 0)).filter(Boolean),
    })),
  };
  let json = JSON.stringify(data);
  for (const [file, id] of assets) json = json.split(JSON.stringify(file)).join(id);   // "/abs/x.png" → a0
  lines.push(`export const deck = ${json};`);
  lines.push(`export const components = {${templates.map((t, i) => `${JSON.stringify(t.id)}: T${i}`).join(', ')}};`);
  lines.push('export { Footer };');
  return lines.join('\n');
}

function deckPlugin(deckDir: string): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: 'rosling:deck',
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return;
      return deckModule(loadDeck(deckDir));
    },
    configureServer(s) {
      server = s;
      // slide files, deck.json, template.json and sample.json are data, not imports: reload the deck when they change.
      // Template components themselves (.tsx, .css) update through Vite's normal hot reload.
      const deck = loadDeck(deckDir);
      const watched = [deckDir, ...deck.packs.map((p) => p.dir)].filter((d, i, a) => a.indexOf(d) === i);
      // (the watcher takes real paths, not globs)
      s.watcher.add(watched.flatMap((d) => ['deck.json', 'slides', 'assets', 'templates', 'themes'].map((f) => path.join(d, f)).filter((f) => fs.existsSync(f))));
      const reload = (file: string) => {
        if (file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}dist${path.sep}`)) return;
        const isData = file.endsWith('.json') || file.includes(`${path.sep}assets${path.sep}`);
        if (!isData) return;
        const mod = server!.moduleGraph.getModuleById(RESOLVED);
        if (mod) server!.moduleGraph.invalidateModule(mod);
        server!.ws.send({ type: 'full-reload' });
      };
      s.watcher.on('change', reload);
      s.watcher.on('add', reload);
      s.watcher.on('unlink', reload);
      s.watcher.on('addDir', (d) => { if (d.includes(`${path.sep}templates${path.sep}`)) reload(d + '.json'); });
    },
  };
}

export function viteConfig(deckDir: string, extra: InlineConfig = {}): InlineConfig {
  const dir = path.resolve(deckDir);
  const deck = loadDeck(dir);
  return {
    configFile: false,
    root: path.join(FRAMEWORK_DIR, 'src/client'),
    base: './',
    // the framework may be a global install we can't write to: keep Vite's cache in the deck (git-ignored)
    cacheDir: path.join(dir, 'node_modules/.vite'),
    logLevel: 'warn',
    plugins: [react(), deckPlugin(dir)],
    resolve: {
      // templates may live outside this package (a deck's own templates, installed packs): they all get
      // the same React and the framework's helpers, without needing their own node_modules
      alias: [
        { find: /^rosling$/, replacement: path.join(FRAMEWORK_DIR, 'src/client/api.ts') },
        { find: /^react(\/.*)?$/, replacement: pkgDir('react') + '$1' },
        { find: /^react-dom(\/.*)?$/, replacement: pkgDir('react-dom') + '$1' },
      ],
    },
    // Installed from npm (globally or not), templates sit in node_modules, and Vite would pre-bundle their 'rosling' import
    // into a second copy of the API, with its own React context. Keep it one module; bundle React up front
    // so the first page load doesn't stop to optimize it.
    optimizeDeps: { exclude: ['rosling'], include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'qrcode'] },
    server: { fs: { allow: [FRAMEWORK_DIR, dir, ...deck.packs.map((p) => p.dir)] } },
    build: { outDir: path.join(dir, 'dist'), emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
    ...extra,
  };
}
