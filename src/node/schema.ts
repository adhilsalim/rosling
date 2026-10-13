/* Template schemas: the list of "boxes" a template has, and the check that a slide's values fit them.
   A prop is written in template.json either in full ({ "type": "text", "required": true, "max": 80 })
   or as shorthand ("title": "text"). Checking also fills in defaults, so templates can rely on them. */

export type PropType = 'text' | 'url' | 'image' | 'video' | 'number' | 'boolean' | 'enum' | 'list' | 'object';

export interface Prop {
  type: PropType;
  description?: string;
  required?: boolean;
  default?: unknown;
  max?: number;            // text: characters; list: items
  min?: number;            // list: items
  values?: string[];       // enum
  of?: Prop;               // list
  props?: Record<string, Prop>;   // object
}

export type Schema = Record<string, Prop>;

const TYPES: PropType[] = ['text', 'url', 'image', 'video', 'number', 'boolean', 'enum', 'list', 'object'];

/** Turns the shorthand forms in template.json into full Prop objects, and reports mistakes in the schema itself. */
export function normalizeSchema(raw: unknown, where: string): Schema {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${where}: "props" must be a map of prop names`);
  const out: Schema = {};
  for (const [name, def] of Object.entries(raw as Record<string, unknown>)) out[name] = normalizeProp(def, `${where} › ${name}`);
  return out;
}

function normalizeProp(def: unknown, where: string): Prop {
  if (typeof def === 'string') def = { type: def };
  if (!def || typeof def !== 'object') throw new Error(`${where}: expected a type name or { type: ... }`);
  const p = { ...(def as Record<string, unknown>) } as unknown as Prop;
  if (!TYPES.includes(p.type)) throw new Error(`${where}: unknown type "${p.type}" (use one of ${TYPES.join(', ')})`);
  if (p.type === 'list') p.of = normalizeProp(p.of ?? 'text', `${where}[]`);
  if (p.type === 'object') p.props = normalizeSchema(p.props ?? {}, where);
  if (p.type === 'enum' && (!Array.isArray(p.values) || !p.values.length)) throw new Error(`${where}: enum needs "values"`);
  return p;
}

export interface Asset { kind: 'image' | 'video'; file: string }

/** Checks values against a schema. Returns the values with defaults filled in, every problem found,
    and the asset files the values point to (images and videos). */
export function validate(schema: Schema, values: unknown, onAsset: (a: Asset) => unknown = (a) => a.file) {
  const errors: string[] = [];
  const out = checkObject(schema, values ?? {}, 'values', errors, onAsset);
  return { values: out as Record<string, unknown>, errors };
}

function checkObject(schema: Schema, value: unknown, path: string, errors: string[], onAsset: (a: Asset) => unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected a map of values`);
    return {};
  }
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input))
    if (!(key in schema)) errors.push(`${path}.${key}: this template has no "${key}" (it has: ${Object.keys(schema).join(', ') || 'nothing'})`);
  for (const [key, prop] of Object.entries(schema)) {
    const v = input[key];
    if (v === undefined || v === null || v === '') {
      if (prop.default !== undefined) out[key] = prop.default;
      else if (prop.required) errors.push(`${path}.${key}: required`);
      continue;
    }
    out[key] = checkValue(prop, v, `${path}.${key}`, errors, onAsset);
  }
  return out;
}

function checkValue(prop: Prop, v: unknown, path: string, errors: string[], onAsset: (a: Asset) => unknown): unknown {
  switch (prop.type) {
    case 'text':
    case 'url':
      if (typeof v === 'number') v = String(v);
      if (typeof v !== 'string') { errors.push(`${path}: expected text`); return ''; }
      if (prop.max && v.length > prop.max) errors.push(`${path}: ${v.length} characters, at most ${prop.max} fit`);
      if (prop.type === 'url' && !/^(https?:|mailto:)/.test(v)) errors.push(`${path}: expected a link starting with https://`);
      return v;
    case 'image':
    case 'video':
      if (typeof v !== 'string') { errors.push(`${path}: expected a file name in assets/`); return ''; }
      if (/^https?:/.test(v)) return v;   // a remote file is used as is (it won't work offline)
      return onAsset({ kind: prop.type, file: v });
    case 'number':
      if (typeof v !== 'number') { errors.push(`${path}: expected a number`); return 0; }
      return v;
    case 'boolean':
      if (typeof v !== 'boolean') { errors.push(`${path}: expected true or false`); return false; }
      return v;
    case 'enum':
      if (!prop.values!.includes(String(v))) errors.push(`${path}: "${v}" is not one of ${prop.values!.join(', ')}`);
      return v;
    case 'list': {
      if (!Array.isArray(v)) { errors.push(`${path}: expected a list`); return []; }
      if (prop.max && v.length > prop.max) errors.push(`${path}: ${v.length} items, at most ${prop.max} fit`);
      if (prop.min && v.length < prop.min) errors.push(`${path}: ${v.length} items, needs at least ${prop.min}`);
      return v.map((item, i) => checkValue(prop.of!, item, `${path}[${i + 1}]`, errors, onAsset));
    }
    case 'object':
      return checkObject(prop.props!, v, path, errors, onAsset);
  }
}

/** A short, readable description of a schema, for `rosling template list --props` and for agents. */
export function describeSchema(schema: Schema, indent = '  '): string {
  return Object.entries(schema).map(([name, p]) => {
    let line = `${indent}${name}: ${p.type}`;
    if (p.type === 'list') line += ` of ${p.of!.type}`;
    if (p.type === 'enum') line += ` (${p.values!.join(' | ')})`;
    const notes = [p.required && 'required', p.max && `max ${p.max}`, p.min && `min ${p.min}`,
      p.default !== undefined && `default ${JSON.stringify(p.default)}`].filter(Boolean);
    if (notes.length) line += ` [${notes.join(', ')}]`;
    if (p.description) line += ` — ${p.description}`;
    const inner = p.type === 'object' ? p.props : p.type === 'list' && p.of!.type === 'object' ? p.of!.props : null;
    return inner ? line + '\n' + describeSchema(inner, indent + '  ') : line;
  }).join('\n');
}
