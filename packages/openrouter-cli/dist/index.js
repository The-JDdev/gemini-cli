#!/usr/bin/env node
/**
 * OpenRouter Gemma CLI — pre-built bundle
 * No compilation needed — works directly in Termux after: npm install
 *
 * @license Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import process from 'node:process';

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────── */
const VERSION = '1.0.0';
const DEFAULT_MODEL = 'google/gemma-4-31b-it:free';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_HISTORY = 100;

const BANNER = `
╔══════════════════════════════════════════════════╗
║   OpenRouter Gemma CLI  v${VERSION}                   ║
║   Model: google/gemma-4-31b-it:free (default)    ║
║   Type /help for commands, /exit to quit         ║
╚══════════════════════════════════════════════════╝
`;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function c(text, ...codes) {
  if (process.env.NO_COLOR || process.env.TERM === 'dumb') return text;
  return codes.join('') + text + C.reset;
}

/* ─────────────────────────────────────────────────────────────
   TERMUX-SAFE TEMP FILE UTILITIES
   Never uses /tmp — respects process.env.TMPDIR
   All writes wrapped in try…finally for guaranteed cleanup
───────────────────────────────────────────────────────────── */
function getTempDir() {
  if (process.env.TMPDIR) {
    try { fs.mkdirSync(process.env.TMPDIR, { recursive: true }); return process.env.TMPDIR; } catch {}
  }
  const fallback = path.resolve(process.cwd(), '.temp_cli');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function tempFilePath(suffix = '.tmp') {
  return path.resolve(getTempDir(), `or_${crypto.randomBytes(8).toString('hex')}${suffix}`);
}

async function withTempFile(content, suffix, callback) {
  const fp = tempFilePath(suffix);
  fs.writeFileSync(fp, content, 'utf8');
  try {
    return await callback(fp);
  } finally {
    try { fs.unlinkSync(fp); } catch {}
  }
}

function cleanupTempDir() {
  const fallback = path.resolve(process.cwd(), '.temp_cli');
  try {
    if (fs.existsSync(fallback)) fs.rmSync(fallback, { recursive: true, force: true });
  } catch {}
}

/* ─────────────────────────────────────────────────────────────
   OPENROUTER API CLIENT
   Endpoint: https://openrouter.ai/api/v1/chat/completions
   Auth:     OPENROUTER_API_KEY env var (OpenAI format)
───────────────────────────────────────────────────────────── */
function getApiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !key.trim()) {
    throw new Error(
      '\n[OpenRouter CLI] Missing API key.\n' +
      'Export your key before running:\n' +
      '  export OPENROUTER_API_KEY="sk-or-..."\n' +
      'Get a free key at: https://openrouter.ai/keys\n',
    );
  }
  return key.trim();
}

const FETCH_HEADERS = (apiKey) => ({
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://github.com/The-JDdev/gemini-cli',
  'X-Title': 'OpenRouter Gemma CLI (Termux)',
});

async function chatCompletion(messages, opts = {}) {
  const apiKey = getApiKey();
  const model = opts.model || DEFAULT_MODEL;
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: FETCH_HEADERS(apiKey),
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      stream: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter API error ${res.status}: ${t}`);
  }
  const json = await res.json();
  return {
    content: json.choices?.[0]?.message?.content ?? '',
    model: json.model ?? model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function chatCompletionStream(messages, opts = {}, onChunk) {
  const apiKey = getApiKey();
  const model = opts.model || DEFAULT_MODEL;
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: FETCH_HEADERS(apiKey),
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter API error ${res.status}: ${t}`);
  }
  if (!res.body) throw new Error('No response body from OpenRouter stream');

  let fullContent = '';
  let responseModel = model;
  let promptTokens = 0;
  let completionTokens = 0;
  let buffer = '';
  const decoder = new TextDecoder();

  for await (const rawChunk of res.body) {
    buffer += decoder.decode(rawChunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.model) responseModel = parsed.model;
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens;
          completionTokens = parsed.usage.completion_tokens;
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) { fullContent += delta; onChunk(delta); }
      } catch {}
    }
  }
  return { content: fullContent, model: responseModel, promptTokens, completionTokens };
}

