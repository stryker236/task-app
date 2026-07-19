import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { ActivityLogEntry, ChecklistItem, SharedNote, Tag, Task, TaskInput, TaskPriority, TaskRelation, TaskStatus } from '../../../shared/types';
import { getSchedulerRules, getSharedNotes, type SchedulerRule } from '../api';
import { activeCalendarEvents, nextScheduledEvent, reviewedCalendarEvents } from '../utils/taskScheduling';
import DependencyPicker from './DependencyPicker';
import RelationPicker, { RELATION_LABELS } from './RelationPicker';
import TagPicker from './TagPicker';

const PRIORITIES: Record<TaskPriority, string> = { 1: 'Baixa', 2: 'Media', 3: 'Alta', 4: 'Urgente' };
const STATUS_LABELS: Record<TaskStatus, string> = { new: 'New', in_progress: 'In progress', waiting: 'Waiting', done: 'Done', cancelled: 'Cancelled' };
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

type EditableChecklistItem = Partial<ChecklistItem> & {
  title: string;
  isDone: boolean;
};

type EditableTask = Omit<Task, 'estimatedMinutes' | 'checklistItems'> & {
  estimatedMinutes: number | string | null;
  checklistItems: EditableChecklistItem[];
};

export type TaskDetailsChange = Omit<Partial<TaskInput>, 'checklistItems' | 'relations'> & {
  blocksTaskIds?: string[];
  checklistItems?: EditableChecklistItem[];
  relations?: TaskRelation[];
};

