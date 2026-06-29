import type { Task, TaskRelationType } from './task';

export type AiCommandType = 'update_task' | 'add_relation' | 'create_task';

export interface AiCommand {
  id?: string;
  type: AiCommandType;
  label?: string;
  reason?: string;
  taskId?: string | null;
  relatedTaskId?: string | null;
  relationType?: TaskRelationType | null;
  patch?: Partial<Task> | null;
  task?: Partial<Task> | null;
}

export interface AiCommandPreview {
  id: string;
  type: AiCommandType;
  summary: string;
  reason?: string;
  taskId: string | null;
  taskTitle: string | null;
  relatedTaskId: string | null;
  relatedTaskTitle: string | null;
  relationType: TaskRelationType | null;
  alreadyExists: boolean;
  changes: unknown;
}
