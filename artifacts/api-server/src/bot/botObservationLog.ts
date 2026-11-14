export type BotObservationSource = "model" | "fallback" | "deadline-fallback" | "stale";

export interface BotObservationEntry {
  readonly sequence: number;
  readonly timestampMs: number;
  readonly botSlot: number;
  readonly decision: string;
  readonly observation: Readonly<Record<string, unknown>>;
  readonly fallback: unknown;
  source: BotObservationSource | "pending";
  selected?: unknown;
  reason?: string;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Bounded in-memory trace of the public inputs supplied to autonomous bot
 * decisions. It deliberately has no persistence or credential fields.
 */
export class BotObservationLog {
  private readonly entries: BotObservationEntry[] = [];
  private nextSequence = 1;

  constructor(private readonly capacity = 64) {}

  record(
    botSlot: number,
    decision: string,
    observation: Readonly<Record<string, unknown>>,
    fallback: unknown,
  ): number {
    const sequence = this.nextSequence++;
    this.entries.push({
      sequence,
      timestampMs: Date.now(),
      botSlot,
      decision,
      observation: cloneJson(observation),
      fallback: cloneJson(fallback),
      source: "pending",
    });
    while (this.entries.length > Math.max(1, this.capacity)) this.entries.shift();
    return sequence;
  }

  resolve(
    sequence: number,
    source: BotObservationSource,
    selected: unknown,
    reason?: string,
  ): void {
    const entry = this.entries.find(candidate => candidate.sequence === sequence);
    if (!entry) return;
    entry.source = source;
    entry.selected = cloneJson(selected);
    if (reason) entry.reason = reason.slice(0, 160);
  }

  snapshot(): readonly BotObservationEntry[] {
    return this.entries.map(entry => cloneJson(entry));
  }
}
