import { useEffect, useRef, type CSSProperties } from 'react';
import { useLanguage } from '../lib/language';
import {
  CONTROL_LABELS,
  defaultControlPosition,
  resetControlLayout,
  setControlPosition,
  setJoystickSide,
  useGameSettings,
  type GameplayControlId,
  type JoystickSide,
} from '../lib/gameSettings';

export function SettingsButton({
  label,
  onClick,
  style,
}: {
  label: string;
  onClick: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        boxSizing: 'border-box',
        flex: '0 0 44px',
        display: 'grid',
        placeItems: 'center',
        padding: 0,
        lineHeight: 0,
        overflow: 'visible',
        borderRadius: 13,
        color: '#e7f2f4',
        background: 'linear-gradient(180deg, rgba(32,53,67,.96), rgba(14,27,37,.96))',
        border: '1px solid rgba(160,205,215,.4)',
        boxShadow: '0 3px 10px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.1)',
        cursor: 'pointer',
        ...style,
      }}
    >
      <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
        <path
          d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="m19.4 13.5 1.1.9-1.5 2.6-1.4-.5a7.8 7.8 0 0 1-1.4.8l-.2 1.5h-3l-.3-1.5a7.8 7.8 0 0 1-1.4-.8l-1.4.5-1.5-2.6 1.1-.9a6.4 6.4 0 0 1 0-1.6l-1.1-.9 1.5-2.6 1.4.5a7.8 7.8 0 0 1 1.4-.8l.3-1.5h3l.2 1.5a7.8 7.8 0 0 1 1.4.8l1.4-.5 1.5 2.6-1.1.9a6.4 6.4 0 0 1 0 1.6Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

const optionStyle = (selected: boolean): CSSProperties => ({
  minHeight: 54,
  flex: 1,
  padding: '9px 12px',
  borderRadius: 12,
  border: `1px solid ${selected ? 'rgba(91,221,205,.9)' : 'rgba(167,193,203,.2)'}`,
  color: selected ? '#f2fffd' : 'rgba(226,238,241,.78)',
  background: selected
    ? 'linear-gradient(180deg, rgba(27,124,115,.78), rgba(18,82,80,.82))'
    : 'rgba(5,15,23,.5)',
  boxShadow: selected ? '0 0 0 2px rgba(63,204,187,.12), inset 0 1px rgba(255,255,255,.1)' : 'none',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
});

