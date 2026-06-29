import type { Task } from '../../../shared/types';

export function isToday(task: Pick<Task, 'dueDateTime'>) {
  if (!task.dueDateTime) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const due = new Date(task.dueDateTime);
  return due >= start && due < end;
}

export function isOverdue(task: Pick<Task, 'dueDateTime'>) {
  if (!task.dueDateTime) return false;
  return new Date(task.dueDateTime) < new Date();
}
