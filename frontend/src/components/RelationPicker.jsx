import { useMemo, useState } from 'react';

export const RELATION_LABELS = {
  relates_to: 'Relacionada com',
  duplicates: 'Duplica',
  parent_of: 'Tarefa principal de',
  child_of: 'Subtarefa de'
};

export default function RelationPicker({ tasks, relations, currentTaskId, onChange, onOpenTask }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('relates_to');
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const candidates = tasks.filter((task) => {
    const term = search.trim().toLocaleLowerCase();
    return !task.isArchived && task.id !== currentTaskId
      && (!term || task.title.toLocaleLowerCase().includes(term))
      && !relations.some((relation) => relation.relatedTaskId === task.id && relation.type === type);
  });

  function add(taskId) {
    onChange([...relations, { relatedTaskId: taskId, type }]);
  }

  return (
    <div className="dependency-field">
      <div className="field-heading">
        <span>Outras relações</span>
        <button type="button" className="button secondary small" onClick={() => setOpen(true)}>+ Adicionar relação</button>
      </div>
      <div className="selected-dependencies">
        {relations.length === 0 && <span className="muted">Sem outras relações.</span>}
        {relations.map((relation) => (
          <span className="dependency-chip" key={`${relation.type}:${relation.relatedTaskId}`}>
            <small>{RELATION_LABELS[relation.type]}</small>
            {onOpenTask && taskMap.get(relation.relatedTaskId)
              ? <button type="button" className="chip-task-link" onClick={() => onOpenTask(taskMap.get(relation.relatedTaskId))}>{taskMap.get(relation.relatedTaskId).title}</button>
              : taskMap.get(relation.relatedTaskId)?.title || 'Tarefa indisponível'}
            <button type="button" aria-label="Remover relação" onClick={() => onChange(relations.filter((item) => item !== relation))}>×</button>
          </span>
        ))}
      </div>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div className="dialog dependency-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div><h2>Adicionar relação</h2><p>Escolha o tipo e a tarefa associada.</p></div>
              <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="relation-picker-controls">
              <select value={type} onChange={(event) => setType(event.target.value)}>
                {Object.entries(RELATION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tarefas…" />
            </div>
            <div className="dependency-list">
              {candidates.map((task) => (
                <button type="button" className="relation-candidate" key={task.id} onClick={() => add(task.id)}>
                  <strong>{task.title}</strong><small>{task.status.replaceAll('_', ' ')} · prioridade {task.priority}</small>
                </button>
              ))}
              {candidates.length === 0 && <p className="empty-message">Nenhuma tarefa disponível.</p>}
            </div>
            <div className="dialog-actions"><button type="button" className="button primary" onClick={() => setOpen(false)}>Concluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