export default function SettingsDialog({
  open,
  onClose,
  showLeaveMatch = false,
  onLeaveMatch,
}: {
  open: boolean;
  onClose: () => void;
  showLeaveMatch?: boolean;
  onLeaveMatch?: () => void;
}) {
  const { language, setLanguage } = useLanguage();
  const { joystickSide, controlLayout } = useGameSettings();
  const [selectedControl, setSelectedControl] = useState<GameplayControlId>('joystick');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const en = language === 'en';
  const selectedPosition = controlLayout[selectedControl] ?? defaultControlPosition(selectedControl, joystickSide);
  const controlOptions = Object.entries(CONTROL_LABELS) as Array<[GameplayControlId, { en: string; ru: string }]>;

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  const selectSide = (side: JoystickSide) => setJoystickSide(side);

  return (
    <div
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        background: 'rgba(3,8,13,.76)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ag-settings-title"
        style={{
          width: 'min(100%, 370px)',
          boxSizing: 'border-box',
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: '22px 20px 18px',
          borderRadius: 20,
          border: '1px solid rgba(157,205,214,.28)',
          background: 'linear-gradient(165deg, #172b39 0%, #0b141e 100%)',
          boxShadow: '0 24px 70px rgba(0,0,0,.58), inset 0 1px rgba(255,255,255,.07)',
          color: '#eaf4f5',
          fontFamily: "'Fredoka One', system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22 }}>
          <div>
            <h2 id="ag-settings-title" style={{ margin: 0, fontSize: 23, lineHeight: 1.15 }}>
              {en ? 'Settings' : 'Настройки'}
            </h2>
            <p style={{ margin: '5px 0 0', color: 'rgba(220,237,239,.58)', font: '12px/1.4 system-ui, sans-serif' }}>
              {en ? 'Your preferences are saved automatically.' : 'Настройки сохраняются автоматически.'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={en ? 'Close settings' : 'Закрыть настройки'}
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              flex: '0 0 auto',
              borderRadius: 12,
              border: '1px solid rgba(170,200,208,.22)',
              background: 'rgba(5,15,23,.58)',
              color: '#eaf4f5',
              fontSize: 26,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: '0 0 19px' }}>
          <legend style={{ padding: 0, marginBottom: 9, color: 'rgba(226,239,241,.78)', fontSize: 14 }}>
            {en ? 'Language' : 'Язык'}
          </legend>
          <div style={{ display: 'flex', gap: 9 }}>
            {([
              { value: 'ru', label: 'Русский' },
              { value: 'en', label: 'English' },
            ] as const).map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={language === option.value}
                onClick={() => setLanguage(option.value)}
                style={optionStyle(language === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0, marginBottom: 9, color: 'rgba(226,239,241,.78)', fontSize: 14 }}>
            {en ? 'Movement joystick' : 'Джойстик движения'}
          </legend>
          <div style={{ display: 'flex', gap: 9 }}>
            {([
              { value: 'right', label: en ? 'Right side' : 'Справа' },
              { value: 'left', label: en ? 'Left side' : 'Слева' },
            ] as const).map(option => (
              <button
                key={option.value}
                type="button"
                data-testid={`joystick-side-${option.value}`}
                aria-label={en
                  ? `Move joystick to the ${option.value}`
                  : `Переместить джойстик ${option.value === 'right' ? 'вправо' : 'влево'}`}
                aria-pressed={joystickSide === option.value}
                onClick={() => selectSide(option.value)}
                style={optionStyle(joystickSide === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: '20px 0 0' }}>
          <legend style={{ padding: 0, marginBottom: 5, color: 'rgba(226,239,241,.78)', fontSize: 14 }}>
            {en ? 'Custom gameplay controls' : 'Расположение игровых кнопок'}
          </legend>
          <p style={{ margin: '0 0 10px', color: 'rgba(220,237,239,.58)', font: '12px/1.4 system-ui, sans-serif' }}>
            {en
              ? 'Choose a control, then adjust its position. Changes save automatically for this device.'
              : 'Выберите элемент и настройте его положение. Изменения сохраняются автоматически на этом устройстве.'}
          </p>
          <label style={{ display: 'block', marginBottom: 12, color: 'rgba(226,239,241,.8)', font: '12px/1.4 system-ui, sans-serif' }}>
            {en ? 'Control' : 'Элемент управления'}
            <select
              data-testid="control-layout-select"
              value={selectedControl}
              onChange={event => setSelectedControl(event.target.value as GameplayControlId)}
              style={{
                boxSizing: 'border-box', display: 'block', width: '100%', minHeight: 42,
                marginTop: 5, padding: '8px 10px', borderRadius: 10,
                border: '1px solid rgba(167,193,203,.28)', background: 'rgba(5,15,23,.7)',
                color: '#eaf4f5', font: '14px system-ui, sans-serif',
              }}
            >
              {controlOptions.map(([id, label]) => (
                <option key={id} value={id}>{en ? label.en : label.ru}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 12, color: 'rgba(226,239,241,.85)', font: '12px/1.4 system-ui, sans-serif' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{en ? 'Horizontal position' : 'По горизонтали'}</span>
              <strong>{selectedPosition.x}%</strong>
            </span>
            <input
              data-testid="control-layout-x"
              type="range"
              min={5}
              max={95}
              step={1}
              value={selectedPosition.x}
              onChange={event => setControlPosition(selectedControl, { ...selectedPosition, x: Number(event.target.value) })}
              style={{ display: 'block', width: '100%', margin: '8px 0 0', accentColor: '#5bdccd', touchAction: 'pan-y' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 12, color: 'rgba(226,239,241,.85)', font: '12px/1.4 system-ui, sans-serif' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{en ? 'Vertical position' : 'По вертикали'}</span>
              <strong>{selectedPosition.y}%</strong>
            </span>
            <input
              data-testid="control-layout-y"
              type="range"
              min={5}
              max={95}
              step={1}
              value={selectedPosition.y}
              onChange={event => setControlPosition(selectedControl, { ...selectedPosition, y: Number(event.target.value) })}
              style={{ display: 'block', width: '100%', margin: '8px 0 0', accentColor: '#5bdccd', touchAction: 'pan-y' }}
            />
          </label>

          <button
            type="button"
            data-testid="control-layout-reset"
            onClick={resetControlLayout}
            style={{
              width: '100%', minHeight: 40, padding: '8px 12px', borderRadius: 10,
              border: '1px solid rgba(167,193,203,.22)', background: 'rgba(5,15,23,.5)',
              color: 'rgba(226,238,241,.85)', fontFamily: 'inherit', fontSize: 13,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            {en ? 'Reset all control positions' : 'Сбросить расположение кнопок'}
          </button>
        </fieldset>

        {showLeaveMatch && onLeaveMatch && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(170,200,208,.16)' }}>
            <button
              type="button"
              data-testid="settings-leave-match"
              onClick={onLeaveMatch}
              style={{
                width: '100%', minHeight: 44, padding: '10px 14px', borderRadius: 11,
                border: '1px solid rgba(255,145,145,.36)',
                background: 'rgba(105,24,36,.3)', color: '#ffd9dc',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {en ? 'Leave match…' : 'Выйти из матча…'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
