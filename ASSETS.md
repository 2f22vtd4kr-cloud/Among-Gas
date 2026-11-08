# Among Gas asset provenance

## Current status

This file is the release inventory for visual/audio assets. No third-party asset is treated as cleared merely because it exists in the repository.

### High-risk legacy directory

`artifacts/telegram-game/public/au-assets/` was introduced from an external Among Us clone/reference pack and is therefore **not cleared for commercial redistribution**. Its 17 files are now quarantined under `attached_assets/legacy-au-assets/` and excluded from the production public build.

A source-code reference audit on 2026-11-08 found two actual runtime dependencies:
- `emergency_icon.png` — the in-game emergency-call button.
- `emergency_meeting.png` — the emergency-call waiting/confirmation splash.

This branch replaces both with original, in-source SVG components in `artifacts/telegram-game/src/components/EmergencyMeetingArtwork.tsx`. The app source should therefore have no runtime references to `public/au-assets/`; a CI source-scan regression is added. The previously listed `kill_icon.png` and `sabotage_icon.png` have no current application-source references in the repository search and are not runtime dependencies.

All 17 files have been moved to `attached_assets/legacy-au-assets/` in this branch. They remain uncleared for redistribution but are no longer under Vite's `public/` directory and are not copied into the production web build. Keep them only as quarantined historical/QA material until the full fixture/provenance audit authorizes deletion or licensing.

### Required release action

- Runtime replacement is complete for the only two source references found: original SVG artwork now handles the emergency button and splash; CI prevents source references from returning.
- Before commercial source distribution, record the exact source, licence, attribution requirement, and disposition for every archived legacy asset, or remove the quarantined archive after confirming no QA/fixture dependencies remain.
- Do not ship third-party logos, title art, meeting/ejection art, character art, or ripped sound effects.
- Generated character atlas output is derived from the repository's authored Among Gas character source and is covered by the existing atlas tests; it is not a licence for unrelated source art.

## Original / generated project assets

| Asset family | Status | Notes |
|---|---|---|
| `artifacts/telegram-game/public/sprites/` | Project-authored/generated | Character atlas is validated by runtime/golden tests. |
| Map artwork | Project-provided | Keep transform calibration at logical 3224×1858. |
| Procedural footsteps | Project-generated | Synthesized in `sfx.ts`; no external sample required. |
| UI CSS / SVG primitives | Project-authored | Original emergency alarm button and splash artwork now use the in-source `EmergencyMeetingArtwork.tsx` SVG components. |

## Release gate

The release checklist remains blocked until every unclear asset has a provenance entry and the quarantined legacy archive has a documented license/removal disposition. The production web build must continue to exclude `attached_assets/legacy-au-assets/`.
