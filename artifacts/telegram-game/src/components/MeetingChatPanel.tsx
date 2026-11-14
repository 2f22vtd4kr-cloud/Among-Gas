import type { MeetingChatMessage } from '../context/GameContext';
import { ADMIN_DOT_COLORS, slotColor } from '../game/mapPresentation';

interface MeetingChatPanelProps {
  messages: MeetingChatMessage[];
  inDiscussion: boolean;
  isDead: boolean;
  english: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  playerName: (slot: number) => string;
  onSend: (message: string) => void;
}

export default function MeetingChatPanel({
  messages,
  inDiscussion,
  isDead,
  english,
  draft,
  onDraftChange,
  playerName,
  onSend,
}: MeetingChatPanelProps) {
  return (
    <div style={{ width: 'min(440px, 94vw)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {inDiscussion && (
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'sans-serif', textAlign: 'center' }}>
          {english ? 'Voting begins after discussion' : 'Голосование начнётся после обсуждения'}
        </div>
      )}
      <div aria-live="polite" style={{
        display: 'flex', flexDirection: 'column', gap: 5, padding: 10,
        height: 150, overflowY: 'auto', borderRadius: 10,
        background: 'rgba(25,35,48,0.88)', border: '1px solid rgba(120,160,200,0.2)',
        textAlign: 'left',
      }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.4, textAlign: 'center', margin: 'auto' }}>
            {english ? 'Meeting chat' : 'Чат обсуждения'}
          </div>
        )}
        {messages.map((message, index) => (
          <div key={message.receivedAt + '-' + message.slot + '-' + index} style={{
            fontSize: 13, lineHeight: 1.35, overflowWrap: 'anywhere', color: '#e6f2ff',
          }}>
            <strong style={{ color: ADMIN_DOT_COLORS[slotColor(message.slot)] }}>
              {String(message.slot + 1).padStart(2, '0')} · {playerName(message.slot)}:
            </strong> {message.text}
          </div>
        ))}
      </div>
      {!isDead && (
        <form onSubmit={event => {
          event.preventDefault();
          if (!draft.trim()) return;
          onSend(draft);
          onDraftChange('');
        }} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck
            aria-label={english ? 'Meeting message' : 'Сообщение в обсуждении'}
            value={draft}
            onChange={event => onDraftChange(event.target.value)}
            maxLength={200}
            placeholder={english ? 'Write a message…' : 'Написать сообщение…'}
            style={{
              flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 9,
              color: '#fff', background: '#172230', border: '1px solid rgba(130,180,220,0.35)',
              fontSize: 14, outline: 'none', userSelect: 'text', WebkitUserSelect: 'text',
              touchAction: 'manipulation',
            }}
          />
          <button type="submit" disabled={!draft.trim()} style={{
            padding: '0 16px', borderRadius: 9, color: '#071015', background: '#70dfc1',
            border: 0, fontWeight: 900, opacity: draft.trim() ? 1 : 0.4,
            touchAction: 'manipulation',
          }}>➤</button>
        </form>
      )}
    </div>
  );
}
