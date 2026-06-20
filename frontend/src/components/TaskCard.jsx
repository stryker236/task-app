const PRIORITIES = { 1: 'Baixa', 2: 'Média', 3: 'Alta', 4: 'Urgente' };
const STATUS_OPTIONS = [
  ['novo', 'Novo'], ['em_curso', 'Em curso'], ['a_espera', 'À espera'], ['feito', 'Feito'], ['cancelado', 'Cancelado']
];

function dateState(task) {
  if (!task.dueDateTime || ['feito', 'cancelado'].includes(task.status)) return null;
  const date = new Date(task.dueDateTime);
  const now = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (date < now) return 'overdue';
  if (date < end) return 'today';
  return null;
}

export default function TaskCard({ task, allTasks, onEdit, onDelete, onDuplicate, onStatusChange, onOpenTask, onProgress, onAddBlocker, dragEnabled = false, onDragStart, onDragEnd }) {
  const dependencies = task.blockedByTaskIds.map((id) => allTasks.find((item) => item.id === id)).filter(Boolean);
  const unfinished = dependencies.filter((item) => item.status !== 'feito');
  const blockedDependents = allTasks.filter((candidate) =>
    !['feito', 'cancelado'].includes(candidate.status) &&
    candidate.blockedByTaskIds.includes(task.id)
  );
  const isBlocking = task.status !== 'feito' && blockedDependents.length > 0;
  const progressEntries = (task.activityLog || []).filter((entry) => entry.type === 'progress');
  const latestProgress = progressEntries.at(-1);
  const timing = dateState(task);

  return (
    <article className={`task-card priority-${task.priority} ${unfinished.length ? 'is-blocked' : ''}`}>
      <div className="card-topline">
        <span className={`priority-badge p${task.priority}`}>{PRIORITIES[task.priority]}</span>
        {timing === 'overdue' && <span className="timing-badge overdue">Atrasada</span>}
        {timing === 'today' && <span className="timing-badge today">Hoje</span>}
        {unfinished.length > 0 && <span className="blocked-count-badge">Bloqueada por {unfinished.length}</span>}
        {isBlocking && (
          <span className="blocking-badge" title={`A bloquear: ${blockedDependents.map((item) => item.title).join(', ')}`}>
            A bloquear {blockedDependents.length}
          </span>
        )}
        {dragEnabled && unfinished.length === 0 && (
          <span
            className="drag-handle"
            draggable="true"
            role="button"
            tabIndex="0"
            title="Arrastar para alterar o estado"
            aria-label={`Arrastar ${task.title}`}
            onDragStart={(event) => onDragStart(event, task)}
            onDragEnd={onDragEnd}
          >⠿</span>
        )}
      </div>
      <h3>{task.title}</h3>
      {task.description && <p className="task-description">{task.description}</p>}
      <div className="task-meta">
        {task.requestedBy && <span>Pedido por <strong>{task.requestedBy}</strong></span>}
        <span>{task.dueDateTime ? new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(task.dueDateTime)) : 'Sem prazo'}</span>
      </div>
      {task.tags.length > 0 && <div className="tag-list">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      {dependencies.length > 0 && (
        <div className="dependency-summary">
          <strong>{unfinished.length ? `Bloqueada por ${unfinished.length}` : 'Ready'}</strong>
          {dependencies.map((dependency) => (
            <button type="button" className={dependency.status === 'feito' ? 'dependency-done' : ''} key={dependency.id} onClick={() => onOpenTask(dependency)}>
              <span>{dependency.status === 'feito' ? '✓' : '○'}</span> {dependency.title}
            </button>
          ))}
        </div>
      )}
      {isBlocking && (
        <div className="blocking-summary">
          <strong>A bloquear</strong>
          {blockedDependents.map((dependent) => (
            <button type="button" key={dependent.id} onClick={() => onOpenTask(dependent)}>
              <span>→</span> {dependent.title}
            </button>
          ))}
        </div>
      )}
      {task.blockedReason && <p className="blocked-reason">{task.blockedReason}</p>}
      {latestProgress && (
        <button type="button" className="latest-progress" onClick={() => onProgress(task)}>
          <strong>Último progresso</strong>
          <span>{latestProgress.message}</span>
        </button>
      )}
      <div className="card-status">
        <label>Estado</label>
        <select
          value={task.status}
          disabled={unfinished.length > 0}
          title={unfinished.length ? 'Conclua as dependências antes de alterar o estado' : 'Alterar estado'}
          onChange={(event) => onStatusChange(task, event.target.value)}
        >
          {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </div>
      <div className="card-actions">
        <button type="button" onClick={() => onProgress(task)}>{task.status === 'novo' ? 'Histórico' : 'Progresso'} ({(task.activityLog || []).length})</button>
        {!['feito', 'cancelado'].includes(task.status) && <button type="button" onClick={() => onAddBlocker(task)}>+ Bloqueio</button>}
        <button type="button" onClick={() => onEdit(task)}>Editar</button>
        <button type="button" onClick={() => onDuplicate(task)}>Duplicar</button>
        <button type="button" className="danger-link" onClick={() => onDelete(task)}>Eliminar</button>
      </div>
    </article>
  );
}
