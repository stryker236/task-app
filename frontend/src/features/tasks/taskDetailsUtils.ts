import type { ActivityLogEntry, ChecklistItem, Task, TaskPriority, TaskStatus } from '../../../../shared/types';

export const TASK_PRIORITIES: Record<TaskPriority, string> = { 1: 'Baixa', 2: 'Media', 3: 'Alta', 4: 'Urgente' };
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { new: 'New', in_progress: 'In progress', waiting: 'Waiting', done: 'Done', cancelled: 'Cancelled' };
export const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
export const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

export type EditableChecklistItem = Partial<ChecklistItem> & {
  title: string;
  isDone: boolean;
};

export type EditableTask = Omit<Task, 'estimatedMinutes' | 'checklistItems'> & {
  estimatedMinutes: number | string | null;
  checklistItems: EditableChecklistItem[];
};

export function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

export function localDeadline(value?: string | null) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function editableTaskFromTask(task: Task): EditableTask {
  return {
    ...task,
    checklistItems: task.checklistItems || []
  };
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function constraintAppliesToTask(constraint: { scope?: Record<string, unknown> }, task: Task) {
  const scope = constraint.scope || {};
  const keys = Object.keys(scope).filter((key) => {
    const value = scope[key];
    return !(Array.isArray(value) && value.length === 0) && value !== false && value != null;
  });
  if (!keys.length || scope.allTasks === true) return true;
  const tags = arrayValue(scope.tags);
  if (tags.length && !tags.some((tag) => task.tags.includes(tag))) return false;
  const titleIncludes = arrayValue(scope.titleIncludes).map((item) => item.toLocaleLowerCase());
  if (titleIncludes.length && !titleIncludes.some((item) => task.title.toLocaleLowerCase().includes(item))) return false;
  const taskIds = arrayValue(scope.taskIds);
  if (taskIds.length && !taskIds.includes(task.id)) return false;
  const statuses = arrayValue(scope.statuses);
  if (statuses.length && !statuses.includes(task.status)) return false;
  const priorities = Array.isArray(scope.priorities) ? scope.priorities.map(Number) : [];
  if (priorities.length && !priorities.includes(task.priority)) return false;
  return true;
}

export function formatConstraintPayload(payload?: Record<string, unknown>) {
  const entries = Object.entries(payload || {});
  if (!entries.length) return 'Sem parametros';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

export function formatMinutes(value?: number | null) {
  if (value == null) return '-';
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function numericMinutes(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) ? minutes : null;
}

export function activityText(entry: ActivityLogEntry) {
  if (entry.type === 'status') {
    return `Status changed from ${entry.fromStatus || ''} to ${entry.toStatus || ''}`;
  }
  return entry.message;
}
