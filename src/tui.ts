import chalk from 'chalk';
import { confirm as inquirerConfirm, input as inquirerInput, password as inquirerPassword, select as inquirerSelect } from '@inquirer/prompts';

const LOGO = `              __  __                     _     
  ___  ____  / /_/ /_  _________  ____  (_)____
 / _ \\/ __ \\/ __/ __ \\/ ___/ __ \\/ __ \\/ / ___/
/  __/ / / / /_/ / / / /  / /_/ / /_/ / / /__  
\\___/_/ /_/\\__/_/ /_/_/   \\____/ .___/_/\\___/  
                              /_/              `;

const SEPARATOR = '──────────────────────────────────────────────────────────────';

export function pink(text: string): string {
  return chalk.ansi256(219)(text);
}

export function dimmed(text: string): string {
  return chalk.dim(text);
}

export function boldWhite(text: string): string {
  return chalk.bold.white(text);
}

export function successGreen(text: string): string {
  return chalk.green(text);
}

export function errorRed(text: string): string {
  return chalk.red(text);
}

export function printHeader(): void {
  console.log(pink(LOGO));
  console.log(pink(SEPARATOR));
  console.log();
}

export function printSuccess(msg: string): void {
  console.log(`${chalk.green('✓')} ${msg}`);
}

export function printError(msg: string): void {
  console.error(`${chalk.red('✗')} ${msg}`);
}

export function printDim(msg: string): void {
  console.log(chalk.dim(msg));
}

export async function confirm(prompt: string): Promise<boolean> {
  return inquirerConfirm({ message: prompt });
}

export async function input(prompt: string): Promise<string> {
  return inquirerInput({ message: prompt });
}

export async function inputWithDefault(prompt: string, defaultValue: string): Promise<string> {
  return inquirerInput({ message: prompt, default: defaultValue });
}

export async function password(prompt: string): Promise<string> {
  return inquirerPassword({ message: prompt, mask: '*' });
}

export async function select(prompt: string, items: string[]): Promise<number> {
  const choices = items.map((name, value) => ({ name, value }));
  return inquirerSelect({ message: prompt, choices });
}
