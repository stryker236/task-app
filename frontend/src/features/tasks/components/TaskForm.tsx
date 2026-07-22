import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent } from 'react';
import type { ChecklistItem, Tag, Task, TaskInput, TaskPriority, TaskRelation, TaskStatus } from '../../../../../shared/types';
import ChecklistEditor from './ChecklistEditor';
import DependencyPicker from './DependencyPicker';
import RelationPicker from './RelationPicker';
import TagPicker from './TagPicker';

export const TASK_DRAFT_KEY = 'task-app:editing-draft:v1';

type EditableChecklistItem = Partial<ChecklistItem> & {
  _key?: string;
  title: string;
  isDone: boolean;
};

type EditableTaskForm = {
  title: string;
  notes: string;
  requestedBy: string;
  needToAsk: string[];
  priority: TaskPriority | string | number;
  status: TaskStatus;
  dueDateTime: string;
  estimatedMinutes: number | string | null;
  isFavorite: boolean;
  tags: string[];
  blockedReason: string;
  blockedByTaskIds: string[];
  relations: TaskRelation[];
  checklistItems: EditableChecklistItem[];
  description?: string;
  notesMarkdown?: string;
};

export type TaskDraft = {
  mode?: 'create' | 'edit' | 'create-blocker';
  taskId?: string | null;
  blockingTarget?: Task | null;
  form?: Partial<EditableTaskForm> | Partial<TaskInput>;
  dueDate?: string;
  dueTime?: string;
  blocksTaskIds?: string[];
  savedAt?: string;
};

export type TaskFormPayload = Omit<Partial<TaskInput>, 'checklistItems'> & {
  blocksTaskIds?: string[];
  checklistItems?: Array<Omit<EditableChecklistItem, '_key'> & { position: number }>;
};

type TaskFormProps = {
  task: Task | null | undefined;
  tasks: Task[];
  availableTags: Tag[];
  draft: TaskDraft | null;
  blockingTarget: Task | null;
  onSave: (task: TaskFormPayload) => Promise<void> | void;
  onClose: () => void;
  onProgress: (task: Task) => void;
  saving: boolean;
};

const EMPTY_TASK: EditableTaskForm = {
  title: '',
  notes: '',
  requestedBy: '',
  needToAsk: [],
  priority: 2,
  status: 'new',
  dueDateTime: '',
  estimatedMinutes: '',
  isFavorite: false,
  tags: [],
  blockedReason: '',
  blockedByTaskIds: [],
  relations: [],
  checklistItems: []
};

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function toLocalInput(isoDate?: string | null) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formFromTask(task: Task | null | undefined): EditableTaskForm {
  if (!task) return { ...EMPTY_TASK, tags: [], blockedByTaskIds: [], relations: [], checklistItems: [] };
  return {
    ...EMPTY_TASK,
    ...task,
    notes: task.notes ?? task.description ?? '',
    dueDateTime: toLocalInput(task.dueDateTime),
    relations: task.relations || [],
    checklistItems: task.checklistItems || []
  };
}

function stopDialogMouseDown(event: MouseEvent<HTMLFormElement>) {
  event.stopPropagation();
}

