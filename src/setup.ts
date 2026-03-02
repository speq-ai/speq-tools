import * as globalConfig from './global_config.js';
import * as tui from './tui.js';

const PROVIDERS = ['anthropic', 'openai', 'openrouter'] as const;

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!resp.ok) return [];
    const json = await resp.json() as { data?: { id: string }[] };
    const models = (json.data ?? []).map(m => m.id).sort().reverse();
    return models;
  } catch {
    return [];
  }
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  try {
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return [];
    const json = await resp.json() as { data?: { id: string }[] };
    const models = (json.data ?? [])
      .map(m => m.id)
      .filter(id => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
      .sort()
      .reverse();
    return models;
  } catch {
    return [];
  }
}

async function fetchOpenRouterModels(): Promise<string[]> {
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'HTTP-Referer': 'https://github.com/Enthropic-spec/enthropic-tools' },
    });
    if (!resp.ok) return [];
    const json = await resp.json() as { data?: { id: string }[] };
    return (json.data ?? []).map(m => m.id).sort();
  } catch {
    return [];
  }
}

async function selectModel(provider: string, apiKey: string): Promise<string> {
  tui.printDim('  Fetching available models...');
  let models: string[] = [];
  if (provider === 'anthropic') models = await fetchAnthropicModels(apiKey);
  else if (provider === 'openai') models = await fetchOpenAIModels(apiKey);
  else if (provider === 'openrouter') models = await fetchOpenRouterModels();

  if (models.length === 0) {
    tui.printDim('  Could not fetch models. Enter model name manually.');
    return tui.input('Model name');
  }

  const idx = await tui.select('Default model', models);
  return models[idx];
}

export async function run(): Promise<void> {
  tui.printHeader();

  console.log('  Welcome to Enthropic.\n');
  console.log('  To use  enthropic build  you need an API key.');
  console.log('  Supported providers:  Anthropic · OpenAI · OpenRouter');
  console.log();

  const cfg = globalConfig.loadConfig();
  const hasKeys = globalConfig.hasAnyKey();

  if (hasKeys) {
    const providerStr = cfg.provider ?? 'none';
    const modelStr = cfg.model ?? 'none';
    console.log(`  Current config: provider=${tui.pink(providerStr)}, model=${tui.pink(modelStr)}`);
    console.log();
    const update = await tui.confirm('Update configuration?');
    if (!update) {
      tui.printDim('  No changes made.');
      return;
    }
    console.log();
  }

  const providerIdx = await tui.select('Select provider', [...PROVIDERS]);
  const provider = PROVIDERS[providerIdx];
  console.log();

  const apiKey = await tui.password(`API key for ${provider}`);
  console.log();

  const model = await selectModel(provider, apiKey);
  console.log();

  globalConfig.setApiKey(provider, apiKey);
  globalConfig.saveConfig({ provider, model });

  console.log();
  tui.printSuccess('Key stored encrypted in ~/.enthropic/global.keys');
  tui.printSuccess(`Config saved  provider=${provider}  model=${model}`);
  console.log();

  const createNow = await tui.confirm('Create a new project now?');
  if (createNow) {
    console.log();
    const { run: newWizardRun } = await import('./new_wizard.js');
    await newWizardRun();
  } else {
    tui.printDim('  Run  enthropic build  from any project folder to start.');
  }
}