async function listFreeModels() {
  const apiKey = getApiKey();
  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? [])
    .filter(m => m.pricing?.prompt === '0')
    .map(m => m.id)
    .sort();
}

/* ─────────────────────────────────────────────────────────────
   CONVERSATION HISTORY
───────────────────────────────────────────────────────────── */
class ConversationHistory {
  constructor(systemPrompt) {
    this.messages = [];
    this.systemPrompt = systemPrompt ?? null;
    this._totalPrompt = 0;
    this._totalCompletion = 0;
  }

  addUser(content) {
    this.messages.push({ role: 'user', content });
    if (this.messages.length > MAX_HISTORY) this.messages = this.messages.slice(-MAX_HISTORY);
  }

  addAssistant(content) { this.messages.push({ role: 'assistant', content }); }

  addUsage(promptTokens, completionTokens) {
    this._totalPrompt += promptTokens;
    this._totalCompletion += completionTokens;
  }

  toApiMessages() {
    const all = [];
    if (this.systemPrompt) all.push({ role: 'system', content: this.systemPrompt });
    all.push(...this.messages);
    return all;
  }

  get turnCount() { return this.messages.filter(m => m.role === 'user').length; }
  clear() { this.messages = []; }

  tokenSummary() {
    return `Prompt: ${this._totalPrompt}, Completion: ${this._totalCompletion}, Total: ${this._totalPrompt + this._totalCompletion}`;
  }

  defaultHistoryPath() {
    const base = process.env.TMPDIR
      ? path.resolve(process.env.TMPDIR, '..', 'home')
      : process.cwd();
    return path.resolve(base, '.openrouter_history.json');
  }

  save(filePath) {
    const target = filePath ?? this.defaultHistoryPath();
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify({ systemPrompt: this.systemPrompt, messages: this.messages }, null, 2), 'utf8');
    } catch (e) { console.error('[History] Save failed:', e); }
  }

  load(filePath) {
    const target = filePath ?? this.defaultHistoryPath();
    try {
      const data = JSON.parse(fs.readFileSync(target, 'utf8'));
      this.systemPrompt = data.systemPrompt ?? this.systemPrompt;
      this.messages = data.messages ?? [];
      return true;
    } catch { return false; }
  }
}

/* ─────────────────────────────────────────────────────────────
   ARGUMENT PARSING
───────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const args = {
    model: DEFAULT_MODEL, message: null, systemPrompt: null,
    stream: true, saveHistory: false, loadHistory: false,
    historyFile: null, listModels: false, maxTokens: 4096,
    temperature: 0.7, file: null, version: false, help: false,
  };
  const raw = argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    switch (raw[i]) {
      case '--model': case '-M': args.model = raw[++i] ?? DEFAULT_MODEL; break;
      case '--message': case '-m': args.message = raw[++i] ?? null; break;
      case '--system': case '-s': args.systemPrompt = raw[++i] ?? null; break;
      case '--no-stream': args.stream = false; break;
      case '--save-history': args.saveHistory = true; break;
      case '--load-history': args.loadHistory = true; break;
      case '--history-file': args.historyFile = raw[++i] ?? null; break;
      case '--list-models': case '-l': args.listModels = true; break;
      case '--max-tokens': args.maxTokens = parseInt(raw[++i] ?? '4096', 10); break;
      case '--temperature': case '-t': args.temperature = parseFloat(raw[++i] ?? '0.7'); break;
      case '--file': case '-f': args.file = raw[++i] ?? null; break;
      case '--version': case '-v': args.version = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (raw[i] && !raw[i].startsWith('-') && !args.message) args.message = raw[i];
    }
  }
  return args;
}

/* ─────────────────────────────────────────────────────────────
   HELP TEXT
───────────────────────────────────────────────────────────── */
function printHelp() {
  console.log(`
${c('OpenRouter Gemma CLI', C.bold, C.cyan)} — AI chat via OpenRouter (OpenAI format)

${c('USAGE', C.bold)}
  gemma                            Interactive REPL
  gemma -m "question"              One-shot
  echo "question" | gemma          Pipe mode
  gemma --file prompt.txt          Prompt from file

${c('FLAGS', C.bold)}
  --model, -M  <id>      Model ID  (default: ${DEFAULT_MODEL})
  --message, -m <text>   One-shot prompt
  --system, -s <text>    System prompt
  --file, -f <path>      Read prompt from file
  --no-stream            Disable streaming
  --max-tokens <n>       Max tokens to generate (default: 4096)
  --temperature, -t <f>  Creativity 0.0–2.0 (default: 0.7)
  --save-history         Auto-save on exit
  --load-history         Load last saved session
  --history-file <path>  Custom history file
  --list-models, -l      List all free OpenRouter models
  --no-color             Disable ANSI colors
  --version, -v          Version
  --help, -h             This help

${c('INTERACTIVE COMMANDS', C.bold)}
  /help  /exit  /quit  /clear  /model <id>
  /system <text>  /models  /save [path]  /load [path]  /tokens

${c('ENVIRONMENT', C.bold)}
  OPENROUTER_API_KEY     Required
  TMPDIR                 Auto-set by Termux

${c('SWITCH MODELS', C.bold)}
  gemma --model anthropic/claude-3-haiku
  gemma --model meta-llama/llama-3-8b-instruct:free
  gemma --model mistralai/mistral-7b-instruct:free
  gemma --list-models

${c('TERMUX SETUP', C.bold)}
  See TERMUX_SETUP.md for full Android setup guide.
`);
}

