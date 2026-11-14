import { EmergencyMeetingArtwork } from './EmergencyMeetingArtwork';

export type EmergencyCallStatus = 'calling' | 'confirmed' | 'failed';

interface EmergencyCallSplashProps {
  status: EmergencyCallStatus;
  english: boolean;
}

/** Presentational emergency-call feedback; server state and timing remain in GameMap. */
export default function EmergencyCallSplash({ status, english }: EmergencyCallSplashProps) {
  return (
    <div
      role="status"
      aria-live="assertive"
      data-testid="emergency-call-splash"
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 24, textAlign: 'center',
        background: '#040a11',
        color: '#fff4df', fontFamily: "'Fredoka One', sans-serif",
      }}
    >
      <EmergencyMeetingArtwork
        style={{ width: 'min(76vw, 340px)', maxHeight: '42dvh', objectFit: 'contain' }}
      />
      <div
        data-testid="emergency-call-status"
        style={{
          fontSize: 'clamp(16px, 4vw, 22px)',
          fontWeight: 800,
          letterSpacing: '0.02em',
          lineHeight: 1.25,
          maxWidth: 340,
        }}
      >
        {status === 'calling'
          ? (english ? 'Waiting for server confirmation…' : 'Ожидаем подтверждение сервера…')
          : status === 'confirmed'
            ? (english ? 'Meeting confirmed' : 'Собрание подтверждено')
            : (english ? 'Call not confirmed' : 'Вызов не подтверждён')}
      </div>
      {status === 'failed' && (
        <div style={{ maxWidth: 300, fontSize: 15, color: 'rgba(255,244,223,0.78)' }}>
          {english
            ? 'The server rejected the call. Check that no sabotage is active and that your emergency call is still available.'
            : 'Сервер отклонил вызов. Проверьте, что саботаж не активен и экстренный вызов ещё доступен.'}
        </div>
      )}
    </div>
  );
}
