export type TaskStatus = 'new' | 'in_progress' | 'waiting' | 'done' | 'cancelled';

export type TaskRelationType = 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates' | 'parent_of' | 'child_of';

export type TaskPriority = 1 | 2 | 3 | 4;

export interface ChecklistItem {
  id: string;
  title: string;
  isDone: boolean;
  position: number;
  createdAt?: string;
  completedAt?: string | null;
}

export interface TaskRelation {
  relatedTaskId: string;
  relatedTaskTitle?: string;
  relatedTaskStatus?: TaskStatus;
  type: TaskRelationType;
  createdAt?: string;
}

export interface ActivityRevision {
  id?: string;
  message: string;
  replacedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  type: 'created' | 'status' | 'note' | 'dependency';
  message: string;
  fromStatus?: TaskStatus | null;
  toStatus?: TaskStatus | null;
  createdAt: string;
  editedAt?: string | null;
  revisions?: ActivityRevision[];
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDateTime: string | null;
  estimatedMinutes: number | null;
  isFavorite: boolean;
  tags: string[];
  blockedByTaskIds: string[];
  relations: TaskRelation[];
  checklistItems: ChecklistItem[];
  activityLog: ActivityLogEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  archivedAt?: string | null;
  isArchived?: boolean;
  requestedBy?: string;
  needToAsk?: string[];
  blockedReason?: string;
}

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'cancelledAt' | 'activityLog'> &
  Partial<Pick<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'cancelledAt' | 'activityLog'>>;
