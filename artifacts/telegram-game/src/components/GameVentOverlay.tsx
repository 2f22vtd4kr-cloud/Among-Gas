import React from 'react';
import { haptic } from '../lib/haptics';
import { findVent, type VentDef } from '@workspace/shared/vents';

export interface GameVentOverlayProps {
  vent: VentDef | undefined;
  english: boolean;
  onTravel: (ventId: number) => void;
  onExit: () => void;
}

/** Presentation-only vent travel overlay; travel authority remains in GameContext/API. */
export default function GameVentOverlay({ vent, english, onTravel, onExit }: GameVentOverlayProps) {
  if (!vent) return null;

  return (
    <div
      data-testid="game-vent-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={english ? 'Vent System' : 'Система люков'}
      style={{
        position: 'fixed', inset: 0, zIndex: 85,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        gap: 12, padding: 24, background: 'rgba(4,10,15,0.96)',
        color: '#e3fbff', fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.65, letterSpacing: '0.2em', fontWeight: 800 }}>
        {english ? 'VENT SYSTEM' : 'СИСТЕМА ЛЮКОВ'}
      </div>
      <div data-testid="game-vent-current-name" style={{ fontSize: 26, fontWeight: 900, textAlign: 'center' }}>
        {english ? vent.nameEn : vent.name}
      </div>
      <div style={{ width: 'min(360px, 100%)', display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        {vent.connections.map(id => {
          const nextVent = findVent(id);
          if (!nextVent) return null;
          return (
            <button
              key={id}
              type="button"
              data-testid={`game-vent-destination-${id}`}
              aria-label={english ? `Travel to ${nextVent.nameEn}` : `Переместиться: ${nextVent.name}`}
              onClick={() => { haptic.tap(); onTravel(id); }}
              style={{
                width: '100%', padding: '15px 18px', borderRadius: 10,
                color: '#e3fbff', background: '#193842',
                border: '1px solid rgba(130,220,230,0.6)', fontWeight: 800, fontSize: 15,
                touchAction: 'manipulation',
              }}
            >
              → {english ? nextVent.nameEn : nextVent.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        data-testid="game-vent-exit"
        onClick={() => { haptic.tap(); onExit(); }}
        style={{
          width: 'min(360px, 100%)', padding: '14px 18px', borderRadius: 10,
          color: '#fff', background: '#8b2430', border: '1px solid #ff7785',
          fontWeight: 900, fontSize: 15, touchAction: 'manipulation',
        }}
      >
        {english ? 'EXIT VENT' : 'ВЫЛЕЗТИ ИЗ ЛЮКА'}
      </button>
    </div>
  );
}
