import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const realRepoRoot = await realpath(repoRoot);
const collisionDir = resolve(repoRoot, "lib/shared/src/collision");
const zoneIds = Array.from({ length: 12 }, (_, index) => `Z${String(index + 1).padStart(2, "0")}`);
const expectedRecords = new Set(zoneIds.map(id => `collision.zone-${id}.review.v1.json`));
const entries = (await readdir(collisionDir)).filter(name => /^collision\.zone-Z\d{2}\.review\.v1\.json$/.test(name));
const errors = [];

if (entries.length !== expectedRecords.size || entries.some(name => !expectedRecords.has(name))) {
  errors.push(`Expected exactly 12 canonical zone review files; found ${entries.length}`);
}

for (const zoneId of zoneIds) {
  const recordPath = resolve(collisionDir, `collision.zone-${zoneId}.review.v1.json`);
  let record;
  try {
    record = JSON.parse(await readFile(recordPath, "utf8"));
  } catch (error) {
    errors.push(`${zoneId}: cannot read/parse review record: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  if (record.zone !== zoneId) errors.push(`${zoneId}: record zone identifier does not match filename`);
  if (!Array.isArray(record.sourceEvidence) || record.sourceEvidence.length === 0) {
    errors.push(`${zoneId}: source evidence is missing`);
    continue;
  }

  for (let index = 0; index < record.sourceEvidence.length; index++) {
    const evidence = record.sourceEvidence[index];
    const label = `${zoneId} evidence ${index + 1}`;
    if (!evidence || typeof evidence !== "object" || typeof evidence.sourcePath !== "string" || !evidence.sourcePath.trim()) {
      errors.push(`${label}: sourcePath is missing`);
      continue;
    }
    if (isAbsolute(evidence.sourcePath)) {
      errors.push(`${label}: absolute source paths are not allowed`);
      continue;
    }
    const absolutePath = resolve(repoRoot, evidence.sourcePath);
    const relativePath = relative(repoRoot, absolutePath);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      errors.push(`${label}: sourcePath escapes the repository`);
      continue;
    }
    let bytes;
    try {
      const canonicalPath = await realpath(absolutePath);
      const canonicalRelativePath = relative(realRepoRoot, canonicalPath);
      if (canonicalRelativePath === ".." || canonicalRelativePath.startsWith(`..${sep}`) || isAbsolute(canonicalRelativePath)) {
        errors.push(`${label}: sourcePath resolves outside the repository through a symlink`);
        continue;
      }
      bytes = await readFile(canonicalPath);
      execFileSync("git", ["ls-files", "--error-unmatch", relativePath], { cwd: repoRoot, stdio: "ignore" });
    } catch {
      errors.push(`${label}: source file is missing or not tracked by Git (${evidence.sourcePath})`);
      continue;
    }
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== String(evidence.sourceSha256).toLowerCase()) {
      errors.push(`${label}: SHA-256 mismatch for ${evidence.sourcePath}`);
    }
    let metadata;
    try {
      metadata = await sharp(bytes).metadata();
    } catch {
      errors.push(`${label}: source is not a readable raster image (${evidence.sourcePath})`);
      continue;
    }
    if (metadata.width !== evidence.sourceWidth || metadata.height !== evidence.sourceHeight) {
      errors.push(`${label}: recorded dimensions ${evidence.sourceWidth}x${evidence.sourceHeight} do not match actual ${metadata.width}x${metadata.height}`);
    }
  }
}

if (errors.length) {
  console.error("ZONE SOURCE EVIDENCE VERIFICATION FAILED");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`ZONE SOURCE EVIDENCE VERIFIED: ${zoneIds.length} tracked review records; every referenced raster exists and matches its recorded SHA-256 and native dimensions. This verifies provenance only, not trace quality, reviewer identity, or design approval.`);
}
