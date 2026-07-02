import { useEffect, useMemo, useState } from 'react';
import type { SharedNote, Task, TaskStatus } from '../../shared/types';
import AdvisorPanel from './components/AdvisorPanel';
import AppDialogs from './components/AppDialogs';
import AppHeader from './components/AppHeader';
import BulkArchiveActions from './components/BulkArchiveActions';
import DashboardCounters from './components/DashboardCounters';
import Filters from './components/Filters';
import GoogleDailyPanel from './components/GoogleDailyPanel';
import MainView from './components/MainView';
import type { QueueSort } from './components/QueueView';
import type { TaskCardActions } from './components/TaskCard';
import ViewTabs from './components/ViewTabs';
import { EMPTY_FILTERS } from './constants/tasks';
import useAdvisorController from './hooks/useAdvisorController';
import useDashboardData from './hooks/useDashboardData';
import useGoogleCalendar from './hooks/useGoogleCalendar';
import useProgressLogController from './hooks/useProgressLogController';
import useQuickQueue from './hooks/useQuickQueue';
import useTagActions from './hooks/useTagActions';
import useTaskActions from './hooks/useTaskActions';
import useTaskFormController from './hooks/useTaskFormController';
import { isOverdue, isToday } from './utils/taskDates';

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('task-app:theme');
    if (stored) return stored === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const {
    tasks,
    allTasks,
    availableTags,
    setAvailableTags,
    setFiltersByView,
    filters,
    setFilters,
    view,
    setView,
    loading,
    error,
    setError,
    counters,
    fetchDashboardData
  } = useDashboardData();

  const [queueSort, setQueueSort] = useState<QueueSort>({ field: 'priority', direction: 'desc' });
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [focusedSharedNoteId, setFocusedSharedNoteId] = useState('');

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('task-app:theme', theme);
  }, [darkMode]);

  const googleCalendar = useGoogleCalendar({ setError });

  const {
    quickQueueItems,
    quickQueueLoading,
    addQuickQueueItem,
    toggleQuickQueueItem,
    deleteQuickQueueItem,
    moveQuickQueueItem,
    clearDoneQuickQueueItems
  } = useQuickQueue({ setError });

  const taskForm = useTaskFormController({
    allTasks,
    loading,
    filters,
    fetchDashboardData,
    setError,
    deleteQuickQueueItem
  });

  const advisorController = useAdvisorController({
    allTasks,
    fetchDashboardData,
    filters,
    setError,
    setViewingTask
  });

  const progressLog = useProgressLogController({
    filters,
    fetchDashboardData,
    setError
  });

  const taskActions = useTaskActions({
    filters,
    fetchDashboardData,
    setError,
    setViewingTask,
    clearFormDraft: taskForm.clearFormDraft
  });

  const { deleteUnusedTagFromCatalog, deleteUnusedTagsFromCatalog } = useTagActions({
    setAvailableTags,
    setError,
    setFiltersByView
  });

  function openTaskDetails(task: Task) {
    setViewingTask(task);
  }

  function openProgressLogFromTaskDetails(task: Task) {
    progressLog.openProgressLogFromTaskDetails(task, setViewingTask);
  }

  function openSharedNoteInNotesView(note: SharedNote) {
    setViewingTask(null);
    setFocusedSharedNoteId(note.id);
    setView('sharedNotes');
  }

  const taskCardActions: TaskCardActions & { onStatusChange: (task: Task, status: TaskStatus) => void } = {
    onEdit: taskForm.openEditTaskForm,
    onDelete: taskActions.deleteSingleTask,
    onDuplicate: taskActions.duplicateSingleTask,
    onStatusChange: taskActions.updateTaskStatus,
    onPriorityChange: taskActions.updateTaskPriority,
    onFavoriteChange: taskActions.updateTaskFavoriteFlag,
    onOpenTask: openTaskDetails,
    onProgress: progressLog.setProgressTask,
    onAddProgressEntry: progressLog.saveTaskProgressEntry,
    onAddBlocker: taskForm.openCreateBlockingTaskForm,
    onPostpone: taskActions.setPostponeTask,
    onArchive: taskActions.archiveSingleTask,
    onRestore: taskActions.restoreArchivedTask
  };

  const collectionSections = useMemo(() => {
    const active = (task: Task) => !['done', 'cancelled'].includes(task.status);
    return [
      ['Atrasadas', tasks.filter((task) => active(task) && isOverdue(task))],
      ['Para hoje', tasks.filter((task) => active(task) && isToday(task))],
      ['Urgentes', tasks.filter((task) => active(task) && task.priority === 4)],
      ['Alta prioridade', tasks.filter((task) => active(task) && task.priority === 3)],
      ['Waiting', tasks.filter((task) => task.status === 'waiting')],
      ['Sem prazo', tasks.filter((task) => active(task) && !task.dueDateTime)]
    ] satisfies Array<[string, Task[]]>;
  }, [tasks]);

  return (
    <div className="app-shell">
      <AppHeader onCreateTask={taskForm.openCreateTaskForm} darkMode={darkMode} onToggleDarkMode={() => setDarkMode((current) => !current)} />

      <main>
        <DashboardCounters counters={counters} />

        {view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'learnedRules' && (
          <GoogleDailyPanel
            status={googleCalendar.googleStatus}
            loading={googleCalendar.googleLoading}
            date={googleCalendar.calendarDate}
            events={googleCalendar.calendarEvents}
            accountEmail={googleCalendar.calendarAccountEmail}
            busyCount={googleCalendar.calendarBusyCount}
            onDateChange={googleCalendar.setCalendarDate}
            onConnect={googleCalendar.connectGoogle}
            onDisconnect={googleCalendar.disconnectGoogleAccount}
            onLoadEvents={googleCalendar.loadCalendarEvents}
          />
        )}

        {view !== 'archived' && view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'learnedRules' && (
          <AdvisorPanel
            allTasks={allTasks}
            advice={advisorController.advisor}
            loading={advisorController.advisorLoading}
            proposals={advisorController.proposalBatch}
            currentAction={advisorController.lastAdvisorAction}
            proposalStatuses={advisorController.proposalStatuses}
            proposalFeedbackStatuses={advisorController.proposalFeedbackStatuses}
            interactionFeedbackSaved={advisorController.interactionFeedbackSaved}
            memoryRules={advisorController.advisorMemoryRules}
            memoryLoading={advisorController.advisorMemoryLoading}
            applyingProposalId={advisorController.applyingProposalId}
            applyingAllProposals={advisorController.applyingAllProposals}
            googleStatus={googleCalendar.googleStatus}
            onRefresh={advisorController.refreshTaskAdvisorAdvice}
            onRequestActions={advisorController.requestAdvisorActions}
            onConnectGoogle={googleCalendar.connectGoogle}
            onApplyProposal={advisorController.applyAdvisorProposal}
            onIgnoreProposal={advisorController.ignoreAdvisorProposal}
            onApplyAllProposals={advisorController.applyAllAdvisorProposals}
            onIgnoreAllProposals={advisorController.ignoreAllAdvisorProposals}
            onClearProposals={advisorController.clearAdvisorProposals}
            onSaveProposalFeedback={advisorController.saveAdvisorProposalFeedback}
            onSaveInteractionFeedback={advisorController.saveAdvisorInteractionFeedback}
            onRefreshMemory={advisorController.refreshAdvisorMemoryRules}
            onForgetMemory={advisorController.forgetAdvisorMemoryRule}
            onOpenTask={advisorController.openAdvisorRecommendedTask}
          />
        )}

        <ViewTabs view={view} onChange={setView} />

        {view !== 'archived' && view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'learnedRules' && (
          <BulkArchiveActions
            onArchiveDone={() => taskActions.archiveTasksWithStatus('done')}
            onArchiveCancelled={() => taskActions.archiveTasksWithStatus('cancelled')}
          />
        )}

        {view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'learnedRules' && (
          <Filters
            filters={filters}
            tags={availableTags}
            onChange={setFilters}
            onDeleteTag={deleteUnusedTagFromCatalog}
            onDeleteTags={deleteUnusedTagsFromCatalog}
            onClear={() => setFilters(view === 'archived'
              ? { ...EMPTY_FILTERS, tags: [], archived: true, hideDone: false, hideCancelled: false }
              : { ...EMPTY_FILTERS, tags: [] })}
          />
        )}

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Fechar">×</button>
          </div>
        )}

        <MainView
          view={view}
          loading={loading}
          tasks={tasks}
          allTasks={allTasks}
          filters={filters}
          taskCardActions={taskCardActions}
          queueSort={queueSort}
          onQueueSortChange={setQueueSort}
          collectionSections={collectionSections}
          quickQueueItems={quickQueueItems}
          quickQueueLoading={quickQueueLoading}
          onQuickQueueAdd={addQuickQueueItem}
          onQuickQueueToggle={toggleQuickQueueItem}
          onQuickQueueDelete={deleteQuickQueueItem}
          onQuickQueueMove={moveQuickQueueItem}
          onQuickQueueClearDone={clearDoneQuickQueueItems}
          onQuickQueueCreateTask={taskForm.createTaskFromQuickQueueItem}
          onOpenTask={openTaskDetails}
          onError={setError}
          onTasksChanged={() => fetchDashboardData(filters)}
          focusedSharedNoteId={focusedSharedNoteId}
          googleStatus={googleCalendar.googleStatus}
          googleLoading={googleCalendar.googleLoading}
          calendarWeekStart={googleCalendar.calendarWeekStart}
          calendarWeekEnd={googleCalendar.calendarWeekEnd}
          weeklyCalendarEvents={googleCalendar.weeklyCalendarEvents}
          googleCalendars={googleCalendar.googleCalendars}
          selectedCalendarIds={googleCalendar.selectedCalendarIds}
          calendarAccountEmail={googleCalendar.calendarAccountEmail}
          weeklyCalendarBusyCount={googleCalendar.weeklyCalendarBusyCount}
          onCalendarWeekChange={googleCalendar.setCalendarWeekStart}
          onCalendarFilterChange={googleCalendar.setSelectedCalendarIds}
          onConnectGoogle={googleCalendar.connectGoogle}
          onDisconnectGoogle={googleCalendar.disconnectGoogleAccount}
          onLoadCalendarWeekEvents={googleCalendar.loadCalendarWeekEvents}
          onLoadCalendarRangeEvents={googleCalendar.loadCalendarRangeEvents}
          onSendDailyTaskEmail={googleCalendar.sendDailyTaskEmail}
          advisorMemoryRules={advisorController.advisorMemoryRules}
          advisorMemoryLoading={advisorController.advisorMemoryLoading}
          onRefreshAdvisorMemory={advisorController.refreshAdvisorMemoryRules}
          onForgetAdvisorMemory={advisorController.forgetAdvisorMemoryRule}
        />
      </main>

      <AppDialogs
        formOpen={taskForm.formOpen}
        editingTask={taskForm.editingTask}
        allTasks={allTasks}
        availableTags={availableTags}
        formDraft={taskForm.formDraft}
        blockingTarget={taskForm.blockingTarget}
        onSaveTaskForm={taskForm.saveTaskForm}
        onCloseTaskForm={taskForm.closeTaskForm}
        onOpenProgress={progressLog.setProgressTask}
        savingTask={taskForm.saving}
        progressTask={progressLog.progressTask}
        onCloseProgress={() => progressLog.setProgressTask(null)}
        onAddProgressEntry={progressLog.saveTaskProgressEntry}
        onEditProgressEntry={progressLog.saveTaskProgressEntryEdit}
        savingProgress={progressLog.savingProgress}
        viewingTask={viewingTask}
        onCloseTaskDetails={() => setViewingTask(null)}
        onChangeTaskDetails={taskActions.updateTaskFromDetails}
        onOpenTask={openTaskDetails}
        onProgressFromDetails={openProgressLogFromTaskDetails}
        onArchiveTask={taskActions.archiveSingleTask}
        onRestoreTask={taskActions.restoreArchivedTask}
        onToggleChecklist={taskActions.updateTaskChecklistItemStatus}
        onAddProgressFromDetails={taskActions.addTaskProgressFromDetails}
        onEditProgressFromDetails={taskActions.editTaskProgressFromDetails}
        onAttachSharedNote={taskActions.attachTaskSharedNote}
        onCreateSharedNote={taskActions.createTaskLinkedSharedNote}
        onDetachSharedNote={taskActions.detachTaskSharedNote}
        onOpenSharedNote={openSharedNoteInNotesView}
        postponeTask={taskActions.postponeTask}
        onClosePostpone={() => taskActions.setPostponeTask(null)}
        onSavePostpone={taskActions.postponeTaskDueDate}
        postponing={taskActions.postponing}
      />
    </div>
  );
}
