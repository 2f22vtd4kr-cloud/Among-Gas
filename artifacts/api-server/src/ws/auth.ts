import { createHmac } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * True when no real bot token is configured — allows dev-mode JSON auth bypass.
 * In production TELEGRAM_BOT_TOKEN must be set as a Replit Secret.
 */
export const DEV_MODE = !BOT_TOKEN || BOT_TOKEN === 'DEBUG_MOCK_TOKEN';

/**
 * Verify a Telegram initData string (HMAC-SHA256).
 *
 * In DEV_MODE, accepts raw JSON { id: number; username?: string } instead,
 * so the game works from the Replit preview without a real Telegram context.
 *
 * Returns the authenticated user, or null on failure.
 */
export function verifyTelegramAuth(initData: string): TelegramUser | null {
  // ── Dev path ──────────────────────────────────────────────────────────────
  if (DEV_MODE) {
    try {
      const parsed = JSON.parse(initData) as TelegramUser;
      if (typeof parsed.id === 'number') return parsed;
    } catch {
      // not JSON — fall through (shouldn't happen in dev, but fail cleanly)
    }
    return null;
  }

  // ── Production path: Telegram HMAC-SHA256 ────────────────────────────────
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const entries: string[] = [];
    params.forEach((val, key) => entries.push(`${key}=${val}`));
    entries.sort();

    // Key derivation: HMAC-SHA256("WebAppData", botToken)
    const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN!).digest();
    const computed = createHmac('sha256', secretKey)
      .update(entries.join('\n'))
      .digest('hex');

    if (computed !== hash) return null;

    const userStr = params.get('user');
    return userStr ? (JSON.parse(userStr) as TelegramUser) : null;
  } catch {
    return null;
  }
}