/* ─────────────────────────────────────────────────────────────
   ONE-SHOT MODE
───────────────────────────────────────────────────────────── */
async function runOneShot(prompt, args, history) {
  history.addUser(prompt);
  const messages = history.toApiMessages();
  const opts = { model: args.model, maxTokens: args.maxTokens, temperature: args.temperature };
  try {
    if (args.stream) {
      const result = await chatCompletionStream(messages, opts, d => process.stdout.write(d));
      process.stdout.write('\n');
      history.addAssistant(result.content);
      history.addUsage(result.promptTokens, result.completionTokens);
    } else {
      const result = await chatCompletion(messages, opts);
      console.log(result.content);
      history.addAssistant(result.content);
      history.addUsage(result.promptTokens, result.completionTokens);
    }
  } catch (e) {
    console.error(c('\nError: ' + String(e), C.red));
    process.exit(1);
  }
}

/* ─────────────────────────────────────────────────────────────
   STDIN READER (PIPE MODE)
───────────────────────────────────────────────────────────── */
async function readStdin() {
  if (process.stdin.isTTY) return null;
  return new Promise(resolve => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => chunks.push(d));
    process.stdin.on('end', () => resolve(chunks.join('').trim() || null));
    process.stdin.on('error', () => resolve(null));
  });
}

