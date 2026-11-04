import type { CSSProperties } from "react";

export interface GameActionBarProps {
  isImpostor: boolean;
  isGhost: boolean;
  killCooldownMs: number;
  killCooldownMaxMs: number;
  killAvailable: boolean;
  reportAvailable: boolean;
  useAvailable: boolean;
  useActionKind: string | null;
  english: boolean;
  positionStyle: CSSProperties;
  onKill: () => void;
  onReport: () => void;
  onUse: () => void;
}

const neutralSurface = "radial-gradient(circle, #77838a, #465158)";
const neutralBorder = "2px solid rgba(190,202,208,0.5)";
const buttonBase: CSSProperties = {
  width: 72,
  height: 72,
  flex: "0 0 72px",
  borderRadius: "50%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 1,
  fontFamily: "sans-serif",
  fontWeight: 900,
  fontSize: 8,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  backdropFilter: "blur(4px)",
  touchAction: "manipulation",
};

export default function GameActionBar(props: GameActionBarProps) {
  const killDisabled = props.killCooldownMs > 0 || !props.killAvailable;
  const cooldownRatio = Math.max(0, Math.min(1, props.killCooldownMs / Math.max(1, props.killCooldownMaxMs)));
  const reportDisabled = !props.reportAvailable;
  const useDisabled = !props.useAvailable;

  return (
    <div data-testid="game-action-bar" style={{
      position: "fixed",
      bottom: 130,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      zIndex: 25,
      ...props.positionStyle,
    }}>
      {props.isImpostor && (
        <button
          type="button"
          data-testid="game-action-kill"
          data-kill-available={String(props.killAvailable)}
          data-cooldown-ms={props.killCooldownMs}
          aria-label={props.killCooldownMs > 0
            ? (props.english ? `Kill cooldown ${Math.ceil(props.killCooldownMs / 1000)} seconds` : `Перезарядка убийства ${Math.ceil(props.killCooldownMs / 1000)} секунд`)
            : props.killAvailable ? (props.english ? "Kill" : "Убить") : (props.english ? "Kill unavailable" : "Убийство недоступно")}
          disabled={killDisabled}
          onClick={props.onKill}
          style={{
            ...buttonBase,
            fontSize: 9,
            letterSpacing: "0.06em",
            color: killDisabled ? "#d8dfe3" : "#fff0f0",
            background: props.killCooldownMs > 0
              ? `conic-gradient(from -90deg, rgba(190,200,206,0.9) 0deg, rgba(190,200,206,0.9) ${cooldownRatio * 360}deg, rgba(66,76,83,0.98) ${cooldownRatio * 360}deg, rgba(66,76,83,0.98) 360deg)`
              : killDisabled ? neutralSurface : "radial-gradient(circle, rgba(210,20,20,0.96), rgba(120,0,0,0.98))",
            border: killDisabled ? neutralBorder : "2px solid rgba(255,135,135,0.9)",
            boxShadow: killDisabled ? "none" : "0 0 18px rgba(255,40,40,0.45)",
            cursor: killDisabled ? "default" : "pointer",
          }}
        >
          {props.killCooldownMs > 0 ? (
            <span style={{ fontSize: 20, lineHeight: 1 }}>{Math.ceil(props.killCooldownMs / 1000)}</span>
          ) : (
            <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
              <path d="M10 35 29 16l5 5-19 19-5-5Z" fill="currentColor" />
              <path d="m27 12 7-7 9 9-7 7-9-9Z" fill="currentColor" />
              <path d="m8 40 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          <span>KILL</span>
        </button>
      )}

      {!props.isGhost && <button
        type="button"
        data-testid="game-action-report"
        data-report-available={String(props.reportAvailable)}
        aria-label={props.reportAvailable ? (props.english ? "Report body" : "Доложить о теле") : (props.english ? "Report unavailable" : "Доклад недоступен")}
        disabled={reportDisabled}
        onClick={props.onReport}
        style={{
          ...buttonBase,
          color: reportDisabled ? "#c5cdd1" : "#fff5d6",
          background: reportDisabled ? neutralSurface : "radial-gradient(circle, rgba(220,160,20,0.96), rgba(140,90,0,0.98))",
          border: reportDisabled ? neutralBorder : "2px solid rgba(255,218,125,0.9)",
          boxShadow: reportDisabled ? "none" : "0 0 18px rgba(255,190,40,0.42)",
          cursor: reportDisabled ? "default" : "pointer",
        }}
      >
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <path d="M9 10h30v22H24l-9 7v-7H9V10Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M24 16v8m0 5v1" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
        <span>{props.english ? "REPORT" : "ДОЛОЖИТЬ"}</span>
      </button>}

      <button
        type="button"
        data-testid="game-action-use"
        data-use-action={props.useActionKind ?? "none"}
        data-use-available={String(props.useAvailable)}
        aria-label={useDisabled ? (props.english ? "Use unavailable" : "Использование недоступно") : (props.english ? "Use" : "Использовать")}
        disabled={useDisabled}
        onClick={props.onUse}
        style={{
          ...buttonBase,
          color: useDisabled ? "#c5cdd1" : "#e4ffff",
          background: useDisabled ? neutralSurface : "radial-gradient(circle, rgba(35,125,145,0.98), rgba(17,58,70,0.98))",
          border: useDisabled ? neutralBorder : "2px solid rgba(125,225,235,0.9)",
          boxShadow: useDisabled ? "none" : "0 0 18px rgba(50,190,205,0.42)",
          cursor: useDisabled ? "default" : "pointer",
        }}
      >
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <path d="M11 25V15a3 3 0 0 1 6 0v8-12a3 3 0 0 1 6 0v12-9a3 3 0 0 1 6 0v11-6a3 3 0 0 1 6 0v11c0 8-5 13-13 13h-2c-5 0-8-2-11-7l-5-8a3 3 0 0 1 5-3l4 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{props.english ? "USE" : "ИСПОЛЬЗОВАТЬ"}</span>
      </button>
    </div>
  );
}
