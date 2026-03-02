import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';

import { parse } from './parser.js';
import type { EnthSpec } from './parser.js';
import { validate } from './validator.js';
import { generate as generateContext } from './context.js';
import { generate as generateState, setStatus } from './state.js';
import {
  setSecret, deleteSecret, listKeys, exportEnv, refreshVaultFile,
} from './vault.js';
import * as globalConfig from './global_config.js';
import * as tui from './tui.js';
import { run as setupRun } from './setup.js';
import { run as newWizardRun } from './new_wizard.js';
import { run as buildRun } from './build_cmd.js';
import { serve } from './mcp.js';

function resolveSpec(file?: string): string {
  if (file && existsSync(file)) return resolve(file);
  const def = 'enthropic.enth';
  if (existsSync(def)) return resolve(def);
  throw new Error('No .enth file specified and enthropic.enth not found in the current directory.');
}

function projectName(spec: EnthSpec, path: string): string {
  const val = spec.project.get('NAME');
  const raw = val?.kind === 'str' ? val.value : path.replace(/\.enth$/, '').split('/').pop() ?? 'project';
  return raw.replace(/^"|"$/g, '').toLowerCase().replace(/ /g, '_');
}

function vaultProject(file?: string): [string, string, string[]] {
  const specPath = resolveSpec(file);
  const spec = parse(specPath);
  const name = projectName(spec, specPath);
  const dir = dirname(specPath);
  return [name, dir, spec.secrets];
}

function cmdValidate(file?: string): void {
  const path = resolveSpec(file);
  const spec = parse(path);
  const errors = validate(spec);

  if (errors.length > 0) {
    console.log(`${'Rule'.padEnd(6)} ${'Severity'.padEnd(9)} Message`);
    console.log('-'.repeat(80));
    for (const e of errors) {
      const sev = e.severity === 'ERROR' ? chalk.red(e.severity) : chalk.yellow(e.severity);
      console.log(`${String(e.rule).padEnd(6)} ${(sev + '          ').slice(0, 19)} ${e.message}`);
    }
    process.exit(1);
  }

  console.log(`${chalk.green('✓')} ${path} — valid`);

  const name = projectName(spec, path);
  const dir = dirname(path);

  const statePath = resolve(dir, `state_${name}.enth`);
  if (!existsSync(statePath)) {
    const content = generateState(spec, name);
    writeFileSync(statePath, content);
    console.log(chalk.dim(`  created state_${name}.enth`));
  }

  const vaultPath = resolve(dir, `vault_${name}.enth`);
  const vaultExisted = existsSync(vaultPath);
  refreshVaultFile(name, spec.secrets, dir);
  console.log(chalk.dim(`  ${vaultExisted ? 'updated' : 'created'} vault_${name}.enth`));

  const gitignorePath = resolve(dir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf-8');
    const additions = ['vault_*.enth', 'state_*.enth'].filter(e => !existing.includes(e));
    if (additions.length > 0) {
      writeFileSync(gitignorePath, existing.trimEnd() + '\n' + additions.join('\n') + '\n');
      console.log(chalk.dim('  updated .gitignore'));
    }
  } else {
    writeFileSync(gitignorePath, 'vault_*.enth\nstate_*.enth\n.env\n');
    console.log(chalk.dim('  created .gitignore'));
  }
}

function cmdContext(file?: string, out?: string): void {
  const path = resolveSpec(file);
  const spec = parse(path);
  const name = projectName(spec, path);
  const dir = dirname(path);
  const candidate = resolve(dir, `state_${name}.enth`);
  const statePath = existsSync(candidate) ? candidate : undefined;
  const result = generateContext(spec, statePath);

  if (out) {
    writeFileSync(out, result);
    console.log(`${chalk.green('✓')} Context written to ${out}`);
  } else {
    process.stdout.write(result);
  }
}

