import { test, expect, describe } from 'bun:test';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from '../src/parser.js';

function withSpec(content: string, fn: (path: string) => void): void {
  const path = join(tmpdir(), `speq_test_${Date.now()}_${Math.random().toString(36).slice(2)}.speq`);
  writeFileSync(path, content);
  try {
    fn(path);
  } finally {
    try { unlinkSync(path); } catch { /* ignore */ }
  }
}

describe('parser — core blocks', () => {
  test('parses VERSION', () => {
    withSpec('VERSION 0.2.0\nENTITY user\n', (p) => {
      expect(parse(p).version).toBe('0.2.0');
    });
  });

  test('parses inline ENTITY', () => {
    withSpec('VERSION 0.2.0\nENTITY user, cart, order\n', (p) => {
      const s = parse(p);
      expect(s.entities).toContain('user');
      expect(s.entities).toContain('cart');
      expect(s.entities).toContain('order');
    });
  });

  test('parses multiline ENTITY', () => {
    withSpec('VERSION 0.2.0\nENTITY\n  user\n  cart\n', (p) => {
      const s = parse(p);
      expect(s.entities).toContain('user');
      expect(s.entities).toContain('cart');
    });
  });

  test('parses PROJECT block', () => {
    withSpec('VERSION 0.2.0\nPROJECT\n  NAME "myapp"\n  LANG python\n  ARCH layered\nENTITY user\n', (p) => {
      const s = parse(p);
      const name = s.project.get('NAME');
      expect(name?.kind).toBe('str');
      if (name?.kind === 'str') expect(name.value).toBe('myapp');
    });
  });

  test('ignores comments', () => {
    withSpec('# comment\nVERSION 0.2.0\nENTITY user # inline\n', (p) => {
      const s = parse(p);
      expect(s.version).toBe('0.2.0');
      expect(s.entities).toContain('user');
    });
  });

  test('parses VOCABULARY', () => {
    withSpec('VERSION 0.2.0\nENTITY user\nVOCABULARY\n  AuthToken\n  CartItem\n', (p) => {
      const s = parse(p);
      expect(s.vocabulary).toContain('AuthToken');
      expect(s.vocabulary).toContain('CartItem');
    });
  });

  test('parses SECRETS without scope', () => {
    withSpec('VERSION 0.2.0\nENTITY user\nSECRETS\n  DB_URL\n  API_KEY\n', (p) => {
      const s = parse(p);
      expect(s.secrets).toContain('DB_URL');
      expect(s.secrets).toContain('API_KEY');
      expect(s.secretScopes.size).toBe(0);
    });
  });

  test('parses SECRETS with -> scope', () => {
    withSpec('VERSION 0.2.0\nENTITY user\nLAYERS\n  API\n    OWNS routing\nSECRETS\n  TOKEN -> API\n  DB_URL\n', (p) => {
      const s = parse(p);
      expect(s.secrets).toContain('TOKEN');
      expect(s.secrets).toContain('DB_URL');
      expect(s.secretScopes.get('TOKEN')).toBe('API');
      expect(s.secretScopes.has('DB_URL')).toBe(false);
    });
  });

  test('parses TRANSFORM', () => {
    withSpec('VERSION 0.2.0\nENTITY user, cart\nTRANSFORM\n  user -> cart : add, remove\n', (p) => {
      const s = parse(p);
      expect(s.transforms).toHaveLength(1);
      expect(s.transforms[0].source).toBe('user');
      expect(s.transforms[0].target).toBe('cart');
      expect(s.transforms[0].actions).toContain('add');
    });
  });
});

describe('parser — LAYERS', () => {
  const spec = [
    'VERSION 0.2.0',
    'ENTITY user',
    'LAYERS',
    '  API',
    '    OWNS    routing',
    '    CALLS   CORE',
    '    NEVER   db_access',
    '    BOUNDARY external',
    '    EXPOSES create, delete',
    '  CORE',
    '    OWNS    logic',
    '    CALLS   none',
  ].join('\n');

  test('parses layer names and order', () => {
    withSpec(spec, (p) => {
      const s = parse(p);
      expect(s.layersOrder).toEqual(['API', 'CORE']);
    });
  });

  test('parses OWNS, CALLS, NEVER', () => {
    withSpec(spec, (p) => {
      const api = parse(p).layers.get('API')!;
      expect(api.owns).toContain('routing');
      expect(api.calls).toContain('CORE');
      expect(api.never).toContain('db_access');
    });
  });

  test('parses BOUNDARY external', () => {
    withSpec(spec, (p) => {
      const api = parse(p).layers.get('API')!;
      expect(api.boundary).toBe('external');
    });
  });

  test('parses EXPOSES', () => {
    withSpec(spec, (p) => {
      const api = parse(p).layers.get('API')!;
      expect(api.exposes).toContain('create');
      expect(api.exposes).toContain('delete');
    });
  });

  test('CORE has no boundary', () => {
    withSpec(spec, (p) => {
      const core = parse(p).layers.get('CORE')!;
      expect(core.boundary).toBeUndefined();
    });
  });
});

