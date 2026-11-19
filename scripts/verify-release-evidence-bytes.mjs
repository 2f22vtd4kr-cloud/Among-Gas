#!/usr/bin/env node
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/i;
const COMMIT = /^[a-f0-9]{40}$/i;
const PINNED_INVENTORY_SHA256 =
  "ab2b97d01e0316ae40289001c63008901cefcfe23517dc1be78bd9e13fb6a332";

// Explicit mappings keep the evidence schema auditable; unknown *Sha256 fields
// follow the conventional <field>Path sibling name.
const DIGEST_PATH_KEYS = {
  sampleSetSha256: "sampleSetPath",
  transformSha256: "transformPath",
  regressionEvidenceSha256: "regressionEvidencePath",
  responseEvidenceSha256: "responseEvidencePath",
  permissionEvidenceSha256: "permissionEvidencePath",
  movementEvidenceSha256: "movementEvidencePath",
  sightEvidenceSha256: "sightEvidencePath",
};

function digestPathKey(key) {
  return DIGEST_PATH_KEYS[key] ?? key.slice(0, -"Sha256".length) + "Path";
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(".." + path.sep) &&
    relative !== ".." && !path.isAbsolute(relative));
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 ||
      value.includes("\\0") || value.includes("\\\\") || value.startsWith("/") ||
      /^[a-z]:/i.test(value)) return false;
  const parts = value.split("/");
  return parts.every(part => part.length > 0 && part !== "." && part !== "..");
}

async function hashEvidenceFile(root, relativePath) {
  if (!safeRelativePath(relativePath)) {
    throw new Error("unsafe or non-canonical repository-relative path");
  }
  const parts = relativePath.split("/");
  let cursor = root;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error("symlink in evidence path");
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw new Error("non-directory path component");
    }
  }

  const resolved = await realpath(cursor);
  if (!inside(root, resolved) || resolved !== cursor) {
    throw new Error("evidence path resolves outside root or is aliased");
  }

  const handle = await open(cursor, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("evidence is not a regular file");
    if (info.nlink !== 1) throw new Error("hard-linked evidence files are not accepted");
    if (info.size <= 0) throw new Error("evidence file is empty");
    const bytes = await handle.readFile();
    if (bytes.length !== info.size) throw new Error("evidence changed while being read");
    const after = await handle.stat();
    if (after.ino !== info.ino || after.dev !== info.dev ||
        after.size !== info.size || after.mtimeMs !== info.mtimeMs) {
      throw new Error("evidence changed during verification");
    }
    return createHash("sha256").update(bytes).digest("hex");
  } finally {
    await handle.close();
  }
}

function collectDigestReferences(value, at = "$", refs = [], errors = []) {
  if (!value || typeof value !== "object") return { refs, errors };
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectDigestReferences(entry, `${at}[${index}]`, refs, errors));
    return { refs, errors };
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith("Sha256")) {
      const pathKey = digestPathKey(key);
      const evidencePath = value[pathKey];
      if (typeof child !== "string" || !SHA256.test(child)) {
        errors.push(`${at}.${key}: expected a 64-character SHA-256 digest`);
      } else if (!safeRelativePath(evidencePath)) {
        errors.push(`${at}.${pathKey}: required safe relative path for ${key}`);
      } else {
        refs.push({ at, digestKey: key, pathKey, expected: child.toLowerCase(), relativePath: evidencePath });
      }
    }
    collectDigestReferences(child, `${at}.${key}`, refs, errors);
  }
  return { refs, errors };
}

