import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface Transform {
  source: string;
  target: string;
  actions: string[];
}

export interface Layer {
  name: string;
  owns: string[];
  can: string[];
  cannot: string[];
  calls: string[];
  never: string[];
  latency?: string;
}

export interface Contract {
  subject: string;
  keyword: string;
  qualifier: string;
}

export interface FlowStep {
  number: number;
  subject: string;
  action: string;
}

export interface Flow {
  name: string;
  steps: FlowStep[];
  rollback: string[];
  atomic?: boolean;
  timeout?: string;
  retry?: number;
}

export type ProjectValue =
  | { kind: 'str'; value: string }
  | { kind: 'list'; value: string[] }
  | { kind: 'deps'; value: Record<string, string[]> };

export interface EnthSpec {
  sourceFile: string;
  version: string;
  project: Map<string, ProjectValue>;
  vocabulary: string[];
  entities: string[];
  transforms: Transform[];
  layers: Map<string, Layer>;
  layersOrder: string[];
  contracts: Contract[];
  flows: Map<string, Flow>;
  flowsOrder: string[];
  secrets: string[];
}

function stripComment(line: string): string {
  const idx = line.indexOf('#');
  return idx === -1 ? line : line.slice(0, idx);
}

function indentLen(line: string): number {
  return line.length - line.trimStart().length;
}

export function splitList(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(x => x.length > 0);
}

function defaultSpec(sourceFile: string): EnthSpec {
  return {
    sourceFile: resolve(sourceFile),
    version: '',
    project: new Map(),
    vocabulary: [],
    entities: [],
    transforms: [],
    layers: new Map(),
    layersOrder: [],
    contracts: [],
    flows: new Map(),
    flowsOrder: [],
    secrets: [],
  };
}

export function parse(path: string): EnthSpec {
  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n');
  const spec = defaultSpec(path);

  let i = 0;
  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    const ind = indentLen(clean);
    if (ind > 0) { i++; continue; }

    if (tok.startsWith('VERSION ')) {
      spec.version = tok.slice('VERSION '.length).trim();
      i++;
    } else if (tok === 'PROJECT' || tok.startsWith('PROJECT ')) {
      if (tok.startsWith('PROJECT ')) {
        const name = tok.slice('PROJECT '.length).trim();
        if (!spec.project.has('NAME')) {
          spec.project.set('NAME', { kind: 'str', value: name });
        }
      }
      i = parseProject(lines, i + 1, spec);
    } else if (tok === 'VOCABULARY') {
      i = parseVocabulary(lines, i + 1, spec);
    } else if (tok.startsWith('ENTITY ')) {
      // inline: ENTITY foo, bar, baz
      spec.entities = splitList(tok.slice('ENTITY '.length));
      i++;
    } else if (tok === 'ENTITY') {
      // multiline: indented lines follow
      i = parseEntityMultiline(lines, i + 1, spec);
    } else if (tok === 'TRANSFORM') {
      i = parseTransform(lines, i + 1, spec);
    } else if (tok === 'LAYERS') {
      i = parseLayers(lines, i + 1, spec);
    } else if (tok === 'CONTRACTS') {
      i = parseContracts(lines, i + 1, spec);
    } else if (tok === 'SECRETS') {
      i = parseSecrets(lines, i + 1, spec);
    } else {
      i++;
    }
  }

  return spec;
}

function parseEntityMultiline(lines: string[], start: number, spec: EnthSpec): number {
  let i = start;
  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    if (indentLen(clean) === 0) return i;
    // Each indented non-empty non-comment line is one entity name
    const name = tok.split(/\s+/)[0];
    if (name) spec.entities.push(name);
    i++;
  }
  return i;
}

function parseProject(lines: string[], start: number, spec: EnthSpec): number {
  let i = start;
  let inDeps = false;
  const depsMap: Record<string, string[]> = {};

  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    const ind = indentLen(clean);
    if (ind === 0) {
      if (Object.keys(depsMap).length > 0) {
        spec.project.set('DEPS', { kind: 'deps', value: depsMap });
      }
      return i;
    }
    if (ind <= 2) {
      inDeps = tok === 'DEPS';
      if (!inDeps) {
        const spaceIdx = tok.search(/\s/);
        if (spaceIdx !== -1) {
          const key = tok.slice(0, spaceIdx).trim();
          const val = tok.slice(spaceIdx + 1).trim().replace(/^"|"$/g, '').trim();
          if (key === 'STACK') {
            spec.project.set(key, { kind: 'list', value: splitList(val) });
          } else {
            spec.project.set(key, { kind: 'str', value: val });
          }
        }
      }
    } else if (inDeps) {
      const spaceIdx = tok.search(/\s/);
      if (spaceIdx !== -1) {
        const depKey = tok.slice(0, spaceIdx).trim();
        const val = tok.slice(spaceIdx + 1).trim();
        if (depKey === 'SYSTEM' || depKey === 'RUNTIME' || depKey === 'DEV') {
          depsMap[depKey] = splitList(val);
        }
      }
    }
    i++;
  }
  if (Object.keys(depsMap).length > 0) {
    spec.project.set('DEPS', { kind: 'deps', value: depsMap });
  }
  return i;
}

