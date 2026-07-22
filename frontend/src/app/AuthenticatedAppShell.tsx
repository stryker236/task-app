import type { Dispatch, SetStateAction } from 'react';
import AppDialogs from '../components/AppDialogs';
import AppHeader from '../components/AppHeader';
import DashboardCounters from '../components/DashboardCounters';
import GoogleDailyPanel from '../components/GoogleDailyPanel';
import MainView from '../components/MainView';
import ViewTabs from '../components/ViewTabs';
import { EMPTY_FILTERS, type ViewKey } from '../constants/tasks';
import AdvisorPanelContainer from '../features/advisor/components/AdvisorPanelContainer';
import ProductivityPanel from '../features/productivity/components/ProductivityPanel';
import BulkArchiveActions from '../features/tasks/components/BulkArchiveActions';
import Filters from '../features/tasks/components/Filters';
import { showsAppDashboardChrome, showsTaskFilters, showsTaskWorkspaceChrome } from './viewConfig';
import type { AppControllers } from './useAppControllers';

type AuthenticatedAppShellProps = {
  view: ViewKey;
  controllers: AppControllers;
  onOpenSettings: () => void;
};

export default function AuthenticatedAppShell({ view, controllers, onOpenSettings }: AuthenticatedAppShellProps) {
  const {
    darkMode,
    setDarkMode,
    dashboard,
    queueSort,
    setQueueSort,
    viewingTask,
    setViewingTask,
    calendarEventTask,
    setCalendarEventTask,
    focusedSharedNoteId,
    googleCalendar,
    settingsController,
    productivity,
    quickQueue,
    taskForm,
    progressLog,
    taskActions,
    tagActions,
    taskCardActions,
    collectionSections,
    openTaskDetails,
    openProgressLogFromTaskDetails,
    openSharedNoteInNotesView,
    refreshAfterCalendarEventCreated
  } = controllers;

  const { tasks, allTasks, availableTags, filters, setFilters, loading, error, setError, counters, fetchDashboardData } = dashboard;
  const { settings, settingsLoading, settingsSaving, refreshSettings, saveSettings } = settingsController;
  const { productivitySummary, productivityLoading, refreshProductivitySummary } = productivity;
  const showDashboardChrome = showsAppDashboardChrome(view);
  const showTaskWorkspaceChrome = showsTaskWorkspaceChrome(view);
  const showTaskFilters = showsTaskFilters(view);

  return (
    <div className="app-shell">
      <AppHeader
        onCreateTask={taskForm.openCreateTaskForm}
        onOpenSettings={onOpenSettings}
        darkMode={darkMode}
        onToggleDarkMode={() => (setDarkMode as Dispatch<SetStateAction<boolean>>)((current) => !current)}
        todayXp={productivitySummary.todayXp}
        currentStreak={productivitySummary.currentStreak}
      />

      <main>
        {showDashboardChrome && settings.productivity.showDashboardPanel && <ProductivityPanel summary={productivitySummary} loading={productivityLoading} />}
        {showDashboardChrome && <DashboardCounters counters={counters} />}
        <ViewTabs view={view} />

        {showTaskWorkspaceChrome && (
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

        {showTaskWorkspaceChrome && <AdvisorPanelContainer allTasks={allTasks} />}

        {showTaskWorkspaceChrome && (
          <BulkArchiveActions
            onArchiveDone={() => taskActions.archiveTasksWithStatus('done')}
            onArchiveCancelled={() => taskActions.archiveTasksWithStatus('cancelled')}
          />
        )}

        {showTaskFilters && (
          <Filters
            filters={filters}
            tags={availableTags}
            onChange={setFilters}
            onDeleteTag={tagActions.deleteUnusedTagFromCatalog}
            onDeleteTags={tagActions.deleteUnusedTagsFromCatalog}
            onClear={() => setFilters(view === 'archived'
              ? { ...EMPTY_FILTERS, tags: [], archived: true, hideDone: false, hideCancelled: false }
              : { ...EMPTY_FILTERS, tags: [] })}
          />
        )}

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Fechar">x</button>
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
          quickQueueItems={quickQueue.quickQueueItems}
          quickQueueLoading={quickQueue.quickQueueLoading}
          productivitySummary={productivitySummary}
          productivityLoading={productivityLoading}
          onProductivityRefresh={refreshProductivitySummary}
          settings={settings}
          settingsLoading={settingsLoading}
          settingsSaving={settingsSaving}
          onSettingsSave={saveSettings}
          onSettingsRefresh={refreshSettings}
          onQuickQueueAdd={quickQueue.addQuickQueueItem}
          onQuickQueueToggle={quickQueue.toggleQuickQueueItem}
          onQuickQueueEdit={quickQueue.editQuickQueueItem}
          onQuickQueueDelete={quickQueue.deleteQuickQueueItem}
          onQuickQueueMove={quickQueue.moveQuickQueueItem}
          onQuickQueueReorder={quickQueue.reorderQuickQueueItems}
          onQuickQueueClearDone={quickQueue.clearDoneQuickQueueItems}
          onQuickQueueCreateTask={taskForm.createTaskFromQuickQueueItem}
          onOpenTask={openTaskDetails}
          onError={setError}
          onTasksChanged={() => fetchDashboardData(filters)}
          onReviewScheduledEvent={taskActions.reviewScheduledTaskEvent}
          focusedSharedNoteId={focusedSharedNoteId}
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
        calendarEventTask={calendarEventTask}
        onOpenCalendarEvent={setCalendarEventTask}
        onCloseCalendarEvent={() => setCalendarEventTask(null)}
        onCalendarEventCreated={refreshAfterCalendarEventCreated}
        onError={setError}
        postponeTask={taskActions.postponeTask}
        onClosePostpone={() => taskActions.setPostponeTask(null)}
        onSavePostpone={taskActions.postponeTaskDueDate}
        postponing={taskActions.postponing}
      />
    </div>
  );
}
