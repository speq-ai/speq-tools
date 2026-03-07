import { test, expect, describe } from 'bun:test';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from '../src/parser.js';
import { validate } from '../src/validator.js';

function errors(content: string): ReturnType<typeof validate> {
  const path = join(tmpdir(), `speq_v_${Date.now()}_${Math.random().toString(36).slice(2)}.speq`);
  writeFileSync(path, content);
  try {
    return validate(parse(path));
  } finally {
    try { unlinkSync(path); } catch { /* ignore */ }
  }
}

function rulesViolated(content: string): number[] {
  return [...new Set(errors(content).map(e => e.rule))];
}

function isClean(content: string): boolean {
  return errors(content).length === 0;
}

const MINIMAL_VALID = [
  'VERSION 0.2.0',
  'ENTITY user',
].join('\n');

describe('validator — rule 1: VERSION required', () => {
  test('missing VERSION triggers rule 1', () => {
    expect(rulesViolated('ENTITY user\n')).toContain(1);
  });
  test('present VERSION clears rule 1', () => {
    expect(rulesViolated(MINIMAL_VALID)).not.toContain(1);
  });
});

describe('validator — rule 2: ENTITY at least one', () => {
  test('no ENTITY triggers rule 2', () => {
    expect(rulesViolated('VERSION 0.2.0\n')).toContain(2);
  });
  test('one entity clears rule 2', () => {
    expect(rulesViolated(MINIMAL_VALID)).not.toContain(2);
  });
});

describe('validator — rule 3: TRANSFORM entities declared', () => {
  test('TRANSFORM with undeclared entity triggers rule 3', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nTRANSFORM\n  user -> ghost : action\n';
    expect(rulesViolated(spec)).toContain(3);
  });
  test('TRANSFORM with declared entities passes', () => {
    const spec = 'VERSION 0.2.0\nENTITY user, cart\nTRANSFORM\n  user -> cart : add\n';
    expect(rulesViolated(spec)).not.toContain(3);
  });
});

describe('validator — rule 4: CONTRACTS subjects declared', () => {
  test('undeclared entity in CONTRACTS triggers rule 4', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nCONTRACTS\n  ghost.password NEVER plaintext\n';
    expect(rulesViolated(spec)).toContain(4);
  });
  test('wildcard * passes rule 4', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nCONTRACTS\n  *.field NEVER plaintext\n';
    expect(rulesViolated(spec)).not.toContain(4);
  });
  test('declared entity passes rule 4', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nCONTRACTS\n  user.password NEVER plaintext\n';
    expect(rulesViolated(spec)).not.toContain(4);
  });
});

describe('validator — rule 5: FLOW step entities declared', () => {
  test('undeclared subject in FLOW step triggers rule 5', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nCONTRACTS\n  FLOW f\n    1. user.start\n    2. ghost.end\n';
    expect(rulesViolated(spec)).toContain(5);
  });
  test('declared subjects pass rule 5', () => {
    const spec = 'VERSION 0.2.0\nENTITY user, cart\nCONTRACTS\n  FLOW f\n    1. user.start\n    2. cart.end\n';
    expect(rulesViolated(spec)).not.toContain(5);
  });
});

describe('validator — rule 6: FLOW steps sequential', () => {
  test('gap in step numbering triggers rule 6', () => {
    const spec = 'VERSION 0.2.0\nENTITY user, cart\nCONTRACTS\n  FLOW f\n    1. user.start\n    3. cart.end\n';
    expect(rulesViolated(spec)).toContain(6);
  });
  test('sequential steps pass rule 6', () => {
    const spec = 'VERSION 0.2.0\nENTITY user, cart\nCONTRACTS\n  FLOW f\n    1. user.start\n    2. cart.end\n';
    expect(rulesViolated(spec)).not.toContain(6);
  });
});

describe('validator — rule 7: FLOW minimum 2 steps', () => {
  test('single step FLOW triggers rule 7', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nCONTRACTS\n  FLOW solo\n    1. user.go\n';
    expect(rulesViolated(spec)).toContain(7);
  });
  test('two steps passes rule 7', () => {
    const spec = 'VERSION 0.2.0\nENTITY user, cart\nCONTRACTS\n  FLOW f\n    1. user.start\n    2. cart.end\n';
    expect(rulesViolated(spec)).not.toContain(7);
  });
});

