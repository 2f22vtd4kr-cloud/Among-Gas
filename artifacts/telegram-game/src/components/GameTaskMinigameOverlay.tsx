import { useEffect } from "react";
import { TASK_DEFS } from "@workspace/shared/tasks";
import TaskMinigame from "./TaskMinigame";

interface TaskProgress {
  taskId: number;
  completedSteps: number;
}

interface Props {
  activeTaskId: number | null;
  myTasks: readonly TaskProgress[];
  onClose: () => void;
  onCompleteStep: (taskId: number, stepIndex: number, isLastStep: boolean) => void;
}

/**
 * Owns the task overlay's render lifecycle. Invalid or completed task state is
 * closed after commit rather than scheduling a state update during GameMap render.
 */
export default function GameTaskMinigameOverlay({
  activeTaskId,
  myTasks,
  onClose,
  onCompleteStep,
}: Props) {
  const task = activeTaskId === null
    ? undefined
    : myTasks.find(item => item.taskId === activeTaskId);
  const definition = activeTaskId === null ? undefined : TASK_DEFS[activeTaskId];
  const invalidTask = activeTaskId !== null && (
    !task || !definition || task.completedSteps >= definition.steps
  );

  useEffect(() => {
    if (invalidTask) onClose();
  }, [invalidTask, onClose]);

  if (activeTaskId === null || !task || !definition || invalidTask) return null;

  const stepIndex = task.completedSteps;
  return (
    <TaskMinigame
      key={`${activeTaskId}-${stepIndex}`}
      taskId={activeTaskId}
      stepIndex={stepIndex}
      onComplete={() => onCompleteStep(
        activeTaskId,
        stepIndex,
        stepIndex + 1 >= definition.steps,
      )}
      onClose={onClose}
    />
  );
}
