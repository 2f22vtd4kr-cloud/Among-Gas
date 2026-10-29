import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLanguage } from '../lib/language';
import {
  CONTROL_LABELS,
  defaultControlPosition,
  setControlPosition,
  setJoystickSide,
  useGameSettings,
  type ControlLayout,
  type ControlPosition,
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
          d="M12 9.2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
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

const DRAGGABLE_CONTROL_IDS = ['joystick', 'emergency', 'taskAction', 'killReport', 'sabotage', 'repair'] as const;
const DRAG_SHORT_LABELS: Record<GameplayControlId, string> = {
  joystick: 'J', emergency: 'SOS', taskAction: 'ACT', killReport: 'K/R', sabotage: 'SAB', repair: 'FIX',
  map: 'MAP', tasks: 'TASK', settings: 'SET',
};
const DRAG_SAFE_HALF_WIDTH: Record<(typeof DRAGGABLE_CONTROL_IDS)[number], number> = {
  joystick: 52, emergency: 80, taskAction: 100, killReport: 100, sabotage: 42, repair: 100,
};
const DRAG_SAFE_HALF_HEIGHT: Record<(typeof DRAGGABLE_CONTROL_IDS)[number], number> = {
  joystick: 52, emergency: 24, taskAction: 24, killReport: 40, sabotage: 42, repair: 24,
};
const PREVIEW_CONTROL_DIMENSIONS: Record<(typeof DRAGGABLE_CONTROL_IDS)[number], { width: number; height: number }> = {
  joystick: { width: 40, height: 40 },
  emergency: { width: 32, height: 22 },
  taskAction: { width: 72, height: 22 },
  killReport: { width: 72, height: 31 },
  sabotage: { width: 36, height: 32 },
  repair: { width: 72, height: 22 },
};

function constrainDragPosition(id: GameplayControlId, position: ControlPosition): ControlPosition {
  const viewportWidth = typeof window === 'undefined' ? 390 : Math.max(1, window.innerWidth);
  const margin = (DRAG_SAFE_HALF_WIDTH[id as keyof typeof DRAG_SAFE_HALF_WIDTH] ?? 22) / viewportWidth * 100;
  return {
    x: Math.round(Math.max(margin, Math.min(100 - margin, position.x))),
    y: Math.round(Math.max(25, Math.min(95, position.y))),
  };
}

/** Keep controls apart using their actual gameplay hit-area estimates, while allowing a fallback on tiny screens. */
function resolveNonOverlappingPosition(
  id: GameplayControlId,
  proposed: ControlPosition,
  layout: ControlLayout,
  joystickSide: JoystickSide,
): ControlPosition {
  const viewportWidth = typeof window === 'undefined' ? 390 : Math.max(1, window.innerWidth);
  const viewportHeight = typeof window === 'undefined' ? 844 : Math.max(1, window.innerHeight);
  const others = DRAGGABLE_CONTROL_IDS.filter(other => other !== id);
  const positionFor = (other: (typeof DRAGGABLE_CONTROL_IDS)[number]) =>
    layout[other] ?? defaultControlPosition(other, joystickSide);

  const fits = (candidate: ControlPosition) => others.every(other => {
    const point = positionFor(other);
    const dx = Math.abs(candidate.x - point.x) * viewportWidth / 100;
    const dy = Math.abs(candidate.y - point.y) * viewportHeight / 100;
    // A small safety gap accounts for borders and preview/gameplay scaling.
    const horizontalClearance =
      DRAG_SAFE_HALF_WIDTH[id as keyof typeof DRAG_SAFE_HALF_WIDTH] +
      DRAG_SAFE_HALF_WIDTH[other] + 12;
    const verticalClearance =
      DRAG_SAFE_HALF_HEIGHT[id as keyof typeof DRAG_SAFE_HALF_HEIGHT] +
      DRAG_SAFE_HALF_HEIGHT[other] + 12;
    return dx >= horizontalClearance || dy >= verticalClearance;
  });

  const safeProposed = constrainDragPosition(id, proposed);
  if (fits(safeProposed)) return safeProposed;

  // Search nearest screen-space offsets first. This makes dragging near a
  // control gently move the selected control to a free spot instead of stacking
  // hit targets on top of each other.
  const directions = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1],
  ] as const;
  for (let offsetPx = 8; offsetPx <= 400; offsetPx += 8) {
    for (const [dx, dy] of directions) {
      const candidate = constrainDragPosition(id, {
        x: safeProposed.x + dx * offsetPx / viewportWidth * 100,
        y: safeProposed.y + dy * offsetPx / viewportHeight * 100,
      });
      if (fits(candidate)) return candidate;
    }
  }
  // If the viewport has no feasible free position, retain the clamped choice;
  // the editor remains usable instead of trapping the control at a random edge.
  return safeProposed;
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
  const [draftLayout, setDraftLayout] = useState<ControlLayout>({});
  const previewRef = useRef<HTMLDivElement>(null);
  const draggingControlRef = useRef<GameplayControlId | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const en = language === 'en';
  const controlOptions = DRAGGABLE_CONTROL_IDS.map(id => [id, CONTROL_LABELS[id]] as [GameplayControlId, { en: string; ru: string }]);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const draft: ControlLayout = {};
    DRAGGABLE_CONTROL_IDS.forEach(id => {
      const position = controlLayout[id] ?? defaultControlPosition(id, joystickSide);
      draft[id] = constrainDragPosition(id, position);
    });
    setDraftLayout(draft);
    draggingControlRef.current = null;
  }, [open, joystickSide, controlLayout]);

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
            {en ? 'Arrange gameplay controls' : 'Расположение игровых кнопок'}
          </legend>
          <p style={{ margin: '0 0 10px', color: 'rgba(220,237,239,.58)', font: '12px/1.4 system-ui, sans-serif' }}>
            {en
              ? 'Drag a control to where you want it. Controls move away from each other when space allows; keep them below the fixed top HUD, then press Save.'
              : 'Перетащите элемент в нужное место. Кнопки стараются не перекрываться; держите их ниже верхней панели и нажмите «Сохранить».'}
          </p>
          <label style={{ display: 'block', marginBottom: 9, color: 'rgba(226,239,241,.8)', font: '12px/1.4 system-ui, sans-serif' }}>
            {en ? 'Selected control' : 'Выбранный элемент'}
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
          <div
            ref={previewRef}
            data-testid="control-layout-preview"
            aria-label={en ? 'Drag controls in this preview' : 'Перетаскивайте элементы в этой области'}
            style={{
              position: 'relative', width: 'min(100%, 150px)', aspectRatio: '390 / 844', maxHeight: 300,
              margin: '0 auto 12px', overflow: 'hidden', borderRadius: 13, border: '1px solid rgba(167,193,203,.3)',
              background: 'linear-gradient(180deg, rgba(10,22,31,.98), rgba(17,48,55,.94))',
              touchAction: 'none', userSelect: 'none', marginBottom: 12,
            }}
          >
            <div
            data-testid="control-layout-fixed-hud"
            style={{
              position: 'absolute', inset: '0 0 auto', height: '24%', display: 'flex',
              alignItems: 'flex-start', justifyContent: 'space-between', padding: '7px 8px',
              boxSizing: 'border-box', borderBottom: '1px dashed rgba(255,255,255,.25)',
              color: 'rgba(220,237,239,.5)', font: '8px system-ui, sans-serif', whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              <span>{en ? 'MAP · TASKS · SET' : 'КАРТА · ЗАД · НАСТР'}</span>
              <span>{en ? 'FIXED' : 'ФИКС'}</span>
            </div>
            {controlOptions.map(([id, label]) => {
              const position = draftLayout[id] ?? controlLayout[id] ?? defaultControlPosition(id, joystickSide);
              const selected = selectedControl === id;
              const previewDimensions = PREVIEW_CONTROL_DIMENSIONS[id as keyof typeof PREVIEW_CONTROL_DIMENSIONS];
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`control-drag-${id}`}
                  aria-label={en ? `Drag ${label.en}` : `Переместить: ${label.ru}`}
                  aria-pressed={selected}
                  onPointerDown={event => {
                    event.preventDefault();
                    setSelectedControl(id);
                    draggingControlRef.current = id;
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={event => {
                    const dragging = draggingControlRef.current;
                    const bounds = previewRef.current?.getBoundingClientRect();
                    if (!dragging || !bounds || bounds.width <= 0 || bounds.height <= 0) return;
                    const x = Math.round(Math.max(5, Math.min(95, ((event.clientX - bounds.left) / bounds.width) * 100)));
                    const y = Math.round(Math.max(25, Math.min(95, ((event.clientY - bounds.top) / bounds.height) * 100)));
                    setDraftLayout(previous => ({
                      ...previous,
                      [dragging]: resolveNonOverlappingPosition(dragging, { x, y }, previous, joystickSide),
                    }));
                  }}
                  onPointerUp={() => { draggingControlRef.current = null; }}
                  onPointerCancel={() => { draggingControlRef.current = null; }}
                  onClick={() => setSelectedControl(id)}
                  style={{
                    position: 'absolute', left: `${position.x}%`, top: `${Math.max(25, position.y)}%`,
                    transform: 'translate(-50%, -50%)',
                    width: previewDimensions.width,
                    height: previewDimensions.height,
                    minWidth: 0, minHeight: 0, maxWidth: 'none', padding: 0, boxSizing: 'border-box',
                    borderRadius: id === 'joystick' ? 999 : 7, border: `2px solid ${selected ? '#62e8d8' : 'rgba(200,225,230,.5)'}`,
                    background: selected ? 'rgba(26,130,121,.95)' : 'rgba(17,37,48,.94)',
                    boxShadow: selected ? '0 0 0 3px rgba(98,232,216,.16)' : '0 2px 5px rgba(0,0,0,.28)',
                    color: '#f0ffff', font: '8px/1 system-ui, sans-serif', fontWeight: 700,
                    touchAction: 'none', cursor: 'grab', zIndex: selected ? 2 : 1,
                  }}
                >
                  {DRAG_SHORT_LABELS[id]}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button
              type="button"
              data-testid="control-layout-reset"
              onClick={() => {
                const defaults: ControlLayout = {};
                controlOptions.forEach(([id]) => { const point = defaultControlPosition(id, joystickSide); defaults[id] = constrainDragPosition(id, point); });
                setDraftLayout(defaults);
              }}
              style={{
                flex: 1, minHeight: 42, padding: '8px 10px', borderRadius: 10,
                border: '1px solid rgba(167,193,203,.22)', background: 'rgba(5,15,23,.5)',
                color: 'rgba(226,238,241,.85)', fontFamily: 'inherit', fontSize: 12,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              {en ? 'Reset preview' : 'Сбросить просмотр'}
            </button>
            <button
              type="button"
              data-testid="control-layout-cancel"
              onClick={onClose}
              style={{
                flex: 1, minHeight: 42, padding: '8px 10px', borderRadius: 10,
                border: '1px solid rgba(167,193,203,.22)', background: 'rgba(5,15,23,.5)',
                color: 'rgba(226,238,241,.85)', fontFamily: 'inherit', fontSize: 12,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              {en ? 'Cancel' : 'Отмена'}
            </button>
            <button
              type="button"
              data-testid="control-layout-save"
              onClick={() => {
                controlOptions.forEach(([id]) => { const point = draftLayout[id] ?? defaultControlPosition(id, joystickSide); setControlPosition(id, constrainDragPosition(id, point)); });
                onClose();
              }}
              style={{
                flex: 1.3, minHeight: 42, padding: '8px 8px', borderRadius: 10,
                border: '1px solid rgba(91,221,205,.9)', background: 'linear-gradient(180deg, #208e83, #155c59)',
                color: '#f2fffd', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {en ? 'Save positions' : 'Сохранить'}
            </button>
          </div>
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
