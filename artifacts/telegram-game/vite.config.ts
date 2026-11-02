import fs from 'fs';
import { createHash } from 'node:crypto';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { CELL, COLS, ROWS } from '../../lib/shared/src/collisionData';
import { validateCollisionDocument } from '../../lib/shared/src/collision/vectorCollision';

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only API for the in-app Collision Editor (/collision-editor).
//
// Lets a developer paint collision cells in the browser and "commit" them by
// rewriting `src/game/collisionData.ts` on disk. This only runs under
// `vite dev` (apply: 'serve') — it has no effect on the production static
// build, which is why the editor page itself checks `import.meta.env.DEV`
// before offering the commit action.
// ─────────────────────────────────────────────────────────────────────────────

/** Encode a flat 0/1 grid into the alternating-run-length format `collisionData.ts` expects. */
function encodeRuns(grid: number[]): number[] {
  const runs: number[] = [];
  let current: 0 | 1 = 0; // decode always starts assuming a walkable(0) run
  let count = 0;
  for (const cell of grid) {
    const v: 0 | 1 = cell ? 1 : 0;
    if (v === current) {
      count++;
    } else {
      runs.push(count);
      current = v;
      count = 1;
    }
  }
  runs.push(count);
  return runs;
}

// Cross-origin fetches that set a custom header must pass a CORS preflight;
// since this server never sends Access-Control-Allow-Origin, the browser
// blocks the real request unless it's same-origin. This closes off the
// classic "text/plain form" JSON-CSRF trick (native <form> submissions can
// never add custom headers), without needing a full CSRF-token exchange for
// what is a throwaway dev-only tool.
const EDITOR_HEADER = 'x-collision-editor';
const MAX_BODY_BYTES = 1_000_000; // grid is ~30KB of JSON; generous cap against abuse


const VECTOR_EDITOR_HEADER = 'x-vector-collision-editor';
const VECTOR_EDITOR_MAX_BODY_BYTES = 512_000;

function vectorCollisionEditorApiPlugin(): Plugin {
  return {
    name: 'vector-collision-editor-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__vector-collision-api', (req, res, next) => {
        const route = (req.url || '/').split('?')[0];
        if (route !== '/document') {
          next();
          return;
        }

        const respond = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(payload));
        };

        // CI injects a disposable path so the dev API can be tested without
        // leaving generated candidate geometry in the production source tree.
        const filePath = process.env.VECTOR_COLLISION_DOCUMENT_PATH
          ? path.resolve(process.env.VECTOR_COLLISION_DOCUMENT_PATH)
          : path.resolve(
              import.meta.dirname,
              '../../lib/shared/src/collision/collision.v1.json',
            );

        if (req.method === 'GET') {
          try {
            const exists = fs.existsSync(filePath);
            const document = exists
              ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
              : { version: 1, mapW: 3224, mapH: 1858, shapes: [] };
            const errors = validateCollisionDocument(document);
            if (errors.length) {
              respond(500, { error: 'Saved candidate document is invalid: ' + errors.slice(0, 5).join('; ') });
              return;
            }
            respond(200, { document, saved: exists });
          } catch (error) {
            respond(500, { error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }

        if (req.method !== 'POST') {
          respond(405, { error: 'Method not allowed' });
          return;
        }

        // This is a local authoring endpoint, not a public game API. Require a
        // same-origin browser request and a custom header (CORS preflight blocks
        // cross-origin form/script posts that cannot set the header).
        const origin = req.headers.origin;
        const host = req.headers.host;
        let sameOrigin = false;
        try {
          sameOrigin = typeof origin === 'string' && typeof host === 'string' && new URL(origin).host === host;
        } catch {
          sameOrigin = false;
        }
        if (!sameOrigin || req.headers[VECTOR_EDITOR_HEADER] !== '1') {
          respond(403, { error: 'Forbidden: same-origin editor request required' });
          return;
        }
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          respond(415, { error: 'Content-Type must be application/json' });
          return;
        }

        let body = '';
        let bytes = 0;
        let tooLarge = false;
        req.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > VECTOR_EDITOR_MAX_BODY_BYTES) {
            tooLarge = true;
            body = '';
            return;
          }
          if (!tooLarge) body += chunk.toString('utf8');
        });
        req.on('end', () => {
          if (tooLarge) {
            respond(413, { error: 'Candidate document exceeds 512 KB' });
            return;
          }
          try {
            const candidate = JSON.parse(body) as unknown;
            const errors = validateCollisionDocument(candidate);
            if (errors.length) {
              respond(400, { error: errors.slice(0, 12).join('; ') });
              return;
            }
            const document = candidate as { version: number; mapW: number; mapH: number; shapes: unknown[] };
            if (document.mapW !== 3224 || document.mapH !== 1858) {
              respond(400, { error: 'Candidate dimensions must exactly match the 3224×1858 world' });
              return;
            }
            if (!Array.isArray(document.shapes) || document.shapes.length === 0) {
              respond(400, { error: 'Refusing to save an empty document; author and review real map contours first' });
              return;
            }
            if (document.shapes.length > 1000) {
              respond(400, { error: 'Candidate document may contain at most 1000 shapes' });
              return;
            }

            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const temporaryPath = filePath + '.' + process.pid + '.' + Date.now() + '.tmp';
            const backupDirectory = path.join(path.dirname(filePath), '.backups');
            const serialized = JSON.stringify(document, null, 2) + '\n';
            const contentHash = createHash('sha256').update(serialized).digest('hex');
            try {
              if (fs.existsSync(filePath)) {
                fs.mkdirSync(backupDirectory, { recursive: true });
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupName = 'collision.v1.' + stamp + '.' + process.pid + '.json';
                fs.copyFileSync(filePath, path.join(backupDirectory, backupName));
                const backups = fs.readdirSync(backupDirectory)
                  .filter(name => name.startsWith('collision.v1.') && name.endsWith('.json'))
                  .sort();
                for (const stale of backups.slice(0, Math.max(0, backups.length - 20))) {
                  fs.unlinkSync(path.join(backupDirectory, stale));
                }
              }
              fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
              fs.renameSync(temporaryPath, filePath);
            } catch (error) {
              try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* best-effort cleanup */ }
              throw error;
            }
            const backupCount = fs.existsSync(backupDirectory)
              ? fs.readdirSync(backupDirectory).filter(name => name.startsWith('collision.v1.') && name.endsWith('.json')).length
              : 0;
            respond(200, { ok: true, saved: true, shapeCount: document.shapes.length, contentHash, backupCount });
          } catch (error) {
            respond(400, { error: error instanceof Error ? error.message : String(error) });
          }
        });
      });
    },
  };
}

