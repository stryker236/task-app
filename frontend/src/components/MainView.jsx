import KanbanView from './KanbanView';
import QueueView from './QueueView';
import QuickQueue from './QuickQueue';
import TaskCard from './TaskCard';

export default function MainView({
  view,
  loading,
  tasks,
  allTasks,
  filters,
  taskCardActions,
  queueSort,
  onQueueSortChange,
  collectionSections,
  quickQueueItems,
  onQuickQueueAdd,
  onQuickQueueToggle,
  onQuickQueueDelete,
  onQuickQueueMove,
  onQuickQueueClearDone,
  onQuickQueueCreateTask
}) {
  if (view === 'quickQueue') {
    return (
      <QuickQueue
        items={quickQueueItems}
        onAdd={onQuickQueueAdd}
        onToggle={onQuickQueueToggle}
        onDelete={onQuickQueueDelete}
        onMove={onQuickQueueMove}
        onClearDone={onQuickQueueClearDone}
        onCreateTask={onQuickQueueCreateTask}
      />
    );
  }

  if (loading) return <div className="loading">A carregar tarefas…</div>;

  if (view === 'kanban') {
    return (
      <KanbanView
        tasks={tasks}
        allTasks={allTasks}
        taskActions={taskCardActions}
        hideDone={filters.hideDone}
        hideCancelled={filters.hideCancelled}
      />
    );
  }

  if (view === 'queue' || view === 'archived') {
    return (
      <QueueView
        tasks={tasks}
        allTasks={allTasks}
        taskActions={taskCardActions}
        sort={queueSort}
        onSortChange={onQueueSortChange}
      />
    );
  }

  if (view === 'collections') {
    return (
      <div className="collections-view">
        {collectionSections.map(([title, items]) => (
          <section className="collection-section" key={title}>
            <header>
              <h2>{title}</h2>
              <span>{items.length}</span>
            </header>
            {items.length ? (
              <div className="queue-grid">
                {items.map((task) => (
                  <TaskCard key={task.id} task={task} allTasks={allTasks} {...taskCardActions} />
                ))}
              </div>
            ) : (
              <p className="empty-column">Sem tarefas nesta secção</p>
            )}
          </section>
        ))}
      </div>
    );
  }

  return null;
}