export async function verifyEvidenceDossier({
  dossier,
  root = process.cwd(),
  candidateCommit,
  expectedInventorySha256 = PINNED_INVENTORY_SHA256,
}) {
  const errors = [];
  const refs = [];
  if (!dossier || typeof dossier !== "object" || Array.isArray(dossier)) {
    return { errors: ["Dossier must be a JSON object"], verifiedFiles: 0 };
  }
  if (typeof candidateCommit !== "string" || !COMMIT.test(candidateCommit)) {
    errors.push("--candidate-commit must be a full 40-character Git commit SHA");
  }
  const releaseCommit = dossier.releaseDossier?.candidateCommit;
  if (typeof releaseCommit !== "string" || !COMMIT.test(releaseCommit) ||
      (COMMIT.test(candidateCommit ?? "") && releaseCommit.toLowerCase() !== candidateCommit.toLowerCase())) {
    errors.push("releaseDossier.candidateCommit must match the exact requested candidate commit");
  }
  if (COMMIT.test(candidateCommit ?? "")) {
    if (dossier.liveGroqProvider?.candidateCommit?.toLowerCase() !== candidateCommit.toLowerCase()) {
      errors.push("liveGroqProvider.candidateCommit must match the exact candidate commit");
    }
    const devices = dossier.physicalDeviceAcceptance;
    if (!Array.isArray(devices) || devices.length !== 3) {
      errors.push("physicalDeviceAcceptance must contain exactly the three required platform records");
    } else {
      for (const device of devices) {
        if (device?.buildCommit?.toLowerCase() !== candidateCommit.toLowerCase()) {
          errors.push(`physical-device ${device?.platform ?? "unknown"} buildCommit must match the exact candidate commit`);
        }
      }
    }
  }

  const collected = collectDigestReferences(dossier);
  refs.push(...collected.refs);
  errors.push(...collected.errors);

  let rootPath;
  try {
    const rootInfo = await lstat(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new Error("verification root must be a real directory, not a symlink");
    }
    rootPath = await realpath(root);
  } catch (error) {
    errors.push(`verification root: ${error.message}`);
    return { errors, verifiedFiles: 0 };
  }

  const seenPaths = new Map();
  let verifiedFiles = 0;
  for (const ref of refs) {
    const prior = seenPaths.get(ref.relativePath);
    if (prior && prior !== ref.expected) {
      errors.push(`${ref.at}.${ref.pathKey}: the same evidence path is bound to conflicting digests`);
      continue;
    }
    seenPaths.set(ref.relativePath, ref.expected);
    try {
      const actual = await hashEvidenceFile(rootPath, ref.relativePath);
      if (actual !== ref.expected) {
        errors.push(`${ref.at}.${ref.digestKey}: SHA-256 mismatch for ${ref.relativePath}; expected ${ref.expected}, got ${actual}`);
        continue;
      }
      if (ref.pathKey === "inventoryPath" && actual !== expectedInventorySha256.toLowerCase()) {
        errors.push(`${ref.at}.${ref.digestKey}: inventory bytes do not match the pinned inventory digest`);
        continue;
      }
      verifiedFiles += 1;
    } catch (error) {
      errors.push(`${ref.at}.${ref.pathKey}: cannot verify ${ref.relativePath}: ${error.message}`);
    }
  }

  if (refs.length === 0) errors.push("Dossier contains no byte-verifiable evidence references");
  return { errors: [...new Set(errors)], verifiedFiles };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--dossier", "--candidate-commit", "--root"].includes(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    options[key] = value;
  }
  if (!options["--dossier"] || !options["--candidate-commit"]) {
    throw new Error("Usage: node verify-release-evidence-bytes.mjs --dossier <json> --candidate-commit <40-char-sha> [--root <repo-root>]");
  }
  return options;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const dossierPath = path.resolve(args["--dossier"]);
    const dossier = JSON.parse(await (await open(dossierPath, "r")).readFile("utf8"));
    const result = await verifyEvidenceDossier({
      dossier,
      root: path.resolve(args["--root"] ?? process.cwd()),
      candidateCommit: args["--candidate-commit"],
    });
    if (result.errors.length) {
      for (const error of result.errors) process.stderr.write(`FAIL: ${error}\\n`);
      process.stderr.write(`Evidence byte verification failed: ${result.verifiedFiles} files verified.\\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`PASS: verified ${result.verifiedFiles} evidence-file references against actual bytes and candidate ${args["--candidate-commit"]}.\\n`);
  } catch (error) {
    process.stderr.write(`FAIL: ${error.message}\\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
