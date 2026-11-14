import type { LobbyPlayer, PlayerRole } from '../context/GameContext';
import { CharacterSpriteCanvas } from '../game/characterSpriteRenderer';

interface RoleRevealOverlayProps {
  role: PlayerRole;
  english: boolean;
  mock: boolean;
  impostorSlots: number[];
  mySlot: number | null;
  players: LobbyPlayer[];
}

export default function RoleRevealOverlay({
  role,
  english,
  mock,
  impostorSlots,
  mySlot,
  players,
}: RoleRevealOverlayProps) {
  const isImpostor = role === 'impostor';
  const accent = isImpostor ? '#ff3344' : '#4dcdff';
  const outline = '-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,-4px 0 0 #000,4px 0 0 #000,0 -4px 0 #000,0 4px 0 #000';
  const glow = isImpostor
    ? ',0 0 40px rgba(255,50,50,0.8),0 0 80px rgba(255,50,50,0.3)'
    : ',0 0 40px rgba(60,180,255,0.8),0 0 80px rgba(60,180,255,0.3)';
  const teammates = impostorSlots.filter(slot => slot !== mySlot);

  return (
    <div data-testid="role-reveal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: isImpostor
        ? 'radial-gradient(ellipse at 50% 40%, #5a0000 0%, #1a0000 60%, #000 100%)'
        : 'radial-gradient(ellipse at 50% 40%, #001850 0%, #000d28 60%, #000 100%)',
      animation: mock ? 'none' : 'rrFade 3.2s ease forwards',
      pointerEvents: 'none',
    }}>
      <div style={{
        textAlign: 'center', padding: '0 32px',
        animation: mock ? 'none' : 'rrScale 3.2s ease forwards',
      }}>
        <p style={{
          fontFamily: "'Fredoka One', sans-serif",
          fontSize: 12, color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.35em', textTransform: 'uppercase',
          marginBottom: 28,
        }}>
          {english ? 'Your role' : 'Ваша роль'}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <div
              className="ag-role-reveal-character"
              data-testid="role-reveal-character"
              style={{ animation: mock ? 'none' : 'rrCharacterBob 1.2s ease-in-out infinite' }}
            >
              <CharacterSpriteCanvas color={isImpostor ? 'maroon' : 'teal'} pose="idle" size={170} />
            </div>
            <div
              className="ag-role-reveal-shadow"
              data-role-reveal-shadow="true"
              aria-hidden="true"
              style={{
                position: 'absolute', bottom: -15, left: '50%', marginLeft: -47, zIndex: 0,
                width: 94, height: 14, borderRadius: '50%', transformOrigin: 'center center',
                background: 'rgba(0, 0, 0, 0.85)',
                boxShadow: '0 0 8px rgba(0, 0, 0, 0.35)',
                filter: 'blur(2.5px)',
                animation: mock ? 'none' : 'rrShadowPulse 1.2s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        <div style={{
          fontFamily: "'Fredoka One', sans-serif",
          fontSize: 56, color: accent, letterSpacing: '0.04em',
          textShadow: outline + glow,
          marginBottom: 20,
        }}>
          {isImpostor ? (english ? 'IMPOSTOR' : 'ПРЕДАТЕЛЬ') : (english ? 'CREWMATE' : 'ЭКИПАЖНИК')}
        </div>

        {isImpostor && teammates.length > 0 && (
          <div style={{
            fontFamily: "'Fredoka One', sans-serif",
            fontSize: 16, color: 'rgba(255,150,150,0.85)',
            letterSpacing: '0.06em',
          }}>
            {teammates.length > 1 ? (english ? 'Teammates' : 'Сообщники') : (english ? 'Teammate' : 'Сообщник')}:{' '}
            {teammates
              .map(slot => players.find(player => player.slot === slot)?.username ?? `Slot ${slot}`)
              .join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
