import { fromWire, MAP_H, MAP_W } from '@workspace/shared/coords';

export interface RemotePlayerPosition {
  slot: number;
  x: number;
  y: number;
  inVent?: boolean;
}

/**
 * Apply a server position delta. If a packet contains our own slot, remove
 * any stale remote-map entry before reconciling the local predicted position.
 */
export function applyDeltaPacket(
  view: DataView,
  mySlot: number | null,
  remotePlayersMap: Map<number, RemotePlayerPosition>,
  onCorrection: (wireX: number, wireY: number, force?: boolean) => void,
): void {
  if (view.byteLength < 2) return;
  const count = view.getUint8(1);
  let off = 2;
  for (let i = 0; i < count; i++) {
    if (off + 5 > view.byteLength) break;
    const slot = view.getUint8(off++);
    const wireX = view.getInt16(off, true); off += 2;
    const wireY = view.getInt16(off, true); off += 2;
    if (slot === mySlot) {
      remotePlayersMap.delete(slot);
      onCorrection(wireX, wireY);
    } else {
      const x = fromWire(wireX, MAP_W);
      const y = fromWire(wireY, MAP_H);
      const previous = remotePlayersMap.get(slot);
      remotePlayersMap.set(slot, { slot, x, y, inVent: previous?.inVent ?? false });
    }
  }
}
