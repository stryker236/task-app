import { useState } from 'react';
import TaskCard from './TaskCard';

const COLUMNS = [
  ['novo', 'Novo'], ['em_curso', 'Em curso'], ['a_espera', 'À espera'], ['feito', 'Feito'], ['cancelado', 'Cancelado']
];

const SORT_OPTIONS = [
  ['priority', 'Prioridade'],
  ['dueDateTime', 'Prazo'],
  ['title', 'Título'],
  ['requestedBy', 'Pedido por'],
  ['createdAt', 'Data de criação'],
  ['updatedAt', 'Última atualização']
];

function compareField(a, b, field, direction) {
  let comparison;
  if (field === 'priority') {
    comparison = a.priority - b.priority;
  } else if (['dueDateTime', 'createdAt', 'updatedAt'].includes(field)) {
    if (!a[field] && !b[field]) return 0;
    if (!a[field]) return 1;
    if (!b[field]) return -1;
    comparison = new Date(a[field]) - new Date(b[field]);
  } else {
    comparison = String(a[field] || '').localeCompare(String(b[field] || ''), 'pt', { sensitivity: 'base' });
  }
  return direction === 'asc' ? comparison : -comparison;
}

function sortTasks(tasks, sort) {
  return [...tasks].sort((a, b) => {
    const primaryComparison = compareField(a, b, sort.primary.field, sort.primary.direction);
    if (primaryComparison !== 0) return primaryComparison;
    const secondaryComparison = compareField(a, b, sort.secondary.field, sort.secondary.direction);
    if (secondaryComparison !== 0) return secondaryComparison;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

export default function KanbanView({ tasks, allTasks, actions }) {
  const [sort, setSort] = useState({
    primary: { field: 'priority', direction: 'desc' },
    secondary: { field: 'dueDateTime', direction: 'asc' }
  });
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dropStatus, setDropStatus] = useState(null);

  function startDrag(event, task) {
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
  }

  function finishDrag() {
    setDraggedTaskId(null);
    setDropStatus(null);
  }

  function dropTask(event, status) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || draggedTaskId;
    const task = tasks.find((item) => item.id === id);
    finishDrag();
    if (task && task.status !== status) actions.onStatusChange(task, status);
  }

  return (
    <section className="kanban-view">
      <div className="kanban-toolbar">
        <span>1.º critério</span>
        <select
          value={sort.primary.field}
          onChange={(event) => {
            const field = event.target.value;
            setSort((current) => ({
              primary: { ...current.primary, field },
              secondary: current.secondary.field === field
                ? { ...current.secondary, field: SORT_OPTIONS.find(([value]) => value !== field)[0] }
                : current.secondary
            }));
          }}
        >
          {SORT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button type="button" className="button secondary direction-button" onClick={() => setSort((current) => ({ ...current, primary: { ...current.primary, direction: current.primary.direction === 'asc' ? 'desc' : 'asc' } }))}>
          {sort.primary.direction === 'desc' ? '↓ Desc.' : '↑ Asc.'}
        </button>
        <span>2.º critério</span>
        <select value={sort.secondary.field} onChange={(event) => setSort((current) => ({ ...current, secondary: { ...current.secondary, field: event.target.value } }))}>
          {SORT_OPTIONS.filter(([value]) => value !== sort.primary.field).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button type="button" className="button secondary direction-button" onClick={() => setSort((current) => ({ ...current, secondary: { ...current.secondary, direction: current.secondary.direction === 'asc' ? 'desc' : 'asc' } }))}>
          {sort.secondary.direction === 'desc' ? '↓ Desc.' : '↑ Asc.'}
        </button>
      </div>
      <div className="kanban-board">
        {COLUMNS.map(([status, label]) => {
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
                    {...actions}
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
