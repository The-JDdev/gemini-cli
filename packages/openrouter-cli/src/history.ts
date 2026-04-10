/**
 * Conversation history manager.
 * Keeps the full message array in memory.
 * Persists sessions to a Termux-safe path when --save-history is used.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Message } from './openrouter.js';

const MAX_HISTORY = 100;

export class ConversationHistory {
  private messages: Message[] = [];
  private systemPrompt: string | null = null;

  constructor(systemPrompt?: string) {
    if (systemPrompt) {
      this.systemPrompt = systemPrompt;
    }
  }

  /** Add a user message. */
  addUser(content: string): void {
    this.messages.push({ role: 'user', content });
    this.trim();
  }

  /** Add an assistant message. */
  addAssistant(content: string): void {
    this.messages.push({ role: 'assistant', content });
  }

  /**
   * Returns the full array ready to send to OpenRouter.
   * System prompt is prepended if set.
   */
  toApiMessages(): Message[] {
    const all: Message[] = [];
    if (this.systemPrompt) {
      all.push({ role: 'system', content: this.systemPrompt });
    }
    all.push(...this.messages);
    return all;
  }

  /** How many turns so far. */
  get turnCount(): number {
    return this.messages.filter(m => m.role === 'user').length;
  }

  /** Clear history (keeps system prompt). */
  clear(): void {
    this.messages = [];
  }

  /** Keep only the last MAX_HISTORY messages to avoid token overflow. */
  private trim(): void {
    if (this.messages.length > MAX_HISTORY) {
      this.messages = this.messages.slice(this.messages.length - MAX_HISTORY);
    }
  }

  /**
   * Save history to a Termux-safe path.
   * Uses TMPDIR or falls back to cwd/.openrouter_history.json
   */
  save(filePath?: string): void {
    const target = filePath ?? this.defaultHistoryPath();
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        JSON.stringify({ systemPrompt: this.systemPrompt, messages: this.messages }, null, 2),
        'utf8',
      );
    } catch (e) {
      console.error('[History] Failed to save:', e);
    }
  }

  /**
   * Load history from a file.
   */
  load(filePath?: string): boolean {
    const target = filePath ?? this.defaultHistoryPath();
    try {
      const raw = fs.readFileSync(target, 'utf8');
      const data = JSON.parse(raw) as { systemPrompt?: string; messages: Message[] };
      this.systemPrompt = data.systemPrompt ?? this.systemPrompt;
      this.messages = data.messages ?? [];
      return true;
    } catch {
      return false;
    }
  }

  private defaultHistoryPath(): string {
    const base = process.env.TMPDIR
      ? path.resolve(process.env.TMPDIR, '..', 'home')
      : process.cwd();
    return path.resolve(base, '.openrouter_history.json');
  }
}
