/* `rosling connect <agent>`: tells a coding agent how to start `rosling mcp` for this deck, so comments
   sent from the viewer reach it. Each agent keeps its MCP servers in its own file; we add (or update) one
   entry named "rosling" and leave everything else in the file alone. Claude Code also gets the review
   skill (/rosling-review); every agent gets the same steps from AGENTS.md and the server's instructions. */
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FRAMEWORK_DIR } from './deck.js';

export const AGENTS = ['claude', 'codex', 'gemini', 'cursor', 'claude-desktop'] as const;
export type Agent = (typeof AGENTS)[number];

const SKILL = 'rosling-review';

// With rosling installed (on the PATH), configs just say "rosling mcp" and can be committed. Otherwise
// (a checkout of the framework) they need this computer's node and rosling paths.
const installed = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['rosling'], { stdio: 'ignore' }).status === 0;
const LOCAL_NOTE = 'rosling is not on your PATH, so this config holds paths for this computer only. After "npm install -g rosling", run connect again for one you can commit.';

/** How to start the server. Without a deck, it finds the deck from the folder the agent starts it in, like git. */
function server(deckDir?: string) {
  const base = installed ? { command: 'rosling', args: [] as string[] } : { command: process.execPath, args: [path.join(FRAMEWORK_DIR, 'bin', 'rosling.js')] };
  return { command: base.command, args: [...base.args, 'mcp', ...(deckDir ? ['--deck', deckDir] : [])] };
}

function addServer(file: string, deckDir?: string) {
  let data: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error(`${file} is not valid JSON; fix it first, then run this again`); }
  }
  data.mcpServers = { ...(data.mcpServers as object ?? {}), rosling: server(deckDir) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function copySkill(to: string) {
  fs.mkdirSync(to, { recursive: true });
  fs.copyFileSync(path.join(FRAMEWORK_DIR, 'skills', SKILL, 'SKILL.md'), path.join(to, 'SKILL.md'));
}

// Claude Desktop's own config file; it has no project folders, so the server gets one folder for all decks
function desktopConfig() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

/** Writes the agent's config and returns what to tell the user. */
export function connect(deckDir: string, agent: string, explicitDeck = true): string[] {
  const note = installed ? [] : ['', LOCAL_NOTE];
  if (agent === 'claude-desktop') {
    // a deck, or a folder where new decks go. The server may change anything in it, so it has to be named
    // on purpose, and be a folder for talks rather than the home folder or a whole disk
    if (!explicitDeck) throw new Error('name the folder for your talks: rosling connect claude-desktop --deck ~/talks');
    const where = fs.existsSync(path.join(deckDir, 'deck.json')) ? path.dirname(deckDir) : deckDir;
    if ([os.homedir(), path.parse(where).root].includes(path.resolve(where)))
      throw new Error(`${where} is too wide: pick a folder just for talks, like ~/talks`);
    fs.mkdirSync(deckDir, { recursive: true });
    const file = desktopConfig();
    addServer(file, fs.realpathSync(deckDir));
    const isDeck = fs.existsSync(path.join(deckDir, 'deck.json'));
    return [`Added the rosling server to ${file}.`,
      `It can make and edit decks in ${isDeck ? path.dirname(deckDir) : deckDir}, and nowhere else.`,
      'Quit and reopen Claude Desktop, then ask: "make me a 10-minute talk about ...".',
      `See the result with: rosling dev --deck <the deck's folder>`, ...note];
  }
  if (!fs.existsSync(path.join(deckDir, 'deck.json'))) throw new Error(`${deckDir} has no deck.json`);
  const rel = (f: string) => { const r = path.relative(process.cwd(), f); return r && !r.startsWith('..') ? r : f; };
  switch (agent) {
    case 'claude': {
      const file = path.join(deckDir, '.mcp.json'), skill = path.join(deckDir, '.claude', 'skills', SKILL);
      addServer(file);
      copySkill(skill);
      return [`Added the rosling server to ${rel(file)} and the ${SKILL} skill to ${rel(skill)}.`,
        `Start Claude Code in the deck folder, approve the "rosling" server, then run /${SKILL}.`, ...note];
    }
    case 'cursor': {
      const file = path.join(deckDir, '.cursor', 'mcp.json');
      addServer(file, '${workspaceFolder}');   // Cursor fills in the open folder
      return [`Added the rosling server to ${rel(file)}.`,
        'Open the deck folder in Cursor, turn the server on (Settings › MCP), then ask the agent: "listen for my slide comments".', ...note];
    }
    case 'gemini': {
      const file = path.join(deckDir, '.gemini', 'settings.json');
      addServer(file);
      // Gemini reads GEMINI.md, not AGENTS.md; point it at the deck's rules
      const md = path.join(deckDir, 'GEMINI.md');
      if (!fs.existsSync(md)) fs.writeFileSync(md, '@AGENTS.md\n');
      return [`Added the rosling server to ${rel(file)}.`,
        'Start Gemini CLI in the deck folder, then ask: "listen for my slide comments".', ...note];
    }
    case 'codex': {
      // Codex keeps MCP servers in ~/.codex/config.toml; its own command edits that file safely
      const s = server(deckDir);
      const q = (a: string) => (/^[\w./:@-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);
      return [`Codex keeps MCP servers in ~/.codex/config.toml. Add this deck's with:`, '',
        `  codex mcp add rosling -- ${[s.command, ...s.args].map(q).join(' ')}`, '',
        'Then start Codex in the deck folder and ask: "listen for my slide comments".'];
    }
    default:
      throw new Error(`usage: rosling connect <${AGENTS.join('|')}>`);
  }
}
