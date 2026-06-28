import { useMemo, useState } from 'react';
import AdvisorPanel from './components/AdvisorPanel';
import AppDialogs from './components/AppDialogs';
import AppHeader from './components/AppHeader';
import BulkArchiveActions from './components/BulkArchiveActions';
import DashboardCounters from './components/DashboardCounters';
import Filters from './components/Filters';
import MainView from './components/MainView';
import ViewTabs from './components/ViewTabs';
import { EMPTY_FILTERS } from './constants/tasks';
import useAdvisorController from './hooks/useAdvisorController';
import useDashboardData from './hooks/useDashboardData';
import useProgressLogController from './hooks/useProgressLogController';
import useQuickQueue from './hooks/useQuickQueue';
import useTagActions from './hooks/useTagActions';
import useTaskActions from './hooks/useTaskActions';
import useTaskFormController from './hooks/useTaskFormController';
import { isOverdue, isToday } from './utils/taskDates';

export default function App() {
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

  const [queueSort, setQueueSort] = useState({ field: 'priority', direction: 'desc' });
  const [viewingTask, setViewingTask] = useState(null);

  const {
    quickQueueItems,
    addQuickQueueItem,
    toggleQuickQueueItem,
    deleteQuickQueueItem,
    moveQuickQueueItem,
    clearDoneQuickQueueItems
  } = useQuickQueue();

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

  const { deleteUnusedTagFromCatalog } = useTagActions({
    setAvailableTags,
    setError,
    setFiltersByView
  });

  function openTaskDetails(task) {
    setViewingTask(task);
  }

  function openProgressLogFromTaskDetails(task) {
    progressLog.openProgressLogFromTaskDetails(task, setViewingTask);
  }

  const taskCardActions = {
    onEdit: taskForm.openEditTaskForm,
    onDelete: taskActions.deleteSingleTask,
    onDuplicate: taskActions.duplicateSingleTask,
    onStatusChange: taskActions.updateTaskStatus,
    onPriorityChange: taskActions.updateTaskPriority,
    onFavoriteChange: taskActions.updateTaskFavoriteFlag,
    onOpenTask: openTaskDetails,
    onProgress: progressLog.setProgressTask,
    onAddBlocker: taskForm.openCreateBlockingTaskForm,
    onPostpone: taskActions.setPostponeTask,
    onArchive: taskActions.archiveSingleTask,
    onRestore: taskActions.restoreArchivedTask
  };

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
      <AppHeader onCreateTask={taskForm.openCreateTaskForm} />

      <main>
        <DashboardCounters counters={counters} />

        {view !== 'archived' && view !== 'quickQueue' && (
          <AdvisorPanel
            advice={advisorController.advisor}
            loading={advisorController.advisorLoading}
            request={advisorController.advisorRequest}
            proposals={advisorController.proposalBatch}
            proposalStatuses={advisorController.proposalStatuses}
            applyingProposalId={advisorController.applyingProposalId}
            applyingAllProposals={advisorController.applyingAllProposals}
            onRequestChange={advisorController.setAdvisorRequest}
            onRefresh={advisorController.refreshTaskAdvisorAdvice}
            onRequestActions={advisorController.requestAdvisorActions}
            onApplyProposal={advisorController.applyAdvisorProposal}
            onIgnoreProposal={advisorController.ignoreAdvisorProposal}
            onApplyAllProposals={advisorController.applyAllAdvisorProposals}
            onIgnoreAllProposals={advisorController.ignoreAllAdvisorProposals}
            onClearProposals={advisorController.clearAdvisorProposals}
            onOpenTask={advisorController.openAdvisorRecommendedTask}
          />
        )}

        <ViewTabs view={view} onChange={setView} />

        {view !== 'archived' && view !== 'quickQueue' && (
          <BulkArchiveActions
            onArchiveDone={() => taskActions.archiveTasksWithStatus('done')}
            onArchiveCancelled={() => taskActions.archiveTasksWithStatus('cancelled')}
          />
        )}

        {view !== 'quickQueue' && (
          <Filters
            filters={filters}
            tags={availableTags}
            onChange={setFilters}
            onDeleteTag={deleteUnusedTagFromCatalog}
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
          onQuickQueueAdd={addQuickQueueItem}
          onQuickQueueToggle={toggleQuickQueueItem}
          onQuickQueueDelete={deleteQuickQueueItem}
          onQuickQueueMove={moveQuickQueueItem}
          onQuickQueueClearDone={clearDoneQuickQueueItems}
          onQuickQueueCreateTask={taskForm.createTaskFromQuickQueueItem}
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
        postponeTask={taskActions.postponeTask}
        onClosePostpone={() => taskActions.setPostponeTask(null)}
        onSavePostpone={taskActions.postponeTaskDueDate}
        postponing={taskActions.postponing}
      />
    </div>
  );
}