function cmdStateShow(file?: string): void {
  let statePath: string;
  if (file) {
    const basename = file.split('/').pop() ?? '';
    if (basename.startsWith('state_')) {
      statePath = resolve(file);
    } else {
      const path = resolveSpec(file);
      const spec = parse(path);
      const name = projectName(spec, path);
      statePath = resolve(dirname(path), `state_${name}.enth`);
    }
  } else {
    const path = resolveSpec(undefined);
    const spec = parse(path);
    const name = projectName(spec, path);
    statePath = resolve(dirname(path), `state_${name}.enth`);
  }

  if (!existsSync(statePath)) {
    console.error(`${chalk.red('✗')} No state file found. Run 'enthropic validate' first.`);
    process.exit(1);
  }
  process.stdout.write(readFileSync(statePath, 'utf-8'));
}

function cmdStateSet(key: string, status: string, file?: string): void {
  const specPath = resolveSpec(file);
  const spec = parse(specPath);
  const name = projectName(spec, specPath);
  const statePath = resolve(dirname(specPath), `state_${name}.enth`);

  if (!existsSync(statePath)) {
    console.error(`${chalk.red('✗')} State file not found: ${statePath}. Run 'enthropic validate' first.`);
    process.exit(1);
  }

  try {
    setStatus(statePath, key, status);
    console.log(`${chalk.green('✓')} ${key} → ${status.toUpperCase()}`);
  } catch (e) {
    console.error(`${chalk.red('✗')} ${String(e)}`);
    process.exit(1);
  }
}

function cmdVaultSet(key: string, value: string, file?: string): void {
  const [project, directory, secretNames] = vaultProject(file);
  try {
    setSecret(project, key, value, directory, secretNames);
    console.log(`${chalk.green('✓')} ${key} → SET in vault_${project}.enth`);
  } catch (e) {
    console.error(`${chalk.red('✗')} ${String(e)}`);
    process.exit(1);
  }
}

function cmdVaultDelete(key: string, file?: string): void {
  const [project, directory, secretNames] = vaultProject(file);
  try {
    deleteSecret(project, key, directory, secretNames);
    console.log(`${chalk.green('✓')} ${key} → UNSET`);
  } catch (e) {
    console.error(`${chalk.red('✗')} ${String(e)}`);
    process.exit(1);
  }
}

function cmdVaultKeys(file?: string): void {
  const [project] = vaultProject(file);
  try {
    const keys = listKeys(project);
    if (keys.length === 0) {
      console.log(chalk.dim('No secrets set yet.'));
    } else {
      for (const k of keys) {
        console.log(`  ${chalk.cyan(k)}  ${chalk.green('SET')}`);
      }
    }
  } catch (e) {
    console.error(`${chalk.red('✗')} ${String(e)}`);
    process.exit(1);
  }
}

function cmdVaultExport(out?: string, file?: string): void {
  const [project] = vaultProject(file);
  try {
    const result = exportEnv(project);
    if (out) {
      writeFileSync(out, result);
      console.log(`${chalk.green('✓')} Exported to ${out}`);
    } else {
      console.log(result);
    }
  } catch (e) {
    console.error(`${chalk.red('✗')} ${String(e)}`);
    process.exit(1);
  }
}

function printHelp(): void {
  const pk = tui.pink;
  const dim = tui.dimmed;
  const bold = tui.boldWhite;
  console.log(`  ${bold('Commands')}`);
  console.log();
  console.log(`    ${pk('setup     ')}    ${dim('Configure AI provider and API key')}`);
  console.log(`    ${pk('new       ')}    ${dim('Quick wizard to scaffold a new .enth file')}`);
  console.log(`    ${pk('build     ')}    ${dim('AI spec consultant — design your .enth through conversation')}`);
  console.log(`    ${pk('validate  ')}    ${dim('Validate an .enth file against the spec rules')}`);
  console.log(`    ${pk('context   ')}    ${dim('Generate AI context block from a spec')}`);
  console.log(`    ${pk('state     ')}    ${dim('Manage project build state (show / set)')}`);
  console.log(`    ${pk('vault     ')}    ${dim('Manage encrypted project secrets (set / keys / export)')}`);
  console.log(`    ${pk('serve     ')}    ${dim('MCP server (stdio) — integrates with Claude Desktop, Cursor, Docker')}`);
  console.log();
  console.log(`  ${bold('Quick start')}`);
  console.log();
  console.log(`    ${pk('enthropic setup')}  →  ${pk('enthropic build')}  →  ${dim('get your .enth')}`);
  console.log();
}

