import { readFileSync, writeFileSync } from 'fs';
import type { SpeqSpec } from './parser.js';

export const STATUS_VALUES = [
  'BUILT', 'PARTIAL', 'PENDING', 'OK', 'MISSING', 'UNVERIFIED', 'SET', 'UNSET',
] as const;

export function generate(spec: SpeqSpec, projectName: string): string {
  const lines: string[] = [`STATE ${projectName}`, ''];

  const checks: [string, string][] = [];
  const lang = spec.project.get('LANG');
  if (lang?.kind === 'str') checks.push([lang.value, 'LANG']);

  const deps = spec.project.get('DEPS');
  if (deps?.kind === 'deps') {
    for (const dep of deps.value['SYSTEM'] ?? []) checks.push([dep, 'DEPS.SYSTEM']);
    for (const dep of deps.value['RUNTIME'] ?? []) checks.push([dep, 'DEPS.RUNTIME']);
  }

  if (checks.length > 0) {
    lines.push('  CHECKS');
    for (const [name, source] of checks) {
      lines.push(`    ${name.padEnd(28)} UNVERIFIED   # ${source}`);
    }
    lines.push('');
  }

  if (spec.entities.length > 0) {
    lines.push('  ENTITY');
    for (const entity of spec.entities) {
      lines.push(`    ${entity.padEnd(28)} PENDING`);
    }
    lines.push('');
  }

  if (spec.flows.size > 0) {
    lines.push('  FLOWS');
    for (const name of spec.flowsOrder) {
      lines.push(`    ${name.padEnd(28)} PENDING`);
    }
    lines.push('');
  }

  if (spec.layers.size > 0) {
    lines.push('  LAYERS');
    for (const name of spec.layersOrder) {
      lines.push(`    ${name.padEnd(28)} PENDING`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function setStatus(path: string, key: string, status: string): void {
  const upperStatus = status.toUpperCase();
  if (!(STATUS_VALUES as readonly string[]).includes(upperStatus)) {
    throw new Error(`Invalid status '${upperStatus}'. Must be: ${STATUS_VALUES.join(', ')}`);
  }

  const content = readFileSync(path, 'utf-8');
  const result: string[] = [];
  let updated = false;

  for (const line of content.split('\n')) {
    const tok = line.trim();
    const parts = tok.split(/\s+/);
    if (parts.length === 2 && parts[0] === key && (STATUS_VALUES as readonly string[]).includes(parts[1])) {
      const leadingLen = line.length - line.trimStart().length;
      const leading = line.slice(0, leadingLen);
      result.push(`${leading}${key.padEnd(28)} ${upperStatus}`);
      updated = true;
    } else {
      result.push(line);
    }
  }

  if (!updated) {
    throw new Error(`Key '${key}' not found in state file`);
  }

  writeFileSync(path, result.join('\n'));
}
