import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}

/**
 * Write private evidence metadata without following symlinks out of the checkout.
 * Every existing/created parent is checked with lstat + realpath, and the final
 * file is opened with O_NOFOLLOW where the platform supports it.
 */
export async function writeEvidenceOutput(
  repoRoot: string,
  outputPath: string,
  contents: string,
): Promise<string> {
  if (!outputPath || path.isAbsolute(outputPath) || outputPath.includes("\0")) {
    throw new Error("Evidence output must be a non-empty repository-relative path");
  }
  const segments = outputPath.split(/[\\/]/);
  if (segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("Evidence output path must not contain empty, dot, or parent segments");
  }

  const canonicalRoot = await realpath(repoRoot);
  let parent = canonicalRoot;
  for (const segment of segments.slice(0, -1)) {
    const next = path.join(parent, segment);
    try {
      await mkdir(next, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstat(next);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error("Evidence output path must not traverse a symlink or non-directory");
    }
    const resolved = await realpath(next);
    if (!isWithin(canonicalRoot, resolved)) {
      throw new Error("Evidence output directory resolves outside the repository");
    }
    parent = resolved;
  }

  const destination = path.join(parent, segments[segments.length - 1]);
  try {
    const existing = await lstat(destination);
    if (existing.isSymbolicLink() || !existing.isFile() || existing.nlink > 1) {
      throw new Error("Evidence output target must be a regular, non-linked file");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(
    destination,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow,
    0o600,
  );
  try {
    await handle.chmod(0o600);
    await handle.writeFile(contents, { encoding: "utf8" });
  } finally {
    await handle.close();
  }
  return destination;
}
