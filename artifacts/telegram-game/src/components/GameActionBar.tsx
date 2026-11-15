import type { CSSProperties } from "react";
import { getCooldownSweepProgress } from "../game/gameActionState";

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

const neutralSurface = "rgba(72, 78, 84, 0.94)";
const neutralBorder = "2px solid rgba(220, 225, 230, 0.72)";
const buttonBase: CSSProperties = {
  width: 68,
  height: 68,
  flex: "0 0 68px",
  position: "relative",
  borderRadius: "50%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  fontFamily: "Arial, sans-serif",
  fontWeight: 800,
  fontSize: 9,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.45)",
  touchAction: "manipulation",
};

export default function GameActionBar(props: GameActionBarProps) {
  const killDisabled = props.killCooldownMs > 0 || !props.killAvailable;
  const killCooldownProgress = getCooldownSweepProgress(props.killCooldownMs, props.killCooldownMaxMs);
  const reportDisabled = !props.reportAvailable;
  const useDisabled = !props.useAvailable;

  return (
    <>
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
          data-kill-state={killDisabled ? "disabled" : "ready"}
          data-kill-available={String(props.killAvailable)}
          data-cooldown-ms={props.killCooldownMs}
          data-cooldown-progress={killCooldownProgress.toFixed(4)}
          aria-label={props.killCooldownMs > 0
            ? (props.english ? `Kill cooldown ${Math.ceil(props.killCooldownMs / 1000)} seconds` : `Перезарядка убийства ${Math.ceil(props.killCooldownMs / 1000)} секунд`)
            : props.killAvailable ? (props.english ? "Kill" : "Убить") : (props.english ? "Kill unavailable" : "Убийство недоступно")}
          disabled={killDisabled}
          onClick={props.onKill}
          style={{
            ...buttonBase,
            fontSize: 9,
            letterSpacing: "0.06em",
            opacity: killDisabled ? 0.45 : 1,
            filter: killDisabled ? "saturate(0.2)" : "none",
            color: killDisabled ? "#d8dfe3" : "#fff0f0",
            background: killDisabled ? neutralSurface : "#c73535",
            border: killDisabled ? neutralBorder : "2px solid rgba(255,255,255,0.88)",
            boxShadow: killDisabled ? "none" : buttonBase.boxShadow,
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
          {killCooldownProgress > 0 && (
            <svg
              data-testid="kill-cooldown-sweep"
              viewBox="0 0 68 68"
              width="68"
              height="68"
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotate(-90deg)",
                pointerEvents: "none",
              }}
            >
              <circle
                cx="34"
                cy="34"
                r="30"
                fill="none"
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="3"
                strokeDasharray={2 * Math.PI * 30}
                strokeDashoffset={2 * Math.PI * 30 * (1 - killCooldownProgress)}
                strokeLinecap="round"
              />
            </svg>
          )}
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
          color: reportDisabled ? "#d8dde0" : "#ffffff",
          opacity: reportDisabled ? 0.45 : 1,
          filter: reportDisabled ? "saturate(0.15)" : "none",
          background: reportDisabled ? neutralSurface : "#d4a52c",
          border: reportDisabled ? neutralBorder : "2px solid rgba(255,255,255,0.88)",
          boxShadow: reportDisabled ? "none" : buttonBase.boxShadow,
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
          color: useDisabled ? "#d8dde0" : "#ffffff",
          opacity: useDisabled ? 0.45 : 1,
          filter: useDisabled ? "saturate(0.15)" : "none",
          background: useDisabled ? neutralSurface : "#d4a52c",
          border: useDisabled ? neutralBorder : "2px solid rgba(255,255,255,0.88)",
          boxShadow: useDisabled ? "none" : buttonBase.boxShadow,
          cursor: useDisabled ? "default" : "pointer",
        }}
      >
        {props.useActionKind === "task" ? (
          <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
            <path d="M16 9h-4a3 3 0 0 0-3 3v27h30V12a3 3 0 0 0-3-3h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <rect x="17" y="5" width="14" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M16 22h16M16 29h10M16 36h13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : props.useActionKind === "repair" ? (
          <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
            <path d="M28 8a12 12 0 0 0-13 16L6 33a5 5 0 0 0 7 7l9-9A12 12 0 0 0 38 18l-8 8-8-8 6-10Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        ) : props.useActionKind === "vent" ? (
          <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
            <rect x="7" y="10" width="34" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M14 17h20M14 23h20M14 29h20M14 35h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="m19 6 5-4 5 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : props.useActionKind === "admin" ? (
          <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
            <rect x="5" y="7" width="38" height="27" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M15 41h18M24 34v7M12 16h7v7h-7zM24 16h12M24 23h12M12 28h24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
            <path d="M11 25V15a3 3 0 0 1 6 0v8-12a3 3 0 0 1 6 0v12-9a3 3 0 0 1 6 0v11-6a3 3 0 0 1 6 0v11c0 8-5 13-13 13h-2c-5 0-8-2-11-7l-5-8a3 3 0 0 1 5-3l4 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span>{props.useActionKind === "vent"
          ? (props.english ? "VENT" : "ЛЮК")
          : props.english ? "USE" : "ИСПОЛЬЗОВАТЬ"}</span>
      </button>
    </div>
    </>
  );
}
