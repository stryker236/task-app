import type { GoogleCalendar, GoogleCalendarEvent, GoogleStatus, QuickQueueItem, Task, TaskStatus } from '../../../shared/types';
import type { AdvisorMemoryRule, TaskFilters } from '../api';
import type { AdvisorFeedbackInput, AdvisorPreview } from '../api';
import type { ViewKey } from '../constants/tasks';
import { AdvisorProposalBuffer } from './AdvisorPanel';
import CalendarWeekView from './CalendarWeekView';
import KanbanView from './KanbanView';
import LearnedRulesView from './LearnedRulesView';
import QueueView from './QueueView';
import type { QueueSort } from './QueueView';
import QuickQueue from './QuickQueue';
import SharedNotesView from './SharedNotesView';
import TaskCard from './TaskCard';
import type { TaskCardActions } from './TaskCard';
import type { AdvisorCalendarPreviewEvent, TaskDueDateCalendarEvent } from '../utils/advisorCalendarPreviews';

const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar';

type CollectionSection = [string, Task[]];
type ProposalStatus = 'accepted' | 'ignored';
type ProposalStatuses = Record<string, ProposalStatus>;
type ProposalFeedbackStatuses = Record<string, 'saved'>;

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
  googleStatus: GoogleStatus;
  googleLoading: boolean;
  calendarWeekStart: string;
  calendarWeekEnd: string;
  weeklyCalendarEvents: GoogleCalendarEvent[];
  advisorCalendarPreviewEvents: AdvisorCalendarPreviewEvent[];
  taskDueDateCalendarEvents: TaskDueDateCalendarEvent[];
  googleCalendars: GoogleCalendar[];
  selectedCalendarIds: string[];
  advisorDefaultCalendarId: string;
  calendarAccountEmail: string | null;
  weeklyCalendarBusyCount: number;
  onCalendarWeekChange: (date: string) => void;
  onCalendarFilterChange: (calendarIds: string[]) => void;
  onAdvisorDefaultCalendarChange: (calendarId: string) => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onLoadCalendarWeekEvents: (date: string, calendarIds?: string[]) => void;
  onLoadCalendarRangeEvents: (start: string, end: string, calendarIds?: string[]) => void;
  onSendDailyTaskEmail: () => Promise<{ to: string; todayCount: number; overdueCount: number } | null>;
  advisorLoading: boolean;
  advisorProposals: AdvisorPreview | null;
  advisorCurrentAction: string;
  proposalStatuses: ProposalStatuses;
  proposalFeedbackStatuses: ProposalFeedbackStatuses;
  interactionFeedbackSaved: boolean;
  applyingProposalId: string | null;
  applyingAllProposals: boolean;
  onRequestAdvisorCalendarEvents: () => void;
  onApplyAdvisorProposal: (commandId: string) => void;
  onIgnoreAdvisorProposal: (commandId: string) => void;
  onApplyAllAdvisorProposals: () => void;
  onIgnoreAllAdvisorProposals: () => void;
  onClearAdvisorProposals: () => void;
  onChangeAdvisorProposalCalendar: (commandId: string, calendarId: string, calendarSummary: string) => void;
  onSaveAdvisorProposalFeedback: (commandId: string, feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onSaveAdvisorInteractionFeedback: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onOpenAdvisorTask: (taskId: string) => void;
  advisorMemoryRules: AdvisorMemoryRule[];
  advisorMemoryLoading: boolean;
  onRefreshAdvisorMemory: () => void;
  onForgetAdvisorMemory: (id: string) => void;
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
  focusedSharedNoteId,
  googleStatus,
  googleLoading,
  calendarWeekStart,
  calendarWeekEnd,
  weeklyCalendarEvents,
  advisorCalendarPreviewEvents,
  taskDueDateCalendarEvents,
  googleCalendars,
  selectedCalendarIds,
  advisorDefaultCalendarId,
  calendarAccountEmail,
  weeklyCalendarBusyCount,
  onCalendarWeekChange,
  onCalendarFilterChange,
  onAdvisorDefaultCalendarChange,
  onConnectGoogle,
  onDisconnectGoogle,
  onLoadCalendarWeekEvents,
  onLoadCalendarRangeEvents,
  onSendDailyTaskEmail,
  advisorLoading,
  advisorProposals,
  advisorCurrentAction,
  proposalStatuses,
  proposalFeedbackStatuses,
  interactionFeedbackSaved,
  applyingProposalId,
  applyingAllProposals,
  onRequestAdvisorCalendarEvents,
  onApplyAdvisorProposal,
  onIgnoreAdvisorProposal,
  onApplyAllAdvisorProposals,
  onIgnoreAllAdvisorProposals,
  onClearAdvisorProposals,
  onChangeAdvisorProposalCalendar,
  onSaveAdvisorProposalFeedback,
  onSaveAdvisorInteractionFeedback,
  onOpenAdvisorTask,
  advisorMemoryRules,
  advisorMemoryLoading,
  onRefreshAdvisorMemory,
  onForgetAdvisorMemory
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

  if (view === 'sharedNotes') {
    return <SharedNotesView allTasks={allTasks} onOpenTask={onOpenTask} onError={onError} onTasksChanged={onTasksChanged} focusedNoteId={focusedSharedNoteId} />;
  }

  if (view === 'calendar') {
    const calendarWriteReady = googleStatus.connected && googleStatus.scopes.includes(CALENDAR_WRITE_SCOPE);
    const showAdvisorBuffer = advisorCurrentAction === 'schedule_calendar_events' || (advisorProposals?.commands || []).some((command) => command.type === 'create_calendar_event');

    return (
      <>
        <CalendarWeekView
          status={googleStatus}
          loading={googleLoading}
          weekStart={calendarWeekStart}
          weekEnd={calendarWeekEnd}
          events={weeklyCalendarEvents}
          advisorPreviewEvents={advisorCalendarPreviewEvents}
          taskDueDateEvents={taskDueDateCalendarEvents}
          calendars={googleCalendars}
          selectedCalendarIds={selectedCalendarIds}
          advisorDefaultCalendarId={advisorDefaultCalendarId}
          accountEmail={calendarAccountEmail}
          busyCount={weeklyCalendarBusyCount}
          onWeekChange={onCalendarWeekChange}
          onCalendarFilterChange={onCalendarFilterChange}
          onAdvisorDefaultCalendarChange={onAdvisorDefaultCalendarChange}
          onConnect={onConnectGoogle}
          onDisconnect={onDisconnectGoogle}
          onLoadEvents={onLoadCalendarWeekEvents}
          onLoadRangeEvents={onLoadCalendarRangeEvents}
          onSendDailyTaskEmail={onSendDailyTaskEmail}
          advisorLoading={advisorLoading}
          onRequestAdvisorCalendarEvents={onRequestAdvisorCalendarEvents}
        />
        {showAdvisorBuffer && (
          <AdvisorProposalBuffer
            allTasks={allTasks}
            googleCalendars={googleCalendars}
            proposals={advisorProposals}
            action={advisorCurrentAction}
            proposalStatuses={proposalStatuses}
            proposalFeedbackStatuses={proposalFeedbackStatuses}
            interactionFeedbackSaved={interactionFeedbackSaved}
            applyingProposalId={applyingProposalId}
            applyingAllProposals={applyingAllProposals}
            calendarWriteReady={calendarWriteReady}
            onConnectGoogle={onConnectGoogle}
            onApplyProposal={onApplyAdvisorProposal}
            onIgnoreProposal={onIgnoreAdvisorProposal}
            onApplyAllProposals={onApplyAllAdvisorProposals}
            onIgnoreAllProposals={onIgnoreAllAdvisorProposals}
            onClearProposals={onClearAdvisorProposals}
            onChangeProposalCalendar={onChangeAdvisorProposalCalendar}
            onSaveProposalFeedback={onSaveAdvisorProposalFeedback}
            onSaveInteractionFeedback={onSaveAdvisorInteractionFeedback}
            onOpenTask={onOpenAdvisorTask}
          />
        )}
      </>
    );
  }

  if (view === 'learnedRules') {
    return (
      <LearnedRulesView
        rules={advisorMemoryRules}
        loading={advisorMemoryLoading}
        onRefresh={onRefreshAdvisorMemory}
        onForget={onForgetAdvisorMemory}
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
