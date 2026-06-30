import { useEffect, useMemo, useState } from 'react';
import type { SharedNote, Task } from '../../../shared/types';
import { archiveSharedNote, createSharedNote, getSharedNotes, updateSharedNote } from '../api';

type SharedNotesViewProps = {
  allTasks: Task[];
  onOpenTask: (task: Task) => void;
  onError: (message: string) => void;
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

export default function SharedNotesView({ allTasks, onOpenTask, onError }: SharedNotesViewProps) {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTags, setNewTags] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string; tags: string }>>({});

  const tasksById = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks]);

  async function loadNotes(query = search) {
    setLoading(true);
    try {
      const nextNotes = await getSharedNotes(query);
      setNotes(nextNotes);
      setDrafts(Object.fromEntries(nextNotes.map((note) => [note.id, { title: note.title, body: note.body, tags: note.tags.join(', ') }])));
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadNotes(search), 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function createNote() {
    if (!newTitle.trim()) return;
    setSavingId('new');
    try {
      await createSharedNote({ title: newTitle.trim(), body: newBody.trim(), tags: parseTags(newTags) });
      setNewTitle('');
      setNewBody('');
      setNewTags('');
      await loadNotes('');
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

  return (
    <section className="shared-notes-view">
      <header className="shared-notes-toolbar">
        <div>
          <h2>Notas partilhadas</h2>
          <p>{notes.length} notas reutilizaveis</p>
        </div>
        <input
          value={search}
          placeholder="Pesquisar notas..."
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
          {notes.map((note) => {
            const draft = drafts[note.id] || { title: note.title, body: note.body, tags: note.tags.join(', ') };
            const linkedTasks = (note.linkedTaskIds || []).map((id) => tasksById.get(id)).filter((task): task is Task => Boolean(task));
            const changed = draft.title !== note.title || draft.body !== note.body || draft.tags !== note.tags.join(', ');
            return (
              <article className="shared-note-card" key={note.id}>
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
                    <button type="button" key={task.id} onClick={() => onOpenTask(task)}>
                      {task.title}
                    </button>
                  )) : <p>Sem tasks ligadas.</p>}
                </div>
              </article>
            );
          })}
          {!notes.length && <p className="empty-column">Sem notas partilhadas.</p>}
        </div>
      )}
    </section>
  );
}
