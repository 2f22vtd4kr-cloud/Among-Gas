import React from 'react';
import { MAP_W, MAP_H } from '../game/collisionMap';
import { ADMIN_DOT_COLORS, slotColor } from '../game/mapPresentation';
import type { AdminTableAgent } from '../game/adminTableAgents';

export interface GameAdminTableProps {
  agents: readonly AdminTableAgent[];
  english: boolean;
  onClose: () => void;
}

/** Presentation-only live Admin Table; player visibility is prepared by the game scene. */
export default function GameAdminTable({ agents, english, onClose }: GameAdminTableProps) {
  return (
    <div
      data-testid="game-admin-table"
      role="dialog"
      aria-modal="true"
      aria-label={english ? 'Admin Table' : 'Планшет администратора'}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 88,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
        background: 'rgba(2,8,15,0.94)', backdropFilter: 'blur(5px)',
        color: '#e4f5ff', fontFamily: 'sans-serif', overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(94vw, 920px)', maxHeight: '88dvh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          padding: '18px 14px 14px', borderRadius: 16,
          background: 'linear-gradient(155deg, rgba(18,42,55,0.98), rgba(5,14,25,0.99))',
          border: '1px solid rgba(100,210,230,0.55)',
          boxShadow: '0 16px 60px rgba(0,0,0,0.55)',
        }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 'clamp(19px, 4vw, 28px)', letterSpacing: '0.1em' }}>
              {english ? 'ADMIN TABLE' : 'ПЛАНШЕТ АДМИНИСТРАТОРА'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(190,225,235,0.68)', marginTop: 3 }}>
              {english ? `Live player locations · ${agents.length} visible` : `Позиции игроков в реальном времени · видно: ${agents.length}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={english ? 'Close Admin Table' : 'Закрыть планшет администратора'}
            style={{
              width: 42, height: 42, borderRadius: 12, border: '1px solid rgba(130,195,215,0.35)',
              background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 22, fontWeight: 800,
              touchAction: 'manipulation',
            }}
          >×</button>
        </div>

        <div
          data-testid="game-admin-table-map"
          style={{
            position: 'relative', width: '100%', aspectRatio: MAP_W / MAP_H,
            borderRadius: 10, overflow: 'hidden',
            border: '1px solid rgba(120,200,220,0.45)', background: '#13212a',
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}map-overview.webp`}
            alt={english ? 'Among Gas map' : 'Карта Among Gas'}
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', userSelect: 'none' }}
          />
          {agents.map(agent => (
            <div
              key={agent.slot}
              data-testid="game-admin-table-player"
              data-player-slot={agent.slot}
              title={agent.username}
              aria-label={`${agent.username}, ${agent.alive ? (english ? 'alive' : 'жив') : (english ? 'dead' : 'мёртв')}`}
              style={{
                position: 'absolute',
                left: `${Math.max(0, Math.min(100, agent.x / MAP_W * 100))}%`,
                top: `${Math.max(0, Math.min(100, agent.y / MAP_H * 100))}%`,
                transform: 'translate(-50%, -50%)',
                display: 'grid', placeItems: 'center',
                width: 'clamp(11px, 2.2vw, 19px)', height: 'clamp(11px, 2.2vw, 19px)',
                borderRadius: '50%',
                border: '1.5px solid rgba(255,255,255,0.95)',
                background: agent.alive ? ADMIN_DOT_COLORS[slotColor(agent.slot)] : '#7f858b',
                color: '#fff', fontWeight: 950, fontSize: 'clamp(9px, 1.4vw, 13px)',
                lineHeight: 1, boxShadow: '0 1px 5px rgba(0,0,0,0.65)',
                pointerEvents: 'auto',
              }}
            >
              {agent.alive ? '' : '×'}
            </div>
          ))}
        </div>
        <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          {agents.map(agent => (
            <div key={agent.slot} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7,
              background: 'rgba(255,255,255,0.04)', color: agent.alive ? '#e4f5ff' : '#7f858b',
              fontSize: 11, maxWidth: '100%',
            }}>
              <span style={{
                display: 'inline-block', width: 9, height: 9, flexShrink: 0, borderRadius: '50%',
                background: agent.alive ? ADMIN_DOT_COLORS[slotColor(agent.slot)] : '#7f858b',
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(42vw, 200px)' }}>
                {agent.username}
              </span>
              {!agent.alive && <span>×</span>}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(190,225,235,0.55)', textAlign: 'center' }}>
          {english
            ? 'Hidden players inside vents do not appear. The table refreshes live.'
            : 'Игроки в люках не отображаются. Таблица обновляется в реальном времени.'}
        </div>
      </div>
    </div>
  );
}
