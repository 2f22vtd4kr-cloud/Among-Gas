import { TASK_DEFS } from '@workspace/shared/tasks';
import {
  SABOTAGE_COMMS,
  SABOTAGE_DEFS,
  type SabotageSystemId,
} from '@workspace/shared/sabotage';

export interface MapTaskProgress {
  readonly taskId: number;
  readonly completedSteps: number;
}

export interface MapMarkerSabotage {
  readonly systemId: number;
  readonly fixedPads: readonly number[];
  readonly lockedTaskIds: readonly number[];
}

export interface MapWorldMarkerOptions {
  readonly context: CanvasRenderingContext2D;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly devicePixelRatio: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly scale: number;
  readonly tasks: readonly MapTaskProgress[];
  readonly sabotage: MapMarkerSabotage | null;
  readonly meetingActive: boolean;
  readonly nearestTaskId: number | null;
  readonly trackedTaskId: number | null;
  readonly role: string | null;
  readonly translateTaskName: (name: string | undefined) => string;
}

/**
 * Draw the map's task and sabotage overlays in their established order.
 *
 * This module deliberately owns only the two marker passes. It receives the
 * already-clamped camera transform and current game snapshot from GameMap;
 * it does not read React state, move the camera, or decide game actions.
 */
export function drawWorldMarkers({
  context: ctx,
  canvasWidth: cw,
  canvasHeight: ch,
  devicePixelRatio: dpr,
  cameraX: srcX,
  cameraY: srcY,
  scale,
  tasks,
  sabotage,
  meetingActive,
  nearestTaskId,
  trackedTaskId,
  role,
  translateTaskName,
}: MapWorldMarkerOptions): void {
  // ── Task markers (crewmates only, hidden during meetings) ────────────────
  if (tasks.length > 0 && !meetingActive && sabotage?.systemId !== SABOTAGE_COMMS) {
    ctx.textAlign = 'center';
    for (const task of tasks) {
      // The fixed action button already names the task in interaction range.
      if (task.taskId === nearestTaskId) continue;
      const def = TASK_DEFS[task.taskId];
      if (!def) continue;
      const done = task.completedSteps >= def.steps;
      const locked = sabotage?.systemId === 0x05 &&
        sabotage.lockedTaskIds.includes(task.taskId);
      const tx = Math.round((def.x - srcX) * scale);
      const ty = Math.round((def.y - srcY) * scale);
      if (tx < -60 || tx > cw + 60 || ty < -60 || ty > ch + 60) continue;
      const markerR = Math.round(9 * dpr);
      ctx.beginPath();
      ctx.arc(tx, ty, markerR + 3, 0, Math.PI * 2);
      ctx.fillStyle = locked ? 'rgba(255,40,40,0.25)' : done ? 'rgba(50,180,50,0.2)' : 'rgba(255,220,40,0.18)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx, ty, markerR, 0, Math.PI * 2);
      ctx.fillStyle = locked ? 'rgba(150,35,40,0.95)' : done ? 'rgba(50,180,50,0.85)' : 'rgba(255,210,30,0.9)';
      ctx.fill();
      ctx.strokeStyle = done ? 'rgba(30,140,30,0.9)' : 'rgba(180,140,0,0.9)';
      ctx.lineWidth = Math.round(1.5 * dpr);
      ctx.stroke();
      ctx.fillStyle = locked ? '#ffffff' : done ? '#0d3b0d' : '#3b2a00';
      ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(locked ? '×' : done ? '✓' : '!', tx, ty);
      ctx.textBaseline = 'top';
      ctx.font = `${Math.round(9 * dpr)}px sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = Math.round(3 * dpr);
      const taskLabel = translateTaskName(def.name);
      const label = locked ? `LOCKED · ${taskLabel}` : taskLabel;
      ctx.strokeText(label, tx, ty + markerR + 3);
      ctx.fillStyle = locked ? 'rgba(255,120,120,0.95)' : done ? 'rgba(120,255,120,0.85)' : 'rgba(255,235,80,0.9)';
      ctx.fillText(label, tx, ty + markerR + 3);
    }

    // Off-screen task compass points towards the selected or next unfinished task.
    if (role === 'crewmate') {
      const candidates = tasks.filter(task => {
        const def = TASK_DEFS.find(item => item.id === task.taskId);
        if (!def || task.completedSteps >= def.steps) return false;
        return !(sabotage?.systemId === 0x05 &&
          sabotage.lockedTaskIds.includes(task.taskId));
      });
      const target = candidates.find(task => task.taskId === trackedTaskId) ?? candidates[0];
      const def = target ? TASK_DEFS.find(item => item.id === target.taskId) : undefined;
      if (def && !meetingActive) {
        const tx = (def.x - srcX) * scale;
        const ty = (def.y - srcY) * scale;
        const margin = 30 * dpr;
        const inView = tx >= margin && tx <= cw - margin && ty >= margin && ty <= ch - margin;
        if (!inView) {
          const centerX = cw / 2;
          const centerY = ch / 2;
          const dx = tx - centerX;
          const dy = ty - centerY;
          const factorX = Math.abs(dx) > 0.001 ? (centerX - margin) / Math.abs(dx) : Number.POSITIVE_INFINITY;
          const factorY = Math.abs(dy) > 0.001 ? (centerY - margin) / Math.abs(dy) : Number.POSITIVE_INFINITY;
          const factor = Math.min(factorX, factorY);
          const ax = centerX + dx * factor;
          const ay = centerY + dy * factor;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.beginPath();
          ctx.moveTo(11 * dpr, 0);
          ctx.lineTo(-7 * dpr, -7 * dpr);
          ctx.lineTo(-4 * dpr, 0);
          ctx.lineTo(-7 * dpr, 7 * dpr);
          ctx.closePath();
          ctx.fillStyle = target.taskId === trackedTaskId
            ? 'rgba(112,223,193,0.98)'
            : 'rgba(255,220,70,0.95)';
          ctx.strokeStyle = 'rgba(0,0,0,0.88)';
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.textAlign = 'left';
  }

  // ── Sabotage pad markers (hidden during meetings) ───────────────────────
  const active = sabotage;
  if (active && !meetingActive) {
    const def = SABOTAGE_DEFS[active.systemId as SabotageSystemId];
    if (def) {
      ctx.textAlign = 'center';
      def.pads.forEach((pad, padId) => {
        const done = active.fixedPads.includes(padId);
        const tx = Math.round((pad.x - srcX) * scale);
        const ty = Math.round((pad.y - srcY) * scale);
        if (tx < -60 || tx > cw + 60 || ty < -60 || ty > ch + 60) return;
        const markerR = Math.round(10 * dpr);
        ctx.beginPath();
        ctx.arc(tx, ty, markerR + 3, 0, Math.PI * 2);
        ctx.fillStyle = done ? 'rgba(50,180,50,0.2)' : 'rgba(255,60,60,0.22)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx, ty, markerR, 0, Math.PI * 2);
        ctx.fillStyle = done ? 'rgba(50,180,50,0.85)' : 'rgba(230,50,50,0.9)';
        ctx.fill();
        ctx.strokeStyle = done ? 'rgba(30,140,30,0.9)' : 'rgba(140,0,0,0.9)';
        ctx.lineWidth = Math.round(1.5 * dpr);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(11 * dpr)}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(done ? '✓' : '!', tx, ty);
        ctx.textBaseline = 'top';
        ctx.font = `${Math.round(9 * dpr)}px sans-serif`;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = Math.round(3 * dpr);
        const translatedName = def.name;
        const label = def.pads.length > 1 ? `${translatedName} ${padId + 1}` : translatedName;
        ctx.strokeText(label, tx, ty + markerR + 3);
        ctx.fillStyle = done ? 'rgba(120,255,120,0.85)' : 'rgba(255,140,140,0.9)';
        ctx.fillText(label, tx, ty + markerR + 3);
      });
      ctx.textAlign = 'left';
    }
  }
}
