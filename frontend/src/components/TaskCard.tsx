import type { DragEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';
import type { Task, TaskPriority } from '../../../shared/types';

const PRIORITIES: Record<TaskPriority, string> = { 1: 'Baixa', 2: 'Media', 3: 'Alta', 4: 'Urgente' };

export type TaskCardActions = {
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onPriorityChange: (task: Task, priority: TaskPriority) => void;
  onFavoriteChange: (task: Task, isFavorite: boolean) => void;
  onOpenTask: (task: Task) => void;
  onProgress: (task: Task) => void;
  onAddProgressEntry: (task: Task, message: string) => Promise<boolean>;
  onAddBlocker: (task: Task) => void;
  onCreateCalendarEvent: (task: Task) => void;
  onPostpone: (task: Task) => void;
  onArchive: (task: Task) => void;
  onRestore: (task: Task) => void;
};

type TaskCardProps = TaskCardActions & {
  task: Task;
  allTasks: Task[];
  dragEnabled?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>, task: Task) => void;
  onDragEnd?: () => void;
};

function dateState(task: Task) {
  if (task.isArchived || !task.dueDateTime || ['done', 'cancelled'].includes(task.status)) return null;
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

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, select, input, textarea, a, [draggable="true"]'));
}

function nextPriority(value: number): TaskPriority {
  return Math.min(4, Math.max(1, value)) as TaskPriority;
}

