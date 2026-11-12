# Among Gas asset provenance

## Current status

This file is the release inventory for visual/audio assets. No third-party asset is treated as cleared merely because it exists in the repository.

### Legacy external bundle — removed from the current tree

On 2026-11-10, `artifacts/telegram-game/public/au-assets/` was confirmed to contain 17 files byte-identical to assets in [`AI0702/Among-Us-clone`](https://github.com/AI0702/Among-Us-clone/tree/e75a1410c8bc9e82b41f2ab51deec373c8486e29/Assets/Images).

The upstream [README](https://github.com/AI0702/Among-Us-clone/blob/e75a1410c8bc9e82b41f2ab51deec373c8486e29/README.md) says its images were ripped from Among Us and credits Innersloth for the game and its assets. Although that repository declares an Unlicense, that repository-level dedication does not establish authority to dedicate or sublicense third-party game artwork. Those images were therefore not safe to redistribute on the strength of that licence.

All 17 local files were compared by Git blob SHA with their named counterparts in the upstream `Assets/Images` tree at commit `e75a1410c8bc9e82b41f2ab51deec373c8486e29`. All 17 matched exactly:

| Removed local file | Exact upstream source path | Git blob SHA |
|---|---|---|
| `defeat.png` | `Alerts/defeat.png` | `8e24947faee1addeba0f5bb4599c17c897387bb0` |
| `eject.png` | `Alerts/eject.png` | `6c2c55635bff3d5d1e67df5ae86034c91d537949` |
| `emergency_icon.png` | `UI/emergency_icon_dim.png` | `fbb27416d63f01d0d29ccc7ecbc9ec37732d01e6` |
| `emergency_meeting.png` | `Alerts/emergency_meeting_red.png` | `ccd52b484c96f8b88affdd94847bbaf7dbb40bc1` |
| `freeplay.png` | `menu/freeplay.png` | `4d9d4feddbc438ba2fa5bebe14ab12e73f533d2a` |
| `impostor_char.png` | `menu/imposteramongus.png` | `de3e95d63a8326ae9e0debcd7d39d2742926375c` |
| `input_bg.png` | `menu/input.png` | `34565fe792f17cc72917d8d435d2461c9b55ac44` |
| `kill_icon.png` | `UI/kill_icon.png` | `e39bae3b2d63412d042f7c0aa9dd91e2cd1b1eab` |
| `online.png` | `menu/online.png` | `3b24b822b453b1f2bb5540890b9ee984db9685cd` |
| `proceed.png` | `Meeting/proceed.PNG` | `feefe8122e1c83342c12b5c56e5d91c8df7607bc` |
| `sabotage_icon.png` | `UI/sabotage_icon.png` | `d20f9abbc8edd3887077ebc0393d51fa5f53966e` |
| `sel.png` | `menu/sel.png` | `0ed5604ebb03ce0c1deda3f20f8798665dfc4feb` |
| `select_vote.png` | `Meeting/select_vote.png` | `2057f7d4c7663025b076d7c6cb780e67c2d2578a` |
| `skip_vote.png` | `Meeting/skip_vote.png` | `5e857fb9c7bb3dbb13027da5371788397fcb496a` |
| `title.png` | `menu/title.png` | `e455e9b68fd541107ec16645f613a4ef80d171f3` |
| `victory.png` | `Alerts/victory.png` | `993bbbed9d7ccb59b99f22d135f1de368ae6676e` |
| `victoryback.png` | `Alerts/victoryback.PNG` | `531b0a38b0ead0089a85fc3026014215bd718675` |

**Removal status:** all 17 files have been deleted from the current source tree. The `au-assets/` directory is absent from the branch, and the current `GameMap.tsx` has no runtime reference to it. Historical Git commits and the archived handoff retain the old history; they are not runtime dependencies and do not imply asset clearance.

Before removal, only two direct live source consumers were found:
- `emergency_icon.png` — the emergency-call action button in `GameMap.tsx`
- `emergency_meeting.png` — the emergency-meeting splash/overlay in `GameMap.tsx`

Both are replaced with project-authored SVG components:
- `EmergencyCallIcon` in `artifacts/telegram-game/src/components/EmergencyMeetingArtwork.tsx`
- `EmergencyMeetingArtwork` in the same module

The emergency button size/placement, localized call status, full-screen overlay, and server confirmation flow are retained. Browser smoke asserts that the authored SVGs render and that the splash no longer depends on a raster image.

No direct source-code consumers were found for the other 15 files in the source audit. They were removed rather than left in the public directory.

### Reference-only screenshot removed

Two additional reference screenshots, `attached_assets/among-us-wiki-lobby.png` and `attached_assets/among-us-wiki-main-menu.png`, were also removed on 2026-11-11. Their names identify them as third-party wiki imagery, no source-code consumers were found, and the repository had no retained redistribution licence record for them. This is a provenance-risk reduction, not a determination about the original publisher's licence.

The v2 Plan 2 audit identified `attached_assets/IMG_2885_1783605337712.jpeg` as a third-party Switch-game HUD reference screenshot. It had no source-code consumers and was removed from the repository on 2026-11-11; keep any private comparison copy outside the source tree. This removal does not clear the other retained reference inputs listed in `attached_assets/`, which remain subject to the provenance review below.

## Third-party audio bundle removed

On 2026-11-12, the nine files formerly under `artifacts/telegram-game/public/au-sounds/` were checked against the pinned public Among Us clone source at commit `e75a1410c8bc9e82b41f2ab51deec373c8486e29`. Every local Git blob SHA matched the corresponding upstream blob exactly:

| Removed local file | Exact upstream source path | Git blob SHA | Bytes |
|---|---|---|---:|
| `kill.wav` | `Assets/Sounds/Kill/imposter_kill.wav` | `30436813cde6c70620757f3e9c2e9a113d38d912` | 188,448 |
| `meeting.wav` | `Assets/Sounds/General/alarm_emergencymeeting.wav` | `3c4e59f667c8dced521e8574e3e1ab7c5f4cf5fd` | 531,500 |
| `menu_music.mp3` | `Assets/Sounds/Background/main_menu_music.mp3` | `1392647073a9af7cbcf7567d615a1813d0eaaa01` | 3,854,902 |
| `report_body.wav` | `Assets/Sounds/General/report_Bodyfound.wav` | `5e8fc07b5d33a9ba5f7b0284f1b8ded6572e8928` | 742,412 |
| `roundstart.wav` | `Assets/Sounds/General/roundstart.wav` | `87c6ae695f50480e913e63cc0643d5841209ef30` | 779,176 |
| `task_complete.wav` | `Assets/Sounds/General/task_complete.wav` | `a31bbc67e30edbcebde567e368f92050d9c1c1d4` | 214,992 |
| `ui_select.wav` | `Assets/Sounds/UI/select.wav` | `944c05daef768eee0aa611620dfd318eedd01cc8` | 303,364 |
| `victory_crew.wav` | `Assets/Sounds/General/victory_crew.wav` | `35a5ffc980148a5ce25ee77361de9cd1593b84b7` | 1,672,652 |
| `victory_impostor.wav` | `Assets/Sounds/General/victory_impostor.wav` | `77ef9f4ed74c56c25283159822f1bd544507e591` | 2,229,740 |

The files have been removed from the runtime tree.
The existing public `sfx()` API now synthesizes the game cues, footstep, and a quiet looping ambient menu motif with Web Audio. It fetches no sample or music files. `scripts/test-audio-preload.mjs` verifies there are no audio network requests before or after a trusted gesture and that audio initialization does not emit browser errors.

## Remaining release gate

Removing this specific bundle does not automatically clear every other asset in the project. Before commercial release:
- Record the exact source, licence, attribution requirement, and replacement path for every retained external asset.
- Check all retained artwork, fonts, audio and source-image inputs for documented ownership or licence terms.
- Do not ship third-party logos, title art, meeting/ejection art, character art, or ripped sound effects.
- Do not infer commercial rights from a repository being public or from an unrelated repository-level licence.

Generated character atlas output is derived from the repository's authored Among Gas character source and is covered by the existing atlas tests; that is not a licence for unrelated source art.

## Original / generated project assets

| Asset family | Status | Notes |
|---|---|---|
| `artifacts/telegram-game/src/components/EmergencyMeetingArtwork.tsx` | Project-authored SVG | Replaces the two live emergency images from the removed legacy bundle. |
| `artifacts/telegram-game/public/sprites/` | Project-authored/generated | Character atlas is validated by runtime/golden tests. |
| Map artwork | Project-provided | Keep transform calibration at logical 3224×1858. |
| Runtime audio | Project-generated | All sound effects, footstep cues, and ambient menu music are synthesized in `sfx.ts` with Web Audio; no external samples or music assets are requested. |
| UI CSS / SVG primitives | Project-authored | Prefer these for icons and overlays. |
