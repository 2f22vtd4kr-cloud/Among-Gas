import assert from "node:assert/strict";
import { link, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeEvidenceOutput } from "./safeEvidenceOutput";

const root = await mkdtemp(path.join(os.tmpdir(), "among-gas-evidence-root-"));
const outside = await mkdtemp(path.join(os.tmpdir(), "among-gas-evidence-outside-"));

try {
  const destination = await writeEvidenceOutput(root, "artifacts/release-evidence/result.json", "{\"passed\":true}\n");
  assert.equal(await readFile(destination, "utf8"), "{\"passed\":true}\n");
  assert.equal((await lstat(destination)).mode & 0o777, 0o600,
    "evidence files must be owner-readable/writable only");

  await symlink(outside, path.join(root, "linked-directory"), "dir");
  await assert.rejects(
    writeEvidenceOutput(root, "linked-directory/escape.json", "must not be written"),
    /symlink|outside the repository/,
    "a symlinked parent directory must be rejected",
  );
  await assert.rejects(
    readFile(path.join(outside, "escape.json"), "utf8"),
    { code: "ENOENT" },
    "rejected parent traversal must not create an outside file",
  );

  const outsideTarget = path.join(outside, "target.json");
  await writeFile(outsideTarget, "unchanged");
  await symlink(outsideTarget, path.join(root, "linked-file.json"), "file");
  await assert.rejects(
    writeEvidenceOutput(root, "linked-file.json", "overwrite"),
    /linked file|ELOOP/,
    "a symlinked final target must be rejected",
  );
  assert.equal(await readFile(outsideTarget, "utf8"), "unchanged");

  const hardlinkTarget = path.join(outside, "hardlink.json");
  await writeFile(hardlinkTarget, "protected");
  await link(hardlinkTarget, path.join(root, "hardlinked.json"));
  await assert.rejects(
    writeEvidenceOutput(root, "hardlinked.json", "overwrite"),
    /linked file/,
    "a hard-linked evidence target must be rejected",
  );
  assert.equal(await readFile(hardlinkTarget, "utf8"), "protected");

  await assert.rejects(writeEvidenceOutput(root, "../escape.json", "bad"), /repository-relative|parent segments/);
  await assert.rejects(writeEvidenceOutput(root, path.join(outside, "absolute.json"), "bad"), /repository-relative/);
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}

console.log("PASS: Groq evidence output rejects parent traversal, symlinked parents/targets and hard links");
