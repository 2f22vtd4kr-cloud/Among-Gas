import React from 'react';
import type {
  LobbyPlayer,
  MeetingChatMessage,
  MeetingInfo,
} from '../context/GameContext';
import { NO_TARGET } from '@workspace/shared/coords';
import MeetingChatPanel from './MeetingChatPanel';
import MeetingVotingPanel from './MeetingVotingPanel';

interface GameMeetingOverlayProps {
  meeting: MeetingInfo;
  remainingMs: number;
  inDiscussion: boolean;
  isDead: boolean;
  english: boolean;
  messages: MeetingChatMessage[];
  players: LobbyPlayer[];
  deadSlots: number[];
  hasVoted: boolean;
  mySlot: number | null;
  draft: string;
  onDraftChange: (value: string) => void;
  playerName: (slot: number) => string;
  onSendChat: (message: string) => void;
  onVote: (slot: number) => void;
}

/**
 * Presentation-only meeting shell. Timing, server state, chat sending and vote
 * authorization remain owned by GameMap/GameContext; this component only
 * renders the already-derived meeting state and forwards user interactions.
 */
export default function GameMeetingOverlay({
  meeting,
  remainingMs,
  inDiscussion,
  isDead,
  english,
  messages,
  players,
  deadSlots,
  hasVoted,
  mySlot,
  draft,
  onDraftChange,
  playerName,
  onSendChat,
  onVote,
}: GameMeetingOverlayProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(6,10,18,0.94)', backdropFilter: 'blur(4px)', padding: 24,
      overflowY: 'auto',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'sans-serif',
          letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 8,
        }}>
          {meeting.bodySlot === NO_TARGET ? (english ? 'Emergency meeting' : 'Экстренное собрание') : (english ? 'Body reported' : 'Найдено тело')}
        </div>
        <div style={{ fontSize: 16, color: '#e8f0ff', fontFamily: 'sans-serif', fontWeight: 700 }}>
          {meeting.bodySlot === NO_TARGET
            ? `${playerName(meeting.reporterSlot)} ${english ? 'called an emergency meeting' : 'вызвал экстренное собрание'}`
            : `${playerName(meeting.reporterSlot)} ${english ? 'reported' : 'нашёл тело'} ${playerName(meeting.bodySlot)}`}
        </div>
        <div style={{
          marginTop: 14, fontSize: 32, fontWeight: 900, fontFamily: 'monospace',
          color: inDiscussion ? '#8ab8cc' : '#ffd166',
        }}>
          {Math.ceil(remainingMs / 1000)}s
        </div>
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4,
        }}>
          {inDiscussion ? (english ? 'Discussion' : 'Обсуждение') : (english ? 'Voting' : 'Голосование')}
        </div>
      </div>

      {isDead && (
        <div style={{
          color: 'rgba(200,220,255,0.6)', fontSize: 12, fontFamily: 'sans-serif', marginBottom: 12,
        }}>
          {english ? 'You are dead — spectating' : 'Вы мертвы — наблюдаете'}
        </div>
      )}

      <MeetingChatPanel
        messages={messages}
        inDiscussion={inDiscussion}
        isDead={isDead}
        english={english}
        draft={draft}
        onDraftChange={onDraftChange}
        playerName={playerName}
        onSend={onSendChat}
      />

      {!inDiscussion && !isDead && (
        <MeetingVotingPanel
          players={players}
          deadSlots={deadSlots}
          hasVoted={hasVoted}
          mySlot={mySlot}
          english={english}
          onVote={onVote}
        />
      )}
    </div>
  );
}
