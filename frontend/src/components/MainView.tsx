import { lazy, Suspense, type ReactNode } from 'react';
import type { AppSettings, AppSettingsUpdate, ProductivitySummary, QuickQueueItem, Task, TaskCalendarEvent, TaskCalendarEventReviewStatus, TaskStatus } from '../../../shared/types';
import type { TaskFilters } from '../features/tasks/api';
import type { ViewKey } from '../constants/tasks';
import { useAdvisorContext } from '../features/advisor/context/AdvisorContext';
import KanbanView from '../features/tasks/components/KanbanView';
import QueueView from '../features/tasks/components/QueueView';
import type { QueueSort } from '../features/tasks/components/QueueView';
import ScheduledReviewView from '../features/tasks/components/ScheduledReviewView';
import TaskCard from '../features/tasks/components/TaskCard';
import type { TaskCardActions } from '../features/tasks/components/TaskCard';

const CalendarView = lazy(() => import('../features/calendar/components/CalendarView'));
const LearnedRulesView = lazy(() => import('../features/advisor/components/LearnedRulesView'));
const LogsView = lazy(() => import('../features/logs/components/LogsView'));
const PeriodicTasksView = lazy(() => import('../features/periodic-tasks/components/PeriodicTasksView'));
const ProductivityView = lazy(() => import('../features/productivity/components/ProductivityView'));
const QuickQueue = lazy(() => import('../features/quick-queue/components/QuickQueue'));
const SchedulerRulesView = lazy(() => import('../features/scheduler/components/SchedulerRulesView'));
const SharedNotesView = lazy(() => import('../features/shared-notes/components/SharedNotesView'));
const SettingsView = lazy(() => import('../features/settings/components/SettingsView'));
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
  productivitySummary: ProductivitySummary;
  productivityLoading: boolean;
  onProductivityRefresh: () => void | Promise<void>;
  settings: AppSettings;
  settingsLoading: boolean;
  settingsSaving: boolean;
  onSettingsSave: (patch: AppSettingsUpdate) => Promise<AppSettings> | AppSettings;
  onSettingsRefresh: () => void | Promise<void>;
  onQuickQueueAdd: (text: string, placement: 'top' | 'bottom') => void;
  onQuickQueueToggle: (id: string, done: boolean) => void;
  onQuickQueueEdit: (id: string, text: string) => void | Promise<void>;
  onQuickQueueDelete: (id: string) => void;
  onQuickQueueMove: (id: string, direction: 1 | -1) => void;
  onQuickQueueReorder: (ids: string[]) => void;
  onQuickQueueClearDone: () => void;
  onQuickQueueCreateTask: (item: QuickQueueItem) => void;
  onOpenTask: (task: Task) => void;
  onError: (message: string) => void;
  onTasksChanged: () => Promise<void>;
  onReviewScheduledEvent: (task: Task, event: TaskCalendarEvent, status: TaskCalendarEventReviewStatus, note: string, feedback: Record<string, unknown>) => Promise<Task | null>;
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
  productivitySummary,
  productivityLoading,
  onProductivityRefresh,
  settings,
  settingsLoading,
  settingsSaving,
  onSettingsSave,
  onSettingsRefresh,
  onQuickQueueAdd,
  onQuickQueueToggle,
  onQuickQueueEdit,
  onQuickQueueDelete,
  onQuickQueueMove,
  onQuickQueueReorder,
  onQuickQueueClearDone,
  onQuickQueueCreateTask,
  onOpenTask,
  onError,
  onTasksChanged,
  onReviewScheduledEvent,
  focusedSharedNoteId
}: MainViewProps) {
  const advisor = useAdvisorContext();
  const lazyView = (content: ReactNode) => <Suspense fallback={<div className="loading">A carregar vista...</div>}>{content}</Suspense>;

  if (view === 'quickQueue') {
    return lazyView(
      <QuickQueue
        items={quickQueueItems}
        loading={quickQueueLoading}
        onAdd={onQuickQueueAdd}
        onToggle={onQuickQueueToggle}
        onEdit={onQuickQueueEdit}
        onDelete={onQuickQueueDelete}
        onMove={onQuickQueueMove}
        onReorder={onQuickQueueReorder}
        onClearDone={onQuickQueueClearDone}
        onCreateTask={onQuickQueueCreateTask}
      />
    );
  }

  if (view === 'sharedNotes') {
    return lazyView(<SharedNotesView allTasks={allTasks} onOpenTask={onOpenTask} onError={onError} onTasksChanged={onTasksChanged} focusedNoteId={focusedSharedNoteId} />);
  }

  if (view === 'calendar') {
    return lazyView(<CalendarView allTasks={allTasks} />);
  }

  if (view === 'periodicTasks') {
    return lazyView(<PeriodicTasksView onError={onError} />);
  }

  if (view === 'scheduledReview') {
    return <ScheduledReviewView tasks={allTasks} loading={loading} onOpenTask={onOpenTask} onReview={onReviewScheduledEvent} />;
  }

  if (view === 'productivity') {
    return lazyView(<ProductivityView summary={productivitySummary} loading={productivityLoading} onRefresh={onProductivityRefresh} tasks={allTasks} onOpenTask={onOpenTask} />);
  }

  if (view === 'settings') {
    return lazyView(<SettingsView settings={settings} loading={settingsLoading} saving={settingsSaving} onSave={onSettingsSave} onRefresh={onSettingsRefresh} />);
  }

  if (view === 'learnedRules') {
    return lazyView(
      <LearnedRulesView
        rules={advisor.advisorMemoryRules}
        loading={advisor.advisorMemoryLoading}
        onRefresh={advisor.refreshAdvisorMemoryRules}
        onForget={advisor.forgetAdvisorMemoryRule}
        onUpdate={advisor.saveAdvisorMemoryRule}
      />
    );
  }

  if (view === 'schedulerRules') {
    return lazyView(<SchedulerRulesView />);
  }

  if (view === 'logs') {
    return lazyView(<LogsView onError={onError} />);
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



