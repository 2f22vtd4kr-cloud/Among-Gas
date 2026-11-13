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
  ventAvailable: boolean;
  english: boolean;
  positionStyle: CSSProperties;
  onKill: () => void;
  onReport: () => void;
  onUse: () => void;
  onVent: () => void;
}

const ACTION_SIZE = 60;
const baseButton: CSSProperties = {
  width: ACTION_SIZE,
  height: ACTION_SIZE,
  flex: "0 0 " + ACTION_SIZE + "px",
  borderRadius: "50%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 1,
  padding: 0,
  fontFamily: "Arial, sans-serif",
  fontWeight: 900,
  fontSize: 9,
  lineHeight: 1,
  letterSpacing: "0.035em",
  color: "#ffffff",
  border: "2px solid rgba(255,255,255,0.78)",
  boxShadow: "0 2px 5px rgba(0,0,0,0.48)",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

function ActionGlyph({ kind, actionKind }: { kind: "kill" | "report" | "use" | "vent"; actionKind?: string | null }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 3.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "use" && actionKind === "task") return (
          <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
            <path d="M16 9h-4a3 3 0 0 0-3 3v27h30V12a3 3 0 0 0-3-3h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <rect x="17" y="5" width="14" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M16 22h16M16 29h10M16 36h13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
  );
  if (kind === "use" && actionKind === "repair") return (
    <svg {...common}><path d="M29 7a12 12 0 0 0-14 15L7 30a6 6 0 0 0 8 8l9-9A12 12 0 0 0 39 14l-8 8-8-8 6-7Z" /></svg>
  );
  if (kind === "use" && actionKind === "admin") return (
    <svg {...common}><rect x="7" y="8" width="34" height="32" rx="3" /><path d="M7 18h34M18 18v22M30 18v22M7 29h34" /><circle cx="24" cy="13" r="2" fill="currentColor" stroke="none" /></svg>
  );
  if (kind === "use" && actionKind === "vent") return (
    <svg {...common}><path d="M7 12h34M7 24h34M7 36h34" /><path d="m15 7 0 30m18-30v30" opacity=".6" /></svg>
  );
  if (kind === "kill") return (
    <svg {...common}>
      <path d="m10 37 19-19 7 7-19 19-7-7Z" fill="currentColor" stroke="none" />
      <path d="m26 14 7-7 9 9-7 7" fill="currentColor" stroke="none" />
      <path d="m8 41 9-9" />
    </svg>
  );
  if (kind === "report") return (
    <svg {...common}>
      <path d="M8 9h32v24H23L12 41v-8H8V9Z" />
      <path d="M24 15v9m0 5v.5" />
    </svg>
  );
  if (kind === "vent") return (
    <svg {...common}>
      <path d="M7 12h34M7 24h34M7 36h34" />
      <path d="m15 7 0 30m18-30v30" opacity=".6" />
    </svg>
  );
  return (
    <svg {...common}>
      <path d="M14 24v-9a3 3 0 0 1 6 0v8-12a3 3 0 0 1 6 0v12-9a3 3 0 0 1 6 0v10-5a3 3 0 0 1 6 0v10c0 8-5 13-13 13h-2c-5 0-8-2-11-7l-5-8a3 3 0 0 1 5-3l4 5" />
    </svg>
  );
}

