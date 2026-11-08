import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const gameRoot = path.resolve(import.meta.dirname, "../artifacts/telegram-game");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".html"]);
const references = [];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (absolute === path.join(gameRoot, "public", "au-assets")) continue;
      scan(absolute);
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    const content = fs.readFileSync(absolute, "utf8");
    if (/au-assets[\\/]/i.test(content)) {
      references.push(path.relative(gameRoot, absolute));
    }
  }
}

scan(gameRoot);
assert.deepEqual(
  references,
  [],
  "application source must not load uncleared legacy au-assets files",
);
console.log("ASSET PROVENANCE TESTS PASSED: no application-source references to uncleared au-assets files");
