import { runSimulationBatch } from './simulateGame.js';

async function main() {
  const eventsByCode = new Map<string, any[]>();
  const results = await runSimulationBatch({
    games: 50,
    bots: 5,
    impostors: 1,
    concurrency: 15,
    timeoutMs: 100000,
    onEvent: (event: any) => {
      const code = event.code;
      if (!code) return;
      if (!eventsByCode.has(code)) eventsByCode.set(code, []);
      eventsByCode.get(code)!.push(event);
    },
    onGameResult: () => {},
  });

  const timeouts = results.filter(r => r.winner === 'timeout');
  console.log(`timeouts: ${timeouts.length} / ${results.length}`);
  for (const t of timeouts) {
    console.log('--- TIMEOUT GAME', JSON.stringify(t));
    const events = eventsByCode.get(t.code) ?? [];
    for (const e of events.slice(-40)) console.log(JSON.stringify(e));
  }
}
main();
