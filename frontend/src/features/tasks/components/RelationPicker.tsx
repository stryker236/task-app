import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Task, TaskRelation, TaskRelationType } from '../../../../../shared/types';

type VisibleRelationType = Exclude<TaskRelationType, 'blocks' | 'blocked_by'>;

export const RELATION_LABELS: Record<VisibleRelationType, string> = {
  relates_to: 'Relacionada com',
  duplicates: 'Duplica',
  parent_of: 'Tarefa principal de',
  child_of: 'Subtarefa de'
};

type EditableRelation = Pick<TaskRelation, 'relatedTaskId'> & {
  type: VisibleRelationType;
};

type RelationPickerProps = {
  tasks: Task[];
  relations: EditableRelation[];
  currentTaskId?: string | null;
  onChange: (relations: EditableRelation[]) => void;
  onOpenTask?: (task: Task) => void;
};

export default function RelationPicker({ tasks, relations, currentTaskId, onChange, onOpenTask }: RelationPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<VisibleRelationType>('relates_to');
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const candidates = tasks.filter((task) => {
    const term = search.trim().toLocaleLowerCase();
    return !task.isArchived && task.id !== currentTaskId
      && (!term || task.title.toLocaleLowerCase().includes(term))
      && !relations.some((relation) => relation.relatedTaskId === task.id && relation.type === type);
  });

  function add(taskId: string) {
    onChange([...relations, { relatedTaskId: taskId, type }]);
  }

  function stopDialogMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  return (
    <div className="dependency-field">
      <div className="field-heading">
        <span>Outras relacoes</span>
        <button type="button" className="button secondary small" onClick={() => setOpen(true)}>+ Adicionar relacao</button>
      </div>
      <div className="selected-dependencies">
        {relations.length === 0 && <span className="muted">Sem outras relacoes.</span>}
        {relations.map((relation) => {
          const relatedTask = taskMap.get(relation.relatedTaskId);
          return (
            <span className="dependency-chip" key={`${relation.type}:${relation.relatedTaskId}`}>
              <small>{RELATION_LABELS[relation.type]}</small>
              {onOpenTask && relatedTask
                ? <button type="button" className="chip-task-link" onClick={() => onOpenTask(relatedTask)}>{relatedTask.title}</button>
                : relatedTask?.title || 'Tarefa indisponivel'}
              <button type="button" aria-label="Remover relacao" onClick={() => onChange(relations.filter((item) => item !== relation))}>x</button>
            </span>
          );
        })}
      </div>

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div className="dialog dependency-dialog" role="dialog" aria-modal="true" onMouseDown={stopDialogMouseDown}>
            <div className="dialog-header">
              <div><h2>Adicionar relacao</h2><p>Escolha o tipo e a tarefa associada.</p></div>
              <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>x</button>
            </div>
            <div className="relation-picker-controls">
              <select value={type} onChange={(event) => setType(event.target.value as VisibleRelationType)}>
                {Object.entries(RELATION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tarefas..." />
            </div>
            <div className="dependency-list">
              {candidates.map((task) => (
                <button type="button" className="relation-candidate" key={task.id} onClick={() => add(task.id)}>
                  <strong>{task.title}</strong><small>{task.status.replaceAll('_', ' ')} - prioridade {task.priority}</small>
                </button>
              ))}
              {candidates.length === 0 && <p className="empty-message">Nenhuma tarefa disponivel.</p>}
            </div>
            <div className="dialog-actions"><button type="button" className="button primary" onClick={() => setOpen(false)}>Concluir</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

