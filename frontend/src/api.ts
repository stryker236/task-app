import type { AiCommand, AiCommandPreview, ChecklistItem, CreateGoogleCalendarEventInput, CreateGoogleCalendarEventResponse, DeleteDefaultGoogleCalendarEventsResponse, GoogleCalendar, GoogleCalendarEvent, GoogleCalendarEventsResponse, GoogleCalendarsResponse, GoogleOAuthUrlRequest, GoogleOAuthUrlResponse, GoogleStatus, QuickQueueItem, SendGoogleDailyTaskEmailResponse, SharedNote, SharedNoteInput, Tag, Task, TaskInput, TaskStatus } from '../../shared/types';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const DEFAULT_API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 60000);

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

type JsonRequestOptions = RequestInit & {
  headers?: HeadersInit;
  timeoutMs?: number;
};

export type AppLogEntry = {
  time?: string;
  timestamp?: string;
  level: number | string;
  event?: string;
  requestId?: string | null;
  client?: string | null;
  route?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  msg?: string;
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
  reservedBlocks?: AdvisorReservedBlock[];
  debug?: AdvisorPreviewDebug;
};

export type AdvisorReservedBlock = {
  type: string;
  start: string;
  end: string;
  reason?: string;
  sourceRuleId?: string | null;
  sourceConstraintId?: string | null;
};

export type AdvisorPreviewDebug = {
  generatedCount: number;
  afterActionFilter: number;
  afterCalendarFilter: number;
  afterPastFilter: number;
  afterDuplicateBatchFilter: number;
  afterExistingGoogleFilter: number;
  afterMemoryFilter: number;
  rejectedCount?: number;
  schedulerHorizonEnd?: string;
  schedulerBusyEventCount?: number;
  schedulerReservedBusyCount?: number;
  reservedBlockCount?: number;
  attempts?: number;
  candidateTaskCount?: number;
  candidateTasksWithDueDate?: number;
  candidateTasksWithoutDueDate?: number;
  notProposedCount?: number;
  notProposedWithoutDueDateCount?: number;
  notProposedCandidates?: AdvisorCandidateDebug[];
  candidateAttempts?: Array<{
    attempt: number;
    candidateCount: number;
    candidateTasksWithDueDate: number;
    candidateTasksWithoutDueDate: number;
    returnedTaskCount: number;
    returnedTaskIds: string[];
    notProposedCount: number;
    notProposedWithoutDueDateCount: number;
    notProposedCandidates: AdvisorCandidateDebug[];
  }>;
  rejectionReasons?: Record<string, number>;
  rejections?: Array<{
    status: string;
    reason: string;
    attempt?: number;
    commandId?: string;
    taskId?: string | null;
    taskTitle?: string | null;
    summary?: string;
    details?: string;
    memoryRules?: Array<{
      ruleType?: string;
      action?: string;
      appliesToCommandType?: string;
      titleKeywords?: string[];
      supportCount?: number;
      matchedReasons?: string[];
      summary?: string;
      rule?: Record<string, unknown>;
    }>;
  }>;
};