export default function TaskForm({ task, tasks, availableTags, draft, blockingTarget, onSave, onClose, onProgress, saving }: TaskFormProps) {
  const [form, setForm] = useState<EditableTaskForm>(EMPTY_TASK);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [blocksTaskIds, setBlocksTaskIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const localDeadline = task ? toLocalInput(task.dueDateTime) : '';
    const base = formFromTask(task);
    const source = {
      ...(draft?.form ? { ...base, ...draft.form } : base),
      dueDateTime: (draft?.form?.dueDateTime ?? base.dueDateTime ?? '') || ''
    } as EditableTaskForm;
    if (!source.notes && source.description) source.notes = source.description;
    setForm(source);
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
        dueDate,
        dueTime,
        blocksTaskIds,
        savedAt
      }));
      setDraftSavedAt(savedAt);
    } catch (error) {
      console.error('Could not save the task draft.', error);
    }
  }, [hydrated, task, blockingTarget, form, dueDate, dueTime, blocksTaskIds]);

  const set = (key: keyof EditableTaskForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const hasUnfinishedDependencies = (form.blockedByTaskIds || []).some((id) => {
    const dependency = tasks.find((item) => item.id === id);
    return dependency && dependency.status !== 'done';
  });
  const hasUnfinishedChecklist = (form.checklistItems || []).some((item) => !item.isDone);
  const statusBlocked = hasUnfinishedDependencies || hasUnfinishedChecklist;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deadline = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}`).toISOString() : null;
    const { description, notesMarkdown, ...canonicalForm } = form;
    void description;
    void notesMarkdown;
    onSave({
      ...canonicalForm,
      priority: Number(form.priority) as TaskPriority,
      estimatedMinutes: form.estimatedMinutes === '' ? null : Number(form.estimatedMinutes),
      dueDateTime: deadline,
      tags: form.tags || [],
      checklistItems: (form.checklistItems || []).map(({ _key, ...item }, position) => ({ ...item, position })),
      blocksTaskIds
    });
  }

  const genericRelations = (form.relations || []).filter((relation) => !['blocked_by', 'blocks'].includes(relation.type)) as Array<TaskRelation & { type: keyof typeof import('./RelationPicker').RELATION_LABELS }>;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog task-form" onSubmit={submit} onMouseDown={stopDialogMouseDown}>
        <div className="dialog-header">
          <div>
            <h2>{task ? task.title : blockingTarget ? 'Nova tarefa bloqueadora' : 'Nova tarefa'}</h2>
            <p>{blockingTarget ? `Esta tarefa ira bloquear: ${blockingTarget.title}` : 'Os campos com * sao obrigatorios.'}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>x</button>
        </div>
        <div className="form-grid">
          <label className="full">Titulo *<input required value={form.title} onChange={set('title')} autoFocus /></label>
          <label className="full">Notas<textarea rows={5} maxLength={50000} value={form.notes || ''} onChange={set('notes')} /></label>
          <label>Prioridade *
            <select required value={form.priority} onChange={set('priority')}>
              <option value="1">Baixa</option><option value="2">Media</option><option value="3">Alta</option><option value="4">Urgente</option>
            </select>
          </label>
          <label>Status *
            <select required value={form.status} title={statusBlocked ? 'Conclua as dependencias e o checklist antes de marcar como Done' : 'Estado da tarefa'} onChange={set('status')}>
              <option value="new">New</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="done" disabled={statusBlocked || Boolean(blockingTarget)}>Done</option><option value="cancelled">Cancelled</option>
            </select>
            {statusBlocked && <small>Nao pode ser concluida enquanto existirem dependencias ou itens pendentes.</small>}
          </label>
          <label>Estimativa <small>(minutos)</small>
            <input type="number" min={0} step={1} value={form.estimatedMinutes ?? ''} onChange={set('estimatedMinutes')} placeholder="Sem estimativa" />
          </label>
          <label className="favorite-field">
            <input type="checkbox" checked={form.isFavorite === true} onChange={(event) => setForm((current) => ({ ...current, isFavorite: event.target.checked }))} />
            Favorita
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
              <select aria-label="Hora" value={dueTime ? dueTime.slice(0, 2) : ''} disabled={!dueDate} onChange={(event) => setDueTime(`${event.target.value}:${dueTime.slice(3, 5) || '00'}`)}>
                <option value="">HH</option>
                {HOURS.map((hour) => <option value={hour} key={hour}>{hour}</option>)}
              </select>
              <strong>:</strong>
              <select aria-label="Minuto" value={dueTime ? dueTime.slice(3, 5) : ''} disabled={!dueDate} onChange={(event) => setDueTime(`${dueTime.slice(0, 2) || '00'}:${event.target.value}`)}>
                <option value="">MM</option>
                {MINUTES.map((minute) => <option value={minute} key={minute}>{minute}</option>)}
              </select>
            </span>
            {dueDate && dueTime === '23:59' && <small>Fim do dia por predefinicao</small>}
          </label>
          <div className="full">
            <TagPicker tags={availableTags} selected={form.tags || []} onChange={(tags) => setForm((current) => ({ ...current, tags }))} />
          </div>
          <div className="full">
            <ChecklistEditor items={form.checklistItems || []} onChange={(checklistItems) => setForm((current) => ({ ...current, checklistItems }))} />
          </div>
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
              dialogDescription="Selecione as tarefas que nao poderao avancar ate esta estar concluida."
              emptyText="Nao bloqueia outras tarefas"
            />
          </div>
          <div className="full">
            <RelationPicker
              tasks={tasks}
              currentTaskId={task?.id}
              relations={genericRelations}
              onChange={(relations) => setForm((current) => ({
                ...current,
                relations: [
                  ...(current.relations || []).filter((relation) => ['blocked_by', 'blocks'].includes(relation.type)),
                  ...relations
                ] as TaskRelation[]
              }))}
            />
          </div>
        </div>
        <div className="dialog-actions">
          <span className="draft-status">
            {draftSavedAt ? `Rascunho guardado as ${new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(draftSavedAt))}` : 'A guardar rascunho...'}
          </span>
          {task && <button type="button" className="button secondary" onClick={() => onProgress(task)}>Historico</button>}
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'A guardar...' : task ? 'Guardar alteracoes' : 'Guardar tarefa'}</button>
        </div>
      </form>
    </div>
  );
}

