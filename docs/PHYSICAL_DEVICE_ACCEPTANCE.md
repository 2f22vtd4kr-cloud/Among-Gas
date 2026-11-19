# Plan 2 physical-device acceptance protocol

This is a manual acceptance run against one immutable candidate commit. Browser CI, emulation and screenshots do not count as physical-device acceptance. Do not use Vercel/Replit publishing or production deployment for this protocol.

## Required records

Create one record each for `ios`, `android`, and `telegram` in the release dossier. Record:
- Physical device manufacturer/model (not an emulator or simulator).
- OS version and Telegram client version where applicable.
- App build/version and exact 40-character Git commit.
- Tester identity and UTC test timestamp.
- Pass/fail result and SHA-256 of the retained text/log evidence bundle.

The evidence bundle should contain only diagnostics and test results needed to reproduce the run. Do not include API keys, Telegram auth tokens, private player data, or unredacted network payloads. No screenshot gallery is required or permitted by the current screenshot-free recovery policy.

## Test sequence for each platform

1. Launch the same candidate build and verify the map uses the exact 2× texture transform without tile seams or fallback-image differences.
2. Create and join a lobby with two physical clients where the platform permits; verify authenticated join, role assignment, and reconnect after background/resume.
3. Exercise movement around a representative narrow doorway, wall corner, vehicle, statue planter/pedestal and parking marking. Record any clipping, blocked corridor, or incorrect collision; do not infer vector cut-over acceptance from raster runtime behaviour.
4. Complete each task/minigame interaction and verify progress persists through a reconnect.
5. Exercise body report, emergency meeting, voting, vent and sabotage controls in their enabled/disabled states; verify safe-area and thumb reachability.
6. Verify portrait/landscape rotation where supported, background/foreground transitions, keyboard overlays and network interruption recovery.
7. Verify session-only Groq credential configuration and reconnect restoration only if a valid test key is supplied through the app's secure session setting. Never record the key itself.
8. Confirm no fatal console/native crash, unhandled rejection, WebSocket protocol error or persistent memory growth during a 10-minute navigation/task session.

## Platform-specific notes

- **iOS:** use a physical iPhone; record iOS version, Safari/WebKit version and Telegram client version if using Telegram.
- **Android:** use a physical Android handset; record Android version, Chrome/WebView version and Telegram client version if using Telegram.
- **Telegram:** record Telegram client build and the OS/device on which its Mini App WebView ran. Telegram acceptance is a separate record even when the same handset also passed its browser test.

A failed test is recorded as failed with a diagnostic digest; it is not silently omitted. Re-run after a code change against the new immutable commit. The release validator requires all three platform records to pass.
