/**
 * OpenRouter API client — OpenAI-compatible chat completions.
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 * Auth:     OPENROUTER_API_KEY environment variable
 */

export const DEFAULT_MODEL = 'google/gemma-4-31b-it:free';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error(
      '\n[OpenRouter CLI] Missing API key.\n' +
      'Export your key before running:\n' +
      '  export OPENROUTER_API_KEY="sk-or-..."\n' +
      'Get a free key at: https://openrouter.ai/keys\n',
    );
  }
  return key.trim();
}

/**
 * Send messages to OpenRouter and return the full response.
 */
export async function chatCompletion(
  messages: Message[],
  options: OpenRouterOptions = {},
): Promise<ChatResponse> {
  const apiKey = getApiKey();
  const model = options.model || DEFAULT_MODEL;

  const body = JSON.stringify({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: false,
  });

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/The-JDdev/gemini-cli',
      'X-Title': 'OpenRouter Gemma CLI (Termux)',
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const content = json.choices?.[0]?.message?.content ?? '';
  return {
    content,
    model: json.model ?? model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
  };
}

/**
 * Streaming version — calls onChunk for every delta, returns full content.
 */
export async function chatCompletionStream(
  messages: Message[],
  options: OpenRouterOptions = {},
  onChunk: (delta: string) => void,
): Promise<ChatResponse> {
  const apiKey = getApiKey();
  const model = options.model || DEFAULT_MODEL;

  const body = JSON.stringify({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  });

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/The-JDdev/gemini-cli',
      'X-Title': 'OpenRouter Gemma CLI (Termux)',
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
  }

  if (!res.body) {
    throw new Error('No response body from OpenRouter stream');
  }

  let fullContent = '';
  let responseModel = model;
  let promptTokens = 0;
  let completionTokens = 0;
  let buffer = '';

  const decoder = new TextDecoder();

  for await (const rawChunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(rawChunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr) as {
          choices?: Array<{ delta?: { content?: string } }>;
          model?: string;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };

        if (parsed.model) responseModel = parsed.model;
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens;
          completionTokens = parsed.usage.completion_tokens;
        }

        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {
      }
    }
  }

  return {
    content: fullContent,
    model: responseModel,
    promptTokens,
    completionTokens,
  };
}

/**
 * List available free models from OpenRouter.
 */
export async function listFreeModels(): Promise<string[]> {
  const apiKey = getApiKey();
  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data: Array<{ id: string; pricing?: { prompt: string } }> };
  return (json.data ?? [])
    .filter(m => m.pricing?.prompt === '0')
    .map(m => m.id)
    .sort();
}
