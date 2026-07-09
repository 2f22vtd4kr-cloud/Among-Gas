import { useRef, useEffect } from 'react';

const BASE_RADIUS = 52;   // outer ring radius (px)
const KNOB_RADIUS = 22;   // draggable knob radius (px)
const DEAD_ZONE   = 0.18; // fraction of base radius before movement registers

interface JoystickProps {
  /** The keysRef Set from GameMap — joystick writes 'w','a','s','d' into it */
  keysRef: React.MutableRefObject<Set<string>>;
}

export default function Joystick({ keysRef }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeTouch = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  // Derive which keys to hold from the knob offset
  function applyDirection(dx: number, dy: number) {
    const dist = Math.hypot(dx, dy);
    const keys = keysRef.current;
    if (dist < BASE_RADIUS * DEAD_ZONE) {
      keys.delete('w'); keys.delete('s');
      keys.delete('a'); keys.delete('d');
      return;
    }
    const nx = dx / dist; // -1..1
    const ny = dy / dist;
    // Threshold 0.4 so diagonals are easy to hit
    if (ny < -0.4) keys.add('w'); else keys.delete('w');
    if (ny >  0.4) keys.add('s'); else keys.delete('s');
    if (nx < -0.4) keys.add('a'); else keys.delete('a');
    if (nx >  0.4) keys.add('d'); else keys.delete('d');
  }

  function resetKnob() {
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(-50%, -50%)';
    }
    keysRef.current.delete('w');
    keysRef.current.delete('s');
    keysRef.current.delete('a');
    keysRef.current.delete('d');
  }

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;

    function onTouchStart(e: TouchEvent) {
      if (activeTouch.current !== null) return;
      const t = e.changedTouches[0];
      activeTouch.current = t.identifier;
      const rect = base!.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width  / 2,
        y: rect.top  + rect.height / 2,
      };
      e.preventDefault();
    }

    function onTouchMove(e: TouchEvent) {
      if (activeTouch.current === null) return;
      let touch: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === activeTouch.current) {
          touch = e.touches[i]; break;
        }
      }
      if (!touch) return;
      e.preventDefault();

      const dx = touch.clientX - centerRef.current.x;
      const dy = touch.clientY - centerRef.current.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, BASE_RADIUS);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;

      if (knobRef.current) {
        knobRef.current.style.transform =
          `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      }
      applyDirection(dx, dy);
    }

    function onTouchEnd(e: TouchEvent) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouch.current) {
          activeTouch.current = null;
          resetKnob();
          break;
        }
      }
    }

    base.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend',  onTouchEnd,  { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });
    return () => {
      base.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend',  onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={baseRef}
      style={{
        position: 'fixed',
        bottom: 32,
        left: 32,
        width:  BASE_RADIUS * 2,
        height: BASE_RADIUS * 2,
        borderRadius: '50%',
        background: 'rgba(20, 40, 60, 0.55)',
        border: '2px solid rgba(100, 180, 220, 0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 30,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* knob */}
      <div
        ref={knobRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width:  KNOB_RADIUS * 2,
          height: KNOB_RADIUS * 2,
          borderRadius: '50%',
          background: 'rgba(100, 200, 240, 0.75)',
          border: '2px solid rgba(160, 230, 255, 0.9)',
          transform: 'translate(-50%, -50%)',
          transition: 'transform 0.04s ease-out',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
