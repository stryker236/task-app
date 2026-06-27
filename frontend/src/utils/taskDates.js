export function isToday(task) {
  if (!task.dueDateTime) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const due = new Date(task.dueDateTime);
  return due >= start && due < end;
}

export const isOverdue = (task) => Boolean(task.dueDateTime) && new Date(task.dueDateTime) < new Date();
