import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../lib/logger.js';

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Dev-mode auth bypass — active ONLY when ALL of:
 *   1. NODE_ENV !== 'production'
 *   2. No real TELEGRAM_BOT_TOKEN configured (or it's the placeholder)
 * In production, missing bot token is a hard startup error (see validateAuthConfig).
 */
export const DEV_MODE =
  !IS_PRODUCTION && (!BOT_TOKEN || BOT_TOKEN === 'DEBUG_MOCK_TOKEN');

/** Maximum age of a valid Telegram initData payload (24 hours). */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Call at server startup.  Fails hard in production if the bot token is absent,
 * preventing the server from accepting connections with an insecure bypass.
 */
export function validateAuthConfig(): void {
  if (IS_PRODUCTION && (!BOT_TOKEN || BOT_TOKEN === 'DEBUG_MOCK_TOKEN')) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN must be set as a Replit Secret in production. ' +
        'Server startup aborted to prevent insecure auth bypass.',
    );
  }
  if (DEV_MODE) {
    logger.warn(
      'WS running in DEV_MODE — Telegram HMAC auth bypassed. ' +
        'Set NODE_ENV=production and TELEGRAM_BOT_TOKEN to enable real auth.',
    );
  }
}

/**
 * Verify a Telegram initData string (HMAC-SHA256 with auth_date freshness check).
 *
 * In DEV_MODE, accepts raw JSON { id: number; username?: string } instead,
 * so the game works from the Replit preview without a real Telegram context.
 *
 * Returns the authenticated TelegramUser, or null on any failure.
 */
export function verifyTelegramAuth(initData: string): TelegramUser | null {
  // ── Dev path ──────────────────────────────────────────────────────────────
  if (DEV_MODE) {
    try {
      const parsed = JSON.parse(initData) as TelegramUser;
      if (typeof parsed.id === 'number') return parsed;
    } catch {
      // not JSON — reject cleanly
    }
    return null;
  }

  // ── Production path: Telegram HMAC-SHA256 ────────────────────────────────
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null; // format guard

    // auth_date freshness check — reject replayed tokens
    const authDateRaw = params.get('auth_date');
    if (!authDateRaw) return null;
    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate)) return null;
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds < 0 || ageSeconds > MAX_AUTH_AGE_SECONDS) return null;

    params.delete('hash');

    const entries: string[] = [];
    params.forEach((val, key) => entries.push(`${key}=${val}`));
    entries.sort();

    // Key derivation: HMAC-SHA256("WebAppData", botToken)
    const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN!).digest();
    const computed = createHmac('sha256', secretKey)
      .update(entries.join('\n'))
      .digest();

    // Constant-time comparison — prevents timing-based hash oracle attacks
    const expectedBuf = Buffer.from(hash, 'hex');
    if (expectedBuf.length !== computed.length) return null;
    if (!timingSafeEqual(computed, expectedBuf)) return null;

    const userStr = params.get('user');
    return userStr ? (JSON.parse(userStr) as TelegramUser) : null;
  } catch {
    return null;
  }
}
