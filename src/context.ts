import { readFileSync, existsSync } from 'fs';
import type { EnthSpec } from './parser.js';

const PREAMBLE_TEMPLATE = `=== ENTHROPIC CONTEXT __version__ ===

This project uses the Enthropic specification format.
Read the spec below before generating any code.
All architectural decisions declared here are final.

RULES:
  CONTEXT    — closed world. What is not declared does not exist.
               Do not invent entities, transforms, or relationships.
  CONTRACTS  — invariants. Violations are unacceptable, no exceptions, no workarounds.
  VOCABULARY — canonical names. Use them exactly in all code, comments, file names,
               variable names, and identifiers. Never use aliases or alternatives.
  LAYERS     — ownership boundaries. Never implement logic in a layer that does not own it.
               Never cross CALLS boundaries.
  FLOWS      — ordered sequences. Execute steps in declared order. Never skip or reorder.
               On failure, execute ROLLBACK in listed order.

=== PROJECT SPEC ===

`;

export function generate(spec: EnthSpec, statePath?: string): string {
  const version = spec.version || '0.1.0';
  const preamble = PREAMBLE_TEMPLATE.replace('__version__', version);
  const specContent = readFileSync(spec.sourceFile, 'utf-8');
  let output = preamble + specContent;

  if (statePath && existsSync(statePath)) {
    const stateContent = readFileSync(statePath, 'utf-8');
    output += '\n\n=== CURRENT BUILD STATE ===\n\n';
    output += stateContent;
    output += '\n\nOnly implement entities, flows, and layers marked PENDING or PARTIAL.';
    output += '\nDo not re-implement anything marked BUILT.';
  }

  return output;
}
