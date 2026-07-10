import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { CELL, COLS, ROWS } from '../../lib/shared/src/collisionData';

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