/* ─────────────────────────────────────────────────────────────
   INTERACTIVE REPL
───────────────────────────────────────────────────────────── */
async function runInteractive(args, history) {
  let currentModel = args.model;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c('You › ', C.green, C.bold),
    historySize: 200,
    terminal: true,
  });

  console.log(BANNER);
  console.log(c(`Model: ${currentModel}`, C.dim));
  if (args.systemPrompt) console.log(c(`System: ${args.systemPrompt.slice(0, 70)}`, C.dim));
  console.log();
  rl.prompt();

  rl.on('line', async input => {
    const line = input.trim();
    if (!line) { rl.prompt(); return; }

    if (line.startsWith('/')) {
      const [cmd, ...rest] = line.slice(1).split(' ');
      const val = rest.join(' ').trim();
      switch (cmd?.toLowerCase()) {
        case 'help': printHelp(); break;
        case 'exit': case 'quit':
          console.log(c('\nGoodbye!\n', C.cyan));
          if (args.saveHistory) history.save(args.historyFile ?? undefined);
          cleanupTempDir(); process.exit(0); break;
        case 'clear': history.clear(); console.log(c('History cleared.', C.yellow)); break;
        case 'model':
          if (val) { currentModel = val; console.log(c(`Model: ${currentModel}`, C.cyan)); }
          else console.log(c(`Current model: ${currentModel}`, C.cyan));
          break;
        case 'system':
          if (val) { history.systemPrompt = val; console.log(c('System prompt updated.', C.yellow)); }
          break;
        case 'models':
          process.stdout.write(c('Fetching free models...\n', C.dim));
          try {
            const models = await listFreeModels();
            console.log(c(`\nFree models (${models.length}):\n`, C.bold));
            for (const m of models) console.log(`  ${c('•', C.green)} ${m}`);
            console.log();
          } catch (e) { console.error(c(String(e), C.red)); }
          break;
        case 'save':
          history.save(val || args.historyFile || undefined);
          console.log(c('History saved.', C.green)); break;
        case 'load':
          history.load(val || args.historyFile || undefined);
          console.log(c('History loaded.', C.green)); break;
        case 'tokens':
          console.log(c(history.tokenSummary(), C.dim)); break;
        default:
          console.log(c(`Unknown: /${cmd}. Type /help`, C.yellow));
      }
      rl.prompt(); return;
    }

    history.addUser(line);
    const messages = history.toApiMessages();
    const opts = { model: currentModel, maxTokens: args.maxTokens, temperature: args.temperature };
    process.stdout.write('\n' + c('AI › ', C.cyan, C.bold));

    try {
      if (args.stream) {
        const result = await chatCompletionStream(messages, opts, d => process.stdout.write(d));
        process.stdout.write('\n\n');
        history.addAssistant(result.content);
        history.addUsage(result.promptTokens, result.completionTokens);
        if (result.model !== currentModel)
          process.stdout.write(c(`[served by ${result.model}]\n`, C.dim));
      } else {
        process.stdout.write(c('(thinking...)', C.dim));
        const result = await chatCompletion(messages, opts);
        process.stdout.clearLine?.(0);
        process.stdout.cursorTo?.(0);
        process.stdout.write(c('AI › ', C.cyan, C.bold));
        console.log(result.content + '\n');
        history.addAssistant(result.content);
        history.addUsage(result.promptTokens, result.completionTokens);
      }
    } catch (e) {
      process.stdout.write('\n');
      console.error(c('Error: ' + String(e), C.red));
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(c('\nGoodbye!\n', C.cyan));
    if (args.saveHistory) history.save(args.historyFile ?? undefined);
    cleanupTempDir(); process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log(c('\n\n(Use /exit to quit, or Ctrl+D)\n', C.yellow));
    rl.prompt();
  });
}

/* ─────────────────────────────────────────────────────────────
   MAIN
───────────────────────────────────────────────────────────── */
async function main() {
  process.on('exit', cleanupTempDir);
  process.on('SIGTERM', () => { cleanupTempDir(); process.exit(0); });

  const args = parseArgs(process.argv);

  if (args.version) { console.log(`openrouter-cli v${VERSION}`); return; }
  if (args.help) { printHelp(); return; }

  if (args.listModels) {
    process.stdout.write(c('Fetching free models from OpenRouter...\n', C.dim));
    try {
      const models = await listFreeModels();
      if (!models.length) { console.log('No free models found.'); return; }
      console.log(c(`\nFree models on OpenRouter (${models.length}):\n`, C.bold));
      for (const m of models) console.log(`  ${c('•', C.green)} ${m}`);
      console.log(`\n${c('Tip:', C.yellow)} gemma --model ${models[0] ?? DEFAULT_MODEL}\n`);
    } catch (e) { console.error(c('Error: ' + String(e), C.red)); }
    return;
  }

  const history = new ConversationHistory(args.systemPrompt ?? undefined);
  if (args.loadHistory) history.load(args.historyFile ?? undefined);

  let prompt = args.message;

  if (!prompt && args.file) {
    try {
      prompt = fs.readFileSync(path.resolve(args.file), 'utf8').trim();
    } catch (e) {
      console.error(c(`Cannot read file: ${args.file}\n${e}`, C.red));
      process.exit(1);
    }
  }

  if (!prompt) prompt = await readStdin();

  if (prompt) {
    await runOneShot(prompt, args, history);
    if (args.saveHistory) history.save(args.historyFile ?? undefined);
    cleanupTempDir(); return;
  }

  await runInteractive(args, history);
}

main().catch(e => {
  console.error(c('\nFatal: ' + String(e), C.red));
  cleanupTempDir(); process.exit(1);
});
