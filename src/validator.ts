import { readFileSync } from 'fs';
import type { EnthSpec } from './parser.js';

export interface ValidationError {
  rule: number;
  message: string;
  severity: string;
}

function isUpperCase(s: string): boolean {
  if (!s || !/^[A-Z]/.test(s)) return false;
  return /^[A-Z][A-Z0-9_]*$/.test(s);
}

function isPascalCase(s: string): boolean {
  if (!s || !/^[A-Z]/.test(s)) return false;
  return /^[A-Za-z0-9]+$/.test(s);
}

function isSnakeCase(s: string): boolean {
  if (!s || !/^[a-z]/.test(s)) return false;
  return /^[a-z][a-z0-9_]*$/.test(s);
}

export function validate(spec: EnthSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const entities = new Set(spec.entities);

  // 1 — VERSION must be present
  if (!spec.version) {
    errors.push({ rule: 1, message: 'VERSION is missing', severity: 'ERROR' });
  }

  // 2 — ENTITY must declare at least one entity
  if (entities.size === 0) {
    errors.push({ rule: 2, message: 'ENTITY must declare at least one entity', severity: 'ERROR' });
  }

  // 3 — TRANSFORM entities must be declared
  for (const t of spec.transforms) {
    for (const name of [t.source, t.target]) {
      if (!entities.has(name)) {
        errors.push({ rule: 3, message: `TRANSFORM references undeclared entity '${name}'`, severity: 'ERROR' });
      }
    }
  }

  // 4 — CONTRACT subjects must reference declared entities (or wildcard)
  for (const c of spec.contracts) {
    const base = c.subject.split('.')[0];
    if (base !== '*' && !entities.has(base)) {
      errors.push({ rule: 4, message: `CONTRACTS subject '${c.subject}' references undeclared entity '${base}'`, severity: 'ERROR' });
    }
  }

  // 5 — FLOW step entities must be declared
  for (const flow of spec.flows.values()) {
    for (const step of flow.steps) {
      if (step.subject && !entities.has(step.subject)) {
        errors.push({ rule: 5, message: `FLOW '${flow.name}' step ${step.number} references undeclared entity '${step.subject}'`, severity: 'ERROR' });
      }
    }
  }

  // 6 — FLOW steps must be sequential from 1
  for (const flow of spec.flows.values()) {
    const nums = flow.steps.map(s => s.number);
    const expected = Array.from({ length: nums.length }, (_, k) => k + 1);
    if (JSON.stringify(nums) !== JSON.stringify(expected)) {
      errors.push({ rule: 6, message: `FLOW '${flow.name}' steps are not sequential from 1: ${JSON.stringify(nums)}`, severity: 'ERROR' });
    }
  }

  // 7 — FLOW must have at least 2 steps
  for (const flow of spec.flows.values()) {
    if (flow.steps.length < 2) {
      errors.push({ rule: 7, message: `FLOW '${flow.name}' must have at least 2 steps (has ${flow.steps.length})`, severity: 'ERROR' });
    }
  }

  // 8 — LAYERS names must be UPPER_CASE
  for (const name of spec.layers.keys()) {
    if (!isUpperCase(name)) {
      errors.push({ rule: 8, message: `LAYERS name must be UPPER_CASE: '${name}'`, severity: 'ERROR' });
    }
  }

  // 9 — VOCABULARY entries must be PascalCase
  for (const entry of spec.vocabulary) {
    if (!isPascalCase(entry)) {
      errors.push({ rule: 9, message: `VOCABULARY entry must be PascalCase: '${entry}'`, severity: 'ERROR' });
    }
  }

  // 10 — ENTITY identifiers must be snake_case
  for (const entity of spec.entities) {
    if (!isSnakeCase(entity)) {
      errors.push({ rule: 10, message: `ENTITY identifier must be snake_case: '${entity}'`, severity: 'ERROR' });
    }
  }

  // 11 — VAULT blocks must not appear in enthropic.enth
  if (spec.sourceFile.endsWith('enthropic.enth')) {
    try {
      const raw = readFileSync(spec.sourceFile, 'utf-8');
      raw.split('\n').forEach((line, idx) => {
        if (line.trim().startsWith('VAULT ')) {
          errors.push({
            rule: 11,
            message: `VAULT block in enthropic.enth at line ${idx + 1} — secrets must live in vault_*.enth`,
            severity: 'ERROR',
          });
        }
      });
    } catch {
      // ignore read errors
    }
  }

  // 12 — LAYERS CALLS may only reference declared layer names
  const declaredLayers = new Set(spec.layers.keys());
  for (const layer of spec.layers.values()) {
    for (const ref of layer.calls) {
      if (!declaredLayers.has(ref)) {
        errors.push({ rule: 12, message: `LAYERS '${layer.name}' CALLS undeclared layer '${ref}'`, severity: 'ERROR' });
      }
    }
  }

  // 13 — SECRETS entries must be UPPER_CASE
  for (const secret of spec.secrets) {
    if (!isUpperCase(secret)) {
      errors.push({ rule: 13, message: `SECRETS entry must be UPPER_CASE: '${secret}'`, severity: 'ERROR' });
    }
  }

  return errors;
}
