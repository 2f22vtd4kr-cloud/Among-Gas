import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useGameSettings } from '../lib/gameSettings';
import { useLanguage } from '../lib/language';

const BASE_RADIUS = 52;
const KNOB_RADIUS = 22;
const DEAD_ZONE = 0.18;
const MOVEMENT_KEYS = ['w', 'a', 's', 'd'] as const;

interface JoystickProps {
  keysRef: React.MutableRefObject<Set<string>>;
}

export default function Joystick({ keysRef }: JoystickProps) {
  const { joystickSide } = useGameSettings();
  const { language } = useLanguage();
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  function applyDirection(dx: number, dy: number) {
    const dist = Math.hypot(dx, dy);
    const keys = keysRef.current;
    if (dist < BASE_RADIUS * DEAD_ZONE) {
      for (const key of MOVEMENT_KEYS) keys.delete(key);
      return;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    if (ny < -0.4) keys.add('w'); else keys.delete('w');
    if (ny > 0.4) keys.add('s'); else keys.delete('s');
    if (nx < -0.4) keys.add('a'); else keys.delete('a');
    if (nx > 0.4) keys.add('d'); else keys.delete('d');
  }

  function resetJoystick() {
    activePointer.current = null;
    if (knobRef.current) knobRef.current.style.transform = 'translate(-50%, -50%)';
    for (const key of MOVEMENT_KEYS) keysRef.current.delete(key);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    activePointer.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few older WebViews; window focus
      // and visibility handlers below still guarantee movement is released.
    }
    const rect = event.currentTarget.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updatePointer(event.clientX, event.clientY);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId !== activePointer.current) return;
    event.preventDefault();
    updatePointer(event.clientX, event.clientY);
  }

  function updatePointer(clientX: number, clientY: number) {
    const dx = clientX - centerRef.current.x;
    const dy = clientY - centerRef.current.y;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(distance, BASE_RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }
    applyDirection(dx, dy);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId !== activePointer.current) return;
    resetJoystick();
  }

  function onLostPointerCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId === activePointer.current) resetJoystick();
  }

  useEffect(() => {
    const clear = () => resetJoystick();
    window.addEventListener('blur', clear);
    window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('blur', clear);
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', clear);
      resetJoystick();
    };
  }, []);

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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onLostPointerCapture}
      aria-label={language === 'en' ? 'Movement joystick' : 'Джойстик движения'}
      data-joystick-side={joystickSide}
      style={{
        position: 'fixed',
        bottom: 32,
        left: joystickSide === 'left' ? 32 : 'auto',
        right: joystickSide === 'right' ? 32 : 'auto',
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
