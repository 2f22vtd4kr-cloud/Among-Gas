import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// ── Telegram Mini App initialization (Phase 9 — GAME_SPEC.md §12) ─────────────
// All calls are guarded so they're a no-op outside a real Telegram WebView
// (dev preview, desktop browser, etc.).
const twa = (window as any).Telegram?.WebApp as
  | {
      ready(): void;
      expand(): void;
      themeParams?: Record<string, string>;
    }
  | undefined;

if (twa) {
  // Tell Telegram the mini app is ready and request full-height viewport.
  twa.ready();
  twa.expand();

  // Map Telegram theme tokens to CSS custom properties so the UI can respect
  // the user's system / Telegram colour scheme (dark vs light mode).
  const tp = twa.themeParams;
  if (tp) {
    const s = document.documentElement.style;
    if (tp['bg_color'])            s.setProperty('--tg-bg-color',            tp['bg_color']);
    if (tp['text_color'])          s.setProperty('--tg-text-color',          tp['text_color']);
    if (tp['button_color'])        s.setProperty('--tg-button-color',        tp['button_color']);
    if (tp['button_text_color'])   s.setProperty('--tg-button-text-color',   tp['button_text_color']);
    if (tp['hint_color'])          s.setProperty('--tg-hint-color',          tp['hint_color']);
    if (tp['link_color'])          s.setProperty('--tg-link-color',          tp['link_color']);
    if (tp['secondary_bg_color'])  s.setProperty('--tg-secondary-bg-color',  tp['secondary_bg_color']);
  }
}

createRoot(document.getElementById('root')!).render(<App />);
