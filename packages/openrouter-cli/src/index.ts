#!/usr/bin/env node
/**
 * OpenRouter Gemma CLI
 * ---------------------
 * A lightweight, Termux-optimised AI chat CLI powered by OpenRouter.
 * Default model: google/gemma-4-31b-it:free
 *
 * Usage:
 *   gemma                              # interactive REPL
 *   gemma -m "Tell me a joke"          # one-shot prompt
 *   echo "What is 2+2?" | gemma        # pipe stdin
 *   gemma --model anthropic/claude-3-opus
 *   gemma --list-models
 */

import readline from 'node:readline';
import process from 'node:process';
import { cleanupTempDir } from './tempFiles.js';
import {
  chatCompletionStream,
  chatCompletion,
  listFreeModels,
  DEFAULT_MODEL,
  type Message,
} from './openrouter.js';
import { ConversationHistory } from './history.js';

const VERSION = '1.0.0';

const BANNER = `
╔══════════════════════════════════════════════════╗
║   OpenRouter Gemma CLI  v${VERSION}                   ║
║   Model: google/gemma-4-31b-it:free (default)    ║
║   Type /help for commands, /exit to quit         ║
╚══════════════════════════════════════════════════╝
`;

interface CliArgs {
  model: string;
  message: string | null;
  systemPrompt: string | null;
  stream: boolean;
  saveHistory: boolean;
  loadHistory: boolean;
  historyFile: string | null;
  listModels: boolean;
  noColor: boolean;
  maxTokens: number;
  temperature: number;
  version: boolean;
  help: boolean;
  file: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    model: DEFAULT_MODEL,
    message: null,
    systemPrompt: null,
    stream: true,
    saveHistory: false,
    loadHistory: false,
    historyFile: null,
    listModels: false,
    noColor: false,
    maxTokens: 4096,
    temperature: 0.7,
    version: false,
    help: false,
    file: null,
  };

  const raw = argv.slice(2);
  let i = 0;
  while (i < raw.length) {
    const flag = raw[i];
    switch (flag) {
      case '--model':
      case '-M':
        args.model = raw[++i] ?? DEFAULT_MODEL;
        break;
      case '--message':
      case '-m':
        args.message = raw[++i] ?? null;
        break;
      case '--system':
      case '-s':
        args.systemPrompt = raw[++i] ?? null;
        break;
      case '--no-stream':
        args.stream = false;
        break;
      case '--save-history':
        args.saveHistory = true;
        break;
      case '--load-history':
        args.loadHistory = true;
        break;
      case '--history-file':
        args.historyFile = raw[++i] ?? null;
        break;
      case '--list-models':
      case '-l':
        args.listModels = true;
        break;
      case '--no-color':
        args.noColor = true;
        break;
      case '--max-tokens':
        args.maxTokens = parseInt(raw[++i] ?? '4096', 10);
        break;
      case '--temperature':
      case '-t':
        args.temperature = parseFloat(raw[++i] ?? '0.7');
        break;
      case '--file':
      case '-f':
        args.file = raw[++i] ?? null;
        break;
      case '--version':
      case '-v':
        args.version = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (flag && !flag.startsWith('-') && !args.message) {
          args.message = flag;
        }
        break;
    }
    i++;
  }
  return args;
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[97m',
};

function color(text: string, ...codes: string[]): string {
  if (process.env.NO_COLOR || process.env.TERM === 'dumb') return text;
  return codes.join('') + text + COLORS.reset;
}

