import { CharacterSpriteCanvas } from '../game/characterSpriteRenderer';
import { slotColor } from '../game/mapPresentation';

interface KillAnimationOverlayProps {
  attackerSlot: number | null;
  victimSlot: number;
  english: boolean;
}

/** Victim-only full-screen elimination sequence, isolated from GameMap orchestration. */
export default function KillAnimationOverlay({
  attackerSlot,
  victimSlot,
  english,
}: KillAnimationOverlayProps) {
  return (
        <div
          role="alert"
          aria-live="assertive"
          aria-label={english ? 'Kill animation' : 'Анимация убийства'}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(155deg, #8b0612 0%, #37050b 48%, #050609 100%)',
            color: '#fff4f2', fontFamily: 'system-ui, sans-serif',
            animation: 'agKillBackdrop 1.65s ease-out both',
            pointerEvents: 'none',
          }}
        >
          {/* Original Among Gas speed-line treatment; character art stays on our balaclava sprites. */}
          <div aria-hidden="true" className="ag-kill-speedlines" style={{
            position: 'absolute', inset: '-35% -25%', pointerEvents: 'none',
            backgroundImage: [
              'repeating-linear-gradient(169deg, transparent 0 24px, rgba(255,34,48,.88) 26px 39px, rgba(255,226,210,.94) 40px 47px, transparent 49px 76px)',
              'repeating-linear-gradient(169deg, transparent 0 72px, rgba(250,14,28,.66) 74px 91px, transparent 93px 136px)',
              'linear-gradient(90deg, transparent 0%, rgba(255,245,230,.72) 45%, rgba(255,20,42,.48) 54%, transparent 86%)',
            ].join(','),
            opacity: 0.66,
            transform: 'rotate(-7deg) scale(1.08)',
            animation: 'agKillStreaks .9s cubic-bezier(.12,.75,.21,1) both',
          }} />
          <style>{`
            @keyframes agKillBackdrop {
              0% { opacity: 0; filter: brightness(2.0) saturate(1.3); }
              10% { opacity: 1; filter: brightness(1.4) saturate(1.2); }
              100% { opacity: 1; filter: brightness(1) saturate(1); }
            }
            @keyframes agKillStreaks {
              0% { transform: translateX(-18%) rotate(-7deg) scale(1.08); opacity: 0; }
              24% { opacity: .9; }
              100% { transform: translateX(18%) rotate(-7deg) scale(1.08); opacity: .35; }
            }
            @keyframes agKillAttacker {
              0% { transform: translateX(-105vw) scale(.62) rotate(-8deg); opacity: 0; }
              28% { transform: translateX(3vw) scale(1.12) rotate(5deg); opacity: 1; }
              48% { transform: translateX(17vw) scale(1.04) rotate(0); opacity: 1; }
              100% { transform: translateX(14vw) scale(1) rotate(-2deg); opacity: 1; }
            }
            @keyframes agKillVictimUpper {
              0%, 25% { transform: translate(0, 0) rotate(0) scale(1); opacity: 1; }
              36% { transform: translate(-4vw, -1vh) rotate(-12deg) scale(1.06); opacity: 1; }
              52% { transform: translate(8vw, -10vh) rotate(34deg) scale(.96); opacity: .92; }
              74%, 100% { transform: translate(15vw, -18vh) rotate(62deg) scale(.74); opacity: 0; }
            }
            @keyframes agKillVictimLower {
              0%, 34% { transform: translateY(0) rotate(0); opacity: 0; }
              46% { transform: translateY(2vh) rotate(-8deg); opacity: .25; }
              70% { transform: translateY(7vh) rotate(7deg); opacity: .86; }
              100% { transform: translateY(5vh) rotate(3deg); opacity: 1; }
            }
            @keyframes agKillSlash {
              0%, 20% { transform: translate(-130%, -50%) rotate(-17deg) scaleX(.45); opacity: 0; }
              31% { opacity: 1; }
              46% { transform: translate(0, -50%) rotate(-17deg) scaleX(1.2); opacity: 1; }
              62% { transform: translate(115%, -50%) rotate(-17deg) scaleX(.65); opacity: 0; }
              100% { transform: translate(115%, -50%) rotate(-17deg) scaleX(.65); opacity: 0; }
            }
            @keyframes agKillBurst {
              0%, 28% { transform: translate(-50%, -50%) scale(.1) rotate(0); opacity: 0; }
              42% { transform: translate(-50%, -50%) scale(1.25) rotate(15deg); opacity: .9; }
              68%, 100% { transform: translate(-50%, -50%) scale(1.55) rotate(28deg); opacity: 0; }
            }
            @keyframes agKillText {
              0%, 43% { opacity: 0; transform: translateY(14px); }
              62% { opacity: 1; transform: translateY(0); }
              100% { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              .ag-kill-speedlines, .ag-kill-attacker, .ag-kill-victim-upper,
              .ag-kill-victim-lower, .ag-kill-slash, .ag-kill-burst, .ag-kill-text {
                animation-duration: 1ms !important;
              }
            }
          `}</style>
          <div style={{
            position: 'relative', width: 'min(100vw, 900px)', height: 'min(62vh, 520px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            isolation: 'isolate',
          }}>
            {/* Compact flash/impact burst, not a plain line painted over the sprites. */}
            <div aria-hidden="true" className="ag-kill-burst" style={{
              position: 'absolute', left: '55%', top: '43%', width: 'min(88vw, 660px)', height: 'min(42vh, 300px)',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(ellipse at center, rgba(255,249,228,.98) 0%, rgba(255,100,89,.96) 8%, rgba(211,0,25,.86) 22%, rgba(120,0,15,.32) 42%, transparent 68%)',
              clipPath: 'polygon(0 48%, 20% 40%, 5% 28%, 32% 36%, 26% 9%, 43% 32%, 52% 0, 61% 30%, 84% 8%, 73% 39%, 100% 44%, 74% 54%, 93% 77%, 66% 64%, 65% 100%, 51% 70%, 31% 91%, 37% 64%, 10% 73%, 27% 55%)',
              animation: 'agKillBurst 1.65s ease-out both',
              zIndex: 1,
            }} />
            <div className="ag-kill-attacker" style={{
              position: 'absolute', left: '3%', top: '19%', zIndex: 4,
              animation: 'agKillAttacker 1.65s cubic-bezier(.12,.8,.18,1) both',
              filter: 'drop-shadow(0 12px 12px rgba(0,0,0,.72))',
            }}>
              <CharacterSpriteCanvas color={slotColor(attackerSlot ?? 0)} pose="idle" size={174} />
            </div>
            <div className="ag-kill-victim" style={{
              position: 'absolute', right: '15%', top: '17%', width: 174, height: 190, zIndex: 3,
              filter: 'drop-shadow(0 12px 12px rgba(0,0,0,.72))',
            }}>
              <div className="ag-kill-victim-upper" style={{
                position: 'absolute', inset: 0, width: 174, height: 154,
                // Keep the complete authored balaclava sprite visible during the strike.
                animation: 'agKillVictimUpper 1.65s cubic-bezier(.16,.68,.25,1) both',
              }}>
                <CharacterSpriteCanvas color={slotColor(victimSlot)} pose="idle" size={174} />
              </div>
              <div className="ag-kill-victim-lower" role="img" aria-label={english ? 'Balaclava corpse with exposed bone' : 'Тело с открытой костью'} style={{
                position: 'absolute', inset: 0,
                animation: 'agKillVictimLower 1.65s ease-out both',
              }}>
                <CharacterSpriteCanvas color={slotColor(victimSlot)} pose="dead-body" size={174} />
              </div>
            </div>
            <div className="ag-kill-slash" style={{
              position: 'absolute', left: '-5%', top: '45%', width: '112%', height: 'clamp(12px, 2.2vh, 22px)',
              borderRadius: 999,
              background: 'linear-gradient(90deg, transparent 0%, #ff263b 11%, #fff4e8 26%, #fff 48%, #fff0df 68%, #f31330 88%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255,45,70,.95), 0 0 44px rgba(255,10,35,.8), 0 0 92px rgba(255,10,35,.46)',
              animation: 'agKillSlash 1.65s cubic-bezier(.1,.8,.2,1) both',
              zIndex: 2,
            }} />
          </div>
          <div className="ag-kill-text" style={{
            position: 'absolute', left: '4%', right: '4%', bottom: '10%',
            textAlign: 'center', fontSize: 'clamp(20px, 4vw, 42px)',
            fontWeight: 950, letterSpacing: '.18em', textTransform: 'uppercase',
            color: '#fff4f2', textShadow: '0 4px 18px rgba(255,30,50,.8)',
            animation: 'agKillText 1.65s ease-out both',
          }}>
            {english ? 'ELIMINATED' : 'УСТРАНЁН'}
          </div>
        </div>
  );
}
