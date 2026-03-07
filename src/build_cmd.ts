import { createInterface } from 'readline';
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ora from 'ora';
import { select } from '@inquirer/prompts';
import * as globalConfig from './global_config.js';
import * as tui from './tui.js';
import { parse } from './parser.js';
import { generate as generateState } from './state.js';
import { tryResolveSpec } from './utils.js';

const MAX_TOKENS = 4096;

interface Message {
  role: string;
  content: string;
}

const SPEC_FORMAT = `
## .speq Format Reference (v0.2)

### VERSION (required, must be first non-blank statement)
VERSION 0.2.0

### PROJECT
PROJECT
  NAME   "project name"
  LANG   python|rust|typescript|go|...
  STACK  comma, separated, tech
  ARCH   layered|event-driven|realtime|hexagonal|...
  DEPS
    SYSTEM   os-level packages
    RUNTIME  production dependencies
    DEV      dev-only tools

### VOCABULARY (naming enforcement -- prevents drift)
VOCABULARY
  PascalCaseName  # never: alternative_names

### ENTITY (domain objects, snake_case)
ENTITY user, product, order

### TRANSFORM (valid entity interactions)
TRANSFORM
  user -> cart : add_product, remove_product
  cart -> order : checkout

### SECRETS (key names only -- no values, optional layer scope)
SECRETS
  DATABASE_URL
  PAYMENT_KEY -> PAYMENT   # scoped: only PAYMENT layer may access this

### LAYERS (organizational boundaries)
LAYERS
  API
    OWNS     http_routing, request_validation
    CALLS    CORE
    NEVER    direct_database_access
    BOUNDARY external
    EXPOSES  create_order, get_status
  CORE
    OWNS     business_logic, domain_rules
    CALLS    STORAGE
  STORAGE
    OWNS     persistence, queries
    CALLS    none

### CLASSIFY (field security classification)
CLASSIFY
  user.password   credential    # encrypt at rest, never log, never expose
  user.email      pii           # data-privacy compliance
  order.total     sensitive     # owning layer only
  request_id      internal      # never outside system boundary

### CONTRACTS (behavioral invariants + critical flows)
CONTRACTS
  payment.*    ALWAYS    server-side
  admin.*      REQUIRES  verified-admin-role
  FLOW checkout
    1. [API] cart.validate
    2. [CORE] payment.authorize
    3. [CORE] order.confirm
    ROLLBACK  payment.void, order.cancel
    ATOMIC    true
    TIMEOUT   30s

### OBSERVABILITY (per-flow logging contracts)
OBSERVABILITY
  flow checkout
    level:        critical
    must-log:     order_id, user_id
    must-not-log: payment_token
    metrics:      checkout_duration, checkout_success_rate

### CHANGELOG (spec evolution)
CHANGELOG
  0.2.0
    ADDED    CLASSIFY block for field security classification
    BREAKING payment layer renamed to PAYMENT

## Validation rules (violations cause errors)
- VERSION must be the first non-blank, non-comment statement
- ENTITY identifiers: snake_case only
- VOCABULARY entries: PascalCase only
- LAYER names: UPPER_CASE only
- Every entity in TRANSFORM, FLOW steps, CONTRACTS must be declared in ENTITY
- Every layer in CALLS must be declared in LAYERS; use \`none\` when a layer calls nothing
- CALLS is exclusive: if a layer declares CALLS, calls to any unlisted layer are forbidden
- FLOW steps numbered from 1, sequential, no gaps, minimum 2 steps
- FLOW step subject MUST be \`entity.action\` — e.g. \`cart.validate\`, \`payment.authorize\`
  The part before the dot MUST be a declared entity (snake_case)
- SECRETS declares names only -- never values
- Secret scoped with -> restricts access to that layer only
- CLASSIFY classes: credential | pii | sensitive | internal -- subjects must be declared entities
- credential fields are implicitly must-not-log in all contexts regardless of OBSERVABILITY
- At most one layer may declare BOUNDARY external
- [LAYER_NAME] on FLOW steps must reference a declared layer
`;

