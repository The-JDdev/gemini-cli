/**
 * Termux-safe temporary file utility.
 *
 * NEVER uses /tmp or %TEMP% — those are either missing or restricted on Android.
 * Priority order:
 *   1. process.env.TMPDIR  (Termux sets this to /data/data/com.termux/files/usr/tmp)
 *   2. .temp_cli/ inside the current working directory
 *
 * All writes are wrapped in try…finally so files are always cleaned up.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function getTempDir(): string {
  if (process.env.TMPDIR) {
    try {
      fs.mkdirSync(process.env.TMPDIR, { recursive: true });
      return process.env.TMPDIR;
    } catch {
    }
  }
  const fallback = path.resolve(process.cwd(), '.temp_cli');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

/**
 * Returns a unique temporary file path (does NOT create the file).
 */
export function tempFilePath(suffix = '.tmp'): string {
  const dir = getTempDir();
  const name = `or_${crypto.randomBytes(8).toString('hex')}${suffix}`;
  return path.resolve(dir, name);
}

/**
 * Writes content to a temp file, executes the callback with that path,
 * then deletes the file in the finally block — guaranteed cleanup.
 */
export async function withTempFile<T>(
  content: string,
  suffix: string,
  callback: (filePath: string) => Promise<T>,
): Promise<T> {
  const filePath = tempFilePath(suffix);
  fs.writeFileSync(filePath, content, 'utf8');
  try {
    return await callback(filePath);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
    }
  }
}

/**
 * Safely resolves any user-supplied path.
 * Refuses to hardcode /sdcard or /tmp — always uses path.resolve.
 */
export function safeResolvePath(userPath: string): string {
  return path.resolve(userPath);
}

/**
 * Cleans up the entire .temp_cli scratch directory if it exists.
 * Called on process exit.
 */
export function cleanupTempDir(): void {
  const fallback = path.resolve(process.cwd(), '.temp_cli');
  try {
    if (fs.existsSync(fallback)) {
      fs.rmSync(fallback, { recursive: true, force: true });
    }
  } catch {
  }
}
