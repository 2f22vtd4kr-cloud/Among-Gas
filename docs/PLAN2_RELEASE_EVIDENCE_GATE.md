# Plan 2 final release evidence contract

This contract is implemented by `lib/shared/src/collision/releaseReadiness.ts` and exercised by `scripts/test-collision-release-readiness.ts`. It is deliberately fail-closed. It records required evidence; it does not create approvals or claim that the evidence currently exists.

## Newly explicit blockers

- **Statue planter and pedestal:** separate source-object records, each with its own evidence bundle and digest, author and independent reviewer, chronology, and explicit movement/sight/shadow semantics. A painted shadow must not be duplicated as a synthetic occluder.
- **Parking markings:** an enumerated source-line inventory must match the classification set exactly. Each line is either paint-only (must remain walkable) or a physical obstacle (must explicitly block movement), with separate source evidence and independent review. Bidirectional full-footprint parking-corridor regression evidence is required.
- **AI-assisted map refinement:** the record must identify the original source and a distinct generated candidate, model/version, prompt and parameter digests, QA report digest, author, independent reviewer, and a distinct design-owner acceptance in chronological order. A sharpened copy or a renamed source image cannot satisfy this requirement.
- **Physical acceptance:** separate passing evidence is required for a physical iOS device, Android device, and Telegram client. Each record binds the device/OS/app versions and tester to the exact tested commit.
- **Live Groq:** a real provider-backed response must be recorded with provider/model/scenario, tester, timestamp and response-evidence digest. Credential handling must remain session-only; secrets must never be committed or persisted to create a passing record.
- **Final release dossier:** an immutable candidate commit, distinct author/reviewer, chronology, evidence digest, and explicit approved decision are required.

## Evidence integrity rules

- Evidence hashes must be SHA-256 values. File paths must remain inside the appropriate object/anchor/parking evidence namespace.
- A source image digest, transform digest, generated-candidate digest, QA digest, rights digest, and runtime parity digests are separate evidence identities; one cannot stand in for another.
- Test fixtures prove the validator's behaviour only. They are not release evidence and must never be copied into a real dossier.
- CI/browser simulations, mocked Groq responses, asset provenance inventories, and source code review do not replace legal permission, physical-device testing, or an independent design-owner decision.
- Passing this metadata validator does not itself authorize deployment. Production cut-over still requires the complete immutable release dossier and owner authorization.

## Current truth

The repository does not currently contain the source-authored statue/parking decisions, an approved AI-refined map candidate, physical-device evidence, live Groq evidence, or a signed release dossier. The validator now makes each of those absences an explicit release blocker. No runtime collision geometry or map artwork is changed by this contract.


Commercial asset clearance is now per-file, not one project-wide checkbox: the release record must pin the complete asset-provenance inventory and provide one unique retained-asset path/hash, rights holder, licence, written permission evidence path/hash and cleared status for every inventoried asset. Provenance presence or a repository-level licence cannot substitute for asset-specific rights.


The physical iOS/Android/Telegram run protocol is documented in [PHYSICAL_DEVICE_ACCEPTANCE.md](PHYSICAL_DEVICE_ACCEPTANCE.md). It is screenshot-free and requires real devices, exact build identity, tester/time metadata and a digest of redacted diagnostic evidence.


## Byte-level evidence verification (separate from metadata validation)

The metadata validator deliberately remains pure and does not read files. The combined release command runs that validator, confirms the candidate SHA equals the current clean checkout HEAD, then runs the independent byte verifier against every referenced file. Use this combined command for the release gate:

```sh
pnpm --filter @workspace/scripts run test:release-evidence-bytes
pnpm --filter @workspace/scripts run verify:release-readiness -- --dossier artifacts/release-evidence/release-dossier.json --candidate-commit <full-40-character-commit-sha> --root ..
```

The lower-level `verify:release-evidence-bytes` command remains available for byte-integrity diagnostics only; it does not replace the combined metadata + byte-integrity gate.

Every field ending in `Sha256` must have a sibling repository-relative file path. The conventional pair is `evidenceSha256` / `evidencePath`; explicit pairs include `sampleSetSha256` / `sampleSetPath`, `responseEvidenceSha256` / `responseEvidencePath`, `movementEvidenceSha256` / `movementEvidencePath`, `sightEvidenceSha256` / `sightEvidencePath`, `regressionEvidenceSha256` / `regressionEvidencePath`, `permissionEvidenceSha256` / `permissionEvidencePath`, and `inventorySha256` / `inventoryPath`. The map source, transform, AI source/candidate/prompt/parameters/QA report, parity channels, physical-device records and final dossier likewise require their corresponding file paths.

The combined command reads the dossier without following symlinked parent paths, verifies its candidate is the current checkout HEAD, then reads each referenced evidence file and recomputes SHA-256. It fails closed for absent/empty files, malformed digests, path traversal, absolute or non-canonical paths, symlinks in path components, hardlinks, file replacement detected during open/read, conflicting digests for one path, and stale candidate-commit bindings. It also compares the actual asset-inventory bytes with the pinned inventory digest. It does not authenticate human identities, prove legal rights, judge geometry, or create approvals. Those remain independently evidenced human decisions.

The verifier is not a release pass until it is run against the complete real dossier and all evidence files from the exact candidate checkout. Test fixtures only exercise the verifier's rejection behaviour and are never valid release evidence.


## Exhaustive object and parking inventories

The release record now requires a byte-verifiable source-object inventory under `evidence/map-objects/source-object-inventory/`. Its JSON must contain an `objectIds` array, and the IDs must exactly equal the `sourceObjectIds` list in the dossier. Every inventoried object must have one accepted, independently reviewed record with its own evidence file and explicit `blocksMove`, `blocksSight`, `castsShadow`, and `shadowTreatment` fields. The statue planter and pedestal records must also appear in, and agree with, this exhaustive object inventory. This keeps movement, interaction sight, and presentation shadow as separate authored semantics.

Parking lines likewise require a byte-verifiable JSON source inventory under `evidence/parking-lines/source-inventory/` containing `sourceLineIds`. The file's IDs must exactly match the dossier list, which in turn must reconcile one-to-one with the accepted line classifications. A caller-supplied list alone is not exhaustive-source evidence. Each line classification now has its own `evidence/parking-lines/<line-id>/` source bundle, a distinct author and reviewer, and chronological completion/review timestamps; a review dated before its source classification is rejected.


Evidence-path canonicalization also rejects backslash aliases, repeated separators, empty path segments and control characters. The dossier loader rejects symlinked parent directories as well as symlinked or hard-linked dossier files; object-specific and line-specific review records are bound to the same source identities across their dedicated and exhaustive inventories.
