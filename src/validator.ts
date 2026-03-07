import type { SpeqSpec } from './parser.js';

export interface ValidationError {
  rule: number;
  message: string;
  severity: string;
}

function isUpperCase(s: string): boolean {
  return Boolean(s) && /^[A-Z][A-Z0-9_]*$/.test(s);
}

function isPascalCase(s: string): boolean {
  return Boolean(s) && /^[A-Z][A-Za-z0-9]+$/.test(s);
}

function isSnakeCase(s: string): boolean {
  return Boolean(s) && /^[a-z][a-z0-9_]*$/.test(s);
}

export function validate(spec: SpeqSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  const entities = new Set(spec.entities);
  const declaredLayers = new Set(spec.layers.keys());

  // Rule 1 — VERSION must be present
  if (!spec.version) {
    errors.push({ rule: 1, message: 'VERSION is missing', severity: 'ERROR' });
  }

  // Rule 2 — ENTITY must declare at least one entity
  if (entities.size === 0) {
    errors.push({ rule: 2, message: 'ENTITY must declare at least one entity', severity: 'ERROR' });
  }

  // Rule 3 — Every identifier in TRANSFORM is declared in ENTITY
  for (const t of spec.transforms) {
    for (const name of [t.source, t.target]) {
      if (!entities.has(name)) {
        errors.push({ rule: 3, message: `TRANSFORM references undeclared entity '${name}'`, severity: 'ERROR' });
      }
    }
  }

  // Rule 4 — Every subject in CONTRACTS references a declared entity or uses the * wildcard
  for (const c of spec.contracts) {
    const base = c.subject.split('.')[0];
    if (base !== '*' && !entities.has(base)) {
      errors.push({ rule: 4, message: `CONTRACTS subject '${c.subject}' references undeclared entity '${base}'`, severity: 'ERROR' });
    }
  }

  // Rule 5 — Every entity referenced in a FLOW step is declared in ENTITY
  for (const flow of spec.flows.values()) {
    for (const step of flow.steps) {
      if (step.subject && !entities.has(step.subject)) {
        errors.push({ rule: 5, message: `FLOW '${flow.name}' step ${step.number} references undeclared entity '${step.subject}'`, severity: 'ERROR' });
      }
    }
  }

  // Rule 6 — FLOW step numbers are sequential from 1, no gaps
  for (const flow of spec.flows.values()) {
    const nums = flow.steps.map(s => s.number);
    const expected = Array.from({ length: nums.length }, (_, k) => k + 1);
    if (JSON.stringify(nums) !== JSON.stringify(expected)) {
      errors.push({ rule: 6, message: `FLOW '${flow.name}' steps are not sequential from 1: [${nums.join(', ')}]`, severity: 'ERROR' });
    }
  }

  // Rule 7 — Every FLOW has at least 2 steps
  for (const flow of spec.flows.values()) {
    if (flow.steps.length < 2) {
      errors.push({ rule: 7, message: `FLOW '${flow.name}' must have at least 2 steps (has ${flow.steps.length})`, severity: 'ERROR' });
    }
  }

  // Rule 8 — LAYERS names are UPPER_CASE
  for (const name of spec.layers.keys()) {
    if (!isUpperCase(name)) {
      errors.push({ rule: 8, message: `LAYERS name must be UPPER_CASE: '${name}'`, severity: 'ERROR' });
    }
  }

  // Rule 9 — VOCABULARY entries are PascalCase
  for (const entry of spec.vocabulary) {
    if (!isPascalCase(entry)) {
      errors.push({ rule: 9, message: `VOCABULARY entry must be PascalCase: '${entry}'`, severity: 'ERROR' });
    }
  }

  // Rule 10 — ENTITY identifiers are snake_case
  for (const entity of spec.entities) {
    if (!isSnakeCase(entity)) {
      errors.push({ rule: 10, message: `ENTITY identifier must be snake_case: '${entity}'`, severity: 'ERROR' });
    }
  }

  // Rule 11 — CALLS lists may only reference layer names declared in the same LAYERS block
  for (const layer of spec.layers.values()) {
    for (const ref of layer.calls) {
      if (ref.toLowerCase() === 'none') continue;
      if (!declaredLayers.has(ref)) {
        errors.push({ rule: 11, message: `LAYERS '${layer.name}' CALLS references undeclared layer '${ref}'`, severity: 'ERROR' });
      }
    }
  }

  // Rule 12 — SECRETS entries are UPPER_CASE
  for (const secret of spec.secrets) {
    if (!isUpperCase(secret)) {
      errors.push({ rule: 12, message: `SECRETS entry must be UPPER_CASE: '${secret}'`, severity: 'ERROR' });
    }
  }

  // Rule 13 — CALLS is exclusive (agent enforcement rule — verified at generation time, not statically)

  // Rule 14 — At most one layer may declare BOUNDARY external
  const boundaryLayers = [...spec.layers.values()].filter(l => l.boundary === 'external');
  if (boundaryLayers.length > 1) {
    errors.push({
      rule: 14,
      message: `At most one layer may declare BOUNDARY external (found: ${boundaryLayers.map(l => l.name).join(', ')})`,
      severity: 'ERROR',
    });
  }

  // Rule 15 — Scoped secret must reference a declared layer
  for (const [secret, layer] of spec.secretScopes) {
    if (!declaredLayers.has(layer)) {
      errors.push({ rule: 15, message: `SECRETS '${secret}' scoped to undeclared layer '${layer}'`, severity: 'ERROR' });
    }
  }

  // Rule 16 — CLASSIFY subjects must match declared entities, class must be valid
  const validClasses = new Set(['credential', 'pii', 'sensitive', 'internal']);
  for (const entry of spec.classify) {
    const subjectEntity = entry.field.split('.')[0];
    if (!entities.has(subjectEntity)) {
      errors.push({ rule: 16, message: `CLASSIFY '${entry.field}' references undeclared entity '${subjectEntity}'`, severity: 'ERROR' });
    }
    if (!validClasses.has(entry.class)) {
      errors.push({ rule: 16, message: `CLASSIFY '${entry.field}' has invalid class '${entry.class}' (must be credential, pii, sensitive, or internal)`, severity: 'ERROR' });
    }
  }

  // Rule 17 — A field classified 'credential' must not appear in must-log in any OBSERVABILITY entry
  const credentialFields = new Set(
    spec.classify.filter(e => e.class === 'credential').map(e => e.field),
  );
  for (const obs of spec.observability.values()) {
    for (const field of obs.mustLog) {
      if (credentialFields.has(field)) {
        errors.push({ rule: 17, message: `OBSERVABILITY '${obs.flow}' must-log contains credential field '${field}'`, severity: 'ERROR' });
      }
    }
  }

  // Rule 18 — FLOW steps with [LAYER_NAME] must reference a declared layer
  for (const flow of spec.flows.values()) {
    for (const step of flow.steps) {
      if (step.layer && !declaredLayers.has(step.layer)) {
        errors.push({ rule: 18, message: `FLOW '${flow.name}' step ${step.number} [${step.layer}] references undeclared layer '${step.layer}'`, severity: 'ERROR' });
      }
    }
  }

  // Extra — OBSERVABILITY level must be critical, standard, or low (spec §OBSERVABILITY)
  const validLevels = new Set(['critical', 'standard', 'low']);
  for (const entry of spec.observability.values()) {
    if (entry.level !== undefined && !validLevels.has(entry.level)) {
      errors.push({ rule: 19, message: `OBSERVABILITY '${entry.flow}' level must be 'critical', 'standard', or 'low' (got '${entry.level}')`, severity: 'ERROR' });
    }
  }

  // Extra — VERSION must match semver (x.y.z)
  if (spec.version && !/^\d+\.\d+\.\d+/.test(spec.version)) {
    errors.push({ rule: 20, message: `VERSION '${spec.version}' must be semver (x.y.z)`, severity: 'ERROR' });
  }

  return errors;
}
