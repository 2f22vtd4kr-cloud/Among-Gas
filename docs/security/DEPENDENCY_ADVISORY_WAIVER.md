# Temporary development-only dependency advisory exception

**Status:** active, explicitly time-limited  
**Advisory:** [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) / CVE-2026-112366  
**Package:** `picomatch`  
**Reported affected range:** `<= 4.0.7`  
**Severity:** High  
**Expiry:** 2026-12-02 00:00:00 UTC

## Decision and scope

The repository owner authorized a narrowly scoped temporary exception on 2026-11-18 so that unrelated verified work can proceed while the upstream advisory has no confirmed patched npm release.

The current dependency audit identifies this advisory only in development-tooling dependency paths. The CI policy therefore runs two independent audits:

1. `pnpm audit --prod --audit-level low` must pass with **zero findings**. No advisory is ignored in the production dependency graph.
2. `pnpm audit --dev --audit-level low` must pass, except that the audit wrapper may tolerate exactly one finding: this GHSA, for `picomatch` with reported affected range `<= 4.0.7`.

The exception is enforced by `scripts/audit-dependencies.mjs`. It is not configured as a global pnpm ignore, and the script fails closed if the advisory ID, package, affected range, count, severity, or scope differs. It also fails automatically at the expiry timestamp.

## Risk and limitations

This is **not a remediation** and does not establish that the vulnerable code is harmless. A development dependency may still execute in developer or CI processes. Do not feed attacker-controlled extglob patterns to affected picomatch code. The exception exists only to unblock verified development work while retaining a clean production audit.

As of 2026-11-18, the GitHub Advisory Database lists no patched version. Some pnpm audit output has displayed a `>= 4.0.8` threshold, but that threshold is not treated as proof of an actually published, advisory-confirmed fixed release. No dependency override or fabricated version is introduced.

## Removal conditions

Remove this exception immediately when either:

- an upstream release is confirmed by the advisory/vendor and the lockfile can be updated to that fixed version; or
- the affected development dependency paths are removed/replaced.

At the latest, the exception expires on **2026-12-02 00:00 UTC**. Before expiry, an owner must remove it or explicitly reassess and amend the policy. CI will fail after expiry rather than silently extending the exception.

## Audit evidence

The production and development audits run separately on every verification workflow. The temporary exception only affects the development audit's acceptance logic; it never changes the dependency graph, lockfile, production install, or runtime code.
