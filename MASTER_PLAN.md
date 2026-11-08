# Among Gas — Master Engineering & Release Plan (revised 2026-11-08)

> This is the execution contract for the existing Among Gas product, not a rewrite. Preserve the proprietary gas-station/industrial map, balaclava crew, exposed-bone corpse art, Telegram Mini App protocol, and server-authoritative match model. This plan supersedes the ZIP's unreviewed assumptions where they conflict with evidence from the live repository.

## 0. Mission and current release status

Deliver a genuinely playable, visually coherent, secure Telegram HTML5 game. Work in gated waves with one integration owner and specialist workstreams; "100 agents" means 100 review/implementation workstreams, not a claim that 100 independent workers or simultaneous code editors exist.

**Release status: NOT READY.** The verified `main` head is `82433bc5adf65f427c113f5a9d6df6e26ecf6139`. Open PR [#116](https://github.com/2f22vtd4kr-cloud/Among-Gas/pull/116) (`work/plan-v2-map-refinement-hardening`, head `042ff509844b847e631b07401dc1059d989fa9ba`) has exact-head GitHub Actions runs [42464084346](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/42464084346) and [42464080927](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/42464080927) completed successfully; the PR remains draft and unmerged. Open PR [#115](https://github.com/2f22vtd4kr-cloud/Among-Gas/pull/115) (`work/redline-vector-collision-runtime`, head `d4143cb78e1db10e0db8b9ff7cb6f1e5736c20e8`) has no successful exact-head acceptance: its latest runs [42464250620](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/42464250620) and [42464254543](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/42464254543) were cancelled before completion. No vector geometry is used by live gameplay. Additional camera/HUD/minigame/sprite/12-zone changes are being tested on dependent branches and are not integrated into main. Active recovery issue #90 prohibits Replit/Vercel access and publishing during repository recovery; real-device acceptance and target-platform verification remain deferred. Do not treat old CI, partial browser smoke, or candidate geometry as release proof.

## 1. Non-negotiable engineering rules

1. No visual change is accepted without before/after screenshots from a running browser at the affected viewport. A mock fixture is labelled as mock; it is not live multiplayer proof.
2. One authoritative representation per concept. Collision/visibility geometry must ultimately share authored boundaries and independent `blocksMove`/`blocksSight` flags. No guessed geometry is promoted.
3. Keep movement, collision, visibility contracts shared by client and server. Retain speed budgets, anti-cheat validation, prediction acknowledgements, and server authority.
4. Floor paint, parking lines, cracks, baked lighting, decals, and floor shadows are not collision geometry.
5. Do not change the map, balaclava models, suit identity, corpse design, or authored art direction without grounded visual evidence and owner approval.
6. Small, scoped PRs; CI on the exact head; no direct main commits, no force-push, no weakened tests.
7. Never commit secrets or put Groq credentials in client bundles, logs, screenshots, or repository content.
8. Preserve source assets needed by CI and generation scripts until their dependencies and provenance are replaced.
9. Follow the active recovery-room restrictions: no Replit/Vercel operations or publishing until the repository recovery gate explicitly permits them.

## 2. Verified architecture (corrected from the ZIP's static review)

- World coordinates are 3224×1858. The source map, transforms and gameplay anchors must stay calibrated to that coordinate space.
- There are multiple raster layers today: a legacy 104×58 collision/navigation grid; a 680×392 fine movement mask; a 208×116 clearance-aware navigation grid derived by bot code from the fine mask; and independent vision/shadow derivations. The bot runtime is **not** simply using the 104×58 grid as claimed in the ZIP.
- The current in-app CollisionEditor paints the 104×58 legacy data and therefore does not edit the fine movement mask used by players. The Vite dev endpoint writes `lib/shared/src/collisionData.ts`; this is not a production fine-grid/vector editor.
- Player movement currently uses the shared fine mask and an asymmetric feet footprint (three circles of radius 4px, with horizontal offsets ±10px). Do not replace it with a 12–14px circle until all critical doorways, corners, and client/server route probes prove equivalent or improved clearance.
- Bot navigation builds a 208×116 grid from the fine mask and validates live steps against the fine player footprint. New vector navigation must preserve that safety contract.
- Vision is not just a single collision-grid lookup: it combines fine/coarse masks, manually measured narrow occluders, extracted shadow segments and region heuristics. The statue offset example is a concrete defect candidate; its replacement contour still requires measurement against the map image.
- The player atlas is currently expanded from seven authored source colours to 18 runtime palettes. The ZIP's extraction contact sheet proves only 7×9 source frames (63), not 18×9 generated frames.
- Audio is already lazy-loaded on demand and the footstep cue is procedural. Do not reintroduce eager audio preloads while auditing missing/late cues.

## 3. Revised phases and gates

| Phase | Scope | Gate |
|---|---|---|
| 0 — baseline & architecture | Exact-main audit, reproducible local/CI baseline, source/provenance inventory, stable render/input extraction boundaries; audit the existing 25-capture browser smoke and full-map + 4×3 collision/shadow/vision QA tiles before extending them; add deterministic camera/teleport/scenario controls where missing | Main CI green; baseline visual set; no behaviour change from refactors; all existing artifacts reproducible |
| 1 — collision foundation/editor | Validated vector model, shared movement/visibility engine, property tests, phone-first dev editor with coalesced freehand/RDP, active chains, endpoint snap/loupe, vertex/segment editing, vision/analyzer overlays, per-zone import/export, autosave/restore, 8× zoom and 48px touch targets; secure dev-only save/import/export | Engine tests and CI green; all editor gesture tests pass; do not cut over without reviewed map geometry |
| 2 — map tracing & review | 12 map zones, independent tracer/reviewer, authored wall/prop silhouettes and explicit door gaps | All critical routes/anchors pass full-footprint probes; component dispositions approved; before/after zone screenshots |
| 3 — runtime cut-over | Client prediction, server validation, bots and visibility consume one reviewed world; delete raster paths only after all consumers migrate | Client/server parity, 50+ deterministic games, no regression, complete map geometry |
| 4 — product polish | Sprite pipeline, 18-palette baked atlas, minigame modularization, contextual bot social behavior, original/licensed assets, Telegram/device performance | Visual and functional test matrix, actual server-backed multi-client flows, asset provenance complete |
| 5 — hardening/release | Clean install, security/dependency audit, 20-minute soak, multi-seed balance, release dossier | Exact-main CI and target-platform acceptance; no unreviewed PRs; owner sign-off |

**Human/device gate note:** issue #90 currently prohibits Replit/Vercel operations. Complete all local/CI and asset work possible under that restriction; real-phone Replit acceptance is a deferred external gate, not something to fake or silently waive.

## 4. Canonical vector geometry contract

The target document is `collision.v1.json` with world size, version, stable shape IDs, point arrays, closed/open semantics, zone/label metadata, and independent `blocksMove` and `blocksSight` booleans.

- Open polylines represent thin walls/edges. Closed polygons represent filled props/solids.
- Walls, tall props and the statue pedestal may block both; low benches/curbs/planter rings can block movement only; foliage can block sight only. Painted lines and baked art create no shape.
- Trace object ground footprints, not sprite overhangs. Trace on the visible base boundary; collider radius provides clearance. Never globally shrink or expand all obstacles to solve a local path.
- Validate finite in-bounds points, unique IDs, non-degenerate edges, closed polygon area and self-intersections before loading or saving.
- Vector nav rasterization is a derived pathfinding artifact, not an independent source of movement truth. It must use the production three-circle feet footprint (radius 4px at horizontal offsets −10/0/+10px) and align with the existing 208×116 bot grid; do not substitute a 12px circular proxy.
- The vector engine is foundation-only until all map zones are author-traced, reviewed and route-tested. Do not instantiate an empty or automatically vectorized guess as the production map.

## 5. Editor requirements

Dev-only `/dev/collision`, excluded from production routing and bundles. One-thumb modes: Move, Draw, Points, Edit, Magnet, close loop, Undo/Redo, Delete, Layers, Flags, Walk test, Vision preview, Analyzer. Pointer events must support capture, coalesced events, two-finger pan/zoom, clean stroke cancellation, constant screen-space handles, autosave/restore, JSON import/export and safe dev-only repo save. Save validates schema, same-origin/custom header, size and zone; write atomically with rotating backups. The tool must exercise the exact runtime movement/visibility implementation.

## 6. Vision, sprites, product systems

- Replace independent manual vision/shadow approximations only after the shared geometry is traced and verified from multiple origins. Keep low props move-only; prove open-area vision is circular and not corridor-shaped; profile on a mid-range phone.
- Map asset memory: the runtime currently loads `map-hires.webp` at 6608×3808 (about 100.7 MB decoded as RGBA). Keep the hi-res file as a QA/source asset until every consumer is migrated; produce a 3224×1858 WebP or viewport tiles, preserve world-to-image transform tests, and measure decoded memory and first-frame time on target mobile devices. Compressed download size is not decoded-memory size.
- Sprite extraction is a proposed pipeline, not approved output. Review all 63 source crops and compare the generated 18-colour runtime atlas against the current balaclava models, including visor/filter, suit shading, feet anchor, walk poses and corpse bone. Bake palettes only after golden-image QA; keep runtime API stable.
- Split the 11 minigames from the monolith with no behaviour drift before redesigning each game.
- Bot movement uses the same world and footprint as humans. Social assertions must be grounded in observed/public facts. LLM decisions are optional, bounded, asynchronously requested and fail closed to deterministic local logic.
- Audit all visual assets for provenance and actual use. Do not label an asset infringing merely from its filename; replace assets with unclear/unlicensed provenance using original work before commercial handoff, preserving the user's proprietary character/map designs.
- Keep Telegram auth, HMAC, WebSocket isolation, reconnect, payload limits and Replit single-instance constraints intact.

## 7. Specialist workstreams (100)

S0 release/docs (3); S1 architecture/refactors (6); S2 vector engine (6); S3 mobile editor (8); S4 map tracers (12); S5 independent geometry QA (6); S6 vision/shadows (5); S7 sprites/animation (6); S8 minigames (11); S9 bot navigation/behaviour (6); S10 social AI/Groq/voting (7); S11 Telegram/performance (5); S12 UI/UX (6); S13 server/security/test infrastructure (4); S14 asset provenance/original art/audio (3); S15 visual QA (6). Work may run in parallel only on disjoint owned files and reviewed interfaces. One integration owner controls shared geometry, protocol and mainline merges.

## 8. Mandatory acceptance

- Real player traverses all intended corridors; no invisible wall, paint collision, corner clipping, doorway snag or out-of-bounds movement.
- Vision/shadows begin at measured object contours; statue and parking tests from at least eight relevant viewpoints; no square artifacts/light leaks.
- Full map route matrix and every task/vent/button/spawn interaction pass full-footprint path tests.
- Emergency/report/meeting/discussion/voting/ejection proven with two live WebSocket clients, not only mocks.
- Bots navigate without getting stuck, react only to seen events, perform tasks and sabotage, and have grounded contextual dialogue with a deterministic fallback. Live Groq is only claimed after a valid-key end-to-end test.
- 18×9 sprite QA confirms no crop/limb/feet/balaclava/corpse regressions; 11 minigames have independent functional tests.
- Telegram auth/reconnect/safe areas and mobile touch controls pass; mobile performance and memory are measured, not guessed.
- Asset provenance documented; secrets excluded; clean install and security checks pass.
- Exact final main SHA has full CI, seeded balance, visual artifacts, no pending/unreviewed PRs, target Replit acceptance after restrictions are lifted, and an explicit release dossier/go-no-go.

## 9. Active references

- Active acceptance tracker: [issue #71](https://github.com/2f22vtd4kr-cloud/Among-Gas/issues/71)
- 100-workstream execution/evidence room: [issue #90](https://github.com/2f22vtd4kr-cloud/Among-Gas/issues/90)
- Current strategic bot/balance candidate: [PR #106](https://github.com/2f22vtd4kr-cloud/Among-Gas/pull/106)
- ZIP original SHA-256: `2e6840b90b8a27983780f2f03388ae6ff921e6b70c034088ebc0a36407bd66b3` (see `docs/master-plan/reference/README.md` for the full attachment inventory).
