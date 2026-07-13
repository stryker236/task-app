const DEFAULT_SCHEDULER_URL = 'http://127.0.0.1:8000';
const { fetchWithTimeout, numberFromEnv } = require('../utils/fetchWithTimeout');

type SchedulerTask = {
  id: string;
  title: string;
  durationMinutes: number;
  dueDateTime?: string | null;
  fixedStart?: string | null;
  fixedEnd?: string | null;
};

type BusyInterval = {
  calendarId?: string;
  start: string;
  end: string;
};

type SchedulerConstraint = {
  taskId: string;
  fixedStart: string;
  fixedEnd?: string | null;
};

type TaskConstraint = {
  id: string;
  ruleId?: string;
  type: string;
  payload: Record<string, unknown>;
  hard?: boolean;
};

type SchedulerRequest = {
  now: string;
  horizonEnd: string;
  timeZone?: string | null;
  tasks: SchedulerTask[];
  busy: BusyInterval[];
  taskConstraints?: Record<string, TaskConstraint[]>;
  constraints?: SchedulerConstraint[];
};

type ScheduledTask = {
  taskId: string;
  start: string;
  end: string;
  appliedConstraintIds?: string[];
};

type ReservedBlock = {
  type: string;
  start: string;
  end: string;
  reason?: string;
  sourceRuleId?: string | null;
  sourceConstraintId?: string | null;
};

type UnscheduledTask = {
  taskId: string;
  reason: string;
};

type SchedulerResponse = {
  scheduled: ScheduledTask[];
  reserved: ReservedBlock[];
  unscheduled: UnscheduledTask[];
};

function schedulerServiceUrl() {
  return (process.env.SCHEDULER_SERVICE_URL || DEFAULT_SCHEDULER_URL).replace(/\/+$/, '');
}

async function requestSchedule(payload: SchedulerRequest): Promise<SchedulerResponse> {
  const response = await fetchWithTimeout(`${schedulerServiceUrl()}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, numberFromEnv(process.env.SCHEDULER_REQUEST_TIMEOUT_MS, 30000));
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Scheduler service failed with ${response.status}`);
    (error as any).status = 502;
    throw error;
  }
  return {
    scheduled: Array.isArray(data.scheduled) ? data.scheduled : [],
    reserved: Array.isArray(data.reserved) ? data.reserved : [],
    unscheduled: Array.isArray(data.unscheduled) ? data.unscheduled : []
  };
}

module.exports = {
  requestSchedule
};

export {};
