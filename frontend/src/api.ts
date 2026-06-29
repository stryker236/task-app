import type { AiCommand, AiCommandPreview, ChecklistItem, GoogleCalendarEvent, GoogleStatus, QuickQueueItem, Tag, Task, TaskInput, TaskStatus } from '../../shared/types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

export type TaskFilters = {
  search?: string;
  status?: TaskStatus | '';
  priority?: number | '';
  tags?: string[];
  tagMode?: 'and' | 'or';
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

type JsonRequestOptions = RequestInit & {
  headers?: HeadersInit;
};

export type AdvisorAdvice = {
  generatedAt: string;
  source: 'rules' | 'ai';
  model: string | null;
  summary: string;
  actions: unknown[];
  blockers: unknown[];
  note?: string;
};

export type AdvisorPreview = {
  mode: string;
  generatedAt?: string;
  source?: string;
  model?: string | null;
  summary?: string;
  commandCount: number;
  commands: AiCommandPreview[];
  rawCommands?: AiCommand[];
};

type DeleteTagsResult = {
  deletedCount?: number;
  deactivatedIds?: string[];
  deletedIds?: string[];
  inUseIds?: string[];
};

type QuickQueuePatch = Partial<Pick<QuickQueueItem, 'text' | 'done' | 'position'>>;

export type TaskMutationPayload = Omit<Partial<TaskInput>, 'checklistItems'> & {
  checklistItems?: Array<Partial<ChecklistItem> & { title: string; isDone: boolean; position?: number }>;
  blocksTaskIds?: string[];
};

async function requestJson<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  if (response.status === 204) return null as T;
  const data = await response.json().catch(() => ({} as { error?: string; details?: string[] }));
  if (!response.ok) {
    const details = data.details?.length ? `: ${data.details.join('; ')}` : '';
    throw new Error(`${data.error || 'O pedido falhou'}${details}`);
  }
  return data as T;
}

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

export function getTaskAdvisorAdvice(limit = 5) {
  return requestJson<AdvisorAdvice>(`/advisor?limit=${encodeURIComponent(limit)}`);
}

export function requestTaskAdvisorCommands(action: string) {
  return requestJson<AdvisorPreview>('/ai/advisor/request', {
    method: 'POST',
    body: JSON.stringify({ action })
  });
}

export function applyAiCommands(commands: AiCommand[]) {
  return requestJson<{ mode: string; appliedCount: number; results: unknown[] }>('/ai/commands/apply', {
    method: 'POST',
    body: JSON.stringify({ commands })
  });
}

export const deleteTag = (id: string, { force = false } = {}) => requestJson<void>(`/tags/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
export const deleteTags = (ids: string[], { force = false } = {}) => requestJson<DeleteTagsResult>('/tags', { method: 'DELETE', body: JSON.stringify({ ids, force }) });

export const createTask = (task: TaskMutationPayload) => requestJson<Task>('/tasks', { method: 'POST', body: JSON.stringify(task) });
export const updateTask = (id: string, task: TaskMutationPayload) => requestJson<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) });
export const deleteTask = (id: string) => requestJson<void>(`/tasks/${id}`, { method: 'DELETE' });
export const duplicateTask = (id: string) => requestJson<Task>(`/tasks/${id}/duplicate`, { method: 'POST' });
export const archiveTask = (id: string) => requestJson<Task>(`/tasks/${id}/archive`, { method: 'POST' });
export const archiveTasksByStatus = (status: TaskStatus) => requestJson<{ archivedCount: number }>('/tasks/archive-bulk', { method: 'POST', body: JSON.stringify({ status }) });
export const restoreTask = (id: string) => requestJson<Task>(`/tasks/${id}/archive`, { method: 'DELETE' });
export const toggleChecklistItem = (taskId: string, itemId: string, isDone: boolean) => requestJson<Task>(`/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isDone }) });
export const addTaskProgressEntry = (taskId: string, message: string) => requestJson<{ task: Task }>(`/tasks/${taskId}/progress`, { method: 'POST', body: JSON.stringify({ message }) });
export const editTaskProgressEntry = (taskId: string, entryId: string, message: string) => requestJson<{ task: Task }>(`/tasks/${taskId}/progress/${entryId}`, { method: 'PUT', body: JSON.stringify({ message }) });
export const createBlockingTask = (blockedTaskId: string, task: TaskMutationPayload) => requestJson<Task>(`/tasks/${blockedTaskId}/blockers`, { method: 'POST', body: JSON.stringify(task) });

export const getQuickQueueItems = () => requestJson<QuickQueueItem[]>('/quick-queue');
export const createQuickQueueItem = (text: string) => requestJson<QuickQueueItem>('/quick-queue', { method: 'POST', body: JSON.stringify({ text }) });
export const updateQuickQueueItem = (id: string, patch: QuickQueuePatch) => requestJson<QuickQueueItem>(`/quick-queue/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteQuickQueueItem = (id: string) => requestJson<void>(`/quick-queue/${id}`, { method: 'DELETE' });
export const moveQuickQueueItem = (id: string, direction: 1 | -1) => requestJson<QuickQueueItem[]>(`/quick-queue/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
export const clearDoneQuickQueueItems = () => requestJson<QuickQueueItem[]>('/quick-queue/done', { method: 'DELETE' });

export const getGoogleStatus = () => requestJson<GoogleStatus>('/google/status');
export const getGoogleOAuthUrl = () => requestJson<{ url: string; expiresAt: string }>('/google/oauth/url', { method: 'POST' });
export const disconnectGoogle = () => requestJson<void>('/google/connection', { method: 'DELETE' });
export const getGoogleCalendarEvents = (date: string) => requestJson<{ date: string; events: GoogleCalendarEvent[] }>(`/google/calendar/events?date=${encodeURIComponent(date)}`);