export type AdvisorCandidateDebug = {
  attempt?: number;
  taskId: string;
  taskTitle?: string;
  title?: string;
  status?: string;
  priority?: number | null;
  dueDateTime?: string | null;
  hasDueDateTime?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type DeleteTagsResult = {
  deletedCount?: number;
  deactivatedIds?: string[];
  deletedIds?: string[];
  inUseIds?: string[];
};

type QuickQueuePatch = Partial<Pick<QuickQueueItem, 'text' | 'done' | 'position'>>;

export type PeriodicTaskConstraint = {
  id: string;
  periodicTaskId: string;
  type: 'fixed_occurrence' | 'allowed_window' | 'minimum_count';
  scope: Record<string, unknown>;
  payload: Record<string, unknown>;
  hard: boolean;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PeriodicTaskOccurrence = {
  id: string;
  periodicTaskId: string;
  scheduledStart: string;
  scheduledEnd: string;
  calendarId: string;
  googleEventId: string | null;
  htmlLink: string | null;
  status: 'scheduled' | 'completed' | 'skipped' | 'cancelled';
  createdAt: string;
  updatedAt: string;
};

export type PeriodicTask = {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  priority: number;
  estimatedMinutes: number;
  period: 'week' | 'month';
  targetCount: number;
  hardConstraints: {
    allowedDays?: number[];
    allowedWindows?: Array<{ startTime: string; endTime: string; days?: number[] }>;
    minSpacingHours?: number;
  };
  preferences: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  constraints: PeriodicTaskConstraint[];
  occurrences: PeriodicTaskOccurrence[];
};

export type PeriodicTaskInput = Omit<Partial<PeriodicTask>, 'id' | 'createdAt' | 'updatedAt' | 'constraints' | 'occurrences'> & {
  title?: string;
};

export type TaskMutationPayload = Omit<Partial<TaskInput>, 'checklistItems'> & {
  checklistItems?: Array<Partial<ChecklistItem> & { title: string; isDone: boolean; position?: number }>;
  blocksTaskIds?: string[];
};

async function requestJson<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal, ...requestOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = timeoutMs > 0
    ? window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : 0;
  const abortRequest = () => controller.abort();
  const cleanupRequest = () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortRequest);
  };

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', abortRequest, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...requestOptions.headers },
      ...requestOptions,
      signal: controller.signal
    });
  } catch (error) {
    const message = timedOut
      ? `O pedido demorou mais de ${Math.round(timeoutMs / 1000)}s e foi cancelado.`
      : error instanceof Error
        ? error.message
        : 'O pedido falhou';
    window.dispatchEvent(new CustomEvent('task-app:api-error', {
      detail: { path, status: 0, requestId: '', error: message }
    }));
    cleanupRequest();
    throw new Error(message);
  }

  try {
    const requestId = response.headers.get('x-request-id') || '';
    if (response.status === 204) return null as T;
    const data = await response.json().catch((error) => {
      if (timedOut) throw error;
      return {} as { error?: string; details?: string[] };
    });
    if (!response.ok) {
      window.dispatchEvent(new CustomEvent('task-app:api-error', {
        detail: { path, status: response.status, requestId, error: data.error || 'O pedido falhou' }
      }));
      const details = data.details?.length ? `: ${data.details.join('; ')}` : '';
      throw new Error(`${data.error || 'O pedido falhou'}${details}`);
    }
    if (requestId) {
      window.dispatchEvent(new CustomEvent('task-app:api-response', {
        detail: { path, status: response.status, requestId }
      }));
    }
    return data as T;
  } catch (error) {
    if (timedOut) {
      const message = `O pedido demorou mais de ${Math.round(timeoutMs / 1000)}s e foi cancelado.`;
      window.dispatchEvent(new CustomEvent('task-app:api-error', {
        detail: { path, status: 0, requestId: '', error: message }
      }));
      throw new Error(message);
    }
    throw error;
  } finally {
    cleanupRequest();
  }
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

export type SchedulerConstraintInput = {
  taskId: string;
  start: string;
  end?: string;
};

