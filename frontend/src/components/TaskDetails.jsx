const PRIORITIES = { 1: 'Baixa', 2: 'Média', 3: 'Alta', 4: 'Urgente' };
const STATUS_LABELS = { new: 'New', in_progress: 'In progress', waiting: 'Waiting', done: 'Done', cancelled: 'Cancelled' };

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

export default function TaskDetails({ task, allTasks, onClose, onEdit, onOpenTask }) {
  const dependencies = (task.blockedByTaskIds || []).map((id) => allTasks.find((item) => item.id === id)).filter(Boolean);
  const blockedTasks = allTasks.filter((item) => (item.blockedByTaskIds || []).includes(task.id));
  const activity = [...(task.activityLog || [])].reverse();

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog task-details-dialog" role="dialog" aria-modal="true" aria-labelledby="task-details-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><h2 id="task-details-title">{task.title}</h2><p>ID: {task.id}</p></div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button>
        </div>

        <div className="task-details-content">
          <section className="details-summary-grid">
            <div><span>Status</span><strong>{STATUS_LABELS[task.status] || task.status}</strong></div>
            <div><span>Prioridade</span><strong>{PRIORITIES[task.priority]}</strong></div>
            <div><span>Prazo</span><strong>{formatDate(task.dueDateTime)}</strong></div>
            <div><span>Atualizada</span><strong>{formatDate(task.updatedAt)}</strong></div>
          </section>

          <section className="details-section">
            <h3>Descrição</h3>
            <p className="details-description">{task.description || 'Sem descrição.'}</p>
          </section>

          <section className="details-section">
            <h3>Tags <span>{(task.tags || []).length}</span></h3>
            {(task.tags || []).length
              ? <div className="tag-list details-tags">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
              : <p className="details-empty">Sem tags.</p>}
          </section>

          <div className="details-relations-grid">
            <section className="details-section">
              <h3>Bloqueada por <span>{dependencies.length}</span></h3>
              {dependencies.length ? dependencies.map((dependency) => (
                <button type="button" className="details-relation" key={dependency.id} onClick={() => onOpenTask(dependency)}>
                  <span className={dependency.status === 'done' ? 'relation-state done' : 'relation-state'}>{dependency.status === 'done' ? '✓' : '○'}</span>
                  <div><strong>{dependency.title}</strong><small>{STATUS_LABELS[dependency.status]}</small></div>
                </button>
              )) : <p className="details-empty">Sem dependências.</p>}
            </section>

            <section className="details-section">
              <h3>Bloqueia <span>{blockedTasks.length}</span></h3>
              {blockedTasks.length ? blockedTasks.map((blocked) => (
                <button type="button" className="details-relation" key={blocked.id} onClick={() => onOpenTask(blocked)}>
                  <span className="relation-state">→</span>
                  <div><strong>{blocked.title}</strong><small>{STATUS_LABELS[blocked.status]}</small></div>
                </button>
              )) : <p className="details-empty">Não bloqueia outras tarefas.</p>}
            </section>
          </div>

          <section className="details-section">
            <h3>Datas</h3>
            <dl className="details-dates">
              <div><dt>Criada</dt><dd>{formatDate(task.createdAt)}</dd></div>
              <div><dt>Atualizada</dt><dd>{formatDate(task.updatedAt)}</dd></div>
              <div><dt>Concluída</dt><dd>{formatDate(task.completedAt)}</dd></div>
              <div><dt>Cancelada</dt><dd>{formatDate(task.cancelledAt)}</dd></div>
            </dl>
          </section>

          <section className="details-section">
            <h3>Histórico <span>{activity.length}</span></h3>
            <div className="details-activity">
              {activity.map((entry) => (
                <article key={entry.id}>
                  <span className={`activity-dot activity-dot-${entry.type}`} />
                  <div><p>{entry.message}</p><time>{formatDate(entry.createdAt)}{entry.editedAt ? ' · Editado' : ''}</time></div>
                </article>
              ))}
              {activity.length === 0 && <p className="details-empty">Sem histórico.</p>}
            </div>
          </section>
        </div>

        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Fechar</button>
          <button type="button" className="button primary" onClick={() => onEdit(task)}>Editar tarefa</button>
        </div>
      </section>
    </div>
  );
}
