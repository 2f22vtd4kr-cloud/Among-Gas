/**
 * Phase 9 — Telegram haptic feedback helpers (GAME_SPEC.md §12).
 *
 * Wraps window.Telegram.WebApp.HapticFeedback. Every function is a silent
 * no-op when called outside a real Telegram WebView so it's safe to call
 * unconditionally across the whole codebase.
 */

const hf = () => (window as any).Telegram?.WebApp?.HapticFeedback as
  | { notificationOccurred(type: 'error' | 'success' | 'warning'): void;
      impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
      selectionChanged(): void; }
  | undefined;

export const haptic = {
  /** Kill executed or received — strong error pulse. */
  kill:    () => hf()?.notificationOccurred('error'),
  /** Meeting started — urgent warning pulse. */
  meeting: () => hf()?.notificationOccurred('error'),
  /** Positive completion — task step done, sabotage fixed, game won. */
  success: () => hf()?.notificationOccurred('success'),
  /** Warning event — role reveal as impostor, sabotage incoming. */
  warning: () => hf()?.notificationOccurred('warning'),
  /** Light tap — generic button press. */
  tap:     () => hf()?.impactOccurred('light'),
  /** Medium impact — notable action (start game, vote cast). */
  medium:  () => hf()?.impactOccurred('medium'),
  /** Heavy impact — high-stakes action (sabotage trigger). */
  heavy:   () => hf()?.impactOccurred('heavy'),
};