const SYSTEM_CONSULTANT = `You are an SpeQ spec consultant. Your only output is a complete, valid .speq architectural specification — never code, never pseudocode, never prose without a spec block.

A .speq file is an architectural contract. It is written BEFORE code. Once locked, it is the source of truth. Every change to it implies architecture rethinking, data migrations, and integration updates.

## Your process
1. Ask focused questions to deeply understand the project: domain, users, critical flows, external services, security requirements, failure modes.
2. Never generate the spec until you have enough to make it complete. If unclear: ask, don't guess.
3. Probe explicitly for: auth model, payment/billing, file storage, admin roles, rate limiting, background jobs, deployment target.
4. Flag missing pieces: "You have a checkout flow but no payment entity — is that intentional?"
5. When ready, output the full spec inside a single \`\`\`speq code block. Then briefly explain your main structural choices (3–5 lines max).
6. Warn once: this is a binding contract.

## Critical rules for generated specs (violations cause validation errors)
- ENTITY names: snake_case only (e.g. \`user\`, \`payment_subscription\`)
- VOCABULARY entries: PascalCase only (e.g. \`AuthToken\`, \`SiteBundle\`)
- LAYER names: UPPER_CASE only (e.g. \`API\`, \`CORE\`, \`STORAGE\`)
- Every entity referenced in TRANSFORM, FLOW steps, CONTRACTS must be declared in ENTITY
- Every layer referenced in LAYERS CALLS must be declared in LAYERS; use \`none\` when a layer calls nothing
- CALLS is exclusive: if a layer declares CALLS, any call to an unlisted layer is a contract violation
- FLOW steps numbered from 1, sequential, no gaps, minimum 2 steps
- FLOW step subject MUST be \`entity.action\` — e.g. \`cart.validate\`, \`payment.authorize\`.
  The part before the dot MUST be a declared entity (snake_case). Never write plain action names
  like \`validate_cart\` or \`process_payment\` as subjects — those are not valid and will fail
  validation. If no entity fits a step, reconsider the flow or add the missing entity first.
- SECRETS declares key names only -- never values
- Secret scoped with -> (e.g. \`API_KEY -> API\`) restricts access to that layer only
- CLASSIFY classes: credential | pii | sensitive | internal -- subjects must be declared entities
- credential fields are implicitly must-not-log in all contexts regardless of OBSERVABILITY declarations
- At most one layer may declare BOUNDARY external
- [LAYER_NAME] on FLOW steps must reference a declared layer (e.g. \`1. [API] cart.validate\`)
- CONTRACTS subjects must match declared entity names (snake_case)

## What makes a good spec
- Specific, not generic. Real project names, real vocabulary, real boundaries.
- VOCABULARY prevents naming drift — include every domain term that must stay consistent.
- LAYERS define responsibility boundaries — each layer has clear OWNS and limited CALLS.
- CONTRACTS capture invariants that must never be violated in any implementation.
- FLOW covers only critical paths (auth, payment, core domain operations).
- SECRETS lists every external credential the system will need.

Always respond in the same language the user writes in.
`;

async function callApi(provider: string, model: string, apiKey: string, systemPrompt: string, history: Message[]): Promise<string> {
  if (provider === 'anthropic') {
    return callAnthropic(model, apiKey, systemPrompt, history);
  } else {
    const baseUrl = provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    return callOpenAICompatible(baseUrl, model, apiKey, systemPrompt, history);
  }
}

async function callAnthropic(model: string, apiKey: string, systemPrompt: string, history: Message[]): Promise<string> {
  const messages = history.map(m => ({ role: m.role, content: m.content }));
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: systemPrompt, messages }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Anthropic API error ${resp.status}: ${text}`);
  let parsed: { content?: { text: string }[] };
  try {
    parsed = JSON.parse(text) as { content?: { text: string }[] };
  } catch (e) {
    throw new Error('Failed to parse API response: ' + String(e));
  }
  const content = parsed.content?.[0]?.text;
  if (!content) throw new Error(`Unexpected Anthropic response shape: ${text}`);
  return content;
}

async function callOpenAICompatible(baseUrl: string, model: string, apiKey: string, systemPrompt: string, history: Message[]): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ];
  const resp = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: MAX_TOKENS, messages }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${text}`);
  let parsed: { choices?: { message?: { content: string } }[] };
  try {
    parsed = JSON.parse(text) as { choices?: { message?: { content: string } }[] };
  } catch (e) {
    throw new Error('Failed to parse API response: ' + String(e));
  }
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Unexpected API response shape: ${text}`);
  return content;
}

function extractEnthBlock(text: string): string | null {
  const startMarker = '```speq';
  const endMarker = '```';
  const start = text.indexOf(startMarker);
  if (start === -1) return null;
  const after = text.slice(start + startMarker.length).replace(/^\n/, '');
  const end = after.indexOf(endMarker);
  if (end === -1) return null;
  return after.slice(0, end).trim();
}

