import { createInterface } from 'readline';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { join } from 'path';
import ora from 'ora';
import * as globalConfig from './global_config.js';
import * as tui from './tui.js';
import { parse } from './parser.js';
import { generate as generateState } from './state.js';
import { refreshVaultFile } from './vault.js';

interface Message {
  role: string;
  content: string;
}

const SPEC_FORMAT = `
## .enth Format Reference

File starts with: VERSION 0.1.0

### PROJECT (required)
  NAME   "project name"
  LANG   python|rust|typescript|go|...
  STACK  comma, separated, tech
  ARCH   layered|event-driven|realtime|hexagonal|...
  DEPS
    SYSTEM   os-level packages (e.g. tcl-tk, libpq)
    RUNTIME  production dependencies
    DEV      dev-only tools

### VOCABULARY (naming enforcement — prevents drift)
  PascalCaseName  # never: alternative_names
  AuthToken       # never: jwt, accessToken

### ENTITY (domain objects, snake_case)
  ENTITY user, product, order

### TRANSFORM (relationships between entities)
  TRANSFORM
    user -> cart : add_product, remove_product
    cart -> order : checkout

### SECRETS (key names only — no values)
  SECRETS
    DATABASE_URL
    STRIPE_KEY

### LAYERS (organizational boundaries)
  LAYERS
    API
      OWNS   http_routing, request_validation
      CALLS  CORE
      NEVER  direct_database_access
    CORE
      OWNS   business_logic, domain_rules
      CALLS  STORAGE
    STORAGE
      OWNS   persistence, queries

### CONTRACTS (behavioral invariants)
  CONTRACTS
    payment.*    ALWAYS  server-side
    admin.*      REQUIRES verified-admin-role
    FLOW checkout
      1. cart.validate
      2. payment.authorize
      3. order.confirm
      ROLLBACK  payment.void, order.cancel
      ATOMIC    true
      TIMEOUT   30s

## Rules
- VOCABULARY entries = PascalCase, LAYER names = UPPER_CASE, entities = snake_case
- All entities referenced in TRANSFORM/LAYERS/CONTRACTS must be declared in ENTITY
- FLOW steps are numbered and sequential
- SECRETS declares names only — never values
`;

const SYSTEM_CONSULTANT = `You are an Enthropic spec consultant. Your job is to help the user create a complete, precise .enth specification file for their project.

A .enth file is an architectural contract — not code, not pseudocode. It declares everything that must be true before any code is written. Once locked, it is the source of truth. Changes to it mean changes to the entire project.

Your role:
1. Ask questions to understand the project deeply before writing anything
2. Be proactive — if the user hasn't addressed auth, error handling, external APIs, deployment context, ask about them
3. Identify missing pieces: "You have a cart but no payment entity — intentional?"
4. When you have enough to write a complete spec, output it inside a \`\`\`enth code block
5. Explain your structural choices briefly after the block
6. Warn clearly: the spec is a contract. Changing it later means rethinking the entire architecture.

What to cover in consultation:
- Core domain entities and their relationships
- Technology stack, language, architecture style
- Canonical vocabulary (names that must never drift)
- Organizational layers and their boundaries
- Critical flows that must be atomic or have rollback
- Secrets and external dependencies
- What must NEVER happen (security invariants, responsibility violations)

When outputting the spec, use exactly the format in the reference below. Use real project names, meaningful vocabulary, proper layer boundaries. Not toy examples — thorough, production-grade.

Do not write code. Do not suggest implementation details. Only the spec.

Always respond in the same language the user writes in. If the user writes in Italian, respond in Italian. If in English, respond in English. Default to English if unsure.
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
    body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Anthropic API error ${resp.status}: ${text}`);
  const parsed = JSON.parse(text) as { content?: { text: string }[] };
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
    body: JSON.stringify({ model, max_tokens: 4096, messages }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${text}`);
  const parsed = JSON.parse(text) as { choices?: { message?: { content: string } }[] };
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Unexpected API response shape: ${text}`);
  return content;
}

function extractEnthBlock(text: string): string | null {
  const startMarker = '```enth';
  const endMarker = '```';
  const start = text.indexOf(startMarker);
  if (start === -1) return null;
  const after = text.slice(start + startMarker.length).replace(/^\n/, '');
  const end = after.indexOf(endMarker);
  if (end === -1) return null;
  return after.slice(0, end).trim();
}

function resolveSpec(file?: string): string | null {
  if (file && existsSync(file)) return resolve(file);
  const def = 'enthropic.enth';
  if (existsSync(def)) return resolve(def);
  return null;
}

