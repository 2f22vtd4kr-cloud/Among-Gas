import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveSafeDossierPath, verifyEvidenceDossier } from "./verify-release-evidence-bytes.mjs";

const candidate = "a".repeat(40);
const bytes = Buffer.from("independent release evidence\n");
const digest = createHash("sha256").update(bytes).digest("hex");

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "among-gas-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "evidence"), { recursive: true });
  await writeFile(path.join(root, "evidence", "audit.json"), bytes);
  const objectIds = ["statue-planter", "statue-pedestal"];
  const sourceLineIds = ["parking-marking-a", "parking-marking-b"];
  const objectInventoryBytes = Buffer.from(JSON.stringify({ objectIds }) + "\n");
  const parkingInventoryBytes = Buffer.from(JSON.stringify({ sourceLineIds }) + "\n");
  await mkdir(path.join(root, "evidence", "map-objects", "source-object-inventory"), { recursive: true });
  await mkdir(path.join(root, "evidence", "parking-lines", "source-inventory"), { recursive: true });
  await writeFile(path.join(root, "evidence", "map-objects", "source-object-inventory", "objects.json"), objectInventoryBytes);
  await writeFile(path.join(root, "evidence", "parking-lines", "source-inventory", "lines.json"), parkingInventoryBytes);
  const dossier = {
    releaseDossier: { candidateCommit: candidate },
    physicalDeviceAcceptance: [
      { platform: "ios", buildCommit: candidate },
      { platform: "android", buildCommit: candidate },
      { platform: "telegram", buildCommit: candidate },
    ],
    liveGroqProvider: { candidateCommit: candidate },
    sourceObjectIds: objectIds,
    sourceObjectInventoryPath: "evidence/map-objects/source-object-inventory/objects.json",
    sourceObjectInventorySha256: createHash("sha256").update(objectInventoryBytes).digest("hex"),
    parkingLines: {
      sourceLineIds,
      sourceInventoryPath: "evidence/parking-lines/source-inventory/lines.json",
      sourceInventorySha256: createHash("sha256").update(parkingInventoryBytes).digest("hex"),
    },
    auditPath: "evidence/audit.json",
    auditSha256: digest,
  };
  return { root, dossier };
}


test("rejects a dossier reached through a symlinked parent directory", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "among-gas-dossier-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "real"), { recursive: true });
  await writeFile(path.join(root, "real", "dossier.json"), "{}\\n");
  await symlink(path.join(root, "real"), path.join(root, "linked"), "dir");
  await assert.rejects(
    resolveSafeDossierPath(root, "linked/dossier.json"),
    /symlink component/,
  );
});

test("verifies real file bytes and exact candidate commit", async t => {
  const { root, dossier } = await fixture(t);
  const result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.deepEqual(result.errors, []);
  assert.equal(result.verifiedFiles, 3);
});

test("rejects path traversal and absolute paths", async t => {
  const { root, dossier } = await fixture(t);
  dossier.auditPath = "../secret.json";
  let result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("safe relative path")));
  dossier.auditPath = path.join(root, "evidence", "audit.json");
  result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("safe relative path")));
});

test("rejects symlinks in any evidence path component", async t => {
  const { root, dossier } = await fixture(t);
  await symlink(path.join(root, "evidence", "audit.json"), path.join(root, "evidence", "alias.json"));
  dossier.auditPath = "evidence/alias.json";
  const result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("symlink")));
});

test("rejects hard-linked evidence files", async t => {
  const { root, dossier } = await fixture(t);
  await link(path.join(root, "evidence", "audit.json"), path.join(root, "evidence", "hardlink.json"));
  dossier.auditPath = "evidence/hardlink.json";
  const result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("hard-linked")));
});

test("rejects missing and empty evidence files", async t => {
  const { root, dossier } = await fixture(t);
  dossier.auditPath = "evidence/missing.json";
  let result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("cannot verify")));
  await writeFile(path.join(root, "evidence", "empty.json"), "");
  dossier.auditPath = "evidence/empty.json";
  result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("empty")));
});

test("rejects a digest that does not match the referenced bytes", async t => {
  const { root, dossier } = await fixture(t);
  dossier.auditSha256 = "0".repeat(64);
  const result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("SHA-256 mismatch")));
});

test("rejects conflicting duplicate aliases and hardlink aliases", async t => {
  const { root, dossier } = await fixture(t);
  dossier.secondPath = "evidence/audit.json";
  dossier.secondSha256 = "0".repeat(64);
  let result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("conflicting digests")));
  await link(path.join(root, "evidence", "audit.json"), path.join(root, "evidence", "alias.json"));
  dossier.secondPath = "evidence/alias.json";
  dossier.secondSha256 = digest;
  result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("hard-linked")));
});

test("rejects stale provider, device, or dossier commit bindings", async t => {
  const { root, dossier } = await fixture(t);
  dossier.liveGroqProvider.candidateCommit = "b".repeat(40);
  const result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("liveGroqProvider.candidateCommit")));
});

test("requires each digest to have a corresponding file path", async t => {
  const { root, dossier } = await fixture(t);
  delete dossier.auditPath;
  const result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("required safe relative path")));
});


test("reconciles exhaustive object and parking IDs to the hashed inventory bytes", async t => {
  const { root, dossier } = await fixture(t);
  dossier.sourceObjectIds = ["statue-planter", "invented-object"];
  let result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("source inventory file IDs")));
  dossier.sourceObjectIds = ["statue-planter", "statue-pedestal"];
  dossier.parkingLines.sourceLineIds = ["parking-marking-a", "invented-line"];
  result = await verifyEvidenceDossier({ dossier, root, candidateCommit: candidate });
  assert.ok(result.errors.some(error => error.includes("source inventory file IDs")));
});

test("pins inventory bytes to the supplied inventory digest", async t => {
  const { root, dossier } = await fixture(t);
  dossier.inventoryPath = "evidence/audit.json";
  dossier.inventorySha256 = digest;
  const result = await verifyEvidenceDossier({
    dossier, root, candidateCommit: candidate, expectedInventorySha256: "f".repeat(64),
  });
  assert.ok(result.errors.some(error => error.includes("pinned inventory digest")));
});
