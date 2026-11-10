# Among Gas asset provenance

## Legacy external bundle — removed from the current tree

On 2026-11-10, the repository's `artifacts/telegram-game/public/au-assets/` folder was
confirmed to be an exact copy of 17 images from
[`AI0702/Among-Us-clone`](https://github.com/AI0702/Among-Us-clone/tree/e75a1410c8bc9e82b41f2ab51deec373c8486e29/Assets/Images).

The upstream README explicitly says its images were ripped from Among Us and credits Innersloth
for the game and its assets. Although the upstream repository has an Unlicense, that licence
does not establish that its author had authority to dedicate or sublicense the underlying
third-party game artwork. The images were therefore not safe to redistribute on the strength
of that repository licence.

All 17 local files were verified as byte-identical Git blobs against their named upstream
counterparts. The complete bundle has now been **removed from the current source tree**. It is
not copied into the current public build. Historical Git commits and the archived session
handoff still preserve the original history; that is not a runtime dependency or an asset
clearance claim.

| Removed local file | Exact upstream path | Git blob SHA |
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

Before removal, the only two direct live source consumers were
`emergency_icon.png` (the emergency-call button) and `emergency_meeting.png` (the
emergency-call splash), both in `GameMap.tsx`. No source-code consumer was found for the
other 15 filenames. The two live paths now render the authored SVG components above; the
unused 15 files were removed instead of being left in the public directory.

The two previously live consumers were replaced with project-authored vector artwork:
- `EmergencyCallIcon` in `artifacts/telegram-game/src/components/EmergencyMeetingArtwork.tsx`
- `EmergencyMeetingArtwork` in the same module

The full-screen call status, localization, server confirmation behavior, button placement and
size remain unchanged. Browser smoke now asserts the authored SVGs are present and that the
splash has no raster image dependency.

## Original / generated project assets

| Asset family | Current classification | Notes |
|---|---|---|
| `artifacts/telegram-game/src/components/EmergencyMeetingArtwork.tsx` | Project-authored SVG | Replaces the two live emergency images from the removed legacy bundle. |
| `artifacts/telegram-game/public/sprites/` | Project-authored/generated | Character atlas is validated by runtime/golden tests. |
| Map artwork | Project-provided | Keep transform calibration at logical 3224×1858. |
| Procedural footsteps | Project-generated | Synthesized in `sfx.ts`; no external sample required. |
| UI CSS / SVG primitives | Project-authored | Prefer these for icons and overlays. |

## Remaining provenance gate

Removing the identified ripped-image bundle does not automatically clear every asset in the
project. Before commercial release, continue checking all other retained artwork, fonts, audio
and source-image inputs for documented ownership or licence terms. Do not infer commercial
rights from a repository being public or from an unrelated repository-level licence.