export type SchedulerRuleConstraint = {
  id: string;
  ruleId: string;
  type: string;
  scope: Record<string, unknown>;
  payload: Record<string, unknown>;
  hard: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerRule = {
  id: string;
  text: string;
  interpretation: string;
  status: 'draft' | 'needs_review' | 'active' | 'disabled' | 'invalid';
  enabled: boolean;
  confidence: number | null;
  model: string | null;
  constraints: SchedulerRuleConstraint[];
  createdAt: string;
  updatedAt: string;
};

export function requestTaskAdvisorCommands(action: string, options: { defaultCalendarId?: string; schedulerConstraints?: SchedulerConstraintInput[] } = {}) {
  return requestJson<AdvisorPreview>('/ai/advisor/request', {
    method: 'POST',
    body: JSON.stringify({
      action,
      defaultCalendarId: options.defaultCalendarId || '',
      schedulerConstraints: options.schedulerConstraints || []
    })
  });
}

export const getSchedulerRules = () => requestJson<SchedulerRule[]>('/scheduler/rules');
export const createSchedulerRule = (text: string) => requestJson<SchedulerRule>('/scheduler/rules', { method: 'POST', body: JSON.stringify({ text }) });
export const createSchedulerRulesFromText = (text: string) => requestJson<{ rules: SchedulerRule[] }>('/scheduler/rules/from-text', { method: 'POST', body: JSON.stringify({ text }) });
export const updateSchedulerRule = (id: string, patch: Partial<Pick<SchedulerRule, 'enabled' | 'status' | 'text'>>) => requestJson<SchedulerRule>(`/scheduler/rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const reinterpretSchedulerRule = (id: string) => requestJson<SchedulerRule>(`/scheduler/rules/${id}/reinterpret`, { method: 'POST' });
export const deleteSchedulerRule = (id: string) => requestJson<void>(`/scheduler/rules/${id}`, { method: 'DELETE' });

export function applyAiCommands(commands: AiCommand[], options: { reservedBlocks?: AdvisorReservedBlock[] } = {}) {
  return requestJson<{ mode: string; appliedCount: number; results: unknown[] }>('/ai/commands/apply', {
    method: 'POST',
    body: JSON.stringify({ commands, reservedBlocks: options.reservedBlocks || [] })
  });
}

export type AdvisorFeedbackInput = {
  action: string;
  commandPreview: AiCommandPreview;
  rawCommand?: AiCommand;
  feedback: {
    overall: 'useful' | 'not_useful' | 'mixed';
    tagVolume: 'more' | 'less' | 'ok';
    goodTags: string[];
    badTags: string[];
    wrongReason: boolean;
    wrongPriority: boolean;
    wrongDeadline: boolean;
    priorityDirection?: 'too_high' | 'too_low' | 'ok';
    taskAgeImportance?: 'too_much' | 'too_little' | 'ok';
    overdueImportance?: 'too_much' | 'too_little' | 'ok';
    dueDateDirection?: 'too_early' | 'too_late' | 'ok';
    calendarChoice?: 'ok' | 'wrong';
    calendarDurationDirection?: 'too_short' | 'too_long' | 'ok';
    unnecessaryEvent?: boolean;
    wrongCalendar?: boolean;
    chosenCalendarId?: string;
    chosenCalendarSummary?: string;
    preferredCalendarId?: string;
    preferredCalendarSummary?: string;
    shouldBeUrgent?: boolean;
    shouldBeLowerPriority?: boolean;
    missingContext: boolean;
  };
};

export type AdvisorMemoryRule = {
  id: string;
  ruleType: string;
  titleFingerprint: string;
  action: string;
  rule: {
    summary?: string;
    source?: 'openai_feedback_interpretation' | 'backend_feedback_fallback' | string;
    confidence?: number | null;
    titleKeywords?: string[];
    context?: {
      titleKeywords?: string[];
      commandTypes?: string[];
      changedFields?: string[];
      requiredTags?: string[];
      statuses?: string[];
      priorityMin?: number | null;
      priorityMax?: number | null;
      hasDueDate?: boolean;
      isOverdue?: boolean;
      isBlocked?: boolean;
    };
    behavior?: {
      avoidTags?: string[];
      preferTags?: string[];
      tagVolume?: 'more' | 'less' | 'ok';
      avoidSimilarSuggestions?: boolean;
      askForMoreContext?: boolean;
      reviewReasoning?: boolean;
      reviewPriority?: boolean;
      reviewDeadline?: boolean;
      priorityDirection?: 'too_high' | 'too_low' | 'ok';
      taskAgeImportance?: 'too_much' | 'too_little' | 'ok';
      overdueImportance?: 'too_much' | 'too_little' | 'ok';
      dueDateDirection?: 'too_early' | 'too_late' | 'ok';
      calendarChoice?: 'ok' | 'wrong';
      calendarDurationDirection?: 'too_short' | 'too_long' | 'ok';
      unnecessaryEvent?: boolean;
      wrongCalendar?: boolean;
      chosenCalendarId?: string;
      chosenCalendarSummary?: string;
      preferredCalendarId?: string;
      preferredCalendarSummary?: string;
      shouldBeUrgent?: boolean;
      shouldBeLowerPriority?: boolean;
    };
    avoidTags?: string[];
    preferTags?: string[];
    tagVolume?: 'more' | 'less' | 'ok';
    avoidSimilarSuggestions?: boolean;
    askForMoreContext?: boolean;
    reviewReasoning?: boolean;
    reviewPriority?: boolean;
    reviewDeadline?: boolean;
    priorityDirection?: 'too_high' | 'too_low' | 'ok';
    taskAgeImportance?: 'too_much' | 'too_little' | 'ok';
    overdueImportance?: 'too_much' | 'too_little' | 'ok';
    dueDateDirection?: 'too_early' | 'too_late' | 'ok';
    calendarChoice?: 'ok' | 'wrong';
    calendarDurationDirection?: 'too_short' | 'too_long' | 'ok';
    unnecessaryEvent?: boolean;
    wrongCalendar?: boolean;
    chosenCalendarId?: string;
    chosenCalendarSummary?: string;
    preferredCalendarId?: string;
    preferredCalendarSummary?: string;
    shouldBeUrgent?: boolean;
    shouldBeLowerPriority?: boolean;
  };
  supportCount: number;
  lastFeedbackAt: string;
};

export function submitAdvisorFeedback(feedback: AdvisorFeedbackInput) {
  return requestJson<{ memoryRule: unknown }>('/ai/advisor/feedback', {
    method: 'POST',
    body: JSON.stringify(feedback)
  });
}

export type AdvisorInteractionFeedbackInput = {
  action: string;
  interaction: {
    generatedAt?: string;
    summary?: string;
    commandCount: number;
  };
  feedback: AdvisorFeedbackInput['feedback'];
};

export function submitAdvisorInteractionFeedback(feedback: AdvisorInteractionFeedbackInput) {
  return requestJson<{ memoryRule: unknown }>('/ai/advisor/interaction-feedback', {
    method: 'POST',
    body: JSON.stringify(feedback)
  });
}

export const getAdvisorMemoryRules = () => requestJson<AdvisorMemoryRule[]>('/ai/advisor/memory');
export const deleteAdvisorMemoryRule = (id: string) => requestJson<void>(`/ai/advisor/memory/${id}`, { method: 'DELETE' });
export const getLogs = (filters: {
  level?: string;
  event?: string;
  requestId?: string;
  requestIds?: string[];
  excludeRequestIds?: string[];
  events?: string[];
  excludeEvents?: string[];
  search?: string;
  limit?: number;
} = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => params.append(key, item));
    } else if (value) {
      params.set(key, String(value));
    }
  });
  return requestJson<{ logs: AppLogEntry[] }>(`/logs${params.toString() ? `?${params}` : ''}`);
};
export const sendClientLog = (log: { level: string; event: string; message?: string; metadata?: Record<string, unknown>; requestId?: string }) => requestJson<void>('/client-logs', { method: 'POST', body: JSON.stringify(log) });

export const deleteTag = (id: string, { force = false } = {}) => requestJson<void>(`/tags/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
export const deleteTags = (ids: string[], { force = false } = {}) => requestJson<DeleteTagsResult>('/tags', { method: 'DELETE', body: JSON.stringify({ ids, force }) });

export const getSharedNotes = (search = '') => requestJson<SharedNote[]>(`/shared-notes${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const createSharedNote = (note: SharedNoteInput) => requestJson<SharedNote>('/shared-notes', { method: 'POST', body: JSON.stringify(note) });
export const updateSharedNote = (id: string, note: Partial<SharedNoteInput>) => requestJson<SharedNote>(`/shared-notes/${id}`, { method: 'PUT', body: JSON.stringify(note) });
export const archiveSharedNote = (id: string) => requestJson<void>(`/shared-notes/${id}`, { method: 'DELETE' });
export const attachSharedNoteToTask = (taskId: string, noteId: string) => requestJson<Task>(`/tasks/${taskId}/shared-notes`, { method: 'POST', body: JSON.stringify({ noteId }) });
export const createTaskSharedNote = (taskId: string, note: SharedNoteInput) => requestJson<Task>(`/tasks/${taskId}/shared-notes/create`, { method: 'POST', body: JSON.stringify(note) });
export const detachSharedNoteFromTask = (taskId: string, noteId: string) => requestJson<Task>(`/tasks/${taskId}/shared-notes/${noteId}`, { method: 'DELETE' });

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
export const createQuickQueueItem = (text: string, placement: 'top' | 'bottom' = 'bottom') => requestJson<QuickQueueItem>('/quick-queue', { method: 'POST', body: JSON.stringify({ text, placement }) });
export const updateQuickQueueItem = (id: string, patch: QuickQueuePatch) => requestJson<QuickQueueItem>(`/quick-queue/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteQuickQueueItem = (id: string) => requestJson<void>(`/quick-queue/${id}`, { method: 'DELETE' });
export const moveQuickQueueItem = (id: string, direction: 1 | -1) => requestJson<QuickQueueItem[]>(`/quick-queue/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
export const reorderQuickQueueItems = (ids: string[]) => requestJson<QuickQueueItem[]>('/quick-queue/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
export const clearDoneQuickQueueItems = () => requestJson<QuickQueueItem[]>('/quick-queue/done', { method: 'DELETE' });

export const getPeriodicTasks = () => requestJson<PeriodicTask[]>('/periodic-tasks');
export const createPeriodicTask = (task: PeriodicTaskInput) => requestJson<PeriodicTask>('/periodic-tasks', { method: 'POST', body: JSON.stringify(task) });
export const updatePeriodicTask = (id: string, patch: PeriodicTaskInput) => requestJson<PeriodicTask>(`/periodic-tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deletePeriodicTask = (id: string) => requestJson<void>(`/periodic-tasks/${id}`, { method: 'DELETE' });
export const createPeriodicTaskConstraint = (periodicTaskId: string, constraint: Partial<PeriodicTaskConstraint>) => requestJson<PeriodicTaskConstraint>(`/periodic-tasks/${periodicTaskId}/constraints`, { method: 'POST', body: JSON.stringify(constraint) });
export const deletePeriodicTaskConstraint = (id: string) => requestJson<void>(`/periodic-task-constraints/${id}`, { method: 'DELETE' });
export const updatePeriodicTaskOccurrence = (id: string, status: PeriodicTaskOccurrence['status']) => requestJson<PeriodicTaskOccurrence>(`/periodic-task-occurrences/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const getGoogleStatus = () => requestJson<GoogleStatus>('/google/status');
export const getGoogleOAuthUrl = (returnTo = '') => requestJson<GoogleOAuthUrlResponse>('/google/oauth/url', {
  method: 'POST',
  body: JSON.stringify({ returnTo } satisfies GoogleOAuthUrlRequest)
});
export const disconnectGoogle = () => requestJson<void>('/google/connection', { method: 'DELETE' });
export const sendGoogleDailyTaskEmail = (calendarId = '', date = '') => requestJson<SendGoogleDailyTaskEmailResponse>(
  '/google/gmail/daily-tasks',
  { method: 'POST', body: JSON.stringify({ calendarId, date }) }
);
export const getGoogleCalendars = () => requestJson<GoogleCalendarsResponse>('/google/calendars');

export const createGoogleCalendarEvent = (event: CreateGoogleCalendarEventInput) => requestJson<CreateGoogleCalendarEventResponse>('/google/calendar/events', {
  method: 'POST',
  body: JSON.stringify(event)
});

export const deleteDefaultGoogleCalendarEvents = (calendarId = '') => requestJson<DeleteDefaultGoogleCalendarEventsResponse>('/google/calendar/events/default', {
  method: 'DELETE',
  body: JSON.stringify({ calendarId, confirmation: 'DELETE_DEFAULT_CALENDAR_EVENTS' })
});

function calendarIdsQuery(calendarIds: string[] = []) {
  const params = new URLSearchParams();
  calendarIds.forEach((calendarId) => params.append('calendarId', calendarId));
  return params.toString();
}

export const getGoogleCalendarEvents = (date: string, calendarIds: string[] = []) => {
  const query = calendarIdsQuery(calendarIds);
  return requestJson<GoogleCalendarEventsResponse>(
    `/google/calendar/events?date=${encodeURIComponent(date)}${query ? `&${query}` : ''}`
  );
};

export const getGoogleCalendarEventsRange = (start: string, end: string, calendarIds: string[] = []) => {
  const query = calendarIdsQuery(calendarIds);
  return requestJson<GoogleCalendarEventsResponse>(
    `/google/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${query ? `&${query}` : ''}`
  );
};
