#!/usr/bin/env node
/**
 * Run production and development audits as separate scopes.
 *
 * The only temporary exception is GHSA-fc5q-39xc-vjpf in development
 * dependencies. It is deliberately NOT configured as a global pnpm ignore:
 * production dependencies remain fully audited without exceptions.
 */
import { spawnSync } from "node:child_process";

const WAIVED_GHSA = "GHSA-fc5q-39xc-vjpf";
const WAIVER_EXPIRES_AT = "2026-12-02T00:00:00.000Z";

function runAudit(scope) {
  const result = spawnSync(
    "pnpm",
    ["audit", scope, "--audit-level", "low"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
  };
}

function requireCleanProductionAudit() {
  const audit = runAudit("--prod");
  if (audit.status !== 0) {
    process.stderr.write(audit.output);
    throw new Error("Production dependency audit failed; no production advisory is waived.");
  }
  process.stdout.write(audit.output);
  if (!/No known vulnerabilities found/i.test(audit.output)) {
    throw new Error("Production audit did not explicitly report a clean result.");
  }
}

function validateDevelopmentWaiver(output) {
  const now = Date.now();
  const expires = Date.parse(WAIVER_EXPIRES_AT);
  if (!Number.isFinite(expires) || now >= expires) {
    throw new Error(
      `Temporary ${WAIVED_GHSA} development-only waiver expired at ${WAIVER_EXPIRES_AT}; remove it or reassess before continuing.`,
    );
  }

  // pnpm 11 renders a Unicode box table; strip its borders before matching
  // field labels so validation does not depend on column widths.
  const normalized = output
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/[│┌┐└┘├┤┬┴┼─]/g, " ");
  const advisories = [...new Set(normalized.match(/GHSA-[a-z0-9-]+/gi) ?? [])];
  const hasSingleHighFinding = /\b1 vulnerabilit(?:y|ies) found\b/i.test(normalized) &&
    /Severity:\s*1 high\b/i.test(normalized);
  const isPicomatch = /Package\s+picomatch\b/i.test(normalized);
  const affectedRangeMatches = /Vulnerable versions\s+<=\s*4\.0\.7/i.test(normalized);

  if (
    advisories.length !== 1 ||
    advisories[0]?.toUpperCase() !== WAIVED_GHSA ||
    !hasSingleHighFinding ||
    !isPicomatch ||
    !affectedRangeMatches
  ) {
    process.stderr.write(output);
    throw new Error(
      "Development audit found an unapproved or additional advisory. " +
      JSON.stringify({
        advisories,
        hasSingleHighFinding,
        isPicomatch,
        affectedRangeMatches,
        normalizedTail: normalized.slice(-1200),
      }),
    );
  }

  process.stdout.write(output);
  process.stdout.write(
    [
      "",
      "::warning::Temporary development-only waiver active for GHSA-fc5q-39xc-vjpf.",
      "::warning::The production dependency audit passed independently with zero findings.",
      `::warning::Waiver expires ${WAIVER_EXPIRES_AT}; it must be removed or reassessed before then.`,
      "",
    ].join("\n"),
  );
}

requireCleanProductionAudit();

const development = runAudit("--dev");
if (development.status === 0) {
  process.stdout.write(development.output);
  if (!/No known vulnerabilities found/i.test(development.output)) {
    throw new Error("Development audit did not explicitly report a clean result.");
  }
} else {
  validateDevelopmentWaiver(development.output);
}
