import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { tmpdir } from 'os';
import { execSync, spawnSync } from 'child_process';
import chalk from 'chalk';
import { select, Separator } from '@inquirer/prompts';

import { parse } from './parser.js';
import type { SpeqSpec } from './parser.js';
import { cmdCheck, check } from './check.js';
import { generate as generateContext } from './context.js';
import { setStatus } from './state.js';
import * as tui from './tui.js';
import { run as setupRun } from './setup.js';
import { run as newWizardRun } from './new_wizard.js';
import { run as guideRun } from './guide.js';
import { run as buildRun } from './build_cmd.js';
import { run as initRun } from './init_cmd.js';
import { resolveSpec } from './utils.js';
import { getWorkdir, loadConfig } from './global_config.js';

function projectName(spec: SpeqSpec, path: string): string {
  const val = spec.project.get('NAME');
  const raw = val?.kind === 'str' ? val.value : path.replace(/\.speq$/, '').split('/').pop() ?? 'project';
  return raw.replace(/^"|"$/g, '').toLowerCase().replace(/ /g, '_');
}



function cmdContext(file?: string, out?: string): boolean {
  const path = resolveSpec(file);
  const spec = parse(path);
  const name = projectName(spec, path);
  const dir = dirname(path);
  const candidate = resolve(dir, `state_${name}.speq`);
  const statePath = existsSync(candidate) ? candidate : undefined;
  const result = generateContext(spec, statePath);

  if (out) {
    writeFileSync(out, result);
    console.log(`${chalk.green('✓')} Context written to ${out}`);
  } else {
    process.stdout.write(result);
  }
  return true;
}

function cmdStateShow(file?: string): boolean {
  let statePath: string;
  if (file) {
    const basename = file.split('/').pop() ?? '';
    if (basename.startsWith('state_')) {
      statePath = resolve(file);
    } else {
      const path = resolveSpec(file);
      const spec = parse(path);
      const name = projectName(spec, path);
      statePath = resolve(dirname(path), `state_${name}.speq`);
    }
  } else {
    const path = resolveSpec(undefined);
    const spec = parse(path);
    const name = projectName(spec, path);
    statePath = resolve(dirname(path), `state_${name}.speq`);
  }

  if (!existsSync(statePath)) {
    console.error(`${chalk.red('✗')} No state file found. Run 'speq check' first.`);
    return false;
  }
  process.stdout.write(readFileSync(statePath, 'utf-8'));
  return true;
}

function cmdStateSet(key: string, status: string, file?: string): boolean {
  const specPath = resolveSpec(file);
  const spec = parse(specPath);
  const name = projectName(spec, specPath);
  const statePath = resolve(dirname(specPath), `state_${name}.speq`);

  if (!existsSync(statePath)) {
    console.error(`${chalk.red('✗')} State file not found: ${statePath}. Run 'speq check' first.`);
    return false;
  }

  try {
    setStatus(statePath, key, status);
    console.log(`${chalk.green('✓')} ${key} → ${status.toUpperCase()}`);
    return true;
  } catch (e) {
    console.error(`${chalk.red('✗')} ${String(e)}`);
    return false;
  }
}


async function pickEnthFile(workdir: string, label = 'Select project', allowBack = false): Promise<string | null> {
  type Choice = { name: string; value: string };
  const choices: Choice[] = [];

  // Flat files in workdir
  for (const f of readdirSync(workdir).sort()) {
    if (f.endsWith('.speq') && !f.startsWith('state_')) {
      choices.push({ name: tui.pink(f), value: join(workdir, f) });
    }
  }

  // Project subfolders: workdir/<slug>/<slug>.speq
  for (const entry of readdirSync(workdir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      const specPath = join(workdir, entry.name, `${entry.name}.speq`);
      if (existsSync(specPath)) {
        choices.push({ name: tui.pink(entry.name) + tui.dimmed(`  ${entry.name}/${entry.name}.speq`), value: specPath });
      }
    }
  }

  if (choices.length === 0) {
    tui.printError('No .speq projects found in ' + workdir);
    return null;
  }

  if (allowBack) {
    choices.push({ name: tui.dimmed('← back'), value: '__back__' });
  }

  const result = await select({ message: label, pageSize: 20, choices });
  return result === '__back__' ? null : result;
}

