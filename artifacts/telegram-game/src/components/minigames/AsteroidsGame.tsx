import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

interface AsteroidTarget {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}
interface AsteroidBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
const ASTEROID_TARGET = 30;
const ASTEROID_ACTIVE = 10;
const ASTEROID_FIRE_RATE_MS = 300;
const ASTEROID_BULLET_SPEED = 0.82; // normalized board widths/height per second, direction adjusted for aspect ratio

function createAsteroid(id: number): AsteroidTarget {
  const x = 0.07 + ((id * 37) % 85) / 100;
  const y = 0.06 + ((id * 23) % 52) / 100;
  const vx = (((id * 17) % 5) - 2) * 0.012;
  const vy = 0.022 + ((id * 11) % 5) * 0.008;
  return { id, x, y, vx, vy, size: 0.036 + (id % 3) * 0.004 };
}

export function AsteroidsGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const boardRef = useRef<HTMLDivElement>(null);
  const asteroidsRef = useRef<AsteroidTarget[]>(Array.from({ length: ASTEROID_ACTIVE }, (_, i) => createAsteroid(i + 1)));
  const bulletsRef = useRef<AsteroidBullet[]>([]);
  const nextAsteroidIdRef = useRef(ASTEROID_ACTIVE + 1);
  const nextBulletIdRef = useRef(1);
  const destroyedRef = useRef(0);
  const firingRef = useRef(false);
  const aimRef = useRef({ x: 0.5, y: 0.25 });
  const lastFireAtRef = useRef(0);
  const doneRef = useRef(false);
  const completeRef = useRef(onComplete);
  const [destroyed, setDestroyed] = useState(0);
  const [firing, setFiring] = useState(false);
  const [, setRenderTick] = useState(0);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const fireAt = (aim: { x: number; y: number }) => {
    const board = boardRef.current;
    if (!board || doneRef.current) return;
    const width = Math.max(1, board.clientWidth);
    const height = Math.max(1, board.clientHeight);
    const startX = 0.5;
    const startY = 0.88;
    const dxPx = (aim.x - startX) * width;
    const dyPx = (aim.y - startY) * height;
    const length = Math.hypot(dxPx, dyPx) || 1;
    const speedPx = Math.max(width, height) * ASTEROID_BULLET_SPEED;
    bulletsRef.current = [...bulletsRef.current, {
      id: nextBulletIdRef.current++,
      x: startX,
      y: startY,
      vx: (dxPx / length * speedPx) / width,
      vy: (dyPx / length * speedPx) / height,
    }];
    lastFireAtRef.current = performance.now();
  };

  const updateAim = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    aimRef.current = {
      x: Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width)),
      y: Math.max(0.02, Math.min(0.92, (clientY - rect.top) / rect.height)),
    };
  };

  useEffect(() => {
    let lastTime = performance.now();
    const interval = setInterval(() => {
      const board = boardRef.current;
      if (!board || doneRef.current) return;
      const width = Math.max(1, board.clientWidth);
      const height = Math.max(1, board.clientHeight);
      const now = performance.now();
      const dt = Math.min(0.06, (now - lastTime) / 1000);
      lastTime = now;

      if (firingRef.current && now - lastFireAtRef.current >= ASTEROID_FIRE_RATE_MS) {
        fireAt(aimRef.current);
      }

      const bullets = bulletsRef.current.map(b => ({
        ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt,
      })).filter(b => b.x > -0.05 && b.x < 1.05 && b.y > -0.1 && b.y < 1.1);

      const asteroids = asteroidsRef.current.map(a => {
        let x = a.x + a.vx * dt;
        let y = a.y + a.vy * dt;
        if (x < 0.04 || x > 0.96) return { ...a, x: Math.max(0.04, Math.min(0.96, x)), y, vx: -a.vx };
        if (y > 0.77) return { ...a, x: 0.07 + ((a.id * 29) % 85) / 100, y: 0.03, vx: -a.vx };
        return { ...a, x, y };
      });

      const hitAsteroids = new Set<number>();
      const spentBullets = new Set<number>();
      for (const bullet of bullets) {
        for (const asteroid of asteroids) {
          if (hitAsteroids.has(asteroid.id)) continue;
          const dx = (bullet.x - asteroid.x) * width;
          const dy = (bullet.y - asteroid.y) * height;
          if (Math.hypot(dx, dy) <= asteroid.size * width + 3) {
            hitAsteroids.add(asteroid.id);
            spentBullets.add(bullet.id);
            break;
          }
        }
      }

      let nextDestroyed = destroyedRef.current + hitAsteroids.size;
      nextDestroyed = Math.min(ASTEROID_TARGET, nextDestroyed);
      let remaining = asteroids.filter(a => !hitAsteroids.has(a.id));
      const activeTargetCount = Math.min(ASTEROID_ACTIVE, ASTEROID_TARGET - nextDestroyed);
      while (remaining.length < activeTargetCount) remaining.push(createAsteroid(nextAsteroidIdRef.current++));

      bulletsRef.current = bullets.filter(b => !spentBullets.has(b.id));
      asteroidsRef.current = remaining;
      if (nextDestroyed !== destroyedRef.current) {
        destroyedRef.current = nextDestroyed;
        setDestroyed(nextDestroyed);
      }
      setRenderTick(tick => tick + 1);

      if (nextDestroyed >= ASTEROID_TARGET && !doneRef.current) {
        doneRef.current = true;
        firingRef.current = false;
        setFiring(false);
        setTimeout(() => completeRef.current(), 350);
      }
    }, 33);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <div
        ref={boardRef}
        onPointerDown={event => {
          if (doneRef.current) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          updateAim(event.clientX, event.clientY);
          firingRef.current = true;
          setFiring(true);
          fireAt(aimRef.current);
        }}
        onPointerMove={event => {
          updateAim(event.clientX, event.clientY);
        }}
        onPointerUp={() => { firingRef.current = false; setFiring(false); }}
        onPointerCancel={() => { firingRef.current = false; setFiring(false); }}
        onLostPointerCapture={() => { firingRef.current = false; setFiring(false); }}
        role="application"
        aria-label={en ? 'Aim and shoot moving asteroids' : 'Прицеливайтесь и стреляйте по астероидам'}
        style={{
          position: 'relative', width: 'min(300px,82vw)', height: 220, overflow: 'hidden', borderRadius: 12,
          background: 'radial-gradient(ellipse at 50% 35%,#1a3555,#080d19 75%)',
          border: '1px solid rgba(120,180,220,0.28)', touchAction: 'none', cursor: 'crosshair',
        }}
      >
        {Array.from({ length: 36 }, (_, i) => (
          <span key={i} style={{ position: 'absolute', left: `${(i * 31 + 7) % 99}%`, top: `${(i * 47 + 11) % 98}%`,
            width: i % 4 === 0 ? 2 : 1, height: i % 4 === 0 ? 2 : 1, borderRadius: '50%',
            background: 'rgba(220,240,255,0.7)', pointerEvents: 'none' }} />
        ))}
        {asteroidsRef.current.map(asteroid => (
          <div key={asteroid.id} style={{
            position: 'absolute', left: `${asteroid.x * 100}%`, top: `${asteroid.y * 100}%`,
            width: `${asteroid.size * 100}%`, aspectRatio: '1', display: 'grid', placeItems: 'center',
            borderRadius: '37% 54% 44% 57%', transform: `rotate(${asteroid.id * 29 % 360}deg)`,
            background: 'linear-gradient(135deg,#9caab8,#465566)', border: '1px solid rgba(255,255,255,0.35)',
            color: '#d6e3ef', fontSize: 18, boxShadow: 'inset -4px -5px 0 rgba(0,0,0,0.25)', pointerEvents: 'none',
          }}>✦</div>
        ))}
        {bulletsRef.current.map(bullet => (
          <span key={bullet.id} style={{
            position: 'absolute', left: `${bullet.x * 100}%`, top: `${bullet.y * 100}%`,
            transform: 'translate(-50%,-50%)', width: 4, height: 12, borderRadius: 4,
            background: '#8fffff', boxShadow: '0 0 7px #72fbff', pointerEvents: 'none',
          }} />
        ))}
        <div style={{ position: 'absolute', left: '50%', bottom: 5, transform: 'translateX(-50%)',
          fontSize: 25, filter: 'drop-shadow(0 0 5px rgba(80,190,255,0.4))', pointerEvents: 'none' }}>🚀</div>
        <div style={{ position: 'absolute', left: 8, top: 8, padding: '4px 7px', borderRadius: 5,
          background: 'rgba(0,0,0,0.6)', color: '#ffef93', fontFamily: 'monospace', fontSize: 12, pointerEvents: 'none' }}>
          {en ? 'TARGETS' : 'ЦЕЛИ'} {destroyed}/{ASTEROID_TARGET}
        </div>
        {firing && <div style={{
          position: 'absolute', left: 'calc(50% - 2px)', bottom: 36, width: 4, height: 20,
          background: 'linear-gradient(180deg,rgba(130,255,255,0),#72fbff)',
          filter: 'drop-shadow(0 0 5px #72fbff)', pointerEvents: 'none',
        }} />}
      </div>
      <div style={{ width: 'min(280px,80vw)', height: 7, borderRadius: 9, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ width: `${destroyed / ASTEROID_TARGET * 100}%`, height: '100%', background: 'linear-gradient(90deg,#54baff,#8fffd7)', transition: 'width 150ms linear' }} />
      </div>
      <p style={helpStyle}>{destroyed < ASTEROID_TARGET ? (firing ? (en ? 'Fire! Move the reticle to aim' : 'Огонь! Двигайте прицел, чтобы попасть') : (en ? 'Tap or hold the field to shoot asteroids' : 'Нажмите или удерживайте поле, чтобы стрелять по астероидам')) : (en ? '✓ Asteroids destroyed' : '✓ Астероиды уничтожены')}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

