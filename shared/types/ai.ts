import type { Task, TaskRelationType } from './task';

export type AiCommandType = 'update_task' | 'add_relation' | 'create_task' | 'create_calendar_event';

export type TagGroupingMode = 'off' | 'preferred' | 'required';
export type TagGroupingScope = 'block' | 'day';

export interface TagGroup {
  id: string;
  label: string;
  tags: string[];
  confidence?: number | null;
  reason?: string | null;
  matchingTaskCount?: number;
}

export interface TagGroupingConfig {
  enabled: boolean;
  mode: TagGroupingMode;
  requestedMode?: TagGroupingMode;
  scope: TagGroupingScope;
  strength: number;
  groups?: TagGroup[];
  source?: 'llm' | 'heuristic' | 'manual' | 'none';
}

export interface AiCalendarEventCommandInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  start: string;
  end: string;
  timeZone?: string | null;
  calendarId?: string | null;
  calendarSelectionReason?: string | null;
}

export interface AiCommand {
  id?: string;
  type: AiCommandType;
  label?: string;
  reason?: string;
  taskId?: string | null;
  periodicTaskId?: string | null;
  relatedTaskId?: string | null;
  relationType?: TaskRelationType | null;
  patch?: Partial<Task> | null;
  task?: Partial<Task> | null;
  event?: AiCalendarEventCommandInput | null;
}

export interface AiCommandPreview {
  id: string;
  type: AiCommandType;
  summary: string;
  reason?: string;
  taskId: string | null;
  periodicTaskId?: string | null;
  taskTitle: string | null;
  relatedTaskId: string | null;
  relatedTaskTitle: string | null;
  relationType: TaskRelationType | null;
  alreadyExists: boolean;
  changes: unknown;
}
