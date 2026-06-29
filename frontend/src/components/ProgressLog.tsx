import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ActivityLogEntry, Task, TaskStatus } from '../../../shared/types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
  cancelled: 'Cancelled'
};

type ProgressLogProps = {
  task: Task;
  onClose: () => void;
  onAdd: (task: Task, message: string) => Promise<boolean>;
  onEdit: (task: Task, entryId: string, message: string) => Promise<boolean>;
  saving: boolean;
};

function statusLabel(status: TaskStatus | null | undefined) {
  return status ? STATUS_LABELS[status] : '';
}

function entryText(entry: ActivityLogEntry) {
  if (entry.type === 'status') {
    return `Status changed: ${statusLabel(entry.fromStatus)} -> ${statusLabel(entry.toStatus)}`;
  }
  return entry.message;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(date));
}

export default function ProgressLog({ task, onClose, onAdd, onEdit, saving }: ProgressLogProps) {
  const [message, setMessage] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const entries = [...(task.activityLog || [])].reverse();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    const saved = await onAdd(task, value);
    if (saved) setMessage('');
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>, entry: ActivityLogEntry) {
    event.preventDefault();
    const value = editingMessage.trim();
    if (!value) return;
    const saved = await onEdit(task, entry.id, value);
    if (saved) {
      setEditingEntryId(null);
      setEditingMessage('');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog progress-dialog" role="dialog" aria-modal="true" aria-labelledby="progress-title">
        <div className="dialog-header">
          <div>
            <h2 id="progress-title">Progresso</h2>
            <p>{task.title}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>x</button>
        </div>
        {task.status === 'new' ? (
          <div className="progress-locked">Change the task status before logging progress.</div>
        ) : (
          <form className="quick-progress-form" onSubmit={submit}>
            <label htmlFor="progress-message">Nova atualizacao</label>
            <textarea
              id="progress-message"
              autoFocus
              maxLength={2000}
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="O que avancou, o que falta ou que problema surgiu?"
            />
            <div><small>{message.length}/2000</small><button type="submit" className="button primary" disabled={saving || !message.trim()}>{saving ? 'A registar...' : 'Registar progresso'}</button></div>
          </form>
        )}
        <div className="activity-history">
          <h3>Historico <span>{entries.length}</span></h3>
          {entries.map((entry) => (
            <article className={`activity-entry activity-${entry.type}`} key={entry.id}>
              <span className="activity-dot" />
              <div>
                {editingEntryId === entry.id ? (
                  <form className="activity-edit-form" onSubmit={(event) => submitEdit(event, entry)}>
                    <textarea autoFocus maxLength={2000} rows={3} value={editingMessage} onChange={(event) => setEditingMessage(event.target.value)} />
                    <div>
                      <button type="button" className="button ghost small" onClick={() => setEditingEntryId(null)}>Cancelar</button>
                      <button type="submit" className="button primary small" disabled={saving || !editingMessage.trim()}>Guardar</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p>{entryText(entry)}</p>
                    <div className="activity-meta">
                      <time>{formatDate(entry.createdAt)}{entry.editedAt ? ' - Editado' : ''}</time>
                      {entry.type === 'note' && (
                        <button type="button" onClick={() => { setEditingEntryId(entry.id); setEditingMessage(entry.message); }}>Editar</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
          {entries.length === 0 && <p className="empty-message">Ainda nao existem atualizacoes.</p>}
        </div>
      </section>
    </div>
  );
}