export default function TaskCard({
  task,
  allTasks,
  onEdit,
  onDelete,
  onDuplicate,
  onPriorityChange,
  onFavoriteChange,
  onOpenTask,
  onAddProgressEntry,
  onAddBlocker,
  onCreateCalendarEvent,
  onPostpone,
  onArchive,
  onRestore,
  dragEnabled = false,
  onDragStart,
  onDragEnd
}: TaskCardProps) {
  const [progressMessage, setProgressMessage] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);
  const dependencies = task.blockedByTaskIds.map((id) => allTasks.find((item) => item.id === id)).filter((item): item is Task => Boolean(item));
  const unfinished = dependencies.filter((item) => item.status !== 'done');
  const unfinishedChecklist = (task.checklistItems || []).filter((item) => !item.isDone);
  const blockingItemCount = unfinished.length + unfinishedChecklist.length;
  const blockedDependents = allTasks.filter((candidate) =>
    !['done', 'cancelled'].includes(candidate.status) &&
    candidate.blockedByTaskIds.includes(task.id)
  );
  const isBlocking = task.status !== 'done' && blockedDependents.length > 0;
  const progressEntries = (task.activityLog || []).filter((entry) => entry.type === 'note');
  const latestProgress = progressEntries.at(-1);
  const timing = dateState(task);

  function openFromCard(event: MouseEvent<HTMLElement>) {
    if (isInteractiveTarget(event.target)) return;
    onOpenTask(task);
  }

  function openFromKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onOpenTask(task);
    }
  }

  async function submitProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = progressMessage.trim();
    if (!message || savingProgress) return;
    setSavingProgress(true);
    const saved = await onAddProgressEntry(task, message);
    if (saved) setProgressMessage('');
    setSavingProgress(false);
  }

  return (
    <article
      className={`task-card priority-${task.priority} ${blockingItemCount ? 'is-blocked' : ''} ${task.isArchived ? 'is-archived' : ''}`}
      tabIndex={0}
      aria-label={`Abrir detalhes de ${task.title}`}
      onClick={openFromCard}
      onKeyDown={openFromKeyboard}
    >
      <div className="card-topline">
        {!task.isArchived && <button type="button" className={task.isFavorite ? 'favorite-button active' : 'favorite-button'} title={task.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} aria-label={task.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} onClick={() => onFavoriteChange(task, !task.isFavorite)}>★</button>}
        {task.isArchived && <span className="archived-badge">Arquivada</span>}
        <span className={`priority-badge p${task.priority}`}>{PRIORITIES[task.priority]}</span>
        {timing === 'overdue' && <span className="timing-badge overdue">Atrasada</span>}
        {timing === 'today' && <span className="timing-badge today">Hoje</span>}
        {blockingItemCount > 0 && <span className="blocked-count-badge">{blockingItemCount} bloqueio{blockingItemCount === 1 ? '' : 's'}</span>}
        {isBlocking && (
          <span className="blocking-badge" title={`A bloquear: ${blockedDependents.map((item) => item.title).join(', ')}`}>
            A bloquear {blockedDependents.length}
          </span>
        )}
        {!task.isArchived && <span className="priority-stepper" aria-label="Alterar prioridade">
          <button type="button" disabled={task.priority <= 1} title="Diminuir prioridade" onClick={() => onPriorityChange(task, nextPriority(task.priority - 1))}>−</button>
          <button type="button" disabled={task.priority >= 4} title="Aumentar prioridade" onClick={() => onPriorityChange(task, nextPriority(task.priority + 1))}>+</button>
        </span>}
        {!task.isArchived && dragEnabled && (
          <span
            className="drag-handle"
            draggable="true"
            role="button"
            tabIndex={0}
            title="Arrastar para alterar o estado"
            aria-label={`Arrastar ${task.title}`}
            onDragStart={(event) => onDragStart?.(event, task)}
            onDragEnd={onDragEnd}
          >⠿</span>
        )}
      </div>
      <h3>{task.title}</h3>
      {task.notes && <p className="task-description">{task.notes}</p>}
      <div className="task-meta">
        <span>{task.dueDateTime ? new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(task.dueDateTime)) : 'Sem prazo'}</span>
        {task.estimatedMinutes != null && <span>{task.estimatedMinutes} min</span>}
      </div>
      {(task.checklistItems || []).length > 0 && (
        <div className="card-checklist">
          <div className={unfinishedChecklist.length ? 'checklist-progress blocking' : 'checklist-progress'}>
            <span>Checklist</span>
            <strong>{task.checklistItems.filter((item) => item.isDone).length}/{task.checklistItems.length}{unfinishedChecklist.length ? ` - bloqueia ${unfinishedChecklist.length}` : ''}</strong>
          </div>
          <div className="card-checklist-items">
            {task.checklistItems.map((item) => (
              <div className={item.isDone ? 'done' : ''} key={item.id}>
                <span>{item.isDone ? '✓' : '○'}</span>
                <p>{item.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {task.tags.length > 0 && <div className="tag-list">{task.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      {(task.sharedNotes || []).length > 0 && (
        <div className="card-shared-notes">
          <strong>Notas {task.sharedNotes?.length}</strong>
          {(task.sharedNotes || []).slice(0, 3).map((note) => <span key={note.id}>{note.title}</span>)}
          {(task.sharedNotes || []).length > 3 && <small>+{(task.sharedNotes || []).length - 3}</small>}
        </div>
      )}
      {dependencies.length > 0 && (
        <div className="dependency-summary">
          <strong>{unfinished.length ? `Bloqueada por ${unfinished.length}` : 'Ready'}</strong>
          {dependencies.map((dependency) => (
            <button type="button" className={dependency.status === 'done' ? 'dependency-done' : ''} key={dependency.id} onClick={() => onOpenTask(dependency)}>
              <span>{dependency.status === 'done' ? '✓' : '○'}</span> {dependency.title}
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
      {latestProgress && (
        <div className="latest-progress">
          <strong>Ultimo progresso</strong>
          <span>{latestProgress.message}</span>
        </div>
      )}
      {!task.isArchived && task.status !== 'new' && (
        <form className="card-progress-form" onSubmit={submitProgress}>
          <input
            value={progressMessage}
            maxLength={2000}
            placeholder="Registar progresso..."
            onChange={(event) => setProgressMessage(event.target.value)}
          />
          <button type="submit" className="button secondary small" disabled={!progressMessage.trim() || savingProgress}>
            {savingProgress ? 'A guardar...' : 'Registar'}
          </button>
        </form>
      )}
      <div className="card-actions">
        {task.isArchived ? (
          <button type="button" onClick={() => onRestore(task)}>Restaurar</button>
        ) : (<>
          {timing === 'overdue' && <button type="button" className="postpone-action" onClick={() => onPostpone(task)}>Adiar</button>}
          {!['done', 'cancelled'].includes(task.status) && <button type="button" onClick={() => onAddBlocker(task)}>+ Bloqueio</button>}
          {!(task.calendarEvents || []).length && <button type="button" onClick={() => onCreateCalendarEvent(task)}>Criar evento</button>}
          <button type="button" onClick={() => onDuplicate(task)}>Duplicar</button>
          <button type="button" onClick={() => onArchive(task)}>Arquivar</button>
        </>)}
        <button type="button" className="danger-link" onClick={() => onDelete(task)}>Eliminar</button>
      </div>
    </article>
  );
}
