import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Task } from '../../../../../shared/types';

type DependencyPickerProps = {
  tasks: Task[];
  selectedIds: string[];
  currentTaskId?: string | null;
  onChange: (ids: string[]) => void;
  onOpenTask?: (task: Task) => void;
  label?: string;
  buttonLabel?: string;
  dialogTitle?: string;
  dialogDescription?: string;
  emptyText?: string;
};

export default function DependencyPicker({
  tasks,
  selectedIds,
  currentTaskId,
  onChange,
  onOpenTask,
  label = 'Dependencias (bloqueada por)',
  buttonLabel = '+ Adicionar dependencia',
  dialogTitle = 'Adicionar dependencia',
  dialogDescription = 'Selecione tarefas que tem de estar concluidas primeiro.',
  emptyText = 'Sem dependencias'
}: DependencyPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const candidates = tasks.filter((task) => {
    const term = search.trim().toLocaleLowerCase();
    return !task.isArchived && task.id !== currentTaskId && (!term || task.title.toLocaleLowerCase().includes(term));
  });

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  function stopDialogMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  return (
    <div className="dependency-field">
      <div className="field-heading">
        <span>{label}</span>
        <button type="button" className="button secondary small" onClick={() => setOpen(true)}>{buttonLabel}</button>
      </div>
      <div className="selected-dependencies">
        {selectedIds.length === 0 && <span className="muted">{emptyText}</span>}
        {selectedIds.map((id) => {
          const dependency = taskMap.get(id);
          return (
            <span className="dependency-chip" key={id}>
              {onOpenTask && dependency
                ? <button type="button" className="chip-task-link" onClick={() => onOpenTask(dependency)}>{dependency.title}</button>
                : dependency?.title || 'Tarefa indisponivel'}
              <button type="button" aria-label="Remover dependencia" onClick={() => onChange(selectedIds.filter((item) => item !== id))}>x</button>
            </span>
          );
        })}
      </div>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div className="dialog dependency-dialog" role="dialog" aria-modal="true" aria-labelledby="dependency-title" onMouseDown={stopDialogMouseDown}>
            <div className="dialog-header">
              <div>
                <h2 id="dependency-title">{dialogTitle}</h2>
                <p>{dialogDescription}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>x</button>
            </div>
            <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tarefas..." />
            <div className="dependency-list">
              {candidates.map((task) => (
                <label className="dependency-option" key={task.id}>
                  <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggle(task.id)} />
                  <span><strong>{task.title}</strong><small>{task.status.replaceAll('_', ' ')} - prioridade {task.priority}</small></span>
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

