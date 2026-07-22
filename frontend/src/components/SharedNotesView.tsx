import { useEffect, useMemo, useState } from 'react';
import type { SharedNote, Task } from '../../../shared/types';
import { archiveSharedNote, attachSharedNoteToTask, createSharedNote, detachSharedNoteFromTask, getSharedNotes, updateSharedNote } from '../features/shared-notes/api';

type SharedNotesViewProps = {
  allTasks: Task[];
  onOpenTask: (task: Task) => void;
  onError: (message: string) => void;
  onTasksChanged: () => Promise<void>;
  focusedNoteId: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value));
}

function parseTags(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function fitTextareaToContent(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export default function SharedNotesView({ allTasks, onOpenTask, onError, onTasksChanged, focusedNoteId }: SharedNotesViewProps) {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTags, setNewTags] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string; tags: string }>>({});
  const [taskSearchByNote, setTaskSearchByNote] = useState<Record<string, string>>({});

  const tasksById = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks]);
  const linkableTasks = useMemo(() => allTasks.filter((task) => !task.isArchived), [allTasks]);

  const filteredNotes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return notes;
    return notes.filter((note) => {
      const linkedTasks = (note.linkedTaskIds || []).map((id) => tasksById.get(id)).filter((task): task is Task => Boolean(task));
      return note.title.toLocaleLowerCase().includes(term)
        || linkedTasks.some((task) => task.title.toLocaleLowerCase().includes(term));
    });
  }, [notes, search, tasksById]);

  async function loadNotes() {
    setLoading(true);
    try {
      const nextNotes = await getSharedNotes();
      setNotes(nextNotes);
      setDrafts(Object.fromEntries(nextNotes.map((note) => [note.id, { title: note.title, body: note.body, tags: note.tags.join(', ') }])));
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotes();
  }, []);

  useEffect(() => {
    if (!focusedNoteId || loading || !notes.some((note) => note.id === focusedNoteId)) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`shared-note-${focusedNoteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [focusedNoteId, loading, notes]);

  async function createNote() {
    if (!newTitle.trim()) return;
    setSavingId('new');
    try {
      await createSharedNote({ title: newTitle.trim(), body: newBody.trim(), tags: parseTags(newTags) });
      setNewTitle('');
      setNewBody('');
      setNewTags('');
      await loadNotes();
      setSearch('');
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSavingId('');
    }
  }

  async function saveNote(note: SharedNote) {
    const draft = drafts[note.id];
    if (!draft || !draft.title.trim()) return;
    setSavingId(note.id);
    try {
      await updateSharedNote(note.id, { title: draft.title.trim(), body: draft.body.trim(), tags: parseTags(draft.tags) });
      await loadNotes();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSavingId('');
    }
  }

  async function archiveNote(note: SharedNote) {
    if (!window.confirm(`Arquivar nota "${note.title}"?`)) return;
    setSavingId(note.id);
    try {
      await archiveSharedNote(note.id);
      await loadNotes();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSavingId('');
    }
  }

  async function attachTask(note: SharedNote, taskId: string) {
    setSavingId(note.id);
    try {
      await attachSharedNoteToTask(taskId, note.id);
      await Promise.all([loadNotes(), onTasksChanged()]);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSavingId('');
    }
  }

  async function detachTask(note: SharedNote, taskId: string) {
    setSavingId(note.id);
    try {
      await detachSharedNoteFromTask(taskId, note.id);
      await Promise.all([loadNotes(), onTasksChanged()]);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSavingId('');
    }
  }

  return (
    <section className="shared-notes-view">
      <header className="shared-notes-toolbar">
        <div>
          <h2>Notas partilhadas</h2>
          <p>{filteredNotes.length} de {notes.length} notas reutilizaveis</p>
        </div>
        <input
          value={search}
          placeholder="Pesquisar por titulo da nota ou task..."
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      <section className="shared-note-composer">
        <input
          value={newTitle}
          maxLength={200}
          placeholder="Nova nota partilhada"
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <textarea
          value={newBody}
          maxLength={50000}
          rows={4}
          placeholder="Conteudo reutilizavel..."
          onChange={(event) => setNewBody(event.target.value)}
        />
        <input
          value={newTags}
          maxLength={500}
          placeholder="Tags separadas por virgula"
          onChange={(event) => setNewTags(event.target.value)}
        />
        <button type="button" className="button primary" disabled={!newTitle.trim() || savingId === 'new'} onClick={createNote}>
          Criar nota
        </button>
      </section>

      {loading ? <div className="loading">A carregar notas...</div> : (
        <div className="shared-notes-grid">
          {filteredNotes.map((note) => {
            const draft = drafts[note.id] || { title: note.title, body: note.body, tags: note.tags.join(', ') };
            const linkedTasks = (note.linkedTaskIds || []).map((id) => tasksById.get(id)).filter((task): task is Task => Boolean(task));
            const availableTasks = linkableTasks.filter((task) => !linkedTasks.some((linkedTask) => linkedTask.id === task.id));
            const taskSearch = taskSearchByNote[note.id] || '';
            const visibleTasks = availableTasks.filter((task) => task.title.toLocaleLowerCase().includes(taskSearch.toLocaleLowerCase()));
            const changed = draft.title !== note.title || draft.body !== note.body || draft.tags !== note.tags.join(', ');
            return (
              <article className={note.id === focusedNoteId ? 'shared-note-card is-focused' : 'shared-note-card'} id={`shared-note-${note.id}`} key={note.id}>
                <input
                  value={draft.title}
                  maxLength={200}
                  onChange={(event) => setDrafts((current) => ({ ...current, [note.id]: { ...draft, title: event.target.value } }))}
                  onBlur={() => changed && saveNote(note)}
                />
                <textarea
                  value={draft.body}
                  maxLength={50000}
                  rows={5}
                  onChange={(event) => setDrafts((current) => ({ ...current, [note.id]: { ...draft, body: event.target.value } }))}
                  onInput={(event) => fitTextareaToContent(event.currentTarget)}
                  onFocus={(event) => fitTextareaToContent(event.currentTarget)}
                  onBlur={() => changed && saveNote(note)}
                />
                <input
                  value={draft.tags}
                  maxLength={500}
                  placeholder="Tags separadas por virgula"
                  onChange={(event) => setDrafts((current) => ({ ...current, [note.id]: { ...draft, tags: event.target.value } }))}
                  onBlur={() => changed && saveNote(note)}
                />
                {note.tags.length ? <div className="tag-list shared-note-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
                <footer>
                  <span>Atualizada {formatDate(note.updatedAt)}</span>
                  <button type="button" className="button secondary small" disabled={savingId === note.id} onClick={() => archiveNote(note)}>
                    Arquivar
                  </button>
                </footer>
                <div className="shared-note-links">
                  <strong>Tasks</strong>
                  {linkedTasks.length ? linkedTasks.map((task) => (
                    <span className="shared-note-task-link" key={task.id}>
                      <button type="button" onClick={() => onOpenTask(task)}>{task.title}</button>
                      <button type="button" aria-label={`Remover ${task.title}`} onClick={() => detachTask(note, task.id)}>x</button>
                    </span>
                  )) : <p>Sem tasks ligadas.</p>}
                </div>
                <details className="shared-note-attach">
                  <summary>Associar task</summary>
                  <input
                    value={taskSearch}
                    placeholder="Pesquisar task por titulo..."
                    onChange={(event) => setTaskSearchByNote((current) => ({ ...current, [note.id]: event.target.value }))}
                  />
                  {visibleTasks.length ? (
                    <div className="shared-note-task-options">
                      {visibleTasks.map((task) => (
                        <div key={task.id}>
                          <span>
                            <strong>{task.title}</strong>
                            <small>{task.status.replace('_', ' ')}</small>
                          </span>
                          <button type="button" className="button secondary small" onClick={() => onOpenTask(task)}>
                            Ver
                          </button>
                          <button type="button" className="button secondary small" disabled={savingId === note.id} onClick={() => attachTask(note, task.id)}>
                            Associar
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="details-empty">{availableTasks.length ? 'Sem tasks com esse titulo.' : 'Todas as tasks disponiveis ja estao associadas.'}</p>}
                </details>
              </article>
            );
          })}
          {!filteredNotes.length && <p className="empty-column">{notes.length ? 'Sem notas para essa pesquisa.' : 'Sem notas partilhadas.'}</p>}
        </div>
      )}
    </section>
  );
}
