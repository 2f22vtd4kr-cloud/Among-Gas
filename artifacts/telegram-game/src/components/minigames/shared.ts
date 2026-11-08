import type { CSSProperties } from "react";

export interface MinigameProps {
  stepIndex: number;
  onComplete: () => void;
}

export const labelStyle: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.4)",
  fontFamily: "sans-serif",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  marginBottom: 4,
};

export const helpStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.4)",
  fontFamily: "sans-serif",
  textAlign: "center",
  marginTop: 10,
};
