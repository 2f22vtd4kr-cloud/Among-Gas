import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const runtimeRoots = [
  path.join(root, "artifacts/telegram-game/src"),
  path.join(root, "artifacts/api-server/src"),
];
const forbidden = [
  /@workspace\/shared\/collision\/productionWorld/,
  /from\s+['"][^'"]*productionWorld(?:\.js)?['"]/,
  /PRODUCTION_COLLISION_WORLD/,
];

async function collect(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const violations = [];
for (const runtimeRoot of runtimeRoots) {
  for (const file of await collect(runtimeRoot)) {
    const source = await fs.readFile(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(source)) violations.push(path.relative(root, file) + ": " + pattern);
    }
  }
}
assert.deepEqual(violations, [],
  "The automatically generated vector preview must remain isolated from live client/server gameplay");
console.log("Vector runtime isolation passed: gameplay remains on the reviewed raster authority.");
