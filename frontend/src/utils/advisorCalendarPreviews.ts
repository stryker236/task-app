import type { GoogleCalendar, GoogleCalendarEvent, Task } from '../../../shared/types';
import type { AdvisorPreview } from '../api';

type ObjectRecord = Record<string, unknown>;

export type AdvisorCalendarPreviewEvent = GoogleCalendarEvent & {
  advisorPreview: true;
  advisorProposalId: string;
};

export type TaskDueDateCalendarEvent = GoogleCalendarEvent & {
  taskDueDate: true;
  taskId: string;
};

function isObject(value: unknown): value is ObjectRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function advisorCalendarPreviewEvents(
  proposals: AdvisorPreview | null,
  proposalStatuses: Record<string, string | undefined>,
  calendars: GoogleCalendar[]
): AdvisorCalendarPreviewEvent[] {
  return (proposals?.commands || [])
    .filter((proposal) => proposal.type === 'create_calendar_event' && !proposalStatuses[proposal.id])
    .map((proposal) => {
      const changes = isObject(proposal.changes) ? proposal.changes : {};
      const event = isObject(changes.calendarEvent) ? changes.calendarEvent : {};
      const calendarId = stringValue(event.calendarId) || 'primary';
      const calendar = calendars.find((item) => item.id === calendarId);
      const calendarSummary = stringValue(event.calendarSummary) || calendar?.summary || calendarId;

      return {
        id: `advisor-preview-${proposal.id}`,
        advisorPreview: true as const,
        advisorProposalId: proposal.id,
        calendarId,
        calendarSummary,
        calendarColor: calendar?.backgroundColor || '#6f48eb',
        summary: stringValue(event.summary) || proposal.summary || 'Novo evento',
        description: stringValue(event.description),
        location: stringValue(event.location),
        status: 'advisor_preview',
        start: stringValue(event.start) || null,
        end: stringValue(event.end) || null,
        htmlLink: null
      };
    })
    .filter((event) => event.start);
}

export function taskDueDateCalendarEvents(tasks: Task[]): TaskDueDateCalendarEvent[] {
  return tasks
    .filter((task) => task.dueDateTime && !task.isArchived && !['done', 'cancelled'].includes(task.status))
    .map((task) => {
      const start = task.dueDateTime as string;
      const startTime = Date.parse(start);
      const durationMinutes = Number(task.estimatedMinutes || 0) > 0
        ? Math.max(15, Math.min(240, Number(task.estimatedMinutes)))
        : 30;
      const end = Number.isNaN(startTime) ? null : new Date(startTime + durationMinutes * 60000).toISOString();

      return {
        id: `task-due-${task.id}`,
        taskDueDate: true as const,
        taskId: task.id,
        calendarId: 'task-due-dates',
        calendarSummary: 'Due dates',
        calendarColor: '#0f8b8d',
        summary: task.title,
        description: task.notes || '',
        location: '',
        status: 'task_due_date',
        start,
        end,
        htmlLink: null
      };
    });
}
