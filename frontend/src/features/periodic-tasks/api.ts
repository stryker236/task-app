import { requestJson } from '../../shared/api/requestJson';

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
    maxOccurrencesPerDay?: number;
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

export const getPeriodicTasks = () => requestJson<PeriodicTask[]>('/periodic-tasks');
export const createPeriodicTask = (task: PeriodicTaskInput) => requestJson<PeriodicTask>('/periodic-tasks', { method: 'POST', body: JSON.stringify(task) });
export const updatePeriodicTask = (id: string, patch: PeriodicTaskInput) => requestJson<PeriodicTask>(`/periodic-tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deletePeriodicTask = (id: string) => requestJson<void>(`/periodic-tasks/${id}`, { method: 'DELETE' });
export const createPeriodicTaskConstraint = (periodicTaskId: string, constraint: Partial<PeriodicTaskConstraint>) => requestJson<PeriodicTaskConstraint>(`/periodic-tasks/${periodicTaskId}/constraints`, { method: 'POST', body: JSON.stringify(constraint) });
export const deletePeriodicTaskConstraint = (id: string) => requestJson<void>(`/periodic-task-constraints/${id}`, { method: 'DELETE' });
export const updatePeriodicTaskOccurrence = (id: string, status: PeriodicTaskOccurrence['status']) => requestJson<PeriodicTaskOccurrence>(`/periodic-task-occurrences/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