function parseVocabulary(lines: string[], start: number, spec: EnthSpec): number {
  let i = start;
  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    if (indentLen(clean) === 0) return i;
    const first = tok.split(/\s+/)[0];
    if (first) spec.vocabulary.push(first);
    i++;
  }
  return i;
}

function parseTransform(lines: string[], start: number, spec: EnthSpec): number {
  let i = start;
  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    if (indentLen(clean) === 0) return i;
    if (tok.includes('->') && tok.includes(':')) {
      const colonIdx = tok.indexOf(':');
      const arrow = tok.slice(0, colonIdx);
      const actionsStr = tok.slice(colonIdx + 1);
      const parts = arrow.split('->');
      if (parts.length === 2) {
        spec.transforms.push({
          source: parts[0].trim(),
          target: parts[1].trim(),
          actions: splitList(actionsStr),
        });
      }
    }
    i++;
  }
  return i;
}

function parseLayers(lines: string[], start: number, spec: EnthSpec): number {
  let i = start;
  let current: string | null = null;

  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    const ind = indentLen(clean);
    if (ind === 0) return i;

    if (ind <= 2) {
      const name = tok;
      current = name;
      spec.layersOrder.push(name);
      spec.layers.set(name, { name, owns: [], can: [], cannot: [], calls: [], never: [] });
    } else if (current !== null) {
      const spaceIdx = tok.search(/\s/);
      if (spaceIdx !== -1) {
        const key = tok.slice(0, spaceIdx).trim();
        const val = tok.slice(spaceIdx + 1).trim();
        const layer = spec.layers.get(current)!;
        switch (key) {
          case 'OWNS': layer.owns = splitList(val); break;
          case 'CAN': layer.can = splitList(val); break;
          case 'CANNOT': layer.cannot = splitList(val); break;
          case 'CALLS': layer.calls = splitList(val); break;
          case 'NEVER': layer.never.push(val); break;
          case 'LATENCY': layer.latency = val; break;
        }
      }
    }
    i++;
  }
  return i;
}

function parseContracts(lines: string[], start: number, spec: EnthSpec): number {
  let i = start;
  let currentFlow: string | null = null;

  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    const ind = indentLen(clean);
    if (ind === 0) return i;

    if (ind <= 2) {
      if (tok.startsWith('FLOW ')) {
        const name = tok.slice('FLOW '.length).trim();
        currentFlow = name;
        spec.flowsOrder.push(name);
        spec.flows.set(name, { name, steps: [], rollback: [] });
      } else {
        currentFlow = null;
        const parts = tok.split(/\s+/);
        if (parts.length >= 3) {
          const [subj, kw, ...rest] = parts;
          if (kw === 'ALWAYS' || kw === 'NEVER' || kw === 'REQUIRES') {
            spec.contracts.push({ subject: subj, keyword: kw, qualifier: rest.join(' ') });
          }
        }
      }
    } else if (currentFlow !== null) {
      const spaceIdx = tok.search(/\s/);
      const first = spaceIdx === -1 ? tok : tok.slice(0, spaceIdx);
      const rest = spaceIdx === -1 ? '' : tok.slice(spaceIdx + 1).trim();

      if (first.endsWith('.') && /^\d+$/.test(first.slice(0, -1))) {
        const num = parseInt(first.slice(0, -1), 10);
        const flow = spec.flows.get(currentFlow)!;
        const dotIdx = rest.indexOf('.');
        if (dotIdx !== -1) {
          flow.steps.push({ number: num, subject: rest.slice(0, dotIdx).trim(), action: rest.slice(dotIdx + 1).trim() });
        } else {
          flow.steps.push({ number: num, subject: '', action: rest });
        }
      } else {
        const flow = spec.flows.get(currentFlow);
        if (flow) {
          switch (first) {
            case 'ROLLBACK': flow.rollback = splitList(rest); break;
            case 'ATOMIC': flow.atomic = rest.toLowerCase() === 'true'; break;
            case 'TIMEOUT': flow.timeout = rest; break;
            case 'RETRY': {
              const n = parseInt(rest, 10);
              if (!isNaN(n)) flow.retry = n;
              break;
            }
          }
        }
      }
    }
    i++;
  }
  return i;
}

function parseSecrets(lines: string[], start: number, spec: EnthSpec): number {
  let i = start;
  while (i < lines.length) {
    const clean = stripComment(lines[i]);
    const tok = clean.trim();
    if (!tok) { i++; continue; }
    if (indentLen(clean) === 0) return i;
    const first = tok.split(/\s+/)[0];
    if (first) spec.secrets.push(first);
    i++;
  }
  return i;
}
