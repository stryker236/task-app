import { useEffect, useState } from 'react';
import DependencyPicker from './DependencyPicker';

export const TASK_DRAFT_KEY = 'task-app:editing-draft:v1';

const EMPTY_TASK = {
  title: '', description: '', requestedBy: '', needToAsk: [], priority: 2, status: 'new',
  dueDateTime: '', tags: [], blockedReason: '', blockedByTaskIds: [], notesMarkdown: ''
};

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function toLocalInput(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function TaskForm({ task, tasks, draft, blockingTarget, onSave, onClose, saving }) {
  const [form, setForm] = useState(EMPTY_TASK);
  const [tagsText, setTagsText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [blocksTaskIds, setBlocksTaskIds] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  useEffect(() => {
    const localDeadline = task ? toLocalInput(task.dueDateTime) : '';
    const base = task ? { ...task, dueDateTime: localDeadline } : EMPTY_TASK;
    const source = draft?.form ? { ...base, ...draft.form } : base;
    setForm(source);
    setTagsText(draft?.tagsText ?? (source.tags || []).join(', '));
    setDueDate(draft?.dueDate ?? (localDeadline ? localDeadline.slice(0, 10) : ''));
    setDueTime(draft?.dueTime ?? (localDeadline ? localDeadline.slice(11, 16) : ''));
    const inverseIds = task
      ? tasks.filter((candidate) => (candidate.blockedByTaskIds || []).includes(task.id)).map((candidate) => candidate.id)
      : blockingTarget ? [blockingTarget.id] : [];
    setBlocksTaskIds(draft?.blocksTaskIds ?? inverseIds);
    setDraftSavedAt(draft?.savedAt || null);
    setHydrated(true);
  }, [task, draft, blockingTarget, tasks]);

  useEffect(() => {
    if (!hydrated) return;
    const savedAt = new Date().toISOString();
    try {
      localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify({
        mode: task ? 'edit' : blockingTarget ? 'create-blocker' : 'create',
        taskId: task?.id || null,
        blockingTarget: blockingTarget ? { id: blockingTarget.id, title: blockingTarget.title } : null,
        form,
        tagsText,
        dueDate,
        dueTime,
        blocksTaskIds,
        savedAt
      }));
      setDraftSavedAt(savedAt);
    } catch (error) {
      console.error('Could not save the task draft.', error);
    }
  }, [hydrated, task, blockingTarget, form, tagsText, dueDate, dueTime, blocksTaskIds]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const splitList = (value) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  const hasUnfinishedDependencies = (form.blockedByTaskIds || []).some((id) => {
    const dependency = tasks.find((item) => item.id === id);
    return dependency && dependency.status !== 'done';
  });

  function submit(event) {
    event.preventDefault();
    const deadline = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}`).toISOString() : null;
    onSave({
      ...form,
      priority: Number(form.priority),
      dueDateTime: deadline,
      tags: splitList(tagsText),
      blocksTaskIds
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog task-form" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <h2>{task ? 'Editar tarefa' : blockingTarget ? 'Nova tarefa bloqueadora' : 'Nova tarefa'}</h2>
            <p>{blockingTarget ? `Esta tarefa irá bloquear: ${blockingTarget.title}` : 'Os campos com * são obrigatórios.'}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label className="full">Título *<input required value={form.title} onChange={set('title')} autoFocus /></label>
          <label className="full">Descrição<textarea rows="3" value={form.description} onChange={set('description')} /></label>
          <label>Prioridade *
            <select required value={form.priority} onChange={set('priority')}>
              <option value="1">Baixa</option><option value="2">Média</option><option value="3">Alta</option><option value="4">Urgente</option>
            </select>
          </label>
          <label>Status *
            <select
              required
              value={form.status}
              disabled={hasUnfinishedDependencies}
              title={hasUnfinishedDependencies ? 'Conclua ou remova as dependências antes de alterar o estado' : 'Estado da tarefa'}
              onChange={set('status')}
            >
              <option value="new">New</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="done" disabled={Boolean(blockingTarget)}>Done</option><option value="cancelled">Cancelled</option>
            </select>
            {hasUnfinishedDependencies && <small>Status blocked by unfinished dependencies</small>}
          </label>
          <label>Data do prazo
            <input
              type="date"
              value={dueDate}
              onChange={(event) => {
                const value = event.target.value;
                setDueDate(value);
                if (value && !dueTime) setDueTime('23:59');
                if (!value) setDueTime('');
              }}
            />
          </label>
          <label>Hora do prazo <small>(24 horas)</small>
            <span className="time-select-group">
              <select
                aria-label="Hora"
                value={dueTime ? dueTime.slice(0, 2) : ''}
                disabled={!dueDate}
                onChange={(event) => setDueTime(`${event.target.value}:${dueTime.slice(3, 5) || '00'}`)}
              >
                <option value="">HH</option>
                {HOURS.map((hour) => <option value={hour} key={hour}>{hour}</option>)}
              </select>
              <strong>:</strong>
              <select
                aria-label="Minuto"
                value={dueTime ? dueTime.slice(3, 5) : ''}
                disabled={!dueDate}
                onChange={(event) => setDueTime(`${dueTime.slice(0, 2) || '00'}:${event.target.value}`)}
              >
                <option value="">MM</option>
                {MINUTES.map((minute) => <option value={minute} key={minute}>{minute}</option>)}
              </select>
            </span>
            {dueDate && dueTime === '23:59' && <small>Fim do dia por predefinição</small>}
          </label>
          <label>Tags <small>(separadas por vírgulas)</small><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} /></label>
          <div className="full">
            <DependencyPicker tasks={tasks} selectedIds={form.blockedByTaskIds || []} currentTaskId={task?.id} onChange={(ids) => setForm((current) => ({ ...current, blockedByTaskIds: ids }))} />
          </div>
          <div className="full">
            <DependencyPicker
              tasks={tasks}
              selectedIds={blocksTaskIds}
              currentTaskId={task?.id}
              onChange={setBlocksTaskIds}
              label="Esta tarefa bloqueia"
              buttonLabel="+ Adicionar tarefa bloqueada"
              dialogTitle="Selecionar tarefas bloqueadas"
              dialogDescription="Selecione as tarefas que não poderão avançar até esta estar concluída."
              emptyText="Não bloqueia outras tarefas"
            />
          </div>
        </div>
        <div className="dialog-actions">
          <span className="draft-status">
            {draftSavedAt ? `Rascunho guardado às ${new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(draftSavedAt))}` : 'A guardar rascunho…'}
          </span>
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'A guardar…' : 'Guardar tarefa'}</button>
        </div>
      </form>
    </div>
  );
}
