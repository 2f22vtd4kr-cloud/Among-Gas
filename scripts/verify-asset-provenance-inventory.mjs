#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const inventoryPath = path.join(root, "docs/asset-provenance-inventory.md");
const inventory = await readFile(inventoryPath, "utf8");
const section = inventory.split("## Full file inventory")[1];
assert.ok(section, "asset provenance inventory must contain the full file inventory section");

const rows = new Map();
for (const line of section.split(/\r?\n/)) {
  const match = line.match(/^\| `([^\`]+)` \| (\d+) \| `([a-f0-9]{40})` \| (.*) \|$/i);
  if (!match) continue;
  const [, filePath, bytesText, blobSha, classification] = match;
  assert.ok(!rows.has(filePath), `duplicate provenance row: ${filePath}`);
  assert.ok(classification.trim().length > 0, `${filePath}: provenance classification is required`);
  rows.set(filePath, { bytes: Number(bytesText), blobSha: blobSha.toLowerCase(), classification });
}

const trackedPaths = execFileSync("git", ["ls-files", "-z", "--", "attached_assets/"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean).sort();

assert.ok(trackedPaths.length > 0, "attached_assets must contain tracked source inputs");
const missingRows = trackedPaths.filter(filePath => !rows.has(filePath));
const staleRows = [...rows.keys()].filter(filePath => !trackedPaths.includes(filePath));
assert.deepEqual(missingRows, [],
  "every tracked attached_assets file must have an explicit provenance inventory row");
assert.deepEqual(staleRows, [],
  "the provenance inventory must not retain paths that are no longer tracked");

const duplicateGroups = new Map();
for (const filePath of trackedPaths) {
  const absolutePath = path.join(root, filePath);
  const [blobSha, fileStat] = await Promise.all([
    Promise.resolve(execFileSync("git", ["hash-object", "--", filePath], { cwd: root, encoding: "utf8" }).trim()),
    stat(absolutePath),
  ]);
  const row = rows.get(filePath);
  assert.equal(row.blobSha, blobSha,
    `${filePath}: recorded Git blob SHA must match the tracked file contents`);
  assert.equal(row.bytes, fileStat.size,
    `${filePath}: recorded byte size must match the tracked file`);
  const paths = duplicateGroups.get(blobSha) ?? [];
  paths.push(filePath);
  duplicateGroups.set(blobSha, paths);
}

const duplicatePathCount = [...duplicateGroups.values()]
  .filter(paths => paths.length > 1)
  .reduce((sum, paths) => sum + paths.length, 0);
const uniqueBlobCount = duplicateGroups.size;

assert.match(inventory, /not a licence opinion/i,
  "the inventory must not present file identity as a legal licence conclusion");
assert.match(inventory, /rights-unverified|rights confirmation still needed|licence not recorded/i,
  "the inventory must continue to disclose unresolved asset-rights status");

console.log(JSON.stringify({
  ok: true,
  trackedFiles: trackedPaths.length,
  inventoriedFiles: rows.size,
  uniqueGitBlobs: uniqueBlobCount,
  duplicatePaths: duplicatePathCount,
  rightsStatus: "inventory only; no copyright or redistribution clearance is inferred",
}, null, 2));
