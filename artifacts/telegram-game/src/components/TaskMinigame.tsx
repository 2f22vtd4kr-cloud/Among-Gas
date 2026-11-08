import type { ComponentType } from "react";
import { TASK_DEFS } from "@workspace/shared/tasks";
import { useLanguage } from "../lib/language";
import {
  AlignEngineGame,
  AsteroidsGame,
  CalibrateGame,
  DownloadGame,
  FiltersGame,
  FuelGame,
  GarbageGame,
  ReactorGame,
  RebootWifiGame,
  StabilizeNavigationGame,
  WiringGame,
} from "./minigames";
import MinigameShell from "./minigames/MinigameShell";
import type { MinigameProps } from "./minigames/shared";

interface Props {
  taskId: number;
  stepIndex: number;
  onComplete: () => void;
  onClose: () => void;
}

const TASK_NAME_RU: Record<string, string> = {
  "Fix Wiring": "Починить проводку",
  "Download Data": "Скачать данные",
  "Calibrate Distributor": "Настроить распределитель",
  "Empty Garbage": "Вынести мусор",
  "Clean Filters": "Почистить фильтры",
  "Stabilize Navigation": "Стабилизировать навигацию",
  "Reboot WiFi": "Перезапустить связь",
  "Fuel Engine": "Заправить двигатель",
  "Start Reactor": "Запустить реактор",
  "Align Engine": "Выровнять двигатель",
  "Clear Asteroids": "Уничтожить астероиды",
};

/** Stable task-id registry; index order mirrors the canonical shared TASK_DEFS. */
export const MINIGAME_COMPONENTS: readonly ComponentType<MinigameProps>[] = [
  WiringGame,
  DownloadGame,
  CalibrateGame,
  GarbageGame,
  FiltersGame,
  StabilizeNavigationGame,
  RebootWifiGame,
  FuelGame,
  ReactorGame,
  AlignEngineGame,
  AsteroidsGame,
];

export default function TaskMinigame({ taskId, stepIndex, onComplete, onClose }: Props) {
  const { language } = useLanguage();
  const definition = TASK_DEFS[taskId];
  const Minigame = MINIGAME_COMPONENTS[taskId];

  if (!definition || !Minigame) return null;

  return (
    <MinigameShell
      stepIndex={stepIndex}
      stepCount={definition.steps}
      taskName={language === "en" ? definition.name : (TASK_NAME_RU[definition.name] ?? definition.name)}
      english={language === "en"}
      onClose={onClose}
    >
      <Minigame key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />
    </MinigameShell>
  );
}
