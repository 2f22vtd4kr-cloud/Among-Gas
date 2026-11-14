import { SettingsButton } from "./SettingsDialog";

interface GameTopHudProps {
  english: boolean;
  taskProgress: number;
  showProgress: boolean;
  showMap: boolean;
  mapOpen: boolean;
  showSettings: boolean;
  onToggleMap: () => void;
  onOpenSettings: () => void;
}

/** Persistent, safe-area-aware gameplay controls and crew task progress. */
export default function GameTopHud(props: GameTopHudProps) {
  const progress = Math.max(0, Math.min(100, Math.round(props.taskProgress)));
  const progressLabel = props.english ? "Total tasks completed" : "Всего заданий выполнено";
  const mapLabel = props.mapOpen
    ? (props.english ? "CLOSE MAP" : "ЗАКРЫТЬ КАРТУ")
    : (props.english ? "MAP" : "КАРТА");

  return (
    <>
      {props.showProgress && (
        <div
          data-testid="global-task-progress"
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${progress}%`}
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            left: 12,
            width: "min(184px, calc(100vw - 156px))",
            boxSizing: "border-box",
            padding: "6px 8px 7px",
            borderRadius: 9,
            color: "#e9f2f4",
            background: "linear-gradient(180deg, rgba(25,42,53,.96), rgba(9,19,28,.96))",
            border: "1px solid rgba(160,205,215,.32)",
            boxShadow: "0 3px 10px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.06)",
            fontFamily: "sans-serif",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            minWidth: 0,
            marginBottom: 5,
          }}>
            <span style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 8,
              lineHeight: 1.2,
              fontWeight: 900,
              letterSpacing: "0.045em",
            }}>
              {props.english ? "TOTAL TASKS COMPLETED" : "ЗАДАНИЯ ВЫПОЛНЕНЫ"}
            </span>
            <span data-testid="global-task-progress-value" style={{
              flex: "0 0 auto",
              fontSize: 10,
              lineHeight: 1,
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              color: progress >= 100 ? "#70e4a0" : "#f1cf66",
            }}>
              {progress}%
            </span>
          </div>
          <div aria-hidden="true" style={{
            height: 5,
            overflow: "hidden",
            borderRadius: 4,
            background: "rgba(0,0,0,.48)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,.45)",
          }}>
            <div
              data-testid="global-task-progress-fill"
              style={{
                width: `${progress}%`,
                height: "100%",
                borderRadius: 4,
                background: progress >= 100 ? "#2ecc71" : "linear-gradient(90deg, #f1c40f, #2ecc71)",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      )}

      {(props.showMap || props.showSettings) && (
        <div
          data-testid="game-top-right-controls"
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            right: "max(12px, env(safe-area-inset-right, 0px))",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 35,
          }}
        >
          {props.showMap && (
            <button
              type="button"
              data-testid="game-map-toggle"
              aria-label={mapLabel}
              title={mapLabel}
              aria-expanded={props.mapOpen}
              onClick={props.onToggleMap}
              style={{
                width: 44,
                height: 44,
                boxSizing: "border-box",
                flex: "0 0 44px",
                display: "grid",
                placeItems: "center",
                padding: 0,
                lineHeight: 0,
                overflow: "visible",
                borderRadius: 13,
                color: "#e4f5ff",
                background: props.mapOpen
                  ? "linear-gradient(180deg, rgba(28,105,112,.98), rgba(12,58,67,.98))"
                  : "linear-gradient(180deg, rgba(32,53,67,.96), rgba(14,27,37,.96))",
                border: "1px solid rgba(105,205,220,.55)",
                boxShadow: "0 3px 10px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.08)",
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none">
                <path
                  d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M9 3v15m6-12v15" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          )}
          {props.showSettings && (
            <SettingsButton
              label={props.english ? "Settings" : "Настройки"}
              onClick={props.onOpenSettings}
              style={{ position: "relative", top: "auto", right: "auto", zIndex: "auto" }}
            />
          )}
        </div>
      )}
    </>
  );
}
