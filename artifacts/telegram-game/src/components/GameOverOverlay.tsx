import type { LobbyPlayer } from '../context/GameContext';
import { CharacterSpriteCanvas } from '../game/characterSpriteRenderer';
import { slotColor } from '../game/mapPresentation';

interface GameOverOverlayProps {
  winner: 'crewmates' | 'impostors';
  players: LobbyPlayer[];
  deadSlots: number[];
  english: boolean;
}

export default function GameOverOverlay({
  winner,
  players,
  deadSlots,
  english,
}: GameOverOverlayProps) {
  const isImpostorWinner = winner === 'impostors';
  const accent = isImpostorWinner ? '#ff3344' : '#4dcdff';
  const outline = '-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,-4px 0 0 #000,4px 0 0 #000,0 -4px 0 #000,0 4px 0 #000';
  const glow = isImpostorWinner
    ? ',0 0 40px rgba(255,50,50,0.8),0 0 80px rgba(255,50,50,0.3)'
    : ',0 0 40px rgba(60,180,255,0.8),0 0 80px rgba(60,180,255,0.3)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: isImpostorWinner
        ? 'radial-gradient(ellipse at 50% 40%, #5a0000 0%, #1a0000 60%, #000 100%)'
        : 'radial-gradient(ellipse at 50% 40%, #001850 0%, #000d28 60%, #000 100%)',
      padding: '0 28px',
    }}>
      <p style={{
        fontFamily: "'Fredoka One', sans-serif",
        fontSize: 12, color: 'rgba(255,255,255,0.38)',
        letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: 20,
      }}>
        {english ? 'Game over' : 'Конец игры'}
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
        {players.map(player => (
          <CharacterSpriteCanvas
            key={player.slot}
            color={slotColor(player.slot)}
            pose={deadSlots.includes(player.slot) ? 'ghost' : 'idle'}
            size={50}
            flipped={player.slot % 2 === 0}
          />
        ))}
      </div>

      <div style={{
        fontFamily: "'Fredoka One', sans-serif",
        fontSize: 52, color: accent, letterSpacing: '0.04em',
        textShadow: outline + glow,
        textAlign: 'center', lineHeight: 1.1, marginBottom: 36,
        whiteSpace: 'pre-line',
      }}>
        {isImpostorWinner
          ? (english ? 'IMPOSTORS\nWIN' : 'ПРЕДАТЕЛИ\nПОБЕДИЛИ')
          : (english ? 'CREWMATES\nWIN' : 'ЭКИПАЖ\nПОБЕДИЛ')}
      </div>

      <button
        onClick={() => window.location.reload()}
        style={{
          display: 'flex', alignItems: 'stretch',
          width: '100%', maxWidth: 260, minHeight: 60,
          borderRadius: 8, border: '2.5px solid rgba(0,0,0,0.5)',
          boxShadow: isImpostorWinner ? '0 7px 0 #6b0000' : '0 7px 0 #00316b',
          overflow: 'hidden', cursor: 'pointer', padding: 0, background: 'none',
          transition: 'transform 0.08s, box-shadow 0.08s',
        }}
        onMouseDown={event => {
          (event.currentTarget as HTMLButtonElement).style.transform = 'translateY(6px)';
          (event.currentTarget as HTMLButtonElement).style.boxShadow = isImpostorWinner ? '0 1px 0 #6b0000' : '0 1px 0 #00316b';
        }}
        onMouseUp={event => {
          (event.currentTarget as HTMLButtonElement).style.transform = '';
          (event.currentTarget as HTMLButtonElement).style.boxShadow = isImpostorWinner ? '0 7px 0 #6b0000' : '0 7px 0 #00316b';
        }}
      >
        <div style={{
          width: 60, flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: isImpostorWinner ? '#aa2233' : '#225599',
          borderRight: '2px solid rgba(0,0,0,0.22)', fontSize: 22,
        }}>
          <svg data-testid="gameover-lobby-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
          </svg>
        </div>
        <div style={{
          flex: 1, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: isImpostorWinner ? '#cc2244' : '#2266cc',
          backgroundImage: 'repeating-linear-gradient(-55deg, transparent 0px, transparent 12px, rgba(255,255,255,0.08) 12px, rgba(255,255,255,0.08) 22px)',
          fontFamily: "'Fredoka One', sans-serif",
          fontSize: 20, color: 'white',
          textShadow: '0 2px 5px rgba(0,0,0,0.5)',
          letterSpacing: '0.08em',
        }}>
          {english ? 'TO LOBBY' : 'В ЛОББИ'}
        </div>
      </button>
    </div>
  );
}
