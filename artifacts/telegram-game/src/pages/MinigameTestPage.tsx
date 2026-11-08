import { useState } from "react";
import { TASK_DEFS } from "@workspace/shared/tasks";
import TaskMinigame from "../components/TaskMinigame";

/** Development-only harness for per-task browser interaction and visual QA. */
export default function MinigameTestPage() {
  const rawTaskId = new URLSearchParams(window.location.search).get("task");
  const taskId = rawTaskId === null ? 0 : Number.parseInt(rawTaskId, 10);
  const valid = Number.isInteger(taskId) && taskId >= 0 && taskId < TASK_DEFS.length;
  const [completed, setCompleted] = useState(false);
  const [closed, setClosed] = useState(false);

  return (
    <main
      data-testid="minigame-test-page"
      data-task-id={valid ? taskId : "invalid"}
      style={{ minHeight: "100dvh", background: "#040810", color: "#e8f0ff" }}
    >
      {valid ? (
        <>
          {!closed && (
            <TaskMinigame
              taskId={taskId}
              stepIndex={0}
              onComplete={() => setCompleted(true)}
              onClose={() => setClosed(true)}
            />
          )}
          {completed && <div data-testid="minigame-completed">Task step completed</div>}
          {closed && <div data-testid="minigame-closed">Task panel closed</div>}
        </>
      ) : (
        <p data-testid="minigame-invalid">Unknown task ID</p>
      )}
    </main>
  );
}
