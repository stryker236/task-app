import type { Task, TaskCalendarEvent } from '../../../shared/types';

function eventEndTime(event: TaskCalendarEvent) {
  const value = Date.parse(event.end || '');
  return Number.isNaN(value) ? 0 : value;
}

function eventStartTime(event: TaskCalendarEvent) {
  const value = Date.parse(event.start || '');
  return Number.isNaN(value) ? 0 : value;
}

export function activeCalendarEvents(task: Pick<Task, 'calendarEvents'>, now = Date.now()) {
  return [...(task.calendarEvents || [])]
    .filter((event) => !event.reviewStatus && eventEndTime(event) >= now)
    .sort((a, b) => eventStartTime(a) - eventStartTime(b));
}

export function nextScheduledEvent(task: Pick<Task, 'calendarEvents'>, now = Date.now()) {
  return activeCalendarEvents(task, now)[0] || null;
}

export function pendingScheduledReviewEvents(task: Task, now = Date.now()) {
  if (task.isArchived || ['done', 'cancelled'].includes(task.status)) return [];
  return [...(task.calendarEvents || [])]
    .filter((event) => !event.reviewStatus && eventEndTime(event) > 0 && eventEndTime(event) < now)
    .sort((a, b) => eventEndTime(a) - eventEndTime(b));
}

export function reviewedCalendarEvents(task: Pick<Task, 'calendarEvents'>) {
  return [...(task.calendarEvents || [])]
    .filter((event) => Boolean(event.reviewStatus))
    .sort((a, b) => eventStartTime(b) - eventStartTime(a));
}