function printHelp(): void {
  console.log(`
${color('OpenRouter Gemma CLI', COLORS.bold, COLORS.cyan)} — AI chat powered by OpenRouter

${color('USAGE', COLORS.bold)}
  gemma                            Start interactive REPL
  gemma -m "your question"         One-shot, print answer and exit
  echo "question" | gemma          Pipe mode — reads from stdin
  gemma --file path/to/prompt.txt  Load prompt from file

${color('FLAGS', COLORS.bold)}
  --model, -M  <id>      Override model (default: ${DEFAULT_MODEL})
  --message, -m <text>   One-shot prompt text
  --system, -s <text>    Set system prompt
  --file, -f <path>      Read prompt from file
  --no-stream            Disable streaming (wait for full response)
  --max-tokens <n>       Max tokens to generate (default: 4096)
  --temperature, -t <f>  Sampling temperature (default: 0.7)
  --save-history         Save conversation on exit
  --load-history         Load saved conversation on start
  --history-file <path>  Custom history file path
  --list-models, -l      List all free OpenRouter models and exit
  --no-color             Disable ANSI colors
  --version, -v          Print version and exit
  --help, -h             Show this help

${color('INTERACTIVE COMMANDS', COLORS.bold)}
  /help                  Show this help
  /clear                 Clear conversation history
  /model <id>            Switch model mid-session
  /system <text>         Set/update system prompt
  /models                List free models
  /save [path]           Save conversation history
  /load [path]           Load conversation history
  /tokens                Show token usage
  /exit or /quit         Exit

${color('ENVIRONMENT', COLORS.bold)}
  OPENROUTER_API_KEY     Required — your OpenRouter API key
  NO_COLOR               Disable colors (also respects TERM=dumb)
  TMPDIR                 Temp dir (auto-set by Termux)

${color('EXAMPLES', COLORS.bold)}
  export OPENROUTER_API_KEY="sk-or-..."
  gemma                                        # interactive
  gemma -m "Explain quantum entanglement"      # one-shot
  gemma --model anthropic/claude-3-haiku       # different model
  gemma --model meta-llama/llama-3-8b-instruct:free
  cat mycode.py | gemma -m "Review this code"
`);
}

function printVersion(): void {
  console.log(`openrouter-cli v${VERSION}`);
}

async function handleListModels(): Promise<void> {
  process.stdout.write(color('Fetching free models from OpenRouter...\n', COLORS.dim));
  try {
    const models = await listFreeModels();
    if (models.length === 0) {
      console.log('No free models found (or API key error).');
      return;
    }
    console.log(color(`\nFree models on OpenRouter (${models.length}):\n`, COLORS.bold));
    for (const m of models) {
      console.log(`  ${color('•', COLORS.green)} ${m}`);
    }
    console.log(`\n${color('Tip:', COLORS.yellow)} Use with --model flag:`);
    console.log(`  gemma --model ${models[0] ?? DEFAULT_MODEL}\n`);
  } catch (e) {
    console.error(color('Error: ' + String(e), COLORS.red));
  }
}

async function runOneShot(
  prompt: string,
  args: CliArgs,
  history: ConversationHistory,
): Promise<void> {
  history.addUser(prompt);
  const messages = history.toApiMessages();
  const opts = { model: args.model, maxTokens: args.maxTokens, temperature: args.temperature };

  try {
    if (args.stream) {
      const result = await chatCompletionStream(messages, opts, (delta) => {
        process.stdout.write(delta);
      });
      process.stdout.write('\n');
      history.addAssistant(result.content);
    } else {
      const result = await chatCompletion(messages, opts);
      console.log(result.content);
      history.addAssistant(result.content);
    }
  } catch (e) {
    console.error(color('\nError: ' + String(e), COLORS.red));
    process.exit(1);
  }
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  return new Promise((resolve) => {
    const chunks: string[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('').trim() || null));
    process.stdin.on('error', () => resolve(null));
    setTimeout(() => resolve(null), 100);
  });
}

