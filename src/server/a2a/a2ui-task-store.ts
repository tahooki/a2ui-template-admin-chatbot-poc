import type { A2ATask } from "./a2a-types";

type TaskStoreGlobal = typeof globalThis & {
  __a2uiA2ATasks?: Map<string, A2ATask>;
};

function store() {
  const globalStore = globalThis as TaskStoreGlobal;
  if (!globalStore.__a2uiA2ATasks) {
    globalStore.__a2uiA2ATasks = new Map<string, A2ATask>();
  }
  return globalStore.__a2uiA2ATasks;
}

export function setTask(task: A2ATask) {
  store().set(task.id, task);
  return task;
}

export function getTask(taskId: string) {
  return store().get(taskId);
}
