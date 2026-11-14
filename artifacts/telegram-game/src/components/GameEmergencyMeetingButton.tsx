import type { CSSProperties } from 'react';
import { EmergencyCallIcon } from './EmergencyMeetingArtwork';

export interface GameEmergencyMeetingButtonProps {
  visible: boolean;
  used: boolean;
  english: boolean;
  positionStyle: CSSProperties;
  onCall: () => void;
}

/** Presentation-only emergency action; meeting eligibility and state stay server-owned. */
export default function GameEmergencyMeetingButton(props: GameEmergencyMeetingButtonProps) {
  if (!props.visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 'max(calc(env(safe-area-inset-top, 0px) + 144px), 25dvh)',
      right: 'max(12px, env(safe-area-inset-right, 0px))',
      zIndex: 35,
      ...props.positionStyle,
    }}>
      <button
        type="button"
        data-testid="game-action-emergency"
        aria-label={props.used
          ? (props.english ? 'Emergency meeting already used' : 'Экстренное собрание уже использовано')
          : (props.english ? 'Call emergency meeting' : 'Созвать экстренное собрание')}
        disabled={props.used}
        onClick={props.onCall}
        style={{
          width: 92, height: 92, padding: 8, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          background: props.used ? 'rgba(55,60,65,0.75)' : 'rgba(160,40,20,0.85)',
          color: props.used ? 'rgba(255,255,255,0.35)' : '#ffe4d0',
          border: '1px solid rgba(255,120,80,0.4)', fontFamily: 'sans-serif',
          fontWeight: 800, fontSize: 14, letterSpacing: '0.04em',
          textTransform: 'uppercase', cursor: props.used ? 'default' : 'pointer',
          backdropFilter: 'blur(6px)', touchAction: 'manipulation',
        }}
      >
        {props.used ? '✓' : <EmergencyCallIcon size={70} />}
      </button>
    </div>
  );
}
