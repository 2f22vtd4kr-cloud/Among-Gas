export interface SentWirePosition { wireX: number; wireY: number; }
export interface IncomingMovementEcho extends SentWirePosition { force?: boolean; }
export type MovementEchoClassification =
  | { kind: 'initial' }
  | { kind: 'correction' }
  | { kind: 'acknowledgement'; acknowledgedIndex: number }
  | { kind: 'stale' };

/** Stale ordinary 0xFF snapshots are ignored; only initial/forced updates snap. */
export function classifyMovementEcho(pendingSent: readonly SentWirePosition[], incoming: IncomingMovementEcho,
  hasAuthoritativePosition: boolean): MovementEchoClassification {
  if (incoming.force) return { kind: 'correction' };
  if (!hasAuthoritativePosition) return { kind: 'initial' };
  const acknowledgedIndex = pendingSent.findIndex(p => p.wireX === incoming.wireX && p.wireY === incoming.wireY);
  return acknowledgedIndex >= 0 ? { kind: 'acknowledgement', acknowledgedIndex } : { kind: 'stale' };
}
