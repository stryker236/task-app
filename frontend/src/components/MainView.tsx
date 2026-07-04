import type { QuickQueueItem, Task, TaskStatus } from '../../../shared/types';
import type { TaskFilters } from '../api';
import type { ViewKey } from '../constants/tasks';
import { useAdvisorContext } from '../context/AdvisorContext';
import CalendarView from './CalendarView';
import KanbanView from './KanbanView';
import LearnedRulesView from './LearnedRulesView';
import LogsView from './LogsView';
import QueueView from './QueueView';
import type { QueueSort } from './QueueView';
import QuickQueue from './QuickQueue';
import SharedNotesView from './SharedNotesView';
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
  onOpenTask: (task: Task) => void;
  onError: (message: string) => void;
  onTasksChanged: () => Promise<void>;
  focusedSharedNoteId: string;
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
  onQuickQueueCreateTask,
  onOpenTask,
  onError,
  onTasksChanged,
  focusedSharedNoteId
}: MainViewProps) {
  const advisor = useAdvisorContext();

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

  if (view === 'sharedNotes') {
    return <SharedNotesView allTasks={allTasks} onOpenTask={onOpenTask} onError={onError} onTasksChanged={onTasksChanged} focusedNoteId={focusedSharedNoteId} />;
  }

  if (view === 'calendar') {
    return <CalendarView allTasks={allTasks} />;
  }

  if (view === 'learnedRules') {
    return (
      <LearnedRulesView
        rules={advisor.advisorMemoryRules}
        loading={advisor.advisorMemoryLoading}
        onRefresh={advisor.refreshAdvisorMemoryRules}
        onForget={advisor.forgetAdvisorMemoryRule}
      />
    );
  }

  if (view === 'logs') {
    return <LogsView onError={onError} />;
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