describe('validator — rule 8: LAYERS UPPER_CASE', () => {
  test('lowercase layer name triggers rule 8', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  api\n    OWNS routing\n';
    expect(rulesViolated(spec)).toContain(8);
  });
  test('UPPER_CASE layer name passes rule 8', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  API\n    OWNS routing\n';
    expect(rulesViolated(spec)).not.toContain(8);
  });
});

describe('validator — rule 9: VOCABULARY PascalCase', () => {
  test('snake_case vocabulary entry triggers rule 9', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nVOCABULARY\n  not_pascal\n';
    expect(rulesViolated(spec)).toContain(9);
  });
  test('PascalCase vocabulary entry passes rule 9', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nVOCABULARY\n  AuthToken\n';
    expect(rulesViolated(spec)).not.toContain(9);
  });
});

describe('validator — rule 10: ENTITY snake_case', () => {
  test('PascalCase entity triggers rule 10', () => {
    expect(rulesViolated('VERSION 0.2.0\nENTITY BadEntity\n')).toContain(10);
  });
  test('snake_case entity passes rule 10', () => {
    expect(rulesViolated('VERSION 0.2.0\nENTITY good_entity\n')).not.toContain(10);
  });
});

describe('validator — rule 11: CALLS references declared layers', () => {
  test('CALLS undeclared layer triggers rule 11', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  API\n    OWNS routing\n    CALLS GHOST\n';
    expect(rulesViolated(spec)).toContain(11);
  });
  test('CALLS declared layer passes rule 11', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  API\n    OWNS routing\n    CALLS CORE\n  CORE\n    OWNS logic\n';
    expect(rulesViolated(spec)).not.toContain(11);
  });
  test('CALLS none passes rule 11', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  STORAGE\n    OWNS db\n    CALLS none\n';
    expect(rulesViolated(spec)).not.toContain(11);
  });
});

describe('validator — rule 12: SECRETS UPPER_CASE', () => {
  test('lowercase secret triggers rule 12', () => {
    expect(rulesViolated('VERSION 0.2.0\nENTITY user\nSECRETS\n  my_key\n')).toContain(12);
  });
  test('UPPER_CASE secret passes rule 12', () => {
    expect(rulesViolated('VERSION 0.2.0\nENTITY user\nSECRETS\n  MY_KEY\n')).not.toContain(12);
  });
});

describe('validator — rule 14: at most one BOUNDARY external', () => {
  test('two layers with BOUNDARY external triggers rule 14', () => {
    const spec = [
      'VERSION 0.2.0', 'ENTITY user',
      'LAYERS',
      '  API\n    OWNS routing\n    BOUNDARY external',
      '  EDGE\n    OWNS gateway\n    BOUNDARY external',
    ].join('\n');
    expect(rulesViolated(spec)).toContain(14);
  });
  test('single BOUNDARY external passes rule 14', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  API\n    OWNS routing\n    BOUNDARY external\n';
    expect(rulesViolated(spec)).not.toContain(14);
  });
});

describe('validator — rule 15: scoped secret references declared layer', () => {
  test('secret scoped to undeclared layer triggers rule 15', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  API\n    OWNS routing\nSECRETS\n  KEY -> GHOST\n';
    expect(rulesViolated(spec)).toContain(15);
  });
  test('secret scoped to declared layer passes rule 15', () => {
    const spec = 'VERSION 0.2.0\nENTITY user\nLAYERS\n  API\n    OWNS routing\nSECRETS\n  KEY -> API\n';
    expect(rulesViolated(spec)).not.toContain(15);
  });
});

describe('validator — rule 16: CLASSIFY subjects and classes', () => {
  test('CLASSIFY with undeclared entity triggers rule 16', () => {
    expect(rulesViolated('VERSION 0.2.0\nENTITY user\nCLASSIFY\n  ghost.field credential\n')).toContain(16);
  });
  test('valid CLASSIFY passes rule 16', () => {
    expect(rulesViolated('VERSION 0.2.0\nENTITY user\nCLASSIFY\n  user.password credential\n')).not.toContain(16);
  });
});

