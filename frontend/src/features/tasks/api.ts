import type { ChecklistItem, ReviewTaskCalendarEventInput, Tag, Task, TaskInput, TaskStatus } from '../../../../shared/types';
import { requestJson } from '../../shared/api/requestJson';

type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

export type TaskFilters = {
  search?: string;
  status?: TaskStatus | '';
  priority?: number | '';
  tags?: string[];
  tagMode?: 'and' | 'or' | 'not' | 'nand';
  overdue?: boolean;
  today?: boolean;
  noDueDate?: boolean;
  favoriteOnly?: boolean;
  hideBlocked?: boolean;
  hideDone?: boolean;
  hideCancelled?: boolean;
  archived?: boolean;
  includeArchived?: boolean;
  sort?: string;
};

type DeleteTagsResult = {
  deletedCount?: number;
  deactivatedIds?: string[];
  deletedIds?: string[];
  inUseIds?: string[];
};

export type TaskMutationPayload = Omit<Partial<TaskInput>, 'checklistItems'> & {
  checklistItems?: Array<Partial<ChecklistItem> & { title: string; isDone: boolean; position?: number }>;
  blocksTaskIds?: string[];
};

export function getTasks(filters: TaskFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters as Record<string, QueryValue>).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key === 'tags' ? 'tag' : key, String(item)));
    } else if (value !== '' && value !== false && value != null) {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return requestJson<Task[]>(`/tasks${query ? `?${query}` : ''}`);
}

export function getTags(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return requestJson<Tag[]>(`/tags${query}`);
}

export const deleteTag = (id: string, { force = false } = {}) => requestJson<void>(`/tags/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
export const deleteTags = (ids: string[], { force = false } = {}) => requestJson<DeleteTagsResult>('/tags', { method: 'DELETE', body: JSON.stringify({ ids, force }) });

export const createTask = (task: TaskMutationPayload) => requestJson<Task>('/tasks', { method: 'POST', body: JSON.stringify(task) });
export const updateTask = (id: string, task: TaskMutationPayload) => requestJson<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) });
export const reviewTaskCalendarEvent = (taskId: string, eventId: string, review: ReviewTaskCalendarEventInput) => requestJson<Task>(`/tasks/${taskId}/calendar-events/${eventId}/review`, { method: 'POST', body: JSON.stringify(review) });
export const deleteTask = (id: string) => requestJson<void>(`/tasks/${id}`, { method: 'DELETE' });
export const duplicateTask = (id: string) => requestJson<Task>(`/tasks/${id}/duplicate`, { method: 'POST' });
export const archiveTask = (id: string) => requestJson<Task>(`/tasks/${id}/archive`, { method: 'POST' });
export const archiveTasksByStatus = (status: TaskStatus) => requestJson<{ archivedCount: number }>('/tasks/archive-bulk', { method: 'POST', body: JSON.stringify({ status }) });
export const restoreTask = (id: string) => requestJson<Task>(`/tasks/${id}/archive`, { method: 'DELETE' });
export const toggleChecklistItem = (taskId: string, itemId: string, isDone: boolean) => requestJson<Task>(`/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isDone }) });
export const addTaskProgressEntry = (taskId: string, message: string) => requestJson<{ task: Task }>(`/tasks/${taskId}/progress`, { method: 'POST', body: JSON.stringify({ message }) });
export const editTaskProgressEntry = (taskId: string, entryId: string, message: string) => requestJson<{ task: Task }>(`/tasks/${taskId}/progress/${entryId}`, { method: 'PUT', body: JSON.stringify({ message }) });
export const createBlockingTask = (blockedTaskId: string, task: TaskMutationPayload) => requestJson<Task>(`/tasks/${blockedTaskId}/blockers`, { method: 'POST', body: JSON.stringify(task) });
