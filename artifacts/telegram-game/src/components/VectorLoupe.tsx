import { useEffect, useRef } from "react";
import type { Point } from "@workspace/shared/collision";

interface VectorLoupeProps {
  sourceCanvas: HTMLCanvasElement | null;
  point: Point | null;
  camera: { x: number; y: number; zoom: number };
}

export default function VectorLoupe({ sourceCanvas, point, camera }: VectorLoupeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const outputSize = 360;
    canvas.width = outputSize;
    canvas.height = outputSize;
    context.fillStyle = "#101923";
    context.fillRect(0, 0, outputSize, outputSize);
    if (sourceCanvas && point) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sourceX = (point[0] - camera.x) * camera.zoom * dpr;
      const sourceY = (point[1] - camera.y) * camera.zoom * dpr;
      const cropSize = Math.max(24, 120 * camera.zoom * dpr);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        sourceCanvas,
        sourceX - cropSize / 2, sourceY - cropSize / 2, cropSize, cropSize,
        0, 0, outputSize, outputSize,
      );
      context.strokeStyle = "rgba(255,224,121,.95)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(outputSize / 2, 0);
      context.lineTo(outputSize / 2, outputSize);
      context.moveTo(0, outputSize / 2);
      context.lineTo(outputSize, outputSize / 2);
      context.stroke();
    } else {
      context.fillStyle = "#9db3c1";
      context.font = "16px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("Move finger over map", outputSize / 2, outputSize / 2);
    }
  }, [sourceCanvas, point, camera.x, camera.y, camera.zoom]);

  return (
    <div data-testid="vector-loupe" aria-label="Magnifying loupe" style={{
      position: "absolute", left: 10, bottom: 10, width: 180, height: 180,
      border: "2px solid #e2bd6a", borderRadius: 12, overflow: "hidden",
      background: "#101923", boxShadow: "0 6px 22px rgba(0,0,0,.55)",
      pointerEvents: "none", zIndex: 5,
    }}>
      <canvas ref={canvasRef} width={360} height={360} style={{ width: "100%", height: "100%", display: "block" }} />
      <span style={{ position: "absolute", right: 6, top: 5, padding: "2px 5px", borderRadius: 4, background: "rgba(10,18,26,.85)", color: "#ffe7a1", font: "600 10px system-ui, sans-serif" }}>3× LOUPE</span>
    </div>
  );
}
