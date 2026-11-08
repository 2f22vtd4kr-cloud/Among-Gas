import type { CSSProperties, ReactNode } from "react";
import { labelStyle } from "./shared";

const panelStyle: CSSProperties = {
  background: "rgba(10,18,34,0.98)",
  border: "1px solid rgba(100,150,200,0.25)",
  borderRadius: 16,
  padding: "20px 20px 28px",
  width: "min(360px, 94vw)",
  boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
};

interface Props {
  stepIndex: number;
  stepCount: number;
  taskName: string;
  english: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Shared task overlay shell, header, safe-area padding and 48px close target. */
export default function MinigameShell({
  stepIndex,
  stepCount,
  taskName,
  english,
  onClose,
  children,
}: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(4,8,16,0.93)",
        backdropFilter: "blur(4px)",
        padding: 16,
      }}
    >
      <div style={panelStyle}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 12,
        }}>
          <div>
            <div style={labelStyle}>
              {english ? `Step ${stepIndex + 1} of ${stepCount}` : `Шаг ${stepIndex + 1} из ${stepCount}`}
            </div>
            <div style={{
              fontSize: 16,
              color: "#e8f0ff",
              fontFamily: "sans-serif",
              fontWeight: 700,
            }}>
              {taskName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={english ? "Close" : "Закрыть"}
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              minHeight: 48,
              borderRadius: 12,
              flexShrink: 0,
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(255,255,255,0.16)",
              fontFamily: "sans-serif",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
