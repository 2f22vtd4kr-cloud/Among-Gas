/**
 * Bounded, server-only audit log of the public information a bot considered.
 *
 * Records intentionally contain slot IDs, counts, and decision outcomes only.
 * They never retain player names, raw chat, roles, coordinates, prompts, or keys.
 * A WeakMap ties the ring buffer to the in-memory lobby lifetime; there is no
 * persistence or public API surface for these diagnostics.
 */

export type BotObservationPhase = "ROAMING" | "MEETING";
export type BotObservationKind =
  | "visible-target-search"
  | "task-selection"
  | "meeting-dialogue-context"
  | "meeting-dialogue-result"
  | "meeting-vote-context"
  | "meeting-vote-result";
export type BotObservationDecision = "observed" | "requested" | "accepted" | "fallback" | "none";
export type BotDialogueReplyKind = "question" | "acknowledge" | "quote" | "compare" | "fallback";

export interface BotObservationRecord {
  atMs: number;
  botSlot: number;
  phase: BotObservationPhase;
  kind: BotObservationKind;
  observedPlayerSlots?: number[];
  observedTaskIds?: number[];
  transcriptMessageIndexes?: number[];
  candidateCount?: number;
  selectedTargetSlot?: number | null;
  selectedTaskId?: number | null;
  replyKind?: BotDialogueReplyKind;
  usedFallback?: boolean;
  decision: BotObservationDecision;
}

const MAX_OBSERVATIONS_PER_LOBBY = 256;
const observationsByLobby = new WeakMap<object, BotObservationRecord[]>();

function validSlot(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 31;
}

function uniqueSlots(values: readonly number[] | undefined): number[] | undefined {
  if (!values) return undefined;
  return [...new Set(values.filter(validSlot))].slice(0, 32);
}

function boundedTaskIds(values: readonly number[] | undefined): number[] | undefined {
  if (!values) return undefined;
  return [...new Set(values.filter(value =>
    Number.isInteger(value) && value >= 0 && value <= 4095,
  ))].slice(0, 64);
}

function boundedIndexes(values: readonly number[] | undefined): number[] | undefined {
  if (!values) return undefined;
  return [...new Set(values.filter(value =>
    Number.isInteger(value) && value >= 0,
  ))].slice(-12);
}

export function recordBotObservation(
  lobby: object,
  input: Omit<BotObservationRecord, "atMs"> & { atMs?: number },
): void {
  if (!lobby || !validSlot(input.botSlot)) return;
  const record: BotObservationRecord = {
    atMs: Number.isFinite(input.atMs) ? Number(input.atMs) : Date.now(),
    botSlot: input.botSlot,
    phase: input.phase === "MEETING" ? "MEETING" : "ROAMING",
    kind: input.kind,
    decision: input.decision,
  };
  const observedPlayerSlots = uniqueSlots(input.observedPlayerSlots);
  if (observedPlayerSlots) record.observedPlayerSlots = observedPlayerSlots;
  const observedTaskIds = boundedTaskIds(input.observedTaskIds);
  if (observedTaskIds) record.observedTaskIds = observedTaskIds;
  const transcriptMessageIndexes = boundedIndexes(input.transcriptMessageIndexes);
  if (transcriptMessageIndexes) record.transcriptMessageIndexes = transcriptMessageIndexes;
  if (Number.isInteger(input.candidateCount) && Number(input.candidateCount) >= 0) {
    record.candidateCount = Number(input.candidateCount);
  }
  if (input.selectedTargetSlot === null || validSlot(input.selectedTargetSlot)) {
    record.selectedTargetSlot = input.selectedTargetSlot;
  }
  if (input.selectedTaskId === null ||
      (Number.isInteger(input.selectedTaskId) && Number(input.selectedTaskId) >= 0 && Number(input.selectedTaskId) <= 4095)) {
    record.selectedTaskId = input.selectedTaskId;
  }
  if (input.replyKind) record.replyKind = input.replyKind;
  if (typeof input.usedFallback === "boolean") record.usedFallback = input.usedFallback;

  const log = observationsByLobby.get(lobby) ?? [];
  log.push(record);
  if (log.length > MAX_OBSERVATIONS_PER_LOBBY) {
    log.splice(0, log.length - MAX_OBSERVATIONS_PER_LOBBY);
  }
  observationsByLobby.set(lobby, log);
}

export function getBotObservationLog(lobby: object): BotObservationRecord[] {
  return (observationsByLobby.get(lobby) ?? []).map(record => ({
    ...record,
    observedPlayerSlots: record.observedPlayerSlots?.slice(),
    observedTaskIds: record.observedTaskIds?.slice(),
    transcriptMessageIndexes: record.transcriptMessageIndexes?.slice(),
  }));
}

export function clearBotObservationLog(lobby: object): void {
  observationsByLobby.delete(lobby);
}
