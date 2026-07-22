import type { Task } from '../../../../shared/types';
import { isOverdue, isToday } from '../../utils/taskDates';

export type TaskCollectionSection = [string, Task[]];

export function createTaskCollectionSections(tasks: Task[]): TaskCollectionSection[] {
  const active = (task: Task) => !['done', 'cancelled'].includes(task.status);

  return [
    ['Atrasadas', tasks.filter((task) => active(task) && isOverdue(task))],
    ['Para hoje', tasks.filter((task) => active(task) && isToday(task))],
    ['Urgentes', tasks.filter((task) => active(task) && task.priority === 4)],
    ['Alta prioridade', tasks.filter((task) => active(task) && task.priority === 3)],
    ['Waiting', tasks.filter((task) => task.status === 'waiting')],
    ['Sem prazo', tasks.filter((task) => active(task) && !task.dueDateTime)]
  ];
}
