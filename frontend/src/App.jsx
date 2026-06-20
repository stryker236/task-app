import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addProgress, createBlocker, createTask, deleteTask, duplicateTask, editProgress, getTasks, updateTask } from './api';
import Filters from './components/Filters';
import KanbanView from './components/KanbanView';
import QueueView from './components/QueueView';
import TaskCard from './components/TaskCard';
import TaskForm, { TASK_DRAFT_KEY } from './components/TaskForm';
import ProgressLog from './components/ProgressLog';

const EMPTY_FILTERS = { search: '', status: '', priority: '', requestedBy: '', tag: '', overdue: false, today: false, noDueDate: false, hideBlocked: false };

function isToday(task) {
  if (!task.dueDateTime) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const due = new Date(task.dueDateTime);
  return due >= start && due < end;
}

const isOverdue = (task) => Boolean(task.dueDateTime) && new Date(task.dueDateTime) < new Date();

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [view, setView] = useState('kanban');
  const [editingTask, setEditingTask] = useState(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queueSort, setQueueSort] = useState({ field: 'priority', direction: 'desc' });
  const [formDraft, setFormDraft] = useState(null);
  const [progressTask, setProgressTask] = useState(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [blockingTarget, setBlockingTarget] = useState(null);
  const draftRestored = useRef(false);

  const load = useCallback(async (currentFilters = filters) => {
    try {
      setError('');
      const [filtered, complete] = await Promise.all([getTasks(currentFilters), getTasks()]);
      setTasks(filtered);
      setAllTasks(complete);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => load(filters), 180);
    return () => clearTimeout(timer);
  }, [filters, load]);

  useEffect(() => {
    if (loading || draftRestored.current) return;
    draftRestored.current = true;
    try {
      const storedDraft = JSON.parse(localStorage.getItem(TASK_DRAFT_KEY));
      if (!storedDraft?.mode) return;
      if (storedDraft.mode === 'create' || storedDraft.mode === 'create-blocker') {
        setEditingTask(null);
        if (storedDraft.mode === 'create-blocker' && storedDraft.blockingTarget) {
          setBlockingTarget(allTasks.find((task) => task.id === storedDraft.blockingTarget.id) || storedDraft.blockingTarget);
        }
      } else {
        const sourceTask = allTasks.find((task) => task.id === storedDraft.taskId) || {
          ...storedDraft.form,
          id: storedDraft.taskId
        };
        setEditingTask(sourceTask);
      }
      setFormDraft(storedDraft);
      setFormOpen(true);
    } catch {
      localStorage.removeItem(TASK_DRAFT_KEY);
    }
  }, [loading, allTasks]);

  const counters = useMemo(() => {
    const active = allTasks.filter((task) => !['feito', 'cancelado'].includes(task.status));
    return {
      total: allTasks.length,
      today: active.filter(isToday).length,
      overdue: active.filter(isOverdue).length,
      waiting: allTasks.filter((task) => task.status === 'a_espera').length,
      noDue: active.filter((task) => !task.dueDateTime).length
    };
  }, [allTasks]);

  function openNew() {
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setEditingTask(null);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function openEdit(task) {
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setEditingTask(task);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function openBlockerForm(task) {
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setEditingTask(null);
    setBlockingTarget(task);
    setFormOpen(true);
  }

  function closeForm() {
    if (!window.confirm('Descartar este rascunho e fechar o editor?')) return;
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setBlockingTarget(null);
    setFormOpen(false);
  }

  async function saveTask(taskData) {
    setSaving(true);
    setError('');
    try {
      if (editingTask) await updateTask(editingTask.id, taskData);
      else if (blockingTarget) await createBlocker(blockingTarget.id, taskData);
      else await createTask(taskData);
      localStorage.removeItem(TASK_DRAFT_KEY);
      setFormDraft(null);
      setBlockingTarget(null);
      setFormOpen(false);
      await load(filters);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(task) {
    if (!window.confirm(`Eliminar “${task.title}”? Esta ação não pode ser anulada.`)) return;
    try {
      await deleteTask(task.id);
      await load(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function copyTask(task) {
    try {
      const duplicate = await duplicateTask(task.id);
      await load(filters);
      localStorage.removeItem(TASK_DRAFT_KEY);
      setFormDraft(null);
      setEditingTask(duplicate);
      setFormOpen(true);
    } catch (requestError) { setError(requestError.message); }
  }

  async function changeStatus(task, status) {
    try {
      await updateTask(task.id, { ...task, status });
      await load(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function saveProgress(task, message) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await addProgress(task.id, message);
      setProgressTask(result.task);
      await load(filters);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  async function saveProgressEdit(task, entryId, message) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await editProgress(task.id, entryId, message);
      setProgressTask(result.task);
      await load(filters);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  const actions = { onEdit: openEdit, onDelete: removeTask, onDuplicate: copyTask, onStatusChange: changeStatus, onOpenTask: openEdit, onProgress: setProgressTask, onAddBlocker: openBlockerForm };

  const collectionSections = useMemo(() => {
    const active = (task) => !['feito', 'cancelado'].includes(task.status);
    return [
      ['Atrasadas', tasks.filter((task) => active(task) && isOverdue(task))],
      ['Para hoje', tasks.filter((task) => active(task) && isToday(task))],
      ['Urgentes', tasks.filter((task) => active(task) && task.priority === 4)],
      ['Alta prioridade', tasks.filter((task) => active(task) && task.priority === 3)],
      ['À espera', tasks.filter((task) => task.status === 'a_espera')],
      ['Sem prazo', tasks.filter((task) => active(task) && !task.dueDateTime)]
    ];
  }, [tasks]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark">T</span><div><h1>Task App</h1><p>Organização de trabalho</p></div></div>
        <button className="button primary add-task" type="button" onClick={openNew}>+ Nova tarefa</button>
      </header>

      <main>
        <section className="counter-grid" aria-label="Resumo">
          <div><span>Total</span><strong>{counters.total}</strong></div>
          <div><span>Hoje</span><strong>{counters.today}</strong></div>
          <div className={counters.overdue ? 'counter-alert' : ''}><span>Atrasadas</span><strong>{counters.overdue}</strong></div>
          <div><span>À espera</span><strong>{counters.waiting}</strong></div>
          <div><span>Sem prazo</span><strong>{counters.noDue}</strong></div>
        </section>

        <nav className="view-tabs" aria-label="Vista">
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>Kanban</button>
          <button className={view === 'queue' ? 'active' : ''} onClick={() => setView('queue')}>Fila</button>
          <button className={view === 'collections' ? 'active' : ''} onClick={() => setView('collections')}>Cobranças prováveis</button>
        </nav>

        <Filters filters={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar">×</button></div>}

        {loading ? <div className="loading">A carregar tarefas…</div> : (
          <>
            {view === 'kanban' && <KanbanView tasks={tasks} allTasks={allTasks} actions={actions} />}
            {view === 'queue' && <QueueView tasks={tasks} allTasks={allTasks} actions={actions} sort={queueSort} onSortChange={setQueueSort} />}
            {view === 'collections' && (
              <div className="collections-view">
                {collectionSections.map(([title, items]) => (
                  <section className="collection-section" key={title}>
                    <header><h2>{title}</h2><span>{items.length}</span></header>
                    {items.length ? <div className="queue-grid">{items.map((task) => <TaskCard key={task.id} task={task} allTasks={allTasks} {...actions} />)}</div> : <p className="empty-column">Sem tarefas nesta secção</p>}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {formOpen && <TaskForm task={editingTask} tasks={allTasks} draft={formDraft} blockingTarget={blockingTarget} onSave={saveTask} onClose={closeForm} saving={saving} />}
      {progressTask && <ProgressLog task={progressTask} onClose={() => setProgressTask(null)} onAdd={saveProgress} onEdit={saveProgressEdit} saving={savingProgress} />}
    </div>
  );
}