async function saveSpec(content: string): Promise<void> {
  const tmp = join(tmpdir(), '_enthropic_tmp.enth');
  writeFileSync(tmp, content);
  try {
    const spec = parse(tmp);
    try { unlinkSync(tmp); } catch { /* ignore */ }
    const nameVal = spec.project.get('NAME');
    const name = nameVal?.kind === 'str'
      ? nameVal.value.replace(/^"|"$/g, '').toLowerCase().replace(/ /g, '_')
      : 'enthropic';
    const outPath = `${name}.enth`;
    writeFileSync(outPath, content);
    tui.printSuccess(`Spec saved to ${outPath}`);

    const stateContent = generateState(spec, name);
    const statePath = `state_${name}.enth`;
    writeFileSync(statePath, stateContent);
    tui.printSuccess(`State file: ${statePath}`);

    if (spec.secrets.length > 0) {
      refreshVaultFile(name, spec.secrets, '.');
      tui.printSuccess(`Vault file: vault_${name}.enth`);
    }
    console.log();
    tui.printDim('  The spec is now your source of truth. Pass it to your AI coder as context.');
    console.log();
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    tui.printError(`Spec has validation errors: ${String(e)}`);
    tui.printDim('  Keep refining with the consultant before saving.');
  }
}

function printOpener(): void {
  const prefix = tui.pink('🧠  ›');
  console.log(`${prefix} Tell me about the project you want to build.\n   What does it do, who uses it, what's the core problem it solves?\n`);
}

export async function run(file?: string): Promise<void> {
  tui.printHeader();

  const cfg = globalConfig.loadConfig();
  const provider = cfg.provider;
  if (!provider) {
    tui.printError('No provider configured. Run  enthropic setup  first.');
    return;
  }
  const model = cfg.model;
  if (!model) {
    tui.printError('No model configured. Run  enthropic setup  first.');
    return;
  }
  const apiKey = globalConfig.getApiKey(provider);
  if (!apiKey) {
    tui.printError(`No API key found for ${provider}. Run  enthropic setup  first.`);
    return;
  }

  const systemPrompt = SYSTEM_CONSULTANT + SPEC_FORMAT;
  const sep = tui.pink('──────────────────────────────────────────────────────────');
  const history: Message[] = [];
  let lastSpecBlock: string | null = null;

  const existingSpecPath = resolveSpec(file);

  if (existingSpecPath) {
    console.log(`  ${tui.dimmed('')} spec: ${tui.dimmed(existingSpecPath)}  provider: ${tui.dimmed(provider)}  model: ${tui.dimmed(model)}`);
    console.log(sep);
    console.log('  Existing spec found.');
    console.log(`${sep}\n`);

    const refine = await tui.confirm('Refine existing spec with AI?');
    if (refine) {
      const specText = readFileSync(existingSpecPath, 'utf-8');
      const opener = `I'm loading your existing spec for review.\n\n\`\`\`enth\n${specText}\n\`\`\`\n\nTell me what you want to change or extend, or ask me to review it for completeness.`;
      const prefix = tui.pink('🧠  ›');
      console.log(`${prefix} ${opener}\n`);
      history.push({ role: 'assistant', content: opener });
    } else {
      tui.printDim('  Starting fresh consultation.');
      console.log();
      printOpener();
    }
  } else {
    console.log(`  ${tui.dimmed('')} provider: ${tui.dimmed(provider)}  model: ${tui.dimmed(model)}`);
    console.log(sep);
    console.log('  Spec consultant — design your .enth through conversation.');
    console.log();
    console.log(`  ${tui.dimmed('save → write spec to disk')}  ${tui.dimmed('·')}  ${tui.dimmed('exit → end session')}`);
    console.log(`${sep}\n`);
    printOpener();
  }

  const divider = tui.dimmed('  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·');
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const question = (prompt: string): Promise<string> =>
    new Promise(res => rl.question(prompt, res));

  while (true) {
    const userInput = (await question(`${tui.boldWhite('You ›')} `)).trim();

    if (!userInput) continue;

    if (userInput === 'exit' || userInput === 'quit') {
      console.log();
      const confirmed = await tui.confirm('Exit session? Unsaved spec will be lost.');
      if (confirmed) {
        tui.printDim('  Session ended.');
        console.log();
        break;
      }
      continue;
    }

    if (userInput === 'save') {
      if (lastSpecBlock) {
        await saveSpec(lastSpecBlock);
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

      console.log(divider);
      const prefix = tui.pink('🧠  ›');
      console.log(`${prefix} ${reply}`);

      const spec = extractEnthBlock(reply);
      if (spec) {
        lastSpecBlock = spec;
        console.log();
        tui.printSuccess('Spec ready. Type  save  to write it to disk.');
      }
      console.log(`${divider}\n`);

      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      spinner.stop();
      tui.printError(`API error: ${String(e)}  (session continues)`);
      tui.printDim('  Try again or switch model with  enthropic setup.');
      console.log();
    }
  }

  rl.close();
}
