import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addTaskProgressEntry, archiveTask, archiveTasksByStatus, createBlockingTask, createTask, deleteTag, deleteTask, duplicateTask, editTaskProgressEntry, getTaskAdvisorAdvice, getTags, getTasks, restoreTask, toggleChecklistItem, updateTask } from './api';
import Filters from './components/Filters';
import KanbanView from './components/KanbanView';
import QueueView from './components/QueueView';
import AdvisorPanel from './components/AdvisorPanel';
import TaskCard from './components/TaskCard';
import TaskForm, { TASK_DRAFT_KEY } from './components/TaskForm';
import ProgressLog from './components/ProgressLog';
import TaskDetails from './components/TaskDetails';
import PostponeDialog from './components/PostponeDialog';

const EMPTY_FILTERS = {
  search: '',
  status: '',
  priority: '',
  tags: [],
  overdue: false,
  today: false,
  noDueDate: false,
  favoriteOnly: false,
  hideBlocked: false,
  hideDone: true,
  hideCancelled: true
};

const createViewFilters = () => ({
  kanban: { ...EMPTY_FILTERS, tags: [] },
  queue: { ...EMPTY_FILTERS, tags: [] },
  collections: { ...EMPTY_FILTERS, tags: [] },
  archived: { ...EMPTY_FILTERS, tags: [], archived: true, hideDone: false, hideCancelled: false }
});

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
  const [availableTags, setAvailableTags] = useState([]);
  const [filtersByView, setFiltersByView] = useState(createViewFilters);
  const [view, setView] = useState('kanban');
  const [editingTask, setEditingTask] = useState(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [advisor, setAdvisor] = useState(null);
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [error, setError] = useState('');
  const [queueSort, setQueueSort] = useState({ field: 'priority', direction: 'desc' });
  const [formDraft, setFormDraft] = useState(null);
  const [progressTask, setProgressTask] = useState(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [blockingTarget, setBlockingTarget] = useState(null);
  const [viewingTask, setViewingTask] = useState(null);
  const [postponeTask, setPostponeTask] = useState(null);
  const [postponing, setPostponing] = useState(false);
  const draftRestored = useRef(false);
  const filters = filtersByView[view];

  function setFilters(nextFilters) {
    setFiltersByView((current) => ({ ...current, [view]: nextFilters }));
  }

  const fetchDashboardData = useCallback(async (currentFilters = filters) => {
    try {
      setError('');
      setAdvisorLoading(true);
      const [filteredTasks, completeTaskList, tagCatalog, advisorAdvice] = await Promise.all([getTasks(currentFilters), getTasks({ includeArchived: true }), getTags(), getTaskAdvisorAdvice(5)]);
      setTasks(filteredTasks);
      setAllTasks(completeTaskList);
      setAvailableTags(tagCatalog);
      setAdvisor(advisorAdvice);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setAdvisorLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => fetchDashboardData(filters), 180);
    return () => clearTimeout(timer);
  }, [filters, fetchDashboardData]);

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
    const visibleTasks = allTasks.filter((task) => !task.isArchived);
    const active = visibleTasks.filter((task) => !['done', 'cancelled'].includes(task.status));
    return {
      total: visibleTasks.length,
      today: active.filter(isToday).length,
      overdue: active.filter(isOverdue).length,
      waiting: visibleTasks.filter((task) => task.status === 'waiting').length,
      noDue: active.filter((task) => !task.dueDateTime).length
    };
  }, [allTasks]);

  function openCreateTaskForm() {
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setEditingTask(null);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function openEditTaskForm(task) {
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setEditingTask(task);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function editFromDetails(task) {
    setViewingTask(null);
    openEditTaskForm(task);
  }

  function openTaskDetails(task) {
    setViewingTask(task);
  }

  async function refreshTaskAdvisorAdvice() {
    try {
      setAdvisorLoading(true);
      setAdvisor(await getTaskAdvisorAdvice(5));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAdvisorLoading(false);
    }
  }

  function openAdvisorRecommendedTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId);
    if (task) setViewingTask(task);
  }

  function openProgressLogFromTaskDetails(task) {
    setViewingTask(null);
    setProgressTask(task);
  }

  function openCreateBlockingTaskForm(task) {
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setEditingTask(null);
    setBlockingTarget(task);
    setFormOpen(true);
  }

  function closeTaskForm() {
    if (!window.confirm('Descartar este rascunho e fechar o editor?')) return;
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
    setBlockingTarget(null);
    setFormOpen(false);
  }

  async function saveTaskForm(taskData) {
    setSaving(true);
    setError('');
    try {
      if (editingTask) await updateTask(editingTask.id, taskData);
      else if (blockingTarget) await createBlockingTask(blockingTarget.id, taskData);
      else await createTask(taskData);
      localStorage.removeItem(TASK_DRAFT_KEY);
      setFormDraft(null);
      setBlockingTarget(null);
      setFormOpen(false);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSingleTask(task) {
    if (!window.confirm(`Eliminar “${task.title}”? Esta ação não pode ser anulada.`)) return;
    try {
      await deleteTask(task.id);
      await fetchDashboardData(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function duplicateSingleTask(task) {
    try {
      const duplicate = await duplicateTask(task.id);
      await fetchDashboardData(filters);
      localStorage.removeItem(TASK_DRAFT_KEY);
      setFormDraft(null);
      setViewingTask(duplicate);
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateTaskStatus(task, status) {
    try {
      await updateTask(task.id, { ...task, status });
      await fetchDashboardData(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateTaskPriority(task, priority) {
    if (priority < 1 || priority > 4 || priority === task.priority) return;
    try {
      await updateTask(task.id, { ...task, priority });
      await fetchDashboardData(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateTaskFavoriteFlag(task, isFavorite) {
    try {
      await updateTask(task.id, { ...task, isFavorite });
      await fetchDashboardData(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function archiveSingleTask(task) {
    if (!window.confirm(`Arquivar “${task.title}”?`)) return;
    try {
      await archiveTask(task.id);
      setViewingTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function restoreArchivedTask(task) {
    try {
      await restoreTask(task.id);
      setViewingTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function archiveTasksWithStatus(status) {
    const label = status === 'done' ? 'Done' : 'Cancelled';
    if (!window.confirm(`Arquivar todas as tarefas em ${label}?`)) return;
    try {
      const result = await archiveTasksByStatus(status);
      await fetchDashboardData(filters);
      if (result.archivedCount === 0) setError(`Não existem tarefas ${label} por arquivar.`);
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateTaskChecklistItemStatus(task, item, isDone) {
    try {
      const updated = await toggleChecklistItem(task.id, item.id, isDone);
      setViewingTask(updated);
      await fetchDashboardData(filters);
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateTaskFromDetails(task, changes) {
    try {
      const updated = await updateTask(task.id, { ...task, ...changes });
      setViewingTask(updated);
      await fetchDashboardData(filters);
      return updated;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    }
  }

  async function postponeTaskDueDate(task, dueDateTime) {
    setPostponing(true);
    setError('');
    try {
      await updateTask(task.id, { ...task, dueDateTime });
      setPostponeTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPostponing(false);
    }
  }

  async function deleteUnusedTagFromCatalog(tag) {
    if (!window.confirm(`Eliminar a tag “${tag.name}”?`)) return;
    try {
      await deleteTag(tag.id);
      setFiltersByView((current) => Object.fromEntries(
        Object.entries(current).map(([key, value]) => [key, {
          ...value,
          tags: value.tags.filter((name) => name.toLocaleLowerCase() !== tag.name.toLocaleLowerCase())
        }])
      ));
      setAvailableTags((current) => current.filter((item) => item.id !== tag.id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveTaskProgressEntry(task, message) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await addTaskProgressEntry(task.id, message);
      setProgressTask(result.task);
      await fetchDashboardData(filters);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  async function saveTaskProgressEntryEdit(task, entryId, message) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await editTaskProgressEntry(task.id, entryId, message);
      setProgressTask(result.task);
      await fetchDashboardData(filters);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  const taskCardActions = { onEdit: openEditTaskForm, onDelete: deleteSingleTask, onDuplicate: duplicateSingleTask, onStatusChange: updateTaskStatus, onPriorityChange: updateTaskPriority, onFavoriteChange: updateTaskFavoriteFlag, onOpenTask: openTaskDetails, onProgress: setProgressTask, onAddBlocker: openCreateBlockingTaskForm, onPostpone: setPostponeTask, onArchive: archiveSingleTask, onRestore: restoreArchivedTask };

  const collectionSections = useMemo(() => {
    const active = (task) => !['done', 'cancelled'].includes(task.status);
    return [
      ['Atrasadas', tasks.filter((task) => active(task) && isOverdue(task))],
      ['Para hoje', tasks.filter((task) => active(task) && isToday(task))],
      ['Urgentes', tasks.filter((task) => active(task) && task.priority === 4)],
      ['Alta prioridade', tasks.filter((task) => active(task) && task.priority === 3)],
      ['Waiting', tasks.filter((task) => task.status === 'waiting')],
      ['Sem prazo', tasks.filter((task) => active(task) && !task.dueDateTime)]
    ];
  }, [tasks]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark">T</span><div><h1>Task App</h1><p>Organização de trabalho</p></div></div>
        <button className="button primary add-task" type="button" onClick={openCreateTaskForm}>+ Nova tarefa</button>
      </header>

      <main>
        <section className="counter-grid" aria-label="Resumo">
          <div><span>Total</span><strong>{counters.total}</strong></div>
          <div><span>Hoje</span><strong>{counters.today}</strong></div>
          <div className={counters.overdue ? 'counter-alert' : ''}><span>Atrasadas</span><strong>{counters.overdue}</strong></div>
          <div><span>Waiting</span><strong>{counters.waiting}</strong></div>
          <div><span>Sem prazo</span><strong>{counters.noDue}</strong></div>
        </section>

        {view !== 'archived' && (
          <AdvisorPanel
            advice={advisor}
            loading={advisorLoading}
            onRefresh={refreshTaskAdvisorAdvice}
            onOpenTask={openAdvisorRecommendedTask}
          />
        )}

        <nav className="view-tabs" aria-label="Vista">
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>Kanban</button>
          <button className={view === 'queue' ? 'active' : ''} onClick={() => setView('queue')}>Fila</button>
          <button className={view === 'collections' ? 'active' : ''} onClick={() => setView('collections')}>Cobranças prováveis</button>
          <button className={view === 'archived' ? 'active' : ''} onClick={() => setView('archived')}>Arquivadas</button>
        </nav>

        {view !== 'archived' && <div className="bulk-archive-actions">
          <span>Arquivo rápido</span>
          <button type="button" className="button secondary small" onClick={() => archiveTasksWithStatus('done')}>Arquivar Done</button>
          <button type="button" className="button secondary small" onClick={() => archiveTasksWithStatus('cancelled')}>Arquivar Cancelled</button>
        </div>}

        <Filters filters={filters} tags={availableTags} onChange={setFilters} onDeleteTag={deleteUnusedTagFromCatalog} onClear={() => setFilters(view === 'archived' ? { ...EMPTY_FILTERS, tags: [], archived: true, hideDone: false, hideCancelled: false } : { ...EMPTY_FILTERS, tags: [] })} />
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar">×</button></div>}

        {loading ? <div className="loading">A carregar tarefas…</div> : (
          <>
            {view === 'kanban' && (
              <KanbanView
                tasks={tasks}
                allTasks={allTasks}
                taskActions={taskCardActions}
                hideDone={filters.hideDone}
                hideCancelled={filters.hideCancelled}
              />
            )}
            {view === 'queue' && <QueueView tasks={tasks} allTasks={allTasks} taskActions={taskCardActions} sort={queueSort} onSortChange={setQueueSort} />}
            {view === 'archived' && <QueueView tasks={tasks} allTasks={allTasks} taskActions={taskCardActions} sort={queueSort} onSortChange={setQueueSort} />}
            {view === 'collections' && (
              <div className="collections-view">
                {collectionSections.map(([title, items]) => (
                  <section className="collection-section" key={title}>
                    <header><h2>{title}</h2><span>{items.length}</span></header>
                    {items.length ? <div className="queue-grid">{items.map((task) => <TaskCard key={task.id} task={task} allTasks={allTasks} {...taskCardActions} />)}</div> : <p className="empty-column">Sem tarefas nesta secção</p>}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {formOpen && <TaskForm task={editingTask} tasks={allTasks} availableTags={availableTags} draft={formDraft} blockingTarget={blockingTarget} onSave={saveTaskForm} onClose={closeTaskForm} onProgress={setProgressTask} saving={saving} />}
      {progressTask && <ProgressLog task={progressTask} onClose={() => setProgressTask(null)} onAdd={saveTaskProgressEntry} onEdit={saveTaskProgressEntryEdit} saving={savingProgress} />}
      {viewingTask && <TaskDetails task={viewingTask} allTasks={allTasks} availableTags={availableTags} onClose={() => setViewingTask(null)} onChange={updateTaskFromDetails} onOpenTask={openTaskDetails} onProgress={openProgressLogFromTaskDetails} onArchive={archiveSingleTask} onRestore={restoreArchivedTask} onToggleChecklist={updateTaskChecklistItemStatus} />}
      {postponeTask && <PostponeDialog task={postponeTask} onClose={() => setPostponeTask(null)} onSave={postponeTaskDueDate} saving={postponing} />}
    </div>
  );
}
