export interface AdminTableAgent {
  slot: number;
  username: string;
  x: number;
  y: number;
  alive: boolean;
}

interface AdminTablePlayer {
  slot: number;
  username: string;
}

interface AdminTablePosition {
  x: number;
  y: number;
  inVent?: boolean;
}

export function buildAdminTableAgents(input: {
  players: readonly AdminTablePlayer[];
  mySlot: number | null;
  remotePlayers: ReadonlyMap<number, AdminTablePosition>;
  localPosition: AdminTablePosition;
  myVentId: number | null;
  deadSlots: readonly number[];
}): AdminTableAgent[] {
  return input.players.flatMap(player => {
    const isLocal = player.slot === input.mySlot;
    const remote = isLocal ? undefined : input.remotePlayers.get(player.slot);
    if (isLocal && input.myVentId !== null) return [];
    if (!isLocal && (!remote || remote.inVent)) return [];
    const position = isLocal ? input.localPosition : remote!;
    return [{
      slot: player.slot,
      username: player.username,
      x: position.x,
      y: position.y,
      alive: !input.deadSlots.includes(player.slot),
    }];
  });
}
