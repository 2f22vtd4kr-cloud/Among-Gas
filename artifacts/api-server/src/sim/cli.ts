/**
 * CLI for the headless simulation runner — SINGLE_PLAY.md §8, Phase D.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run simulate -- --games 100 --bots 5 --impostors 1
 *
 * Flags:
 *   --games        Total games to run (default 20)
 *   --bots         Bots per game (default 6)
 *   --impostors    Force a specific impostor count (default: standard playerCount table)
 *   --concurrency  Games running at once (default min(25, games))
 *   --timeoutMs    Per-game safety timeout in ms (default 120000)
 *   --quiet        Suppress per-event NDJSON lines (still prints per-game results + summary)
 *
 * Output: NDJSON to stdout — one line per lifecycle event, one line per
 * finished game (`type":"gameResult"`), and one final `"type":"summary"`
 * line. Human-readable progress + the same summary go to stderr.
 */
import { runSimulationBatch } from './simulateGame.js';
import { MAX_PLAYERS } from '../ws/lobby.js';
import type { SimGameResult } from './types.js';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

function fmtDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  return `${Math.floor(totalSec / 60)}m${totalSec % 60}s`;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : 'n/a';
}

function summarize(results: SimGameResult[], wallMs: number) {
  const finished = results.filter(r => r.winner !== 'timeout');
  const timeouts = results.length - finished.length;
  const crewWins = finished.filter(r => r.winner === 'crew').length;
  const impostorWins = finished.filter(r => r.winner === 'impostor').length;
  const avg = (f: (r: SimGameResult) => number) =>
    finished.length > 0 ? finished.reduce((s, r) => s + f(r), 0) / finished.length : 0;

  return {
    type: 'summary' as const,
    games: results.length,
    timeouts,
    crewWins,
    impostorWins,
    crewWinRatePct: finished.length > 0 ? Math.round((crewWins / finished.length) * 100) : null,
    impostorWinRatePct: finished.length > 0 ? Math.round((impostorWins / finished.length) * 100) : null,
    avgDurationMs: Math.round(avg(r => r.durationMs)),
    avgTasksCompleted: Number(avg(r => r.tasksCompleted).toFixed(1)),
    avgKills: Number(avg(r => r.kills).toFixed(1)),
    avgMeetings: Number(avg(r => r.meetings).toFixed(1)),
    wallMs,
  };
}

/** Parses `raw` as a positive integer for `flag`, throwing a clear error otherwise. */
function requirePositiveInt(raw: string | undefined, flag: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const n = raw === undefined ? fallback : Number(raw);
  const min = opts?.min ?? 1;
  if (!Number.isInteger(n) || n < min || (opts?.max !== undefined && n > opts.max)) {
    const range = opts?.max !== undefined ? `an integer between ${min} and ${opts.max}` : `an integer >= ${min}`;
    throw new Error(`--${flag} must be ${range} (got: ${raw ?? n})`);
  }
  return n;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const games = requirePositiveInt(args.games, 'games', 20);
  const bots = requirePositiveInt(args.bots, 'bots', 6, { min: 2, max: MAX_PLAYERS });
  const impostors = args.impostors !== undefined
    ? requirePositiveInt(args.impostors, 'impostors', 0, { min: 1, max: bots - 1 })
    : undefined;
  const concurrency = requirePositiveInt(args.concurrency, 'concurrency', Math.min(25, games));
  const timeoutMs = requirePositiveInt(args.timeoutMs, 'timeoutMs', 120_000, { min: 1000 });
  const quiet = args.quiet === 'true';

  console.error(
    `[simulate] ${games} game(s), ${bots} bots/game` +
    (impostors !== undefined ? `, ${impostors} impostor(s) forced` : ', default impostor count') +
    `, concurrency=${concurrency}, timeout=${timeoutMs}ms`,
  );

  const startedAt = Date.now();
  const results = await runSimulationBatch({
    games, bots, impostors, concurrency, timeoutMs,
    onEvent: (event) => { if (!quiet) console.log(JSON.stringify(event)); },
    onGameResult: (result) => console.log(JSON.stringify({ type: 'gameResult', ...result })),
  });

  const summary = summarize(results, Date.now() - startedAt);
  console.log(JSON.stringify(summary));

  console.error('');
  console.error(`── Simulation results (${summary.games} games, ${fmtDuration(summary.wallMs)} wall-clock) ──`);
  console.error(`Crewmate win rate: ${pct(summary.crewWins, summary.games - summary.timeouts)}   Impostor win rate: ${pct(summary.impostorWins, summary.games - summary.timeouts)}`);
  console.error(`Avg game length:   ${fmtDuration(summary.avgDurationMs)}   Avg tasks completed: ${summary.avgTasksCompleted}   Avg kills/game: ${summary.avgKills}   Avg meetings/game: ${summary.avgMeetings}`);
  if (summary.timeouts > 0) {
    console.error(`⚠️  ${summary.timeouts} game(s) hit the --timeoutMs safety timeout without reaching GAMEOVER`);
  }
}

main()
  .catch((err) => {
    console.error('[simulate] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
