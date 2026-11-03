/**
 * Compatibility entrypoint retained for the existing map-mechanics verifier.
 *
 * The authoritative generator is buildFineCollisionData.ts. `--check` keeps
 * the historical contract: regenerate into memory/worktree, compare the
 * canonical file, then restore it so a check is side-effect free.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonical = path.join(root, 'lib/shared/src/collisionDataFine.ts');
const before = fs.readFileSync(canonical, 'utf8');
const check = process.argv.includes('--check');

const result = spawnSync('pnpm', ['--filter', '@workspace/scripts', 'exec', 'tsx', 'src/buildFineCollisionData.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);

const generated = fs.readFileSync(canonical, 'utf8');
if (check) {
  fs.writeFileSync(canonical, before);
  if (generated !== before) {
    console.error('Fine collision canonical differs from the deterministic source-red-line generator.');
    process.exit(1);
  }
}
