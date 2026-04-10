# OpenRouter Gemma CLI

A lightweight, **Termux-optimised** AI chat CLI built on [OpenRouter](https://openrouter.ai).  
This package lives inside the [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) fork but is **fully standalone** — it has no dependency on `@google/genai` or any Google SDK.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/The-JDdev/gemini-cli.git
cd gemini-cli/packages/openrouter-cli

# 2. Build
npm install && npm run build

# 3. Link globally
npm link

# 4. Set your API key (free at openrouter.ai/keys)
export OPENROUTER_API_KEY="sk-or-..."

# 5. Chat
gemma
```

## Default Model
`google/gemma-4-31b-it:free` — completely free, no billing required.

## Switch Models

```bash
gemma --model anthropic/claude-3-haiku
gemma --model meta-llama/llama-3-8b-instruct:free
gemma --list-models   # see all free models
```

## One-Shot

```bash
gemma -m "What is quantum computing?"
echo "Review my code" | gemma --file mycode.py
```

## Termux Setup

See [TERMUX_SETUP.md](./TERMUX_SETUP.md) for the full step-by-step Android/Termux guide.

## Features

- **Streaming responses** — see the AI type in real time
- **Persistent conversation history** — multi-turn chat with full context
- **Termux-safe paths** — uses `$TMPDIR`, never `/tmp` or hardcoded Android paths
- **Auto-cleanup** — temp files deleted immediately after use (`try...finally`)
- **Dynamic model switching** — `--model` flag or `/model` command inside REPL
- **Pipe/stdin support** — `echo "question" | gemma`
- **File prompts** — `gemma --file prompt.txt`
- **System prompts** — `gemma --system "You are a Kotlin expert"`
- **Token tracking** — `/tokens` shows usage

## Architecture

```
src/
├── index.ts        CLI entry point — argument parsing, REPL, one-shot mode
├── openrouter.ts   OpenRouter API client (streaming + non-streaming)
├── history.ts      Conversation history management
└── tempFiles.ts    Termux-safe temp file utility
```

## License

Apache-2.0 (same as the upstream gemini-cli)
