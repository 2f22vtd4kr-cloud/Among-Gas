# Among Gas asset provenance

## Current status

This file is the release inventory for visual/audio assets. No third-party asset is treated as cleared merely because it exists in the repository.

### High-risk legacy directory

`artifacts/telegram-game/public/au-assets/` was introduced from an external Among Us clone/reference pack and is therefore **not cleared for commercial redistribution**. It must be replaced or removed before release.

Known runtime references are currently limited to:
- `kill_icon.png`
- `sabotage_icon.png`

The remaining files in the directory are retained only until their production-screen usage is audited; deleting the directory blindly would break historical QA/replay fixtures.

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
