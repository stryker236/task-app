import type { QuickQueueItem, Task, TaskStatus } from '../../../shared/types';
import type { TaskFilters } from '../api';
import type { ViewKey } from '../constants/tasks';
import KanbanView from './KanbanView';
import QueueView from './QueueView';
import type { QueueSort } from './QueueView';
import QuickQueue from './QuickQueue';
import TaskCard from './TaskCard';
import type { TaskCardActions } from './TaskCard';

type CollectionSection = [string, Task[]];

type MainViewProps = {
  view: ViewKey;
  loading: boolean;
  tasks: Task[];
  allTasks: Task[];
  filters: TaskFilters;
  taskCardActions: TaskCardActions & { onStatusChange: (task: Task, status: TaskStatus) => void };
  queueSort: QueueSort;
  onQueueSortChange: (sort: QueueSort) => void;
  collectionSections: CollectionSection[];
  quickQueueItems: QuickQueueItem[];
  quickQueueLoading: boolean;
  onQuickQueueAdd: (text: string) => void;
  onQuickQueueToggle: (id: string, done: boolean) => void;
  onQuickQueueDelete: (id: string) => void;
  onQuickQueueMove: (id: string, direction: 1 | -1) => void;
  onQuickQueueClearDone: () => void;
  onQuickQueueCreateTask: (item: QuickQueueItem) => void;
};

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
  quickQueueLoading,
  onQuickQueueAdd,
  onQuickQueueToggle,
  onQuickQueueDelete,
  onQuickQueueMove,
  onQuickQueueClearDone,
  onQuickQueueCreateTask
}: MainViewProps) {
  if (view === 'quickQueue') {
    return (
      <QuickQueue
        items={quickQueueItems}
        loading={quickQueueLoading}
        onAdd={onQuickQueueAdd}
        onToggle={onQuickQueueToggle}
        onDelete={onQuickQueueDelete}
        onMove={onQuickQueueMove}
        onClearDone={onQuickQueueClearDone}
        onCreateTask={onQuickQueueCreateTask}
      />
    );
  }

  if (loading) return <div className="loading">A carregar tarefas...</div>;

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
              <p className="empty-column">Sem tarefas nesta seccao</p>
            )}
          </section>
        ))}
      </div>
    );
  }

  return null;
}
