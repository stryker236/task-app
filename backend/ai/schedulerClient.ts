const DEFAULT_SCHEDULER_URL = 'http://127.0.0.1:8000';

type SchedulerTask = {
  id: string;
  title: string;
  durationMinutes: number;
  dueDateTime?: string | null;
  fixedStart?: string | null;
  fixedEnd?: string | null;
};

type BusyInterval = {
  start: string;
  end: string;
};

type SchedulerConstraint = {
  taskId: string;
  fixedStart: string;
  fixedEnd?: string | null;
};

type SchedulerRequest = {
  now: string;
  horizonEnd: string;
  timeZone?: string | null;
  tasks: SchedulerTask[];
  busy: BusyInterval[];
  constraints?: SchedulerConstraint[];
};

type ScheduledTask = {
  taskId: string;
  start: string;
  end: string;
};

type UnscheduledTask = {
  taskId: string;
  reason: string;
};

type SchedulerResponse = {
  scheduled: ScheduledTask[];
  unscheduled: UnscheduledTask[];
};

function schedulerServiceUrl() {
  return (process.env.SCHEDULER_SERVICE_URL || DEFAULT_SCHEDULER_URL).replace(/\/+$/, '');
}

async function requestSchedule(payload: SchedulerRequest): Promise<SchedulerResponse> {
  const response = await fetch(`${schedulerServiceUrl()}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Scheduler service failed with ${response.status}`);
    (error as any).status = 502;
    throw error;
  }
  return {
    scheduled: Array.isArray(data.scheduled) ? data.scheduled : [],
    unscheduled: Array.isArray(data.unscheduled) ? data.unscheduled : []
  };
}

module.exports = {
  requestSchedule
};

export {};
