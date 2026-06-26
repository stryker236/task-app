import TaskCard from './TaskCard';

const QUEUE_SORT_OPTIONS = [
  ['priority', 'Prioridade'], ['dueDateTime', 'Prazo'],
  ['createdAt', 'Criada em'], ['updatedAt', 'Atualizada em'], ['status', 'Status']
];

function sortTasksByQueueOrder(tasks, field, direction) {
  return [...tasks].sort((a, b) => {
    let comparison;
    if (field === 'priority') comparison = a.priority - b.priority;
    else if (['dueDateTime', 'createdAt', 'updatedAt'].includes(field)) {
      if (!a[field]) return 1;
      if (!b[field]) return -1;
      comparison = new Date(a[field]) - new Date(b[field]);
    } else comparison = String(a[field] || '').localeCompare(String(b[field] || ''), 'pt');
    return direction === 'asc' ? comparison : -comparison;
  });
}

export default function QueueView({ tasks, allTasks, taskActions, sort, onSortChange }) {
  const items = sortTasksByQueueOrder(tasks, sort.field, sort.direction);
  return (
    <section className="queue-view">
      <div className="queue-toolbar">
        <label>Ordenar por
          <select value={sort.field} onChange={(event) => onSortChange({ ...sort, field: event.target.value })}>
            {QUEUE_SORT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" className="button secondary" onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}>
          {sort.direction === 'asc' ? '↑ Ascendente' : '↓ Descendente'}
        </button>
      </div>
      <div className="queue-grid">
        {items.map((task) => <TaskCard key={task.id} task={task} allTasks={allTasks} {...taskActions} />)}
        {items.length === 0 && <p className="empty-message">Nenhuma tarefa corresponde aos filtros.</p>}
      </div>
    </section>
  );
}
