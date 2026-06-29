import { useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { Task, TaskStatus } from '../../../shared/types';
import TaskCard from './TaskCard';
import type { TaskCardActions } from './TaskCard';

const COLUMNS = [
  ['new', 'New'],
  ['in_progress', 'In progress'],
  ['waiting', 'Waiting'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled']
] as const satisfies ReadonlyArray<readonly [TaskStatus, string]>;

const SORT_OPTIONS = [
  ['priority', 'Prioridade'],
  ['dueDateTime', 'Prazo'],
  ['title', 'Titulo'],
  ['createdAt', 'Data de criacao'],
  ['updatedAt', 'Ultima atualizacao']
] as const;

type KanbanSortField = typeof SORT_OPTIONS[number][0];
type SortRule = {
  field: KanbanSortField;
  direction: 'asc' | 'desc';
};
type KanbanSort = {
  primary: SortRule;
  secondary: SortRule;
};

type KanbanTaskActions = TaskCardActions & {
  onStatusChange: (task: Task, status: TaskStatus) => void;
};

type KanbanViewProps = {
  tasks: Task[];
  allTasks: Task[];
  taskActions: KanbanTaskActions;
  hideDone?: boolean;
  hideCancelled?: boolean;
};

function compareField(a: Task, b: Task, field: KanbanSortField, direction: SortRule['direction']) {
  let comparison: number;
  if (field === 'priority') {
    comparison = a.priority - b.priority;
  } else if (['dueDateTime', 'createdAt', 'updatedAt'].includes(field)) {
    if (!a[field] && !b[field]) return 0;
    if (!a[field]) return 1;
    if (!b[field]) return -1;
    comparison = new Date(a[field]).getTime() - new Date(b[field]).getTime();
  } else {
    comparison = String(a[field] || '').localeCompare(String(b[field] || ''), 'pt', { sensitivity: 'base' });
  }
  return direction === 'asc' ? comparison : -comparison;
}

function sortTasks(tasks: Task[], sort: KanbanSort) {
  return [...tasks].sort((a, b) => {
    const primaryComparison = compareField(a, b, sort.primary.field, sort.primary.direction);
    if (primaryComparison !== 0) return primaryComparison;
    const secondaryComparison = compareField(a, b, sort.secondary.field, sort.secondary.direction);
    if (secondaryComparison !== 0) return secondaryComparison;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function firstAlternativeSortField(field: KanbanSortField) {
  return SORT_OPTIONS.find(([value]) => value !== field)?.[0] || 'priority';
}

export default function KanbanView({ tasks, allTasks, taskActions, hideDone, hideCancelled }: KanbanViewProps) {
  const [sort, setSort] = useState<KanbanSort>({
    primary: { field: 'priority', direction: 'desc' },
    secondary: { field: 'dueDateTime', direction: 'asc' }
  });
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);
  const visibleColumns = COLUMNS.filter(([status]) => (
    !(status === 'done' && hideDone) && !(status === 'cancelled' && hideCancelled)
  ));

  function startDrag(event: DragEvent<HTMLElement>, task: Task) {
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  }

  function finishDrag() {
    setDraggedTaskId(null);
    setDropStatus(null);
  }

  function dropTask(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || draggedTaskId;
    const task = tasks.find((item) => item.id === id);
    finishDrag();
    if (task && task.status !== status) taskActions.onStatusChange(task, status);
  }

  return (
    <section className="kanban-view">
      <div className="kanban-toolbar">
        <span>1.o criterio</span>
        <select
          value={sort.primary.field}
          onChange={(event) => {
            const field = event.target.value as KanbanSortField;
            setSort((current) => ({
              primary: { ...current.primary, field },
              secondary: current.secondary.field === field
                ? { ...current.secondary, field: firstAlternativeSortField(field) }
                : current.secondary
            }));
          }}
        >
          {SORT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button type="button" className="button secondary direction-button" onClick={() => setSort((current) => ({ ...current, primary: { ...current.primary, direction: current.primary.direction === 'asc' ? 'desc' : 'asc' } }))}>
          {sort.primary.direction === 'desc' ? '↓ Desc.' : '↑ Asc.'}
        </button>
        <span>2.o criterio</span>
        <select value={sort.secondary.field} onChange={(event) => setSort((current) => ({ ...current, secondary: { ...current.secondary, field: event.target.value as KanbanSortField } }))}>
          {SORT_OPTIONS.filter(([value]) => value !== sort.primary.field).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button type="button" className="button secondary direction-button" onClick={() => setSort((current) => ({ ...current, secondary: { ...current.secondary, direction: current.secondary.direction === 'asc' ? 'desc' : 'asc' } }))}>
          {sort.secondary.direction === 'desc' ? '↓ Desc.' : '↑ Asc.'}
        </button>
      </div>
      <div className="kanban-board" style={{ '--kanban-column-count': visibleColumns.length } as CSSProperties}>
        {visibleColumns.map(([status, label]) => {
          const items = sortTasks(tasks.filter((task) => task.status === status), sort);
          return (
            <section
              className={`kanban-column column-${status} ${dropStatus === status ? 'drop-target' : ''}`}
              key={status}
              onDragEnter={(event) => {
                event.preventDefault();
                if (draggedTaskId) setDropStatus(status);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => dropTask(event, status)}
            >
              <header><h2>{label}</h2><span>{items.length}</span></header>
              <div className="kanban-cards">
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    allTasks={allTasks}
                    dragEnabled
                    onDragStart={startDrag}
                    onDragEnd={finishDrag}
                    {...taskActions}
                  />
                ))}
                {items.length === 0 && <p className="empty-column">Sem tarefas</p>}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