async function saveSpec(content: string, workdir: string): Promise<string | null> {
  const tmp = join(tmpdir(), '_speq_tmp.speq');
  writeFileSync(tmp, content);
  try {
    const spec = parse(tmp);
    try { unlinkSync(tmp); } catch { /* ignore */ }
    const nameVal = spec.project.get('NAME');
    const name = nameVal?.kind === 'str'
      ? nameVal.value.replace(/^"|"$/g, '').toLowerCase().replace(/ /g, '_')
      : 'speq';

    const projectDir = join(workdir, name);
    mkdirSync(projectDir, { recursive: true });

    const outPath = join(projectDir, `${name}.speq`);
    writeFileSync(outPath, content);
    tui.printSuccess(`Spec saved to ${projectDir}/${name}.speq`);

    const stateContent = generateState(spec, name);
    writeFileSync(join(projectDir, `state_${name}.speq`), stateContent);
    tui.printSuccess(`State file: state_${name}.speq`);


    console.log();
    tui.printDim('  The spec is now your source of truth. Pass it to your AI coder as context.');
    console.log();
    return outPath;
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    tui.printError(`Spec has validation errors: ${String(e)}`);
    tui.printDim('  Keep refining with the consultant before saving.');
    return null;
  }
}

function printOpener(): void {
  const prefix = tui.pink('🧠  ›');
  console.log(`${prefix} Tell me about the project you want to build.\n   What does it do, who uses it, what's the core problem it solves?\n`);
}