describe('parser — FLOW steps with [LAYER]', () => {
  const spec = [
    'VERSION 0.2.0',
    'ENTITY user, cart',
    'LAYERS',
    '  API',
    '    OWNS routing',
    '  CORE',
    '    OWNS logic',
    'CONTRACTS',
    '  FLOW checkout',
    '    1. [API] user.validate',
    '    2. [CORE] cart.confirm',
    '    ROLLBACK cart.cancel',
  ].join('\n');

  test('parses flow name and step count', () => {
    withSpec(spec, (p) => {
      const flow = parse(p).flows.get('checkout')!;
      expect(flow.steps).toHaveLength(2);
    });
  });

  test('parses [LAYER] tag on step', () => {
    withSpec(spec, (p) => {
      const flow = parse(p).flows.get('checkout')!;
      expect(flow.steps[0].layer).toBe('API');
      expect(flow.steps[1].layer).toBe('CORE');
    });
  });

  test('parses entity and action from step', () => {
    withSpec(spec, (p) => {
      const flow = parse(p).flows.get('checkout')!;
      expect(flow.steps[0].subject).toBe('user');
      expect(flow.steps[0].action).toBe('validate');
      expect(flow.steps[1].subject).toBe('cart');
      expect(flow.steps[1].action).toBe('confirm');
    });
  });

  test('steps without [LAYER] have no layer', () => {
    const plain = 'VERSION 0.2.0\nENTITY user, cart\nCONTRACTS\n  FLOW plain\n    1. user.start\n    2. cart.end\n';
    withSpec(plain, (p) => {
      const flow = parse(p).flows.get('plain')!;
      expect(flow.steps[0].layer).toBeUndefined();
    });
  });
});

describe('parser — CLASSIFY', () => {
  test('parses all four classes', () => {
    const spec = [
      'VERSION 0.2.0',
      'ENTITY user, payment',
      'CLASSIFY',
      '  user.password  credential',
      '  user.email     pii',
      '  payment.amount sensitive',
      '  payment.ref    internal',
    ].join('\n');
    withSpec(spec, (p) => {
      const s = parse(p);
      expect(s.classify).toHaveLength(4);
      expect(s.classify.find(e => e.field === 'user.password')?.class).toBe('credential');
      expect(s.classify.find(e => e.field === 'user.email')?.class).toBe('pii');
      expect(s.classify.find(e => e.field === 'payment.amount')?.class).toBe('sensitive');
      expect(s.classify.find(e => e.field === 'payment.ref')?.class).toBe('internal');
    });
  });

  test('ignores unknown classify class', () => {
    withSpec('VERSION 0.2.0\nENTITY user\nCLASSIFY\n  user.x unknown_class\n', (p) => {
      const s = parse(p);
      expect(s.classify).toHaveLength(0);
    });
  });
});

describe('parser — OBSERVABILITY', () => {
  test('parses flow obs entry', () => {
    const spec = [
      'VERSION 0.2.0',
      'ENTITY user, cart',
      'CONTRACTS',
      '  FLOW checkout',
      '    1. user.start',
      '    2. cart.end',
      'OBSERVABILITY',
      '  flow checkout',
      '    level: critical',
      '    must-log: user_id, session_id',
      '    must-not-log: password',
      '    metrics: duration',
    ].join('\n');
    withSpec(spec, (p) => {
      const obs = parse(p).observability.get('checkout')!;
      expect(obs.level).toBe('critical');
      expect(obs.mustLog).toContain('user_id');
      expect(obs.mustNotLog).toContain('password');
      expect(obs.metrics).toContain('duration');
    });
  });
});