function collisionEditorApiPlugin(): Plugin {
  return {
    name: 'collision-editor-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__collision-editor-api/commit', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        if (req.headers[EDITOR_HEADER] !== '1') {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
        let body = '';
        let bytes = 0;
        let tooLarge = false;
        req.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) {
            tooLarge = true;
            res.statusCode = 413;
            res.end(JSON.stringify({ error: 'Payload too large' }));
            req.destroy();
            return;
          }
          body += chunk;
        });
        req.on('end', () => {
          if (tooLarge) return;
          try {
            const parsed = JSON.parse(body) as {
              cols?: number; rows?: number; grid?: number[];
            };
            const { cols, rows, grid } = parsed;
            const gridValid = Array.isArray(grid) &&
              grid.length === COLS * ROWS &&
              grid.every((v) => v === 0 || v === 1);
            if (cols !== COLS || rows !== ROWS || !gridValid) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: `Expected a ${COLS}x${ROWS} grid of 0/1 cells (${COLS * ROWS} total); ` +
                  `got cols=${cols} rows=${rows} length=${grid?.length}`,
              }));
              return;
            }
            const runs = encodeRuns(grid);
            // Write to the canonical location in lib/shared (used by both client and server).
            const filePath = path.resolve(import.meta.dirname, '../../lib/shared/src/collisionData.ts');
            const content = `// Maintained via the in-app Collision Editor (/collision-editor).
// Originally seeded by scripts/src/analyzeCollisionMap.ts from a red-line
// reference image; manual edits made through the editor live here now.
// Re-running analyzeCollisionMap.ts will overwrite any manual edits.
// RLE-encoded row-major grid: alternating run lengths starting with a
// walkable(0) run. Grid is COLS x ROWS cells of CELL px each.
export const CELL = ${CELL};
export const COLS = ${COLS};
export const ROWS = ${ROWS};
export const RUNS: number[] = [${runs.join(',')}];
`;
            fs.writeFileSync(filePath, content, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
      });
    },
  };
}

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    collisionEditorApiPlugin(),
    vectorCollisionEditorApiPlugin(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // Keep API and WebSocket traffic same-origin in the Replit preview.
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true, ws: true },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