async function runInteractive(args: CliArgs, history: ConversationHistory): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: color('You › ', COLORS.green, COLORS.bold),
    historySize: 200,
    terminal: true,
  });

  let currentModel = args.model;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  console.log(BANNER);
  console.log(color(`Model: ${currentModel}`, COLORS.dim));
  if (args.systemPrompt) {
    console.log(color(`System: ${args.systemPrompt.slice(0, 60)}...`, COLORS.dim));
  }
  console.log();

  rl.prompt();

  rl.on('line', async (input) => {
    const line = input.trim();
    if (!line) { rl.prompt(); return; }

    if (line.startsWith('/')) {
      const [cmd, ...rest] = line.slice(1).split(' ');
      const value = rest.join(' ').trim();

      switch (cmd?.toLowerCase()) {
        case 'help':
          printHelp();
          break;
        case 'exit':
        case 'quit':
          console.log(color('\nGoodbye!\n', COLORS.cyan));
          if (args.saveHistory) history.save(args.historyFile ?? undefined);
          cleanupTempDir();
          process.exit(0);
          break;
        case 'clear':
          history.clear();
          console.log(color('History cleared.', COLORS.yellow));
          break;
        case 'model':
          if (value) {
            currentModel = value;
            console.log(color(`Model switched to: ${currentModel}`, COLORS.cyan));
          } else {
            console.log(color(`Current model: ${currentModel}`, COLORS.cyan));
          }
          break;
        case 'system':
          if (value) {
            console.log(color('System prompt updated.', COLORS.yellow));
          }
          break;
        case 'models':
          await handleListModels();
          break;
        case 'save':
          history.save(value || args.historyFile || undefined);
          console.log(color('History saved.', COLORS.green));
          break;
        case 'load':
          history.load(value || args.historyFile || undefined);
          console.log(color('History loaded.', COLORS.green));
          break;
        case 'tokens':
          console.log(
            color(
              `Tokens used — Prompt: ${totalPromptTokens}, Completion: ${totalCompletionTokens}, Total: ${totalPromptTokens + totalCompletionTokens}`,
              COLORS.dim,
            ),
          );
          break;
        default:
          console.log(color(`Unknown command: /${cmd}. Type /help for commands.`, COLORS.yellow));
      }
      rl.prompt();
      return;
    }

    history.addUser(line);
    const messages: Message[] = history.toApiMessages();
    const opts = { model: currentModel, maxTokens: args.maxTokens, temperature: args.temperature };

    process.stdout.write('\n' + color('AI › ', COLORS.cyan, COLORS.bold));

    try {
      if (args.stream) {
        const result = await chatCompletionStream(messages, opts, (delta) => {
          process.stdout.write(delta);
        });
        process.stdout.write('\n\n');
        history.addAssistant(result.content);
        totalPromptTokens += result.promptTokens;
        totalCompletionTokens += result.completionTokens;

        if (result.model !== currentModel) {
          process.stdout.write(color(`[served by ${result.model}]\n`, COLORS.dim));
        }
      } else {
        process.stdout.write(color('(thinking...)', COLORS.dim));
        const result = await chatCompletion(messages, opts);
        process.stdout.clearLine?.(0);
        process.stdout.cursorTo?.(0);
        console.log(result.content);
        console.log();
        history.addAssistant(result.content);
        totalPromptTokens += result.promptTokens;
        totalCompletionTokens += result.completionTokens;
      }
    } catch (e) {
      process.stdout.write('\n');
      console.error(color('Error: ' + String(e), COLORS.red));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(color('\nGoodbye!\n', COLORS.cyan));
    if (args.saveHistory) history.save(args.historyFile ?? undefined);
    cleanupTempDir();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log(color('\n\n(Use /exit to quit, or Ctrl+D)\n', COLORS.yellow));
    rl.prompt();
  });
}

async function main(): Promise<void> {
  process.on('exit', cleanupTempDir);
  process.on('SIGTERM', () => { cleanupTempDir(); process.exit(0); });

  const args = parseArgs(process.argv);

  if (args.version) { printVersion(); return; }
  if (args.help) { printHelp(); return; }
  if (args.listModels) { await handleListModels(); return; }

  const history = new ConversationHistory(args.systemPrompt ?? undefined);
  if (args.loadHistory) history.load(args.historyFile ?? undefined);

  let prompt: string | null = args.message;

  if (!prompt && args.file) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      prompt = fs.readFileSync(path.resolve(args.file), 'utf8').trim();
    } catch (e) {
      console.error(color(`Cannot read file: ${args.file}\n${String(e)}`, COLORS.red));
      process.exit(1);
    }
  }

  if (!prompt) {
    prompt = await readStdin();
  }

  if (prompt) {
    await runOneShot(prompt, args, history);
    if (args.saveHistory) history.save(args.historyFile ?? undefined);
    cleanupTempDir();
    return;
  }

  await runInteractive(args, history);
}

main().catch((e) => {
  console.error(color('\nFatal: ' + String(e), COLORS.red));
  cleanupTempDir();
  process.exit(1);
});
