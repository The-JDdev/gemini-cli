# OpenRouter Gemma CLI — Termux Setup Guide

> **Zero-cost AI chat in Termux.**  
> Default model: `google/gemma-4-31b-it:free` (free tier, no billing needed).

---

## Prerequisites

Open Termux and run:

```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
node --version   # must be v18 or newer
```

If `node --version` shows v16 or below:

```bash
pkg install nodejs-lts -y
```

---

## Step 1 — Clone the Fork

```bash
git clone https://github.com/The-JDdev/gemini-cli.git
cd gemini-cli/packages/openrouter-cli
```

---

## Step 2 — Install Dependencies & Build

```bash
npm install
npm run build
```

This compiles TypeScript → `dist/`. You only need to do this once.

---

## Step 3 — Link Globally (run from anywhere)

```bash
npm link
```

Now you can type `gemma` from any directory.

> **Tip:** If `npm link` fails with permission errors, use:
> ```bash
> npm install -g .
> ```

---

## Step 4 — Get Your Free API Key

1. Go to **https://openrouter.ai/keys**
2. Sign up (free)
3. Click **"Create Key"**
4. Copy the key — it starts with `sk-or-`

---

## Step 5 — Export Your API Key

Add this to your `~/.bashrc` so it persists across sessions:

```bash
echo 'export OPENROUTER_API_KEY="sk-or-your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

Or export it just for the current session:

```bash
export OPENROUTER_API_KEY="sk-or-your-key-here"
```

---

## Step 6 — Run It

### Interactive Chat (REPL)

```bash
gemma
```

You'll see:

```
╔══════════════════════════════════════════════════╗
║   OpenRouter Gemma CLI  v1.0.0                   ║
║   Model: google/gemma-4-31b-it:free (default)    ║
║   Type /help for commands, /exit to quit         ║
╚══════════════════════════════════════════════════╝

You ›
```

Type your question and press Enter.

### One-Shot (Single Question)

```bash
gemma -m "What is machine learning?"
```

### Pipe Mode

```bash
echo "Explain recursion in 2 sentences" | gemma
cat mycode.py | gemma -m "Review this Python code"
```

### Load a Prompt from a File

```bash
gemma --file /sdcard/myprompt.txt
```

---

## Switching Models

### At Launch (Recommended)

```bash
gemma --model anthropic/claude-3-haiku
gemma --model meta-llama/llama-3-8b-instruct:free
gemma --model mistralai/mistral-7b-instruct:free
gemma --model google/gemma-2-9b-it:free
```

### Mid-Session (Inside REPL)

```
You › /model meta-llama/llama-3-8b-instruct:free
Model switched to: meta-llama/llama-3-8b-instruct:free
You ›
```

### List All Free Models

```bash
gemma --list-models
# or inside REPL:
You › /models
```

---

## All CLI Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--model <id>` | `-M` | Override the AI model |
| `--message <text>` | `-m` | One-shot prompt |
| `--system <text>` | `-s` | Set a system prompt |
| `--file <path>` | `-f` | Read prompt from file |
| `--no-stream` | | Wait for full response (no streaming) |
| `--max-tokens <n>` | | Max tokens (default: 4096) |
| `--temperature <f>` | `-t` | Creativity (0.0–2.0, default: 0.7) |
| `--save-history` | | Auto-save conversation on exit |
| `--load-history` | | Load last saved conversation |
| `--history-file <path>` | | Custom history file path |
| `--list-models` | `-l` | List all free OpenRouter models |
| `--no-color` | | Disable ANSI colors |
| `--version` | `-v` | Print version |
| `--help` | `-h` | Show help |

---

## Interactive Commands (Inside REPL)

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/exit` or `/quit` | Exit (also Ctrl+D) |
| `/clear` | Clear conversation history |
| `/model <id>` | Switch model |
| `/system <text>` | Set system prompt |
| `/models` | List free models |
| `/save [path]` | Save conversation |
| `/load [path]` | Load conversation |
| `/tokens` | Show token usage |

---

## Termux-Specific Notes

### Temp Files
The CLI never uses `/tmp`. It reads `$TMPDIR` (Termux sets this automatically to `/data/data/com.termux/files/usr/tmp`). All temp files are deleted immediately after use.

### Storage Paths
Always use `path.resolve()` internally. If you pass a path like `/sdcard/file.txt` via `--file`, it resolves correctly without hardcoding.

### Background Sessions
To keep a session running when you close Termux:

```bash
pkg install tmux -y
tmux new -s ai
gemma
# Detach with Ctrl+B, D
# Reattach later with: tmux attach -t ai
```

### Saving Conversations

```bash
gemma --save-history --history-file /sdcard/chat.json
# next session:
gemma --load-history --history-file /sdcard/chat.json
```

---

## Troubleshooting

### `gemma: command not found`
```bash
cd gemini-cli/packages/openrouter-cli
npm install -g .
```

### `Missing API key` error
```bash
echo $OPENROUTER_API_KEY   # should print your key
# if empty:
export OPENROUTER_API_KEY="sk-or-..."
```

### `fetch is not defined` (Node < 18)
```bash
pkg install nodejs-lts -y
node --version   # must be 18+
```

### Build errors
```bash
npm run clean
npm install
npm run build
```

### Rate limit / quota errors
Switch to a different free model:
```bash
gemma --model mistralai/mistral-7b-instruct:free
```

---

## Uninstall

```bash
npm uninstall -g @google/openrouter-cli
# or
npm unlink
```

---

## Popular Free Models on OpenRouter

| Model ID | Description |
|----------|-------------|
| `google/gemma-4-31b-it:free` | **Default** — Google Gemma 4 31B |
| `google/gemma-2-9b-it:free` | Gemma 2 9B — faster |
| `meta-llama/llama-3-8b-instruct:free` | Meta Llama 3 8B |
| `mistralai/mistral-7b-instruct:free` | Mistral 7B |
| `microsoft/phi-3-mini-128k-instruct:free` | Microsoft Phi-3 Mini |
| `openchat/openchat-7b:free` | OpenChat 7B |
| `huggingfaceh4/zephyr-7b-beta:free` | Zephyr 7B |

Run `gemma --list-models` for the live updated list.
