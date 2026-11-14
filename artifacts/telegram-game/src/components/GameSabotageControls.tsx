import type { SabotageInfo } from '../context/GameContext';
import { SABOTAGE_DEFS, type SabotageSystemId } from '@workspace/shared/sabotage';
import { haptic } from '../lib/haptics';
import { sfx } from '../lib/sfx';
import { sabotageRu } from '../game/mapPresentation';

export interface GameSabotageControlsProps {
  loaded: boolean;
  isDead: boolean;
  isImpostor: boolean;
  meetingActive: boolean;
  sabotage: SabotageInfo | null;
  cooldownMs: number;
  remainingMs: number;
  english: boolean;
  language: 'en' | 'ru';
  panelOpen: boolean;
  onPanelOpen: () => void;
  onPanelClose: () => void;
  onTrigger: (systemId: SabotageSystemId) => void;
}

/** Presentation-only impostor sabotage controls; server authority remains in GameContext/API. */
export default function GameSabotageControls(props: GameSabotageControlsProps) {
  const activeDef = props.sabotage
    ? SABOTAGE_DEFS[props.sabotage.systemId as SabotageSystemId]
    : null;

  return (
    <>
      {props.loaded && !props.isDead && props.isImpostor &&
        !props.meetingActive && props.sabotage === null && (
        <div style={{
          position: 'fixed', bottom: 130, left: 24, zIndex: 25,
        }}>
          <button
            type="button"
            data-testid="game-action-sabotage"
            aria-label={props.cooldownMs > 0
              ? (props.english
                ? `Sabotage cooldown ${Math.ceil(props.cooldownMs / 1000)} seconds`
                : `Перезарядка саботажа ${Math.ceil(props.cooldownMs / 1000)} секунд`)
              : (props.english ? 'Sabotage' : 'Саботаж')}
            disabled={props.cooldownMs > 0}
            onClick={() => {
              haptic.tap();
              props.onPanelOpen();
            }}
            style={{
              width: 88, height: 88, borderRadius: '50%',
              fontFamily: 'sans-serif', fontWeight: 900, fontSize: 11,
              letterSpacing: '0.03em', textTransform: 'uppercase',
              color: props.cooldownMs > 0 ? 'rgba(200,170,255,0.35)' : '#f0e4ff',
              background: props.cooldownMs > 0
                ? 'rgba(50,20,70,0.55)'
                : 'radial-gradient(circle, rgba(130,40,200,0.95), rgba(60,10,110,0.95))',
              border: `2px solid ${props.cooldownMs > 0 ? 'rgba(160,100,220,0.25)' : 'rgba(190,130,255,0.85)'}`,
              boxShadow: props.cooldownMs > 0 ? 'none' : '0 0 22px rgba(150,60,255,0.5)',
              cursor: props.cooldownMs > 0 ? 'default' : 'pointer',
              backdropFilter: 'blur(4px)',
              touchAction: 'manipulation',
            }}
          >
            {props.cooldownMs > 0 ? Math.ceil(props.cooldownMs / 1000) : (
              <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden="true">
                <path d="M24 5 45 42H3L24 5Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                <path d="M24 17v12m0 6v1" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      )}

      {props.loaded && props.sabotage && activeDef && (
        <div
          data-testid="game-sabotage-banner"
          style={{
            position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 112px)',
            left: '50%', transform: 'translateX(-50%)',
            padding: '6px 16px', zIndex: 40, textAlign: 'center',
            background: 'rgba(70,10,10,0.9)', color: '#ffe4e4',
            fontFamily: 'sans-serif', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.03em', borderRadius: 8,
            border: '1px solid rgba(255,100,100,0.4)', backdropFilter: 'blur(6px)',
          }}
        >
          {sabotageRu(activeDef.name, props.language)} {props.english ? 'sabotaged' : 'саботирован'} — {Math.ceil(props.remainingMs / 1000)}{props.english ? 's' : 'с'}
          {activeDef.pads.length > 1 && (
            <span style={{ opacity: 0.8 }}>
              {' '}({props.sabotage.fixedPads.length}/{activeDef.pads.length} {props.english ? 'fixed' : 'починено'})
            </span>
          )}
        </div>
      )}

      {props.panelOpen && props.isImpostor && props.sabotage === null && (
        <div
          data-testid="game-sabotage-panel"
          style={{
            position: 'fixed', inset: 0, zIndex: 55,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,10,18,0.85)', backdropFilter: 'blur(4px)', gap: 14,
          }}
          onClick={props.onPanelClose}
        >
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif',
            letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 4,
          }}>
            {props.english ? 'Choose a sabotage system' : 'Выберите систему саботажа'}
          </div>
          {Object.values(SABOTAGE_DEFS).map(def => (
            <button
              type="button"
              key={def.id}
              data-testid={`game-sabotage-option-${def.id}`}
              onClick={event => {
                event.stopPropagation();
                haptic.tap();
                sfx('uiSelect', 0.3);
                props.onTrigger(def.id);
                props.onPanelClose();
              }}
              style={{
                padding: '12px 32px', borderRadius: 10, minWidth: 180,
                background: 'rgba(130,40,200,0.85)', color: '#f0e4ff',
                border: '1px solid rgba(190,130,255,0.5)',
                fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14,
                letterSpacing: '0.03em', cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              {sabotageRu(def.name, props.language)}
            </button>
          ))}
          <button
            type="button"
            onClick={props.onPanelClose}
            style={{
              marginTop: 8, padding: '8px 20px', borderRadius: 8,
              background: 'transparent', color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.25)',
              fontFamily: 'sans-serif', fontSize: 12, cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {props.english ? 'Cancel' : 'Отмена'}
          </button>
        </div>
      )}
    </>
  );
}
