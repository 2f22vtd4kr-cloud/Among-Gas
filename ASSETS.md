# Among Gas asset provenance

## Current status

This file is the release inventory for visual/audio assets. No third-party asset is treated as cleared merely because it exists in the repository.

### High-risk legacy directory

`artifacts/telegram-game/public/au-assets/` was introduced from an external Among Us clone/reference pack and is therefore **not cleared for commercial redistribution**. It must be replaced or removed before release.

A source-code reference audit on 2026-11-08 found two actual runtime dependencies:
- `emergency_icon.png` — the in-game emergency-call button.
- `emergency_meeting.png` — the emergency-call waiting/confirmation splash.

This branch replaces both with original, in-source SVG components in `artifacts/telegram-game/src/components/EmergencyMeetingArtwork.tsx`. The app source should therefore have no runtime references to `public/au-assets/`; a CI source-scan regression is added. The previously listed `kill_icon.png` and `sabotage_icon.png` have no current application-source references in the repository search and are not runtime dependencies.

The directory remains uncleared for redistribution. Keep its files as historical/QA material until a complete repository and fixture usage audit authorizes archival or removal; do not ship the directory as runtime artwork.

### Required release action

- Replace every runtime `au-assets/*` dependency with original Among Gas artwork or clearly licensed assets.
- Record the exact source, licence, attribution requirement, and replacement path here for every retained external asset.
- Do not ship third-party logos, title art, meeting/ejection art, character art, or ripped sound effects.
- Generated character atlas output is derived from the repository's authored Among Gas character source and is covered by the existing atlas tests; it is not a licence for unrelated source art.

## Original / generated project assets

| Asset family | Status | Notes |
|---|---|---|
| `artifacts/telegram-game/public/sprites/` | Project-authored/generated | Character atlas is validated by runtime/golden tests. |
| Map artwork | Project-provided | Keep transform calibration at logical 3224×1858. |
| Procedural footsteps | Project-generated | Synthesized in `sfx.ts`; no external sample required. |
| UI CSS / SVG primitives | Project-authored | Prefer these for action icons after legacy `au-assets` replacement. |

## Release gate

The release checklist must remain blocked until every unclear asset has a provenance entry and every uncleared `au-assets/*` runtime dependency has been removed.
