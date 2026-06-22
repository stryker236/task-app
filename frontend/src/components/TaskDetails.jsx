import { useEffect, useMemo, useState } from 'react';
import DependencyPicker from './DependencyPicker';
import RelationPicker, { RELATION_LABELS } from './RelationPicker';
import TagPicker from './TagPicker';

const PRIORITIES = { 1: 'Baixa', 2: 'Média', 3: 'Alta', 4: 'Urgente' };
const STATUS_LABELS = { new: 'New', in_progress: 'In progress', waiting: 'Waiting', done: 'Done', cancelled: 'Cancelled' };
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

function localDeadline(value) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export default function TaskDetails({ task, allTasks, availableTags, onClose, onChange, onOpenTask, onProgress, onArchive, onRestore, onToggleChecklist }) {
  const [draft, setDraft] = useState(task);
  const [dueDate, setDueDate] = useState(() => localDeadline(task.dueDateTime).date);
  const [dueTime, setDueTime] = useState(() => localDeadline(task.dueDateTime).time);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [savingField, setSavingField] = useState('');
  const dependencies = (draft.blockedByTaskIds || []).map((id) => allTasks.find((item) => item.id === id)).filter(Boolean);
  const unfinishedDependencies = dependencies.filter((item) => item.status !== 'done');
  const unfinishedChecklist = (draft.checklistItems || []).filter((item) => !item.isDone);
  const statusBlocked = unfinishedDependencies.length > 0 || unfinishedChecklist.length > 0;
  const blockedTaskIds = allTasks.filter((item) => (item.blockedByTaskIds || []).includes(task.id)).map((item) => item.id);
  const genericRelations = (draft.relations || []).filter((relation) => RELATION_LABELS[relation.type]);
  const activity = [...(draft.activityLog || [])].reverse();
  const draftKey = `task-app:view-draft:${task.id}`;

  useEffect(() => {
    let next = task;
    try {
      const stored = JSON.parse(localStorage.getItem(`task-app:view-draft:${task.id}`));
      if (stored?.baseUpdatedAt === task.updatedAt) next = { ...task, ...stored.fields };
    } catch { /* Ignore an invalid local draft. */ }
    setDraft(next);
    const deadline = localDeadline(next.dueDateTime);
    setDueDate(deadline.date);
    setDueTime(deadline.time);
  }, [task]);

  useEffect(() => {
    if (task.isArchived) return;
    localStorage.setItem(draftKey, JSON.stringify({
      baseUpdatedAt: task.updatedAt,
      fields: { title: draft.title, notes: draft.notes, estimatedMinutes: draft.estimatedMinutes }
    }));
  }, [draft.title, draft.notes, draft.estimatedMinutes, draftKey, task.isArchived, task.updatedAt]);

  async function commit(field, changes) {
    if (task.isArchived) return;
    setDraft((current) => ({ ...current, ...changes }));
    setSavingField(field);
    const updated = await onChange(task, changes);
    if (updated) {
      setDraft(updated);
      localStorage.removeItem(draftKey);
    } else {
      setDraft(task);
    }
    setSavingField('');
  }

  function saveDeadline() {
    const dueDateTime = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}`).toISOString() : null;
    commit('dueDateTime', { dueDateTime });
  }

  const savingText = useMemo(() => savingField ? 'A guardar…' : 'Alterações guardadas por campo', [savingField]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog task-details-dialog editable-details" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div className="details-title-wrap">
            {task.isArchived
              ? <h2>{draft.title}</h2>
              : <input className="details-title-input" value={draft.title} maxLength="200" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} onBlur={() => draft.title.trim() && draft.title !== task.title && commit('title', { title: draft.title })} />}
            <p>{task.isArchived ? `Arquivada em ${formatDate(task.archivedAt)}` : savingText}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button>
        </div>

        <div className="task-details-content">
          <section className="details-summary-grid editable-summary">
            <label><span>Status</span><select disabled={task.isArchived} value={draft.status} title={statusBlocked ? 'Conclua os bloqueios antes de marcar como Done' : 'Estado da tarefa'} onChange={(event) => commit('status', { status: event.target.value })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} disabled={value === 'done' && statusBlocked} key={value}>{label}</option>)}</select></label>
            <label><span>Prioridade</span><select disabled={task.isArchived} value={draft.priority} onChange={(event) => commit('priority', { priority: Number(event.target.value) })}>{Object.entries(PRIORITIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Estimativa</span><input disabled={task.isArchived} type="number" min="0" value={draft.estimatedMinutes ?? ''} placeholder="Minutos" onChange={(event) => setDraft((current) => ({ ...current, estimatedMinutes: event.target.value }))} onBlur={() => commit('estimatedMinutes', { estimatedMinutes: draft.estimatedMinutes === '' ? null : Number(draft.estimatedMinutes) })} /></label>
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

          <section className="details-section">
            <h3>Notas</h3>
            {task.isArchived
              ? <p className="details-description">{draft.notes || 'Sem notas.'}</p>
              : <textarea className="details-notes-input" rows="6" maxLength="50000" value={draft.notes || ''} placeholder="Adicionar notas…" onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} onBlur={() => draft.notes !== task.notes && commit('notes', { notes: draft.notes })} />}
          </section>

          <section className="details-section">
            <h3>Tags <span>{(draft.tags || []).length}</span></h3>
            {task.isArchived
              ? ((draft.tags || []).length ? <div className="tag-list details-tags">{draft.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : <p className="details-empty">Sem tags.</p>)
              : <TagPicker tags={availableTags} selected={draft.tags || []} onChange={(tags) => commit('tags', { tags })} />}
          </section>

          <section className="details-section">
            <h3>Checklist <span>{(draft.checklistItems || []).filter((item) => item.isDone).length}/{(draft.checklistItems || []).length}</span></h3>
            {(draft.checklistItems || []).length ? <div className="details-checklist">{draft.checklistItems.map((item, index) => <div className={item.isDone ? 'done' : ''} key={item.id}><input type="checkbox" checked={item.isDone} disabled={task.isArchived} onChange={(event) => onToggleChecklist(task, item, event.target.checked)} />{task.isArchived ? <p>{item.title}</p> : <input className="checklist-title-inline" value={item.title} maxLength="300" onChange={(event) => setDraft((current) => ({ ...current, checklistItems: current.checklistItems.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry) }))} onBlur={() => commit('checklistItems', { checklistItems: draft.checklistItems })} />} {!task.isArchived && <button type="button" className="inline-remove" onClick={() => commit('checklistItems', { checklistItems: draft.checklistItems.filter((entry) => entry.id !== item.id) })}>×</button>}</div>)}</div> : <p className="details-empty">Sem itens.</p>}
            {!task.isArchived && <div className="inline-add-row"><input value={newChecklistTitle} maxLength="300" placeholder="Novo item…" onChange={(event) => setNewChecklistTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && newChecklistTitle.trim()) { event.preventDefault(); commit('checklistItems', { checklistItems: [...(draft.checklistItems || []), { title: newChecklistTitle.trim(), isDone: false }] }); setNewChecklistTitle(''); } }} /><button type="button" className="button secondary small" disabled={!newChecklistTitle.trim()} onClick={() => { commit('checklistItems', { checklistItems: [...(draft.checklistItems || []), { title: newChecklistTitle.trim(), isDone: false }] }); setNewChecklistTitle(''); }}>Adicionar</button></div>}
          </section>

          {!task.isArchived && <div className="details-relations-grid">
            <section className="details-section"><DependencyPicker tasks={allTasks} selectedIds={draft.blockedByTaskIds || []} currentTaskId={task.id} onOpenTask={onOpenTask} onChange={(blockedByTaskIds) => commit('blockedByTaskIds', { blockedByTaskIds })} /></section>
            <section className="details-section"><DependencyPicker tasks={allTasks} selectedIds={blockedTaskIds} currentTaskId={task.id} onOpenTask={onOpenTask} onChange={(blocksTaskIds) => commit('blocksTaskIds', { blocksTaskIds })} label="Esta tarefa bloqueia" buttonLabel="+ Adicionar" emptyText="Não bloqueia outras tarefas" /></section>
          </div>}

          {!task.isArchived && <section className="details-section"><RelationPicker tasks={allTasks} currentTaskId={task.id} relations={genericRelations} onOpenTask={onOpenTask} onChange={(relations) => commit('relations', { relations: [...(draft.relations || []).filter((relation) => !RELATION_LABELS[relation.type]), ...relations] })} /></section>}

          <section className="details-section">
            <h3>Histórico <span>{activity.length}</span></h3>
            <div className="details-activity">{activity.map((entry) => <article key={entry.id}><span className={`activity-dot activity-dot-${entry.type}`} /><div><p>{entry.message}</p><time>{formatDate(entry.createdAt)}{entry.editedAt ? ' · Editado' : ''}</time></div></article>)}</div>
          </section>
        </div>

        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={() => onProgress(task)}>Abrir histórico</button>
          {task.isArchived ? <button type="button" className="button primary" onClick={() => onRestore(task)}>Restaurar</button> : <button type="button" className="button secondary" onClick={() => onArchive(task)}>Arquivar</button>}
          <button type="button" className="button primary" onClick={onClose}>Fechar</button>
        </div>
      </section>
    </div>
  );
}
