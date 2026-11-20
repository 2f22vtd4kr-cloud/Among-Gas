#!/usr/bin/env node
import { constants as fsConstants } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCollisionCutoverEvidence } from "../lib/shared/src/collision/releaseReadiness.js";

const COMMIT = /^[a-f0-9]{40}$/i;

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 1024 ||
      value.includes("\0") || value.includes("\\") || value.startsWith("/") ||
      /^[a-z]:/i.test(value)) return false;
  return value.split("/").every(part => part.length > 0 && part !== "." && part !== "..");
}

export async function readDossierSafely(root: string, relativePath: string): Promise<unknown> {
  if (!safeRelativePath(relativePath)) {
    throw new Error("--dossier must be a canonical repository-relative path");
  }
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new Error("--root must be a real directory, not a symlink");
  }
  const canonicalRoot = await realpath(root);
  let cursor = canonicalRoot;
  const parts = relativePath.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error("dossier path contains a symlink component");
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw new Error("dossier parent path component is not a directory");
    }
  }
  const resolved = await realpath(cursor);
  if (resolved !== cursor || !inside(canonicalRoot, resolved)) {
    throw new Error("dossier path resolves outside the repository root or is aliased");
  }
  const before = await lstat(cursor);
  if (!before.isFile() || before.nlink !== 1) {
    throw new Error("dossier must be a regular, non-hard-linked file");
  }
  const handle = await open(cursor, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    const afterPath = await lstat(cursor);
    const openedRealPath = await realpath(cursor);
    if (!opened.isFile() || opened.nlink !== 1 ||
        opened.ino !== before.ino || opened.dev !== before.dev ||
        afterPath.isSymbolicLink() || afterPath.ino !== opened.ino || afterPath.dev !== opened.dev ||
        openedRealPath !== cursor || !inside(canonicalRoot, openedRealPath)) {
      throw new Error("dossier file identity or parent path changed during secure open");
    }
    const bytes = await handle.readFile();
    const afterRead = await handle.stat();
    if (bytes.length !== opened.size || afterRead.ino !== opened.ino ||
        afterRead.dev !== opened.dev || afterRead.size !== opened.size ||
        afterRead.mtimeMs !== opened.mtimeMs) {
      throw new Error("dossier changed during secure read");
    }
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    await handle.close();
  }
}

export function validateReleaseReadinessMetadata(
  dossier: unknown,
  candidateCommit: string,
  checkoutHead: string,
): string[] {
  const errors = validateCollisionCutoverEvidence(dossier);
  if (!COMMIT.test(candidateCommit)) {
    errors.push("Candidate commit must be a full 40-character Git SHA");
  }
  if (!COMMIT.test(checkoutHead) || !COMMIT.test(candidateCommit) ||
      checkoutHead.toLowerCase() !== candidateCommit.toLowerCase()) {
    errors.push("Candidate commit must equal the current checkout HEAD");
  }
  return [...new Set(errors)];
}

function parseArgs(argv: string[]): { dossier: string; candidateCommit: string; root: string } {
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--dossier", "--candidate-commit", "--root"].includes(key)) {
      throw new Error("Unknown argument: " + key);
    }
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error("Missing value for " + key);
    options[key] = value;
  }
  if (!options["--dossier"] || !options["--candidate-commit"]) {
    throw new Error("Usage: pnpm --filter @workspace/scripts verify:release-readiness -- --dossier <json> --candidate-commit <40-char-sha> [--root <repo-root>]");
  }
  return {
    dossier: options["--dossier"],
    candidateCommit: options["--candidate-commit"],
    root: path.resolve(options["--root"] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dossier = await readDossierSafely(args.root, args.dossier);
  const checkoutHead = execFileSync("git", ["-C", args.root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const metadataErrors = validateReleaseReadinessMetadata(dossier, args.candidateCommit, checkoutHead);
  if (metadataErrors.length) {
    for (const error of metadataErrors) process.stderr.write("FAIL: " + error + "\\n");
    process.exitCode = 1;
    return;
  }

  const verifierPath = path.join(path.dirname(new URL(import.meta.url).pathname), "verify-release-evidence-bytes.mjs");
  const byteResult = spawnSync(process.execPath, [
    verifierPath,
    "--dossier", args.dossier,
    "--candidate-commit", args.candidateCommit,
    "--root", args.root,
  ], { cwd: args.root, encoding: "utf8" });
  if (byteResult.status !== 0) {
    if (byteResult.stdout) process.stderr.write(byteResult.stdout);
    if (byteResult.stderr) process.stderr.write(byteResult.stderr);
    process.exitCode = byteResult.status ?? 1;
    return;
  }
  process.stdout.write("PASS: all Plan 2 metadata gates and evidence-byte checks passed for current HEAD " + args.candidateCommit + ".\\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write("FAIL: " + (error instanceof Error ? error.message : String(error)) + "\\n");
    process.exitCode = 1;
  });
}
