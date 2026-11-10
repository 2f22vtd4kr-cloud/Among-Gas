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