async function navigationLoop(commandFn: () => Promise<void> | void): Promise<void> {
  await commandFn();

  while (true) {
    console.log();
    const choice = await select({
      message: 'What next?',
      choices: [
        { name: 'Run another command', value: 0 },
        { name: 'Exit', value: 1 },
      ],
    });

    if (choice === 1) {
      process.exit(0);
    }

    // Re-print help and wait for a new invocation note
    console.log();
    printHelp();
    tui.printDim('  Run  enthropic <command>  to continue.');
    console.log();
    process.exit(0);
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('enthropic')
    .description('Enthropic — toolkit for the .enth architectural specification format.')
    .helpOption('-h, --help', 'Show help')
    .addHelpCommand(false);

  program
    .command('validate [file]')
    .description('Validate an .enth file against the Enthropic specification rules')
    .action(async (file?: string) => {
      tui.printHeader();
      await navigationLoop(() => cmdValidate(file));
    });

  program
    .command('context [file]')
    .description('Generate the context block to paste as AI system prompt')
    .option('-o, --out <file>', 'Write output to file')
    .action(async (file?: string, opts?: { out?: string }) => {
      tui.printHeader();
      await navigationLoop(() => cmdContext(file, opts?.out));
    });

  program
    .command('state')
    .description('Manage project build state')
    .addCommand(
      new Command('show')
        .argument('[file]', 'State file or spec file')
        .description('Show the current build state')
        .action(async (file?: string) => {
          tui.printHeader();
          await navigationLoop(() => cmdStateShow(file));
        }),
    )
    .addCommand(
      new Command('set')
        .argument('<key>', 'Key to update')
        .argument('<status>', 'New status')
        .argument('[file]', '.enth spec file')
        .description('Update a single entry status in the state file')
        .action(async (key: string, status: string, file?: string) => {
          tui.printHeader();
          await navigationLoop(() => cmdStateSet(key, status, file));
        }),
    );

  program
    .command('vault')
    .description('Manage project secrets (encrypted vault)')
    .addCommand(
      new Command('set')
        .argument('<key>', 'Secret key name')
        .argument('<value>', 'Secret value')
        .argument('[file]', '.enth spec file')
        .description('Store a secret in the encrypted vault')
        .action(async (key: string, value: string, file?: string) => {
          tui.printHeader();
          await navigationLoop(() => cmdVaultSet(key, value, file));
        }),
    )
    .addCommand(
      new Command('delete')
        .argument('<key>', 'Secret key to remove')
        .argument('[file]', '.enth spec file')
        .description('Remove a secret from the vault')
        .action(async (key: string, file?: string) => {
          tui.printHeader();
          await navigationLoop(() => cmdVaultDelete(key, file));
        }),
    )
    .addCommand(
      new Command('keys')
        .argument('[file]', '.enth spec file')
        .description('List all key names in the vault')
        .action(async (file?: string) => {
          tui.printHeader();
          await navigationLoop(() => cmdVaultKeys(file));
        }),
    )
    .addCommand(
      new Command('export')
        .argument('[file]', '.enth spec file')
        .option('-o, --out <file>', 'Write to .env file')
        .description('Export vault contents as .env (decrypted)')
        .action(async (file?: string, opts?: { out?: string }) => {
          tui.printHeader();
          await navigationLoop(() => cmdVaultExport(opts?.out, file));
        }),
    );

  program
    .command('setup')
    .description('Configure your AI provider and API key')
    .action(async () => {
      await navigationLoop(() => setupRun());
    });

  program
    .command('new')
    .description('Create a new Enthropic project interactively')
    .action(async () => {
      await navigationLoop(() => newWizardRun());
    });

  program
    .command('build [file]')
    .description('Start an interactive AI build session for this project')
    .action(async (file?: string) => {
      await navigationLoop(() => buildRun(file));
    });

  program
    .command('serve')
    .description('Start MCP server (stdio) — use with Claude Desktop, Cursor, or Docker')
    .action(() => {
      // serve exits directly — no navigation loop
      serve();
    });

  // Default: no command → print help
  if (process.argv.length <= 2) {
    tui.printHeader();
    printHelp();
    process.exit(0);
  }

  await program.parseAsync(process.argv);
}

main().catch(e => {
  console.error(`${chalk.red('✗')} ${String(e)}`);
  process.exit(1);
});
