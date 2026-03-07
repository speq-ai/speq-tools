import chalk from 'chalk';
import * as tui from './tui.js';

const W = 66;

function box(lines: string[]): void {
  const top    = tui.pink('┌' + '─'.repeat(W) + '┐');
  const bottom = tui.pink('└' + '─'.repeat(W) + '┘');
  const side   = tui.pink('│');

  console.log(top);
  for (const line of lines) {
    const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = W - visible.length;
    console.log(`${side} ${line}${' '.repeat(Math.max(0, pad - 1))} ${side}`);
  }
  console.log(bottom);
}

function section(title: string): void {
  console.log();
  console.log(tui.pink('  ● ') + chalk.bold.white(title));
  console.log(tui.pink('  ' + '─'.repeat(W - 2)));
}

function line(text = ''): void {
  console.log('  ' + text);
}

function step(n: number, label: string, desc: string): void {
  console.log(`  ${tui.pink(String(n) + '.')} ${chalk.bold.white(label.padEnd(14))} ${chalk.dim(desc)}`);
}

const PAGES: (() => void)[] = [
  // Page 1 — intro
  () => {
    box([
      tui.pink('  SPEQ  —  quick start guide'),
      chalk.dim('  for people who just want to ship'),
    ]);
    console.log();
    line('This tool solves one problem:');
    line();
    line(chalk.white('  Every time you start a new AI session,'));
    line(chalk.white('  the AI forgets your entire architecture.'));
    line();
    line('With SpeQ you write your architecture once in a');
    line(chalk.white('.speq') + ' file. Every AI session reads it first.');
    line();
    line('Same spec, any agent, any session — identical architecture.');
    line();
    line(chalk.dim('  The spec is not code. It is a contract.'));
    line(chalk.dim('  The AI follows it. You do not repeat yourself.'));
  },

  // Page 2 — the workflow
  () => {
    section('The workflow  (5 steps, once per project)');
    console.log();
    step(1, 'setup',   'tell SpeQ which AI provider you use');
    console.log();
    step(2, 'new',     'talk to an AI consultant — it writes your spec');
    console.log();
    step(3, 'check',   'validate the spec has no errors');
    console.log();
    step(4, 'context', 'generate the block you paste into your AI coder');
    console.log();
    step(5, 'build',   'paste the context, start coding — every session');
    console.log();
    line(chalk.dim('  You only do steps 1–4 once.'));
    line(chalk.dim('  Step 5 is every session, every agent, forever.'));
  },

  // Page 3 — step 1: setup
  () => {
    section('Step 1  —  setup');
    console.log();
    line('You need an API key from one of these providers:');
    console.log();
    line(tui.pink('  Anthropic')  + chalk.dim('    →  claude-3-5-sonnet, claude-3-opus, …'));
    line(tui.pink('  OpenAI')     + chalk.dim('       →  gpt-4o, gpt-4-turbo, …'));
    line(tui.pink('  OpenRouter') + chalk.dim('  →  any model, one key'));
    console.log();
    line('Get a key, then run ' + chalk.white('setup') + ' from the main menu.');
    line('SpeQ stores it encrypted on your machine.');
    line('It never leaves except to call the API directly.');
    console.log();
    line(chalk.dim('  OpenRouter is the easiest if you want to try'));
    line(chalk.dim('  multiple models without managing multiple keys.'));
    line(chalk.dim('  → openrouter.ai'));
  },

  // Page 4 — step 2: new
  () => {
    section('Step 2  —  new  (create your spec)');
    console.log();
    line('Run ' + chalk.white('new') + ' from the menu. An AI consultant opens.');
    line();
    line('Just describe your project in plain language:');
    console.log();
    line(chalk.dim('  "I want to build a chat app where users bring'));
    line(chalk.dim('  their own API key and talk to different AI models"'));
    console.log();
    line('The consultant asks follow-up questions, then generates');
    line('a ' + chalk.white('.speq') + ' file — your architectural contract.');
    console.log();
    line('It covers:');
    line(chalk.dim('  • entities  (the things in your system)'));
    line(chalk.dim('  • layers    (who owns what)'));
    line(chalk.dim('  • contracts (what must always be true)'));
    line(chalk.dim('  • flows     (critical sequences)'));
    line(chalk.dim('  • secrets   (what env vars you need)'));
    console.log();
    line(chalk.dim('  You can refine it as many times as you want.'));
    line(chalk.dim('  Type  save  when it looks right.'));
  },

  // Page 5 — step 3+4: check + context
  () => {
    section('Step 3  —  check  (validate)');
    console.log();
    line('Run ' + chalk.white('check') + ' from the menu and pick your project.');
    line();
    line('It validates your spec against all 18 spec rules:');
    line(chalk.dim('  naming conventions, layer references,'));
    line(chalk.dim('  flow sequencing, secret scoping, CLASSIFY classes…'));
    console.log();
    line('If there are errors, you can fix them manually');
    line('or send them back to the AI with ' + chalk.white('refine with AI') + '.');
    console.log();
    line(chalk.dim('  A clean spec generates a state file that tracks'));
    line(chalk.dim('  what is built vs still pending.'));
    console.log();
    section('Step 4  —  context  (generate the AI prompt)');
    console.log();
    line('Run ' + chalk.white('context') + ' and pick your project.');
    line('It opens a file containing your full context block.');
    line();
    line(chalk.dim('  Copy everything. This is your system prompt.'));
  },

  // Page 6 — step 5: using the context
  () => {
    section('Step 5  —  using the context with your AI coder');
    console.log();
    line('Paste the context as the system prompt in whatever');
    line('AI tool you use: Cursor, Claude, ChatGPT, Copilot…');
    console.log();
    line('Then ask it to build. Examples:');
    console.log();
    line(chalk.dim('  "implement the checkout flow"'));
    line(chalk.dim('  "build the API layer"'));
    line(chalk.dim('  "implement all entities"'));
    console.log();
    line('The AI knows your architecture. It will not:');
    line(chalk.dim('  • invent entities you did not declare'));
    line(chalk.dim('  • cross layer boundaries'));
    line(chalk.dim('  • violate your contracts'));
    line(chalk.dim('  • log credential fields'));
    console.log();
    line(chalk.white('Every new session: paste the same context.'));
    line(chalk.white('Same spec = same architecture = reproducible.'));
  },

  // Page 7 — done
  () => {
    box([
      tui.pink('  You are ready.'),
      '',
      chalk.dim('  spec   →  your architecture, written once'),
      chalk.dim('  check  →  zero errors before you paste'),
      chalk.dim('  context  →  paste into any AI, every session'),
    ]);
    console.log();
    line('The spec lives in your project folder as a ' + chalk.white('.speq') + ' file.');
    line('Commit it. It is your source of truth.');
    console.log();
    line(chalk.dim('  Full spec reference:'));
    line(chalk.dim('  github.com/speq-ai/speq'));
    console.log();
  },
];

export async function run(): Promise<void> {
  console.clear();
  tui.printHeader();

  for (let i = 0; i < PAGES.length; i++) {
    PAGES[i]();
    console.log();

    const isLast = i === PAGES.length - 1;
    if (!isLast) {
      console.log(chalk.dim(`  ─── ${i + 1} / ${PAGES.length}  · press enter for next ───`));
    } else {
      console.log(chalk.dim(`  ─── back to menu ───`));
    }

    await tui.pressEnter();
    if (!isLast) console.clear();
  }
}
