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
      value.includes(String.fromCharCode(0)) || value.includes(String.fromCharCode(92)) || value.startsWith("/") ||
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
    const openedRealPath = await realpath(cursor);
    const pathInfoAfterOpen = await lstat(cursor);
    if (openedRealPath !== resolved || pathInfoAfterOpen.isSymbolicLink() ||
        pathInfoAfterOpen.ino !== info.ino || pathInfoAfterOpen.dev !== info.dev) {
      throw new Error("evidence path changed during secure open");
    }
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
    return { digest: createHash("sha256").update(bytes).digest("hex"), bytes };
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

export async function resolveSafeDossierPath(root, relativePath) {
  if (!safeRelativePath(relativePath)) {
    throw new Error("--dossier must be a safe repository-relative path beneath --root");
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
  if (!inside(canonicalRoot, resolved) || resolved !== cursor) {
    throw new Error("dossier path resolves outside the verification root or is aliased");
  }
  const info = await lstat(cursor);
  if (!info.isFile() || info.nlink !== 1) {
    throw new Error("dossier must be a regular, non-linked file");
  }
  return { path: cursor, info };
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
      const requiredPlatforms = ["ios", "android", "telegram"];
      const actualPlatforms = devices.map(device => device?.platform);
      if (new Set(actualPlatforms).size !== requiredPlatforms.length ||
          requiredPlatforms.some(platform => !actualPlatforms.includes(platform))) {
        errors.push("physicalDeviceAcceptance must contain one unique ios, android and telegram record");
      }
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
      const { digest: actual, bytes } = await hashEvidenceFile(rootPath, ref.relativePath);
      if (actual !== ref.expected) {
        errors.push(`${ref.at}.${ref.digestKey}: SHA-256 mismatch for ${ref.relativePath}; expected ${ref.expected}, got ${actual}`);
        continue;
      }
      if (ref.pathKey === "inventoryPath" && actual !== expectedInventorySha256.toLowerCase()) {
        errors.push(`${ref.at}.${ref.digestKey}: inventory bytes do not match the pinned inventory digest`);
        continue;
      }
      if (ref.pathKey === "sourceObjectInventoryPath" || ref.pathKey === "sourceInventoryPath") {
        try {
          const inventory = JSON.parse(bytes.toString("utf8"));
          const expectedIds = ref.pathKey === "sourceObjectInventoryPath"
            ? dossier.sourceObjectIds
            : dossier.parkingLines?.sourceLineIds;
          const actualIds = ref.pathKey === "sourceObjectInventoryPath"
            ? inventory.objectIds
            : inventory.sourceLineIds;
          const validIds = value => Array.isArray(value) &&
            value.every(id => typeof id === "string" && id.trim().length > 0) &&
            new Set(value).size === value.length;
          if (!validIds(expectedIds) || !validIds(actualIds) ||
              JSON.stringify([...actualIds].sort()) !== JSON.stringify([...expectedIds].sort())) {
            errors.push(`${ref.at}.${ref.pathKey}: source inventory file IDs do not exactly match the dossier inventory`);
            continue;
          }
        } catch {
          errors.push(`${ref.at}.${ref.pathKey}: source inventory must be valid JSON with an explicit ID array`);
          continue;
        }
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
    const rootArgument = path.resolve(args["--root"] ?? process.cwd());
    const rootInfo = await lstat(rootArgument);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      throw new Error("verification root must be a real directory, not a symlink");
    }
    const rootPath = await realpath(rootArgument);
    const { path: dossierPath, info: dossierInfo } =
      await resolveSafeDossierPath(rootPath, args["--dossier"]);
    const dossierHandle = await open(dossierPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    let dossier;
    try {
      const openedInfo = await dossierHandle.stat();
      const pathInfo = await lstat(dossierPath);
      const openedRealPath = await realpath(dossierPath);
      if (openedInfo.ino !== dossierInfo.ino || openedInfo.dev !== dossierInfo.dev ||
          pathInfo.isSymbolicLink() || pathInfo.ino !== openedInfo.ino || pathInfo.dev !== openedInfo.dev ||
          openedRealPath !== dossierPath || !inside(rootPath, openedRealPath)) {
        throw new Error("dossier file identity or parent path changed during secure open");
      }
      dossier = JSON.parse(await dossierHandle.readFile("utf8"));
    } finally {
      await dossierHandle.close();
    }
    const result = await verifyEvidenceDossier({
      dossier,
      root: rootPath,
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