export async function run(file?: string, forceNew = false, workdir = process.cwd(), alwaysRefine = false, initialErrors?: string): Promise<void> {

  const cfg = globalConfig.loadConfig();
  const provider = cfg.provider;
  if (!provider) {
    tui.printError('No provider configured. Run  speq setup  first.');
    return;
  }
  const model = cfg.model;
  if (!model) {
    tui.printError('No model configured. Run  speq setup  first.');
    return;
  }
  const apiKey = globalConfig.getApiKey(provider);
  if (!apiKey) {
    tui.printError(`No API key found for ${provider}. Run  speq setup  first.`);
    return;
  }

  const systemPrompt = SYSTEM_CONSULTANT + SPEC_FORMAT;
  const sep = tui.pink('──────────────────────────────────────────────────────────');
  const history: Message[] = [];
  let lastSpecBlock: string | null = null;

  const existingSpecPath = forceNew ? null : tryResolveSpec(file);

  if (existingSpecPath) {
    console.log(`  ${tui.dimmed('')} spec: ${tui.dimmed(existingSpecPath)}  provider: ${tui.dimmed(provider)}  model: ${tui.dimmed(model)}`);
    console.log(sep);

    if (initialErrors) {
      // called from check → "refine with AI" — inject errors as AI context
      const specText = readFileSync(existingSpecPath, 'utf-8');
      const opener = `Ho caricato la tua spec. Ci sono i seguenti problemi da correggere:\n\n${initialErrors}\n\nEcco la spec attuale:\n\`\`\`speq\n${specText}\n\`\`\`\n\nDimmi se vuoi che li risolva io direttamente, o se preferisci ragionare su come sistemare ogni punto.`;
      console.log(`${tui.pink('🧠  ›')} ${opener}\n`);
      history.push({ role: 'assistant', content: opener });
    } else if (alwaysRefine) {
      // called from "update" menu — always refine, no question
      const specText = readFileSync(existingSpecPath, 'utf-8');
      const opener = `Loading your spec for refinement.\n\n\`\`\`speq\n${specText}\n\`\`\`\n\nWhat do you want to change or extend?`;
      console.log(`${tui.pink('🧠  ›')} ${opener}\n`);
      history.push({ role: 'assistant', content: opener });
    } else {
      console.log('  Existing spec found.');
      console.log(`${sep}\n`);
      const refine = await tui.confirm('Refine existing spec with AI?');
      if (refine) {
        const specText = readFileSync(existingSpecPath, 'utf-8');
        const opener = `I'm loading your existing spec for review.\n\n\`\`\`speq\n${specText}\n\`\`\`\n\nTell me what you want to change or extend, or ask me to review it for completeness.`;
        console.log(`${tui.pink('🧠  ›')} ${opener}\n`);
        history.push({ role: 'assistant', content: opener });
      } else {
        // user said no → return to menu
        return;
      }
    }
  } else {
    console.log(`  ${tui.dimmed('')} provider: ${tui.dimmed(provider)}  model: ${tui.dimmed(model)}`);
    console.log(sep);
    console.log('  Spec consultant — design your .speq through conversation.');
    console.log();
    console.log(`  ${tui.dimmed('type exit to end session')}`);
    console.log(`${sep}\n`);
    printOpener();
  }

  const divider = tui.dimmed('  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·');
  process.stdin.resume();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const question = (prompt: string): Promise<string> =>
    new Promise(res => rl.question(prompt, res));

   
  while (true) {
    const userInput = (await question(`${tui.boldWhite('You ›')} `)).trim();

    if (!userInput) continue;

    if (userInput === 'exit' || userInput === 'quit') {
      if (lastSpecBlock) {
        rl.pause();
        process.stdin.resume();
        const exitAction = await select({
          message: tui.pink('Spec not saved — what do you want to do?'),
          choices: [
            { name: tui.pink('save    ') + tui.dimmed('  save to disk then exit'),   value: 'save',     short: 'save' },
            { name: tui.pink('discard ') + tui.dimmed('  exit without saving'),      value: 'discard',  short: 'discard' },
            { name: tui.pink('continue') + tui.dimmed('  keep working'),             value: 'continue', short: 'continue' },
          ],
        });
        process.stdin.resume();
        rl.resume();
        if (exitAction === 'save') { await saveSpec(lastSpecBlock, workdir); break; }
        else if (exitAction === 'discard') { break; }
        // continue → loop
      } else {
        break;
      }
      continue;
    }

    if (userInput === 'save') {
      if (lastSpecBlock) {
        await saveSpec(lastSpecBlock, workdir);
        break; // saved → return to menu
      } else {
        tui.printDim('  No spec generated yet. Keep the conversation going.');
      }
      continue;
    }

    history.push({ role: 'user', content: userInput });

    const spinner = ora({ text: 'thinking…', color: 'magenta' }).start();

    try {
      const reply = await callApi(provider, model, apiKey, systemPrompt, history);
      spinner.stop();
      process.stdin.resume();

      console.log(divider);
      const prefix = tui.pink('🧠  ›');
      console.log(`${prefix} ${reply}`);

      const spec = extractEnthBlock(reply);
      if (spec) {
        lastSpecBlock = spec;
        console.log();
        // Mini menu after spec is ready
        rl.pause();
        process.stdin.resume();
        const action = await select({
          message: tui.pink('Spec ready — what next?'),
          choices: [
            { name: tui.pink('continue') + tui.dimmed('  keep refining with the AI'),                     value: 'continue', short: 'continue' },
            { name: tui.pink('save    ') + tui.dimmed('  write spec to disk'),                             value: 'save',     short: 'save' },
            { name: tui.pink('exit    ') + tui.dimmed('  end session without saving'),                     value: 'exit',     short: 'exit' },
          ],
        });
        process.stdin.resume();
        rl.resume();
        if (action === 'save') {
          await saveSpec(spec, workdir);
          break; // saved → return to menu
        } else if (action === 'exit') {
          break; // discard → return to menu
        }
        // 'continue' → loop naturally
      }
      console.log(`${divider}\n`);

      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      spinner.stop();
      process.stdin.resume();
      tui.printError(`API error: ${String(e)}  (session continues)`);
      tui.printDim('  Try again or switch model with  speq setup.');
      console.log();
    }
  }

  rl.close();
  process.stdin.resume();
}
