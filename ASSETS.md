# Among Gas asset provenance

## Current status

This file is the release inventory for visual/audio assets. No third-party asset is treated as cleared merely because it exists in the repository.

### High-risk legacy directory

`artifacts/telegram-game/public/au-assets/` was introduced from an external Among Us clone/reference pack and is therefore **not cleared for commercial redistribution**. It must be replaced or removed before release.

### Origin and current source audit

The archived project handoff records that this directory was downloaded from the external
[`AI0702/Among-Us-clone`](https://github.com/AI0702/Among-Us-clone) repository. The archived note does not record a licence, permission, or attribution grant. Treat every file as **uncleared** until its exact upstream provenance and applicable licence are verified.

A source-reference audit on 2026-11-10 found these **confirmed live runtime consumers**:

| File | Current consumer | Use |
|---|---|---|
| `emergency_icon.png` | `artifacts/telegram-game/src/pages/GameMap.tsx` | Emergency-call action button |
| `emergency_meeting.png` | `artifacts/telegram-game/src/pages/GameMap.tsx` | Emergency-meeting splash/overlay |

The earlier inventory listed `kill_icon.png` and `sabotage_icon.png` as runtime references. The current source search did not find code consumers for those two paths, so they are **not confirmed live dependencies** and must not be described as such without further evidence. All 17 files remain in the directory:

`defeat.png`, `eject.png`, `emergency_icon.png`, `emergency_meeting.png`,
`freeplay.png`, `impostor_char.png`, `input_bg.png`, `kill_icon.png`,
`online.png`, `proceed.png`, `sabotage_icon.png`, `sel.png`,
`select_vote.png`, `skip_vote.png`, `title.png`, `victory.png`,
`victoryback.png`.

A missing source-code match is not proof that a file is safe to delete: legacy screenshots, replay fixtures, or non-code references may still depend on it. Keep the directory intact during this audit; classify each remaining file and its consumers before removal.

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
