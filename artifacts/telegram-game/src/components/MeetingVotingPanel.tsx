import type { LobbyPlayer } from '../context/GameContext';
import { NO_TARGET } from '@workspace/shared/coords';
import { ADMIN_DOT_COLORS, slotColor } from '../game/mapPresentation';

interface MeetingVotingPanelProps {
  players: LobbyPlayer[];
  deadSlots: number[];
  hasVoted: boolean;
  mySlot: number | null;
  english: boolean;
  onVote: (slot: number) => void;
}

export default function MeetingVotingPanel({
  players,
  deadSlots,
  hasVoted,
  mySlot,
  english,
  onVote,
}: MeetingVotingPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 'min(320px, 90vw)' }}>
      {players
        .filter(player => !deadSlots.includes(player.slot))
        .map(player => (
          <button
            key={player.slot}
            disabled={hasVoted}
            onClick={() => onVote(player.slot)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, textAlign: 'left',
              background: hasVoted ? 'rgba(30,40,55,0.6)' : 'rgba(30,40,55,0.9)',
              color: hasVoted ? 'rgba(255,255,255,0.35)' : '#fff',
              border: '1px solid rgba(120,160,200,0.25)', fontFamily: 'sans-serif', fontSize: 14,
              cursor: hasVoted ? 'default' : 'pointer',
            }}
          >
            <span data-testid="vote-player-color" aria-hidden="true" style={{
              width: 18, height: 18, flex: '0 0 18px', borderRadius: '50%',
              background: ADMIN_DOT_COLORS[slotColor(player.slot)],
              border: '2px solid rgba(255,255,255,0.72)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.55)',
            }} />
            <span data-testid="vote-player-number" style={{
              minWidth: 28, color: 'rgba(210,225,240,0.72)',
              fontVariantNumeric: 'tabular-nums', fontWeight: 800,
            }}>
              {String(player.slot + 1).padStart(2, '0')}
            </span>
            <span>{player.slot === mySlot ? `${player.username} (${english ? 'you' : 'вы'})` : player.username}</span>
          </button>
        ))}
      <button
        disabled={hasVoted}
        onClick={() => onVote(NO_TARGET)}
        style={{
          padding: '10px 14px', borderRadius: 8, textAlign: 'center', fontWeight: 700,
          background: hasVoted ? 'rgba(60,60,60,0.4)' : 'rgba(60,60,60,0.75)',
          color: hasVoted ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(150,150,150,0.25)', fontFamily: 'sans-serif', fontSize: 14,
          cursor: hasVoted ? 'default' : 'pointer',
        }}
      >
        {english ? 'Skip' : 'Пропустить'}
      </button>
      {hasVoted && (
        <div style={{ textAlign: 'center', color: 'rgba(150,220,150,0.85)', fontSize: 12, marginTop: 2 }}>
          {english ? 'Vote cast — waiting for others…' : 'Голос отдан — ждём других…'}
        </div>
      )}
    </div>
  );
}
