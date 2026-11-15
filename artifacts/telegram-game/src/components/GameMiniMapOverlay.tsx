import React from 'react';
import { MAP_W, MAP_H } from '../game/collisionMap';
import { TASK_DEFS } from '@workspace/shared/tasks';

interface GameMiniMapOverlayProps {
  open: boolean;
  english: boolean;
  isCrewmate: boolean;
  tasks: ReadonlyArray<{ taskId: number; completedSteps: number }>;
  taskLabel: (name: string) => string;
  playerPosition: { x: number; y: number };
  inVent: boolean;
  overviewSrc: string;
  onClose: () => void;
}

/** Presentation-only overview map; task and player state remain owned by GameMap. */
export default function GameMiniMapOverlay({
  open,
  english,
  isCrewmate,
  tasks,
  taskLabel,
  playerPosition,
  inVent,
  overviewSrc,
  onClose,
}: GameMiniMapOverlayProps) {
  if (!open) return null;

  const unfinishedTasks = isCrewmate
    ? tasks.filter(task => {
      const definition = TASK_DEFS.find(item => item.id === task.taskId);
      return definition !== undefined && task.completedSteps < definition.steps;
    })
    : [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 75,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'max(12px, env(safe-area-inset-top, 12px)) 12px max(12px, env(safe-area-inset-bottom, 12px))',
      background: 'rgba(2,8,15,0.94)', backdropFilter: 'blur(6px)', color: '#e4f5ff', fontFamily: 'sans-serif',
    }}>
      <div onClick={event => event.stopPropagation()} style={{
        width: 'min(96vw, 900px)', maxHeight: '100%', overflowY: 'auto',
        borderRadius: 14, padding: 12, background: 'linear-gradient(155deg, rgba(18,42,55,0.98), rgba(5,14,25,0.99))',
        border: '1px solid rgba(100,210,230,0.55)', boxShadow: '0 16px 60px rgba(0,0,0,0.55)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 'clamp(18px, 4vw, 25px)', letterSpacing: '0.07em' }}>
              {english ? 'FACILITY MAP' : 'КАРТА ОБЪЕКТА'}
            </div>
            <div style={{ marginTop: 3, fontSize: 11, color: 'rgba(190,225,235,0.68)' }}>
              {isCrewmate
                ? (english ? 'Your unfinished tasks are marked in yellow' : 'Ваши незавершённые задания отмечены жёлтым')
                : (english ? 'Map overview' : 'Обзор карты')}
            </div>
          </div>
          <button onClick={onClose} aria-label={english ? 'Close map' : 'Закрыть карту'} style={{
            width: 40, height: 40, flexShrink: 0, borderRadius: 10, border: '1px solid rgba(130,195,215,0.35)',
            background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 23, fontWeight: 800, touchAction: 'manipulation',
          }}>×</button>
        </div>
        <div style={{
          position: 'relative', width: '100%', aspectRatio: MAP_W / MAP_H,
          overflow: 'hidden', borderRadius: 9, border: '1px solid rgba(120,200,220,0.4)', background: '#13212a',
        }}>
          <img src={overviewSrc} alt={english ? 'Among Gas map' : 'Карта Among Gas'} draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none' }} />
          {unfinishedTasks.map(task => {
            const definition = TASK_DEFS.find(item => item.id === task.taskId);
            if (!definition) return null;
            return <span key={task.taskId} title={taskLabel(definition.name)} style={{
              position: 'absolute', left: `${definition.x / MAP_W * 100}%`, top: `${definition.y / MAP_H * 100}%`,
              transform: 'translate(-50%,-50%)', display: 'grid', placeItems: 'center',
              width: 'clamp(13px, 2.8vw, 22px)', height: 'clamp(13px, 2.8vw, 22px)',
              borderRadius: '50%', background: '#f1c40f', border: '1px solid #fff5b4',
              color: '#493900', fontSize: 'clamp(10px, 1.7vw, 15px)', fontWeight: 950,
              boxShadow: '0 0 8px rgba(255,211,48,0.72)',
            }}>!</span>;
          })}
          {!inVent && (
            <span title={english ? 'You are here' : 'Вы здесь'}
              aria-label={english ? 'Your location' : 'Ваше местоположение'} style={{
                position: 'absolute', left: `${playerPosition.x / MAP_W * 100}%`, top: `${playerPosition.y / MAP_H * 100}%`,
                transform: 'translate(-50%,-50%)', width: 'clamp(12px, 2.6vw, 19px)', height: 'clamp(12px, 2.6vw, 19px)',
                borderRadius: '50%', background: '#45e6bc', border: '2px solid #fff',
                boxShadow: '0 0 0 4px rgba(69,230,188,0.25), 0 0 8px #000',
              }} />
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, padding: '8px 2px 0', fontSize: 11, color: 'rgba(220,239,242,0.7)' }}>
          <span>● {english ? 'Your location' : 'Ваше местоположение'}</span>
          <span>! {english ? 'Unfinished task' : 'Незавершённое задание'}</span>
          <span>{unfinishedTasks.length} {english ? 'tasks remaining' : 'заданий осталось'}</span>
        </div>
      </div>
    </div>
  );
}
