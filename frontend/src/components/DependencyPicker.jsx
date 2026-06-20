import { useMemo, useState } from 'react';

export default function DependencyPicker({ tasks, selectedIds, currentTaskId, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const candidates = tasks.filter((task) => {
    const term = search.trim().toLocaleLowerCase();
    return task.id !== currentTaskId && (!term || task.title.toLocaleLowerCase().includes(term));
  });

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  return (
    <div className="dependency-field">
      <div className="field-heading">
        <span>Dependências</span>
        <button type="button" className="button secondary small" onClick={() => setOpen(true)}>+ Adicionar dependência</button>
      </div>
      <div className="selected-dependencies">
        {selectedIds.length === 0 && <span className="muted">Sem dependências</span>}
        {selectedIds.map((id) => (
          <span className="dependency-chip" key={id}>
            {taskMap.get(id)?.title || 'Tarefa indisponível'}
            <button type="button" aria-label="Remover dependência" onClick={() => onChange(selectedIds.filter((item) => item !== id))}>×</button>
          </span>
        ))}
      </div>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div className="dialog dependency-dialog" role="dialog" aria-modal="true" aria-labelledby="dependency-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <h2 id="dependency-title">Adicionar dependência</h2>
                <p>Selecione tarefas que têm de estar concluídas primeiro.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>×</button>
            </div>
            <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tarefas…" />
            <div className="dependency-list">
              {candidates.map((task) => (
                <label className="dependency-option" key={task.id}>
                  <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggle(task.id)} />
                  <span><strong>{task.title}</strong><small>{task.status.replaceAll('_', ' ')} · prioridade {task.priority}</small></span>
                </label>
              ))}
              {candidates.length === 0 && <p className="empty-message">Nenhuma tarefa encontrada.</p>}
            </div>
            <div className="dialog-actions"><button type="button" className="button primary" onClick={() => setOpen(false)}>Concluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