describe('validator — rule 17: credential fields not in must-log', () => {
  test('credential field in must-log triggers rule 17', () => {
    const spec = [
      'VERSION 0.2.0',
      'ENTITY user, cart',
      'CLASSIFY',
      '  user.password credential',
      'CONTRACTS',
      '  FLOW f',
      '    1. user.start',
      '    2. cart.end',
      'OBSERVABILITY',
      '  flow f',
      '    must-log: user.password',
    ].join('\n');
    expect(rulesViolated(spec)).toContain(17);
  });
  test('credential field in must-not-log passes rule 17', () => {
    const spec = [
      'VERSION 0.2.0',
      'ENTITY user, cart',
      'CLASSIFY',
      '  user.password credential',
      'CONTRACTS',
      '  FLOW f',
      '    1. user.start',
      '    2. cart.end',
      'OBSERVABILITY',
      '  flow f',
      '    must-not-log: user.password',
    ].join('\n');
    expect(rulesViolated(spec)).not.toContain(17);
  });
});

describe('validator — rule 18: [LAYER] on steps references declared layer', () => {
  test('[GHOST] on step triggers rule 18', () => {
    const spec = [
      'VERSION 0.2.0', 'ENTITY user, cart',
      'LAYERS\n  API\n    OWNS routing',
      'CONTRACTS\n  FLOW f\n    1. [GHOST] user.start\n    2. [API] cart.end',
    ].join('\n');
    expect(rulesViolated(spec)).toContain(18);
  });
  test('[API] on step with declared layer passes rule 18', () => {
    const spec = [
      'VERSION 0.2.0', 'ENTITY user, cart',
      'LAYERS\n  API\n    OWNS routing',
      'CONTRACTS\n  FLOW f\n    1. [API] user.start\n    2. [API] cart.end',
    ].join('\n');
    expect(rulesViolated(spec)).not.toContain(18);
  });
});

describe('validator — extra: OBSERVABILITY level', () => {
  const flowSpec = (level: string) => [
    'VERSION 0.2.0', 'ENTITY user, cart',
    'CONTRACTS\n  FLOW f\n    1. user.start\n    2. cart.end',
    `OBSERVABILITY\n  flow f\n    level: ${level}`,
  ].join('\n');

  test('invalid level triggers rule 19', () => {
    expect(rulesViolated(flowSpec('info'))).toContain(19);
    expect(rulesViolated(flowSpec('warn'))).toContain(19);
  });
  test('valid levels pass rule 19', () => {
    expect(rulesViolated(flowSpec('critical'))).not.toContain(19);
    expect(rulesViolated(flowSpec('standard'))).not.toContain(19);
    expect(rulesViolated(flowSpec('low'))).not.toContain(19);
  });
});

describe('validator — extra: VERSION semver', () => {
  test('non-semver version triggers rule 20', () => {
    expect(rulesViolated('VERSION 1\nENTITY user\n')).toContain(20);
    expect(rulesViolated('VERSION v0.2.0\nENTITY user\n')).toContain(20);
  });
  test('semver passes rule 20', () => {
    expect(rulesViolated('VERSION 0.2.0\nENTITY user\n')).not.toContain(20);
  });
});

describe('validator — clean spec', () => {
  test('well-formed spec produces zero errors', () => {
    const spec = [
      'VERSION 0.2.0',
      'ENTITY user, cart, order',
      'VOCABULARY',
      '  CartItem',
      '  OrderRef',
      'LAYERS',
      '  API',
      '    OWNS    routing',
      '    CALLS   CORE',
      '    BOUNDARY external',
      '    EXPOSES create, read',
      '  CORE',
      '    OWNS    logic',
      '    CALLS   STORAGE',
      '  STORAGE',
      '    OWNS    persistence',
      '    CALLS   none',
      'SECRETS',
      '  DB_URL',
      '  API_KEY -> API',
      'CLASSIFY',
      '  user.password credential',
      '  user.email    pii',
      'TRANSFORM',
      '  user -> cart : add',
      '  cart -> order : checkout',
      'CONTRACTS',
      '  user.password NEVER plaintext',
      '  FLOW checkout',
      '    1. [API] user.validate',
      '    2. [CORE] cart.confirm',
      '    3. [STORAGE] order.save',
      '    ROLLBACK order.cancel',
      '    ATOMIC true',
      '    TIMEOUT 30s',
      'OBSERVABILITY',
      '  flow checkout',
      '    level: critical',
      '    must-log: user_id',
      '    must-not-log: user.password',
      '    metrics: checkout_duration',
    ].join('\n');
    expect(isClean(spec)).toBe(true);
  });
});
