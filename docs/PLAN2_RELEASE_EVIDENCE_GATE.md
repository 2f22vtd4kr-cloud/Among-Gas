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