function ActionButton({
  kind, label, ariaLabel, disabled, background, onClick, cooldown, testId,
  useActionKind, useAvailable, reportAvailable, killAvailable,
}: {
  kind: "kill" | "report" | "use" | "vent";
  label: string;
  ariaLabel: string;
  disabled: boolean;
  background: string;
  onClick: () => void;
  cooldown?: { remainingMs: number; maxMs: number };
  testId: string;
  useActionKind?: string | null;
  useAvailable?: boolean;
  reportAvailable?: boolean;
  killAvailable?: boolean;
}) {
  const progress = cooldown
    ? Math.max(0, Math.min(1, cooldown.remainingMs / Math.max(1, cooldown.maxMs)))
    : 0;
  const degrees = progress * 360;
  const fill = cooldown && progress > 0
    ? "conic-gradient(from -90deg, #9aa3a8 0deg " + degrees + "deg, #566168 " + degrees + "deg 360deg)"
     : disabled
      ? "linear-gradient(145deg, #77838a 0%, #465158 100%)"
      : background;
  return (
    <button
      type="button"
      data-testid={testId}
      data-use-action={kind === "use" ? useActionKind ?? "none" : undefined}
      data-use-available={kind === "use" ? String(useAvailable === true) : undefined}
      data-report-available={kind === "report" ? String(reportAvailable === true) : undefined}
      data-kill-available={kind === "kill" ? String(killAvailable === true) : undefined}
      data-cooldown-ms={kind === "kill" ? cooldown?.remainingMs : undefined}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...baseButton,
        background: fill,
        opacity: disabled ? 0.45 : 1,
        filter: disabled ? "saturate(0.2)" : "none",
        cursor: disabled ? "default" : "pointer",
        animation: kind === "kill" && killAvailable === true && !disabled
          ? "agKillReadyPulse 1.15s ease-in-out infinite"
          : "none",
      }}
    >
      {cooldown && progress > 0
        ? <span style={{ fontSize: 20, lineHeight: 1 }}>{Math.ceil(cooldown.remainingMs / 1000)}</span>
        : <ActionGlyph kind={kind} actionKind={useActionKind} />}
      <span>{label}</span>
    </button>
  );
}

export default function GameActionBar(props: GameActionBarProps) {
  const killDisabled = props.killCooldownMs > 0 || !props.killAvailable;
  const reportDisabled = props.isGhost || !props.reportAvailable;
  const useDisabled = !props.useAvailable;
  const ventDisabled = !props.ventAvailable;

  return (
    <div
      data-testid="game-action-bar"
      style={{
        position: "fixed",
        bottom: 96,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        zIndex: 25,
        maxWidth: "calc(100vw - 20px)",
        ...props.positionStyle,
      }}
    >
      <style>{'@keyframes agKillReadyPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }'}</style>
      {props.isImpostor && (
        <ActionButton
          kind="kill"
          testId="game-action-kill"
          label="KILL"
          ariaLabel={props.killCooldownMs > 0
            ? (props.english ? "Kill cooldown " + Math.ceil(props.killCooldownMs / 1000) + " seconds" : "Перезарядка убийства " + Math.ceil(props.killCooldownMs / 1000) + " секунд")
            : props.killAvailable ? (props.english ? "Kill" : "Убить") : (props.english ? "Kill unavailable" : "Убийство недоступно")}
          disabled={killDisabled}
          background="#e34b50"
          cooldown={{ remainingMs: props.killCooldownMs, maxMs: props.killCooldownMaxMs }}
          killAvailable={props.killAvailable}
          onClick={props.onKill}
        />
      )}
      {!props.isGhost && (
        <ActionButton
          kind="report"
          testId="game-action-report"
          label={props.english ? "REPORT" : "ДОКЛАД"}
          ariaLabel={reportDisabled
            ? (props.english ? "Report unavailable" : "Доклад недоступен")
            : (props.english ? "Report body" : "Доложить о теле")}
          disabled={reportDisabled}
          background="#e9a52c"
          reportAvailable={props.reportAvailable}
          onClick={props.onReport}
        />
      )}
      <ActionButton
        kind="use"
        testId="game-action-use"
        label={props.english ? "USE" : "ИСП."}
        ariaLabel={useDisabled
          ? (props.english ? "Use unavailable" : "Использование недоступно")
          : (props.english ? "Use" : "Использовать")}
        disabled={useDisabled}
        background="#2aa96b"
        useActionKind={props.useActionKind}
        useAvailable={props.useAvailable}
        onClick={props.onUse}
      />
      {props.isImpostor && !props.isGhost && (
        <ActionButton
          kind="vent"
          testId="game-action-vent"
          label={props.english ? "VENT" : "ЛЮК"}
          ariaLabel={ventDisabled
            ? (props.english ? "Vent unavailable" : "Люк недоступен")
            : (props.english ? "Enter vent" : "Войти в люк")}
          disabled={ventDisabled}
          background="#9c61c7"
          onClick={props.onVent}
        />
      )}
    </div>
  );
}