type TaskDetailsProps = {
  task: Task;
  allTasks: Task[];
  availableTags: Tag[];
  onClose: () => void;
  onChange: (task: Task, changes: TaskDetailsChange) => Promise<Task | null> | Task | null;
  onOpenTask: (task: Task) => void;
  onProgress: (task: Task) => void;
  onArchive: (task: Task) => void;
  onRestore: (task: Task) => void;
  onToggleChecklist: (task: Task, item: ChecklistItem, isDone: boolean) => void;
  onAddProgressEntry: (task: Task, message: string) => Promise<Task | null>;
  onEditProgressEntry: (task: Task, entryId: string, message: string) => Promise<Task | null>;
  onAttachSharedNote: (task: Task, noteId: string) => Promise<Task | null>;
  onCreateSharedNote: (task: Task, title: string, body: string, tags: string[]) => Promise<Task | null>;
  onDetachSharedNote: (task: Task, noteId: string) => Promise<Task | null>;
  onOpenSharedNote: (note: SharedNote) => void;
  onCreateCalendarEvent: (task: Task) => void;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

function localDeadline(value?: string | null) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

function editableTaskFromTask(task: Task): EditableTask {
  return {
    ...task,
    checklistItems: task.checklistItems || []
  };
}

function stopDialogMouseDown(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function constraintAppliesToTask(constraint: { scope?: Record<string, unknown> }, task: Task) {
  const scope = constraint.scope || {};
  const keys = Object.keys(scope).filter((key) => {
    const value = scope[key];
    return !(Array.isArray(value) && value.length === 0) && value !== false && value != null;
  });
  if (!keys.length || scope.allTasks === true) return true;
  const tags = arrayValue(scope.tags);
  if (tags.length && !tags.some((tag) => task.tags.includes(tag))) return false;
  const titleIncludes = arrayValue(scope.titleIncludes).map((item) => item.toLocaleLowerCase());
  if (titleIncludes.length && !titleIncludes.some((item) => task.title.toLocaleLowerCase().includes(item))) return false;
  const taskIds = arrayValue(scope.taskIds);
  if (taskIds.length && !taskIds.includes(task.id)) return false;
  const statuses = arrayValue(scope.statuses);
  if (statuses.length && !statuses.includes(task.status)) return false;
  const priorities = Array.isArray(scope.priorities) ? scope.priorities.map(Number) : [];
  if (priorities.length && !priorities.includes(task.priority)) return false;
  return true;
}

function formatConstraintPayload(payload?: Record<string, unknown>) {
  const entries = Object.entries(payload || {});
  if (!entries.length) return 'Sem parametros';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

function formatMinutes(value?: number | null) {
  if (value == null) return '-';
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function numericMinutes(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) ? minutes : null;
}

function activityText(entry: ActivityLogEntry) {
  if (entry.type === 'status') {
    return `Status changed from ${entry.fromStatus || ''} to ${entry.toStatus || ''}`;
  }
  return entry.message;
}

export default function TaskDetails({
  task,
  allTasks,
  availableTags,
  onClose,
  onChange,
  onOpenTask,
  onProgress,
  onArchive,
  onRestore,
  onToggleChecklist,
  onAddProgressEntry,
  onEditProgressEntry,
  onAttachSharedNote,
  onCreateSharedNote,
  onDetachSharedNote,
  onOpenSharedNote,
  onCreateCalendarEvent
}: TaskDetailsProps) {
  const [draft, setDraft] = useState<EditableTask>(() => editableTaskFromTask(task));
  const [dueDate, setDueDate] = useState(() => localDeadline(task.dueDateTime).date);
  const [dueTime, setDueTime] = useState(() => localDeadline(task.dueDateTime).time);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [availableSharedNotes, setAvailableSharedNotes] = useState<SharedNote[]>([]);
  const [schedulerRules, setSchedulerRules] = useState<SchedulerRule[]>([]);
  const [sharedNoteSearch, setSharedNoteSearch] = useState('');
  const [newSharedNoteTitle, setNewSharedNoteTitle] = useState('');
  const [newSharedNoteBody, setNewSharedNoteBody] = useState('');
  const [newSharedNoteTags, setNewSharedNoteTags] = useState('');
  const [newProgressMessage, setNewProgressMessage] = useState('');
  const [editingEntryId, setEditingEntryId] = useState('');
  const [editingEntryMessage, setEditingEntryMessage] = useState('');
  const [savingField, setSavingField] = useState('');
  const dependencies = (draft.blockedByTaskIds || []).map((id) => allTasks.find((item) => item.id === id)).filter((item): item is Task => Boolean(item));
  const unfinishedDependencies = dependencies.filter((item) => item.status !== 'done');
  const unfinishedChecklist = (draft.checklistItems || []).filter((item) => !item.isDone);
  const statusBlocked = unfinishedDependencies.length > 0 || unfinishedChecklist.length > 0;
  const blockedTaskIds = allTasks.filter((item) => (item.blockedByTaskIds || []).includes(task.id)).map((item) => item.id);
  const genericRelations = (draft.relations || []).filter((relation) => relation.type in RELATION_LABELS) as Array<TaskRelation & { type: keyof typeof RELATION_LABELS }>;
  const activity = [...(draft.activityLog || [])].reverse();
  const linkedSharedNotes = draft.sharedNotes || [];
  const scheduledEvent = nextScheduledEvent(draft);
  const activeEvents = activeCalendarEvents(draft);
  const reviewedEvents = reviewedCalendarEvents(draft);
  const workSessions = [...(draft.workSessions || [])].sort((a, b) => Date.parse(a.plannedStartAt) - Date.parse(b.plannedStartAt));
  const completedWorkMinutes = draft.completedWorkMinutes || 0;
  const plannedFutureWorkMinutes = draft.plannedFutureWorkMinutes || 0;
  const remainingWorkMinutes = draft.remainingWorkMinutes ?? numericMinutes(draft.estimatedMinutes);
  const applicableRules = schedulerRules.map((rule) => ({
    ...rule,
    constraints: rule.constraints.filter((constraint) => constraint.enabled && constraintAppliesToTask(constraint, draft as Task))
  })).filter((rule) => rule.constraints.length);
  const attachableSharedNotes = availableSharedNotes.filter((note) => !linkedSharedNotes.some((linked) => linked.id === note.id));
  const visibleAttachableSharedNotes = attachableSharedNotes.filter((note) => {
    const term = sharedNoteSearch.trim().toLocaleLowerCase();
    if (!term) return true;
    return note.title.toLocaleLowerCase().includes(term)
      || note.body.toLocaleLowerCase().includes(term)
      || note.tags.some((tag) => tag.toLocaleLowerCase().includes(term));
  });
  const draftKey = `task-app:view-draft:${task.id}`;

  useEffect(() => {
    let next = editableTaskFromTask(task);
    try {
      const stored = JSON.parse(localStorage.getItem(`task-app:view-draft:${task.id}`) || 'null');
      if (stored?.baseUpdatedAt === task.updatedAt) next = { ...next, ...stored.fields };
    } catch {
      // Ignore invalid local drafts.
    }
    setDraft(next);
    const deadline = localDeadline(next.dueDateTime);
    setDueDate(deadline.date);
    setDueTime(deadline.time);
  }, [task]);

  useEffect(() => {
    let ignore = false;
    getSharedNotes()
      .then((notes) => {
        if (!ignore) setAvailableSharedNotes(notes);
      })
      .catch(() => {
        if (!ignore) setAvailableSharedNotes([]);
      });
    return () => {
      ignore = true;
    };
  }, [task.id]);
  useEffect(() => {
    let ignore = false;
    getSchedulerRules()
      .then((rules) => {
        if (!ignore) setSchedulerRules(rules.filter((rule) => rule.enabled && rule.status === 'active'));
      })
      .catch(() => {
        if (!ignore) setSchedulerRules([]);
      });
    return () => {
      ignore = true;
    };
  }, [task.id]);

  useEffect(() => {
    if (task.isArchived) return;
    localStorage.setItem(draftKey, JSON.stringify({
      baseUpdatedAt: task.updatedAt,
      fields: { title: draft.title, notes: draft.notes, estimatedMinutes: draft.estimatedMinutes }
    }));
  }, [draft.title, draft.notes, draft.estimatedMinutes, draftKey, task.isArchived, task.updatedAt]);

  async function commit(field: string, changes: TaskDetailsChange) {
    if (task.isArchived) return;
    setDraft((current) => ({ ...current, ...changes }));
    setSavingField(field);
    const updated = await onChange(task, changes);
    if (updated) {
      setDraft(editableTaskFromTask(updated));
      localStorage.removeItem(draftKey);
    } else {
      setDraft(editableTaskFromTask(task));
    }
    setSavingField('');
  }

  function saveDeadline() {
    const dueDateTime = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}`).toISOString() : null;
    commit('dueDateTime', { dueDateTime });
  }

  async function attachSharedNote(noteId: string) {
    setSavingField('sharedNotes');
    const updated = await onAttachSharedNote(task, noteId);
    if (updated) {
      setDraft(editableTaskFromTask(updated));
      setSharedNoteSearch('');
    }
    setSavingField('');
  }

  async function createSharedNote() {
    if (!newSharedNoteTitle.trim()) return;
    setSavingField('sharedNotes');
    const tags = [...new Set(newSharedNoteTags.split(',').map((tag) => tag.trim()).filter(Boolean))];
    const updated = await onCreateSharedNote(task, newSharedNoteTitle.trim(), newSharedNoteBody.trim(), tags);
    if (updated) {
      setDraft(editableTaskFromTask(updated));
      setNewSharedNoteTitle('');
      setNewSharedNoteBody('');
      setNewSharedNoteTags('');
      setAvailableSharedNotes(await getSharedNotes().catch(() => []));
    }
    setSavingField('');
  }

  async function detachSharedNote(noteId: string) {
    setSavingField('sharedNotes');
    const updated = await onDetachSharedNote(task, noteId);
    if (updated) setDraft(editableTaskFromTask(updated));
    setSavingField('');
  }

  async function addProgressEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = newProgressMessage.trim();
    if (!message || task.status === 'new' || task.isArchived) return;
    setSavingField('progress');
    const updated = await onAddProgressEntry(task, message);
    if (updated) {
      setDraft(editableTaskFromTask(updated));
      setNewProgressMessage('');
    }
    setSavingField('');
  }

  async function saveProgressEntryEdit(event: FormEvent<HTMLFormElement>, entry: ActivityLogEntry) {
    event.preventDefault();
    const message = editingEntryMessage.trim();
    if (!message || task.isArchived) return;
    setSavingField('progress');
    const updated = await onEditProgressEntry(task, entry.id, message);
    if (updated) {
      setDraft(editableTaskFromTask(updated));
      setEditingEntryId('');
      setEditingEntryMessage('');
    }
    setSavingField('');
  }

  const savingText = useMemo(() => savingField ? 'A guardar...' : 'Alteracoes guardadas por campo', [savingField]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog task-details-dialog editable-details" role="dialog" aria-modal="true" onMouseDown={stopDialogMouseDown}>
        <div className="dialog-header">
          <div className="details-title-wrap">
            {task.isArchived
              ? <h2>{draft.title}</h2>
              : <input className="details-title-input" value={draft.title} maxLength={200} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} onBlur={() => draft.title.trim() && draft.title !== task.title && commit('title', { title: draft.title })} />}
            <p>{task.isArchived ? `Arquivada em ${formatDate(task.archivedAt)}` : savingText}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>x</button>
        </div>

        <div className="task-details-content">
          <section className="details-summary-grid editable-summary">
            <label><span>Status</span><select disabled={task.isArchived} value={draft.status} title={statusBlocked ? 'Conclua os bloqueios antes de marcar como Done' : 'Estado da tarefa'} onChange={(event) => commit('status', { status: event.target.value as TaskStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} disabled={value === 'done' && statusBlocked} key={value}>{label}</option>)}</select></label>
            <label><span>Prioridade</span><select disabled={task.isArchived} value={draft.priority} onChange={(event) => commit('priority', { priority: Number(event.target.value) as TaskPriority })}>{Object.entries(PRIORITIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Estimativa</span><input disabled={task.isArchived} type="number" min={0} value={draft.estimatedMinutes ?? ''} placeholder="Minutos" onChange={(event) => setDraft((current) => ({ ...current, estimatedMinutes: event.target.value }))} onBlur={() => commit('estimatedMinutes', { estimatedMinutes: draft.estimatedMinutes === '' ? null : Number(draft.estimatedMinutes) })} /></label>
            <label className="details-favorite"><span>Favorita</span><input disabled={task.isArchived} type="checkbox" checked={draft.isFavorite === true} onChange={(event) => commit('isFavorite', { isFavorite: event.target.checked })} /></label>
            <div><span>Criada</span><strong>{formatDate(draft.createdAt)}</strong></div>
            <div><span>Atualizada</span><strong>{formatDate(draft.updatedAt)}</strong></div>
          </section>

          <section className="details-section details-deadline">
            <h3>Prazo</h3>
            <div>
              <input disabled={task.isArchived} type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); if (event.target.value && !dueTime) setDueTime('23:59'); }} />
              <select disabled={task.isArchived || !dueDate} value={dueTime.slice(0, 2)} onChange={(event) => setDueTime(`${event.target.value}:${dueTime.slice(3, 5) || '00'}`)}><option value="">HH</option>{HOURS.map((hour) => <option value={hour} key={hour}>{hour}</option>)}</select>
              <strong>:</strong>
              <select disabled={task.isArchived || !dueDate} value={dueTime.slice(3, 5)} onChange={(event) => setDueTime(`${dueTime.slice(0, 2) || '00'}:${event.target.value}`)}><option value="">MM</option>{MINUTES.map((minute) => <option value={minute} key={minute}>{minute}</option>)}</select>
              {!task.isArchived && <button type="button" className="button secondary small" onClick={saveDeadline}>Guardar prazo</button>}
            </div>
          </section>

          <section className="details-section details-calendar-events">
            <h3>Scheduling <span>{activeEvents.length ? 'scheduled' : 'not scheduled'}</span></h3>
            {scheduledEvent ? (
              <div className="task-calendar-links">
                <a href={scheduledEvent.htmlLink || undefined} target={scheduledEvent.htmlLink ? '_blank' : undefined} rel={scheduledEvent.htmlLink ? 'noreferrer' : undefined}>
                  <strong>{scheduledEvent.summary}</strong>
                  <span>{formatDate(scheduledEvent.start)} - {formatDate(scheduledEvent.end)}</span>
                  <small>{scheduledEvent.calendarId}</small>
                </a>
              </div>
            ) : <p className="details-empty">Sem evento ativo ligado.</p>}
            {reviewedEvents.length > 0 && (
              <details className="task-calendar-history">
                <summary>Historico de eventos ({reviewedEvents.length})</summary>
                <div className="task-calendar-links">
                  {reviewedEvents.map((event) => (
                    <a href={event.htmlLink || undefined} target={event.htmlLink ? '_blank' : undefined} rel={event.htmlLink ? 'noreferrer' : undefined} key={event.id}>
                      <strong>{event.summary}</strong>
                      <span>{formatDate(event.start)} - {formatDate(event.end)}</span>
                      <small>{event.reviewStatus}{event.reviewNote ? ` - ${event.reviewNote}` : ''}</small>
                    </a>
                  ))}
                </div>
              </details>
            )}
            {!task.isArchived && !scheduledEvent && (
              <button type="button" className="button secondary small" onClick={() => onCreateCalendarEvent(task)}>
                Criar evento
              </button>
            )}
          </section>

          <section className="details-section details-work-sessions">
            <h3>Work sessions <span>{workSessions.length}</span></h3>
            <div className="work-session-metrics">
              <div><span>Estimado</span><strong>{formatMinutes(numericMinutes(draft.estimatedMinutes))}</strong></div>
              <div><span>Feito</span><strong>{formatMinutes(completedWorkMinutes)}</strong></div>
              <div><span>Planeado futuro</span><strong>{formatMinutes(plannedFutureWorkMinutes)}</strong></div>
              <div><span>Restante</span><strong>{formatMinutes(remainingWorkMinutes)}</strong></div>
            </div>
            {workSessions.length ? (
              <div className="work-session-list">
                {workSessions.map((session) => {
                  const linkedEvent = (draft.calendarEvents || []).find((event) => event.id === session.taskCalendarEventId);
                  return (
                    <article key={session.id}>
                      <div>
                        <strong>{session.status}</strong>
                        <span>{formatDate(session.plannedStartAt)} - {formatDate(session.plannedEndAt)}</span>
                        <small>{formatMinutes(session.completedMinutes)} feito de {formatMinutes(session.plannedMinutes)}</small>
                        {session.note && <small>{session.note}</small>}
                      </div>
                      {linkedEvent?.htmlLink && <a className="button secondary small" href={linkedEvent.htmlLink} target="_blank" rel="noreferrer">Abrir evento</a>}
                    </article>
                  );
                })}
              </div>
            ) : <p className="details-empty">Sem sessoes de trabalho registadas.</p>}
          </section>

          <section className="details-section details-scheduler-rules">
            <h3>Regras de scheduling <span>{applicableRules.length}</span></h3>
            {applicableRules.length ? (
              <div className="scheduler-rule-links">
                {applicableRules.map((rule) => (
                  <article key={rule.id}>
                    <strong>{rule.text}</strong>
                    <p>{rule.interpretation || 'Sem interpretacao.'}</p>
                    {rule.constraints.map((constraint) => (
                      <small key={constraint.id}>{constraint.type} - {constraint.hard ? 'hard' : 'soft'} - {formatConstraintPayload(constraint.payload)}</small>
                    ))}
                  </article>
                ))}
              </div>
            ) : <p className="details-empty">Sem regras aplicaveis.</p>}
          </section>
          <section className="details-section">
            <h3>Notas</h3>
            {task.isArchived
              ? <p className="details-description">{draft.notes || 'Sem notas.'}</p>
              : <textarea className="details-notes-input" rows={6} maxLength={50000} value={draft.notes || ''} placeholder="Adicionar notas..." onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} onBlur={() => draft.notes !== task.notes && commit('notes', { notes: draft.notes })} />}
          </section>

          <section className="details-section shared-notes-section">
            <h3>Notas partilhadas <span>{linkedSharedNotes.length}</span></h3>
            {linkedSharedNotes.length ? (
              <div className="task-note-references">
                {linkedSharedNotes.map((note) => (
                  <span className="task-note-reference" key={note.id}>
                    <button type="button" onClick={() => onOpenSharedNote(note)}>{note.title}</button>
                    {!task.isArchived && <button type="button" aria-label={`Remover ${note.title}`} onClick={() => detachSharedNote(note.id)}>x</button>}
                  </span>
                ))}
              </div>
            ) : <p className="details-empty">Sem notas partilhadas.</p>}
            {!task.isArchived && (
              <div className="shared-notes-controls">
                <details className="task-note-attach">
                  <summary>Anexar nota existente</summary>
                  <input value={sharedNoteSearch} placeholder="Pesquisar nota por titulo, texto ou tag..." onChange={(event) => setSharedNoteSearch(event.target.value)} />
                  {visibleAttachableSharedNotes.length ? (
                    <div className="task-note-options">
                      {visibleAttachableSharedNotes.map((note) => (
                        <article key={note.id}>
                          <div>
                            <strong>{note.title}</strong>
                            {note.body ? <p>{note.body}</p> : <p className="details-empty">Sem conteudo.</p>}
                            {note.tags.length ? <div className="tag-list shared-note-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
                          </div>
                          <button type="button" className="button secondary small" disabled={savingField === 'sharedNotes'} onClick={() => attachSharedNote(note.id)}>Anexar</button>
                        </article>
                      ))}
                    </div>
                  ) : <p className="details-empty">{attachableSharedNotes.length ? 'Sem notas para essa pesquisa.' : 'Todas as notas disponiveis ja estao associadas.'}</p>}
                </details>
                <div className="shared-note-create">
                  <input value={newSharedNoteTitle} maxLength={200} placeholder="Titulo da nota partilhada" onChange={(event) => setNewSharedNoteTitle(event.target.value)} />
                  <textarea rows={3} maxLength={50000} value={newSharedNoteBody} placeholder="Conteudo reutilizavel..." onChange={(event) => setNewSharedNoteBody(event.target.value)} />
                  <input value={newSharedNoteTags} maxLength={500} placeholder="Tags separadas por virgula" onChange={(event) => setNewSharedNoteTags(event.target.value)} />
                  <button type="button" className="button secondary small" disabled={!newSharedNoteTitle.trim() || savingField === 'sharedNotes'} onClick={createSharedNote}>Criar e anexar</button>
                </div>
              </div>
            )}
          </section>

          <section className="details-section">
            <h3>Tags <span>{(draft.tags || []).length}</span></h3>
            {task.isArchived
              ? ((draft.tags || []).length ? <div className="tag-list details-tags">{draft.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : <p className="details-empty">Sem tags.</p>)
              : <TagPicker tags={availableTags} selected={draft.tags || []} onChange={(tags) => commit('tags', { tags })} />}
          </section>

          <section className="details-section">
            <h3>Checklist <span>{(draft.checklistItems || []).filter((item) => item.isDone).length}/{(draft.checklistItems || []).length}</span></h3>
            {(draft.checklistItems || []).length ? <div className="details-checklist">{draft.checklistItems.map((item, index) => <div className={item.isDone ? 'done' : ''} key={item.id || index}><input type="checkbox" checked={item.isDone} disabled={task.isArchived || !item.id} onChange={(event) => item.id && onToggleChecklist(task, item as ChecklistItem, event.target.checked)} />{task.isArchived ? <p>{item.title}</p> : <input className="checklist-title-inline" value={item.title} maxLength={300} onChange={(event) => setDraft((current) => ({ ...current, checklistItems: current.checklistItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry) }))} onBlur={() => commit('checklistItems', { checklistItems: draft.checklistItems })} />} {!task.isArchived && <button type="button" className="inline-remove" onClick={() => commit('checklistItems', { checklistItems: draft.checklistItems.filter((entry) => entry.id !== item.id) })}>x</button>}</div>)}</div> : <p className="details-empty">Sem itens.</p>}
            {!task.isArchived && <div className="inline-add-row"><input value={newChecklistTitle} maxLength={300} placeholder="Novo item..." onChange={(event) => setNewChecklistTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && newChecklistTitle.trim()) { event.preventDefault(); commit('checklistItems', { checklistItems: [...(draft.checklistItems || []), { title: newChecklistTitle.trim(), isDone: false }] }); setNewChecklistTitle(''); } }} /><button type="button" className="button secondary small" disabled={!newChecklistTitle.trim()} onClick={() => { commit('checklistItems', { checklistItems: [...(draft.checklistItems || []), { title: newChecklistTitle.trim(), isDone: false }] }); setNewChecklistTitle(''); }}>Adicionar</button></div>}
          </section>

          {!task.isArchived && <div className="details-relations-grid">
            <section className="details-section"><DependencyPicker tasks={allTasks} selectedIds={draft.blockedByTaskIds || []} currentTaskId={task.id} onOpenTask={onOpenTask} onChange={(blockedByTaskIds) => commit('blockedByTaskIds', { blockedByTaskIds })} /></section>
            <section className="details-section"><DependencyPicker tasks={allTasks} selectedIds={blockedTaskIds} currentTaskId={task.id} onOpenTask={onOpenTask} onChange={(blocksTaskIds) => commit('blocksTaskIds', { blocksTaskIds })} label="Esta tarefa bloqueia" buttonLabel="+ Adicionar" emptyText="Nao bloqueia outras tarefas" /></section>
          </div>}

          {!task.isArchived && <section className="details-section"><RelationPicker tasks={allTasks} currentTaskId={task.id} relations={genericRelations} onOpenTask={onOpenTask} onChange={(relations) => commit('relations', { relations: [...(draft.relations || []).filter((relation) => !(relation.type in RELATION_LABELS)), ...relations] as TaskRelation[] })} /></section>}

          <section className="details-section">
            <h3>Historico <span>{activity.length}</span></h3>
            {!task.isArchived && task.status !== 'new' && (
              <form className="details-progress-form" onSubmit={addProgressEntry}>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={newProgressMessage}
                  placeholder="Nova entrada no historico..."
                  onChange={(event) => setNewProgressMessage(event.target.value)}
                />
                <div>
                  <small>{newProgressMessage.length}/2000</small>
                  <button type="submit" className="button primary small" disabled={savingField === 'progress' || !newProgressMessage.trim()}>
                    Registar
                  </button>
                </div>
              </form>
            )}
            {task.status === 'new' && !task.isArchived && <p className="details-empty">Muda o estado da task antes de registar progresso.</p>}
            <div className="details-activity">{activity.map((entry) => <article key={entry.id}><span className={`activity-dot activity-dot-${entry.type}`} /><div>
              {editingEntryId === entry.id ? (
                <form className="details-progress-edit" onSubmit={(event) => saveProgressEntryEdit(event, entry)}>
                  <textarea autoFocus rows={3} maxLength={2000} value={editingEntryMessage} onChange={(event) => setEditingEntryMessage(event.target.value)} />
                  <div>
                    <button type="button" className="button ghost small" onClick={() => { setEditingEntryId(''); setEditingEntryMessage(''); }}>Cancelar</button>
                    <button type="submit" className="button primary small" disabled={savingField === 'progress' || !editingEntryMessage.trim()}>Guardar</button>
                  </div>
                </form>
              ) : (
                <>
                  <p>{activityText(entry)}</p>
                  <div className="activity-meta">
                    <time>{formatDate(entry.createdAt)}{entry.editedAt ? ' - Editado' : ''}</time>
                    {!task.isArchived && entry.type === 'note' && <button type="button" onClick={() => { setEditingEntryId(entry.id); setEditingEntryMessage(entry.message); }}>Editar</button>}
                  </div>
                </>
              )}
            </div></article>)}</div>
          </section>
        </div>

        <div className="dialog-actions">
          {task.isArchived ? <button type="button" className="button primary" onClick={() => onRestore(task)}>Restaurar</button> : <button type="button" className="button secondary" onClick={() => onArchive(task)}>Arquivar</button>}
          <button type="button" className="button primary" onClick={onClose}>Fechar</button>
        </div>
      </section>
    </div>
  );
}
