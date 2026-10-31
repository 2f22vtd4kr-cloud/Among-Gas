/**
 * Resolve and validate the Telegram Mini App start parameter used for lobby invites.
 * Telegram exposes it as initDataUnsafe.start_param and as tgWebAppStartParam;
 * the shorter startapp/start_param query keys are accepted for local previews.
 */
const LOBBY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

function normalizeLobbyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return LOBBY_CODE_PATTERN.test(code) ? code : null;
}

export function readLobbyStartParam(search: string, telegramStartParam?: unknown): string | null {
  const fromTelegram = normalizeLobbyCode(telegramStartParam);
  if (fromTelegram) return fromTelegram;

  const query = new URLSearchParams(search);
  for (const key of ['tgWebAppStartParam', 'startapp', 'start_param']) {
    const code = normalizeLobbyCode(query.get(key));
    if (code) return code;
  }
  return null;
}

/** A fresh invite takes precedence over a room remembered by this WebView. */
export function resolveInitialRoomCode(
  inviteCode: string | null,
  persistedRoomCode: string | null,
): string | null {
  return inviteCode ? null : persistedRoomCode;
}
