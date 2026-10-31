/**
 * Minimal Groq Chat Completions client for server-side bot dialogue.
 * Keys are accepted only in memory for the active authenticated lobby session;
 * this module never logs credentials or includes them in errors.
 */
export const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_KEY_PATTERN = /^gsk_[A-Za-z0-9_-]{20,240}$/;

export function isValidGroqApiKey(value: string): boolean {
  return GROQ_KEY_PATTERN.test(value);
}

export interface GroqDialogueMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function requestGroqDialogue(
  apiKey: string,
  messages: readonly GroqDialogueMessage[],
): Promise<string | null> {
  if (!isValidGroqApiKey(apiKey)) return null;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        messages,
        max_completion_tokens: 96,
        temperature: 0.82,
        stream: false,
      }),
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;
    const clean = content.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > 0 ? clean.slice(0, 220) : null;
  } catch {
    // Provider outages, invalid keys, DNS errors and timeouts all use the
    // deterministic in-game dialogue fallback. Never expose provider details.
    return null;
  }
}