async function runInteractiveMenu(workdir: string): Promise<void> {
  let firstRun = true;
   
  while (true) {
    if (!firstRun) {
      console.log(tui.dimmed('──────────────────────────────────────────────────────────────'));
    }
    firstRun = false;
     
    const choice = await select({
      message: 'Select a command',
      pageSize: 30,
      choices: [
        new Separator(),
        { name: tui.pink('guide'.padEnd(11))    + tui.dimmed('Quick start guide — how to use SpeQ from zero'),        value: 'guide',   short: 'guide' },
        { name: tui.pink('setup'.padEnd(11))    + tui.dimmed('Configure AI provider and API key'),                          value: 'setup',   short: 'setup' },
        { name: tui.pink('open'.padEnd(11))     + tui.dimmed('Open a project spec in your editor'),                         value: 'open',    short: 'open' },
        new Separator(),
        { name: tui.pink('new'.padEnd(11))      + tui.dimmed('Create a new .speq project'),                                 value: 'new',     short: 'new' },
        { name: tui.pink('update'.padEnd(11))   + tui.dimmed('Refine an existing spec with AI'),                            value: 'update',  short: 'update' },
        { name: tui.pink('reverse'.padEnd(11))  + tui.dimmed('Reverse-engineer a codebase into a starter .speq file'),      value: 'reverse', short: 'reverse' },
        new Separator(),
        { name: tui.pink('check'.padEnd(11))    + tui.dimmed('Validate & lint — errors and warnings in one view'),          value: 'check',   short: 'check' },
        { name: tui.pink('context'.padEnd(11))  + tui.dimmed('Generate AI context block from a spec'),                      value: 'context', short: 'context' },
        new Separator(),
        { name: tui.pink('state'.padEnd(11))    + tui.dimmed('Manage project build state'),                                 value: 'state',   short: 'state' },
        new Separator(),
        { name: tui.pink('delete'.padEnd(11))   + tui.dimmed('Delete a project and all its files'),                         value: 'delete',  short: 'delete' },
        new Separator(),
        { name: tui.dimmed('exit'),              value: 'exit' },
      ],
    });

    if (choice === 'exit') {
      process.exit(0);
    }

    if (choice === 'guide') {
      await guideRun();
    } else if (choice === 'setup') {
       
      await setupRun();
    } else if (choice === 'open') {
       
      const specFile = await pickEnthFile(workdir, 'Open which project?', true);
      if (specFile) {
        try {
          execSync(`osascript -e 'tell application "Terminal" to do script "cat \\"${specFile}\\"; echo; echo \\"--- press any key to close ---\\"; read"'`, { stdio: 'ignore' });
          tui.printSuccess(`Opened  ${specFile}  in new terminal`);
        } catch (e) { tui.printError(`Cannot open file: ${String(e)}`); }
         
        await tui.pressEnter();
      }
    } else if (choice === 'new') {
       
      await newWizardRun();
    } else if (choice === 'reverse') {
       
      const dir = await tui.inputWithDefault('Directory to scan', '.');
       
      await initRun(dir);
    } else if (choice === 'update') {
       
      const file = await pickEnthFile(workdir, 'Which project to update?', true);
      if (file) {
         
        await buildRun(file, false, workdir, true);
      }
    } else if (choice === 'check') {
       
      const file = await pickEnthFile(workdir, 'Select project', true);
      if (file) {
        let results: import('./check.js').CheckResult[] = [];
        try {
          const spec = parse(file);
          results = check(spec);
          cmdCheck(file);
        } catch (e) { tui.printError(String(e)); }

        const hasIssues = results.some(r => r.severity === 'ERROR' || r.severity === 'WARN');
        if (hasIssues) {
          const errorsText = results.map(r => `[${r.severity}] ${r.rule}: ${r.message}`).join('\n');
           
          const action = await select({
            message: tui.pink('What do you want to do?'),
            pageSize: 5,
            choices: [
              { name: tui.pink('back        ') + tui.dimmed('return to menu'),                    value: 'back',   short: 'back' },
              { name: tui.pink('refine AI   ') + tui.dimmed('fix issues with AI assistance'),     value: 'ai',     short: 'refine with AI' },
              { name: tui.pink('edit        ') + tui.dimmed('open spec in editor'),               value: 'edit',   short: 'edit manually' },
            ],
          });
          process.stdin.resume();
          if (action === 'ai') {
             
            await buildRun(file, false, workdir, true, errorsText);
          } else if (action === 'edit') {
            try { execSync(`osascript -e 'tell application "Terminal" to do script "cat \\"${file}\\"; echo; echo \\"--- press any key to close ---\\"; read"'`, { stdio: 'ignore' }); }
            catch { /**/ }
          }
        } else {
           
          await tui.pressEnter();
        }
      }
    } else if (choice === 'context') {
       
      const file = await pickEnthFile(workdir, 'Select project', true);
      if (file) {
        try {
          const spec = parse(file);
          const projectNm = spec.project.get('NAME');
          const nm = projectNm?.kind === 'str' ? projectNm.value.replace(/"/g, '') : file.split('/').pop()?.replace('.speq', '') ?? 'project';
          const dir = dirname(file);
          const stateCand = resolve(dir, `state_${nm}.speq`);
          const statePath = existsSync(stateCand) ? stateCand : undefined;
          const { generate: genCtx } = await import('./context.js');
          const content = genCtx(spec, statePath);
          const tmpFile = join(tmpdir(), `speq_ctx_${Date.now()}.md`);
          writeFileSync(tmpFile, content);
          const editor = process.env.EDITOR;
          if (editor) {
            spawnSync(editor, [tmpFile], { stdio: 'inherit' });
          } else {
            // open in default system app (new window)
            spawnSync('open', [tmpFile], { stdio: 'ignore' });
          }
        } catch (e) { tui.printError(String(e)); }
      }
    } else if (choice === 'state') {
       
      const specFile = await pickEnthFile(workdir, 'state  — select project', true);
      if (specFile) {
        // inner loop: stay in state until user goes back
         
        while (true) {
          const projectName = specFile.split('/').slice(-2, -1)[0] ?? specFile;
           
          const sub = await select({
            message: tui.pink('state') + tui.dimmed(`  ${projectName}`),
            pageSize: 10,
            choices: [
              { name: tui.pink('show  ') + tui.dimmed('  View current build state'),    value: 'show',  short: 'show' },
              { name: tui.pink('set   ') + tui.dimmed('  Update an entry status'),       value: 'set',   short: 'set' },
              new Separator(),
              { name: tui.dimmed('← back'),                                              value: 'back',  short: 'back' },
            ],
          });
          if (sub === 'back') break;
          if (sub === 'show') {
            try { cmdStateShow(specFile); } catch (e) { tui.printError(String(e)); }
             
            await tui.pressEnter();
          } else if (sub === 'set') {
             
            const key = await tui.input('Key to update');
             
            const status = await tui.input('New status  (pending / in_progress / done / blocked)');
            try { cmdStateSet(key, status, specFile); } catch (e) { tui.printError(String(e)); }
             
            await tui.pressEnter();
          }
        }
      }
    } else if (choice === 'delete') {
       
      const specFile = await pickEnthFile(workdir, 'Delete which project?', true);
      if (specFile) {
        const projectDir = specFile.split('/').slice(0, -1).join('/');
        const projectName = specFile.split('/').slice(-2, -1)[0] ?? specFile;
        console.log();
        tui.printError(`  This will permanently delete:  ${projectDir}`);
        console.log();
         
        const confirmed = await tui.confirm(`Delete  ${projectName}  and all its files?`);
        if (confirmed) {
          rmSync(projectDir, { recursive: true, force: true });
          tui.printSuccess(`${projectName} deleted.`);
          console.log();
        } else {
          tui.printDim('  Cancelled.');
        }
      }
    }

    console.log();
  }
}

async function main(): Promise<void> {
  const workdir = getWorkdir();
  process.chdir(workdir);

  const program = new Command();

  program
    .name('speq')
    .description('SpeQ — toolkit for the .speq architectural specification format.')
    .helpOption('-h, --help', 'Show help')
    .addHelpCommand(false);

  program
    .command('check [file]')
    .description('Full check: errors and warnings in one view')
    .action((file?: string) => {
      if (!cmdCheck(file)) process.exit(1);
    });

  program
    .command('context [file]')
    .description('Generate the context block to paste as AI system prompt')
    .option('-o, --out <file>', 'Write output to file')
    .action((file?: string, opts?: { out?: string }) => {
      if (!cmdContext(file, opts?.out)) process.exit(1);
    });

  program
    .command('state')
    .description('Manage project build state')
    .addCommand(
      new Command('show')
        .argument('[file]', 'State file or spec file')
        .description('Show the current build state')
        .action((file?: string) => {
          cmdStateShow(file);
        }),
    )
    .addCommand(
      new Command('set')
        .argument('<key>', 'Key to update')
        .argument('<status>', 'New status')
        .argument('[file]', '.speq spec file')
        .description('Update a single entry status in the state file')
        .action((key: string, status: string, file?: string) => {
          cmdStateSet(key, status, file);
        }),
    );

  program
    .command('setup')
    .description('Configure your AI provider and API key')
    .action(async () => {
      await setupRun();
    });

  program
    .command('new')
    .description('Create a new SpeQ project interactively')
    .action(async () => {
      await newWizardRun();
    });

  // Default: no command → interactive menu
  if (process.argv.length <= 2) {
    tui.printHeader();
    tui.printWorkdir(workdir);
    const cfg = loadConfig();
    if (cfg.provider && cfg.model) {
      console.log(tui.dimmed(`  ${cfg.provider}  ·  ${cfg.model}`));
      console.log();
    }
    await runInteractiveMenu(workdir);
    return;
  }

  await program.parseAsync(process.argv);

  // After any direct command, return to menu if interactive terminal
  if (process.stdout.isTTY) {
    process.stdin.resume();
    console.log();
    tui.printWorkdir(workdir);
    await runInteractiveMenu(workdir);
  }
}

main().catch(e => {
  console.error(`${chalk.red('✗')} ${String(e)}`);
  process.exit(1);
});
