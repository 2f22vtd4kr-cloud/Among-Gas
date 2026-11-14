import type { CSSProperties } from "react";

export interface TaskListPanelTask {
  id: number;
  name: string;
  completedSteps: number;
  steps: number;
  done: boolean;
  locked: boolean;
  tracked: boolean;
}

export interface TaskListPanelProps {
  visible: boolean;
  expanded: boolean;
  english: boolean;
  completedCount: number;
  totalCount: number;
  commsDisrupted: boolean;
  tasks: TaskListPanelTask[];
  onToggle: () => void;
  onClose: () => void;
  onTrackTask: (taskId: number) => void;
}

const toggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  width: "max-content",
  maxWidth: "none",
  flexShrink: 0,
  whiteSpace: "nowrap",
  padding: "9px 12px",
  borderRadius: 9,
  color: "#f5f0d5",
  border: "1px solid rgba(241,196,15,0.62)",
  boxShadow: "0 3px 12px rgba(0,0,0,0.35)",
  fontFamily: "sans-serif",
  fontSize: 12,
  fontWeight: 900,
  backdropFilter: "blur(8px)",
  touchAction: "manipulation",
};

export default function TaskListPanel(props: TaskListPanelProps) {
  if (!props.visible) return null;

  return (
    <>
      <div style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 60px)",
        left: 12,
        zIndex: 35,
      }}>
        <button
          type="button"
          data-testid="task-list-toggle"
          onClick={props.onToggle}
          aria-expanded={props.expanded}
          style={{
            ...toggleStyle,
            background: props.expanded ? "rgba(106,79,18,0.96)" : "rgba(10,22,34,0.92)",
          }}
        >
          {props.expanded ? (props.english ? "✕ CLOSE TASKS" : "✕ ЗАКРЫТЬ ЗАДАНИЯ") : (
            <>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "middle" }}>
                <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {props.english ? "TASKS" : "ЗАДАНИЯ"}
            </>
          )}
        </button>
      </div>

      {props.expanded && (
        <div
          data-testid="task-list-panel"
          role="region"
          aria-label={props.english ? "Task list" : "Список заданий"}
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 106px)",
            left: 12,
            width: "min(330px, calc(100vw - 24px))",
            maxHeight: "min(55vh, 420px)",
            overflowY: "auto",
            zIndex: 52,
            padding: 10,
            borderRadius: 12,
            background: "rgba(6,16,24,0.97)",
            border: "1px solid rgba(241,196,15,0.42)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            color: "#e8f2f6",
            fontFamily: "sans-serif",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 2px 8px" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: "0.08em" }}>
                {props.english ? "CREW TASKS" : "ЗАДАНИЯ ЭКИПАЖА"}
              </div>
              <div style={{ marginTop: 3, color: "rgba(220,239,242,0.58)", fontSize: 10 }}>
                {props.completedCount} / {props.totalCount} {props.english ? "completed" : "выполнено"}
              </div>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              aria-label={props.english ? "Close tasks" : "Закрыть задания"}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid rgba(220,240,240,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontSize: 19,
                touchAction: "manipulation",
              }}
            >×</button>
          </div>

          {props.commsDisrupted ? (
            <div style={{
              marginTop: 4,
              padding: 12,
              borderRadius: 8,
              background: "rgba(155,48,39,0.18)",
              border: "1px solid rgba(255,90,80,0.26)",
              fontSize: 12,
              lineHeight: 1.4,
            }}>
              <strong>{props.english ? "Communications disrupted." : "Связь нарушена."}</strong>{" "}
              {props.english
                ? "The task list is unavailable until communications are restored."
                : "Список заданий временно недоступен до восстановления связи."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {props.tasks.map(task => (
                <button
                  key={task.id}
                  type="button"
                  disabled={task.done || task.locked}
                  onClick={() => props.onTrackTask(task.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 9px",
                    borderRadius: 8,
                    cursor: task.done || task.locked ? "default" : "pointer",
                    color: task.done ? "rgba(170,235,190,0.75)" : task.locked ? "rgba(255,140,140,0.68)" : "#f3f6fb",
                    background: task.tracked ? "rgba(60,145,125,0.2)" : task.done ? "rgba(40,100,60,0.08)" : "rgba(255,255,255,0.035)",
                    border: `1px solid ${task.tracked ? "rgba(112,223,193,0.55)" : "rgba(160,195,205,0.12)"}`,
                    fontFamily: "inherit",
                    fontSize: 12,
                    touchAction: "manipulation",
                  }}
                >
                  <span style={{
                    width: 21,
                    height: 21,
                    flexShrink: 0,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: task.done ? "rgba(57,170,100,0.22)" : task.locked ? "rgba(170,45,45,0.22)" : "rgba(241,196,15,0.16)",
                    border: `1px solid ${task.done ? "rgba(80,220,130,0.45)" : task.locked ? "rgba(250,90,90,0.4)" : "rgba(241,196,15,0.5)"}`,
                    color: task.done ? "#7fe3a3" : task.locked ? "#ff9999" : "#f1c40f",
                    fontWeight: 950,
                  }}>{task.done ? "✓" : task.locked ? "×" : "!"}</span>
                  <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>{task.name}</span>
                  <span style={{ color: "rgba(220,239,242,0.6)", fontVariantNumeric: "tabular-nums", fontSize: 10 }}>
                    {task.completedSteps} / {task.steps}
                  </span>
                </button>
              ))}
              <div style={{ padding: "5px 3px 0", fontSize: 10, color: "rgba(220,239,242,0.55)" }}>
                {props.english ? "Choose a task; the compass will point toward it." : "Выберите задание: компас укажет направление к цели."}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
