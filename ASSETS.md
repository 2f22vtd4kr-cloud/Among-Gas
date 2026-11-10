# Among Gas asset provenance

## Current status

This file is the release inventory for visual/audio assets. No third-party asset is treated as cleared merely because it exists in the repository.

### High-risk legacy directory

`artifacts/telegram-game/public/au-assets/` was introduced from an external Among Us clone/reference pack and is therefore **not cleared for commercial redistribution**. It must be replaced or removed before release.

### Provenance and exact upstream matches

The archived project handoff records that this directory was downloaded from
[`AI0702/Among-Us-clone`](https://github.com/AI0702/Among-Us-clone). The upstream repository's
[`README.md`](https://github.com/AI0702/Among-Us-clone/blob/e75a1410c8bc9e82b41f2ab51deec373c8486e29/README.md)
says its images were **ripped from Among Us** and credits Innersloth for the game and its assets.
The upstream repository declares an `Unlicense` in its root LICENSE, but that repository-level
dedication cannot grant rights to game artwork the repository author says was ripped from a
third-party game. The presence of that LICENSE therefore does **not** clear these images for
redistribution.

I compared the Git blob IDs of all 17 local files with the corresponding files under the
upstream repository's `Assets/Images` tree at commit
`e75a1410c8bc9e82b41f2ab51deec373c8486e29`. **All 17 files are byte-identical Git blobs**:

| Local file | Upstream source path | Exact Git blob SHA |
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

### Confirmed current runtime consumers

A source-reference audit on 2026-11-10 found these two direct live consumers:

| File | Current consumer | Use |
|---|---|---|
| `emergency_icon.png` | `artifacts/telegram-game/src/pages/GameMap.tsx` | Emergency-call action button |
| `emergency_meeting.png` | `artifacts/telegram-game/src/pages/GameMap.tsx` | Emergency-meeting splash/overlay |

No direct source-code consumers were found for the other 15 filenames in the source search performed for this audit. That is not evidence that they are safe to delete: historical screenshots, replay fixtures, static references or future code may still rely on them. Keep the directory intact until each file's consumers are explicitly reconciled.

**Provenance decision:** the exact source is now known, but the source repository itself describes the imagery as ripped from Among Us. Until permission or a separate licence from the actual rights holder is documented, none of these 17 images is cleared for commercial redistribution. The two live emergency images must be replaced with original Among Gas artwork or artwork with independently verified rights before release.

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
