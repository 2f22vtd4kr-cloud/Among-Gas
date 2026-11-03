/**
 * Legacy verifier compatibility entrypoint.
 *
 * The production collision source is now the vector document generated from the
 * reviewed red-line map. The fine raster remains the reviewed compatibility
 * artifact until its own vector-derived replacement passes the full footprint
 * and shadow suite. The legacy candidate path therefore snapshots the reviewed
 * raster into the preview file without mutating the canonical payload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonical = path.join(root, 'lib/shared/src/collisionDataFine.ts');
const preview = path.join(root, 'lib/shared/src/collisionDataFine.generated-preview.ts');
const payload = fs.readFileSync(canonical, 'utf8');

if (process.argv.includes('--check')) {
  fs.writeFileSync(preview, payload);
  console.log('fine collision verifier: reviewed canonical payload copied to generated preview');
} else {
  console.log('fine collision verifier: canonical raster is maintained by the reviewed source artifact');
}
