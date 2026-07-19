import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { SharedNote, Task, TaskCalendarEvent, TaskStatus } from '../../shared/types';
import AdvisorPanelContainer from './components/AdvisorPanelContainer';
import AppDialogs from './components/AppDialogs';
import AppHeader from './components/AppHeader';
import BulkArchiveActions from './components/BulkArchiveActions';
import DashboardCounters from './components/DashboardCounters';
import Filters from './components/Filters';
import GoogleDailyPanel from './components/GoogleDailyPanel';
import GoogleLoginScreen from './components/GoogleLoginScreen';
import MainView from './components/MainView';
import ProductivityPanel from './components/ProductivityPanel';
import type { QueueSort } from './components/QueueView';
import type { TaskCardActions } from './components/TaskCard';
import ViewTabs from './components/ViewTabs';
import { EMPTY_FILTERS } from './constants/tasks';
import { AdvisorProvider } from './context/AdvisorContext';
import { GoogleCalendarProvider } from './context/GoogleCalendarContext';
import useAdvisorController from './hooks/useAdvisorController';
import useAppSettings from './hooks/useAppSettings';
import useDashboardData from './hooks/useDashboardData';
import useGoogleCalendar from './hooks/useGoogleCalendar';
import useProgressLogController from './hooks/useProgressLogController';
import useProductivitySummary from './hooks/useProductivitySummary';
import useQuickQueue from './hooks/useQuickQueue';
import useTagActions from './hooks/useTagActions';
import useTaskActions from './hooks/useTaskActions';
import useTaskFormController from './hooks/useTaskFormController';
import { loginPath, viewFromPath, viewPath } from './utils/routes';
import { isOverdue, isToday } from './utils/taskDates';

function safeInternalReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return '/';
  return value;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginRoute = location.pathname.replace(/\/+$/, '') === '/login';
  const routeView = viewFromPath(location.pathname);
  const view = routeView || 'kanban';
  const protectedReturnTo = `${location.pathname}${location.search}${location.hash}`;
  const loginReturnTo = safeInternalReturnTo(new URLSearchParams(location.search).get('returnTo'));

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
    loading,
    error,
    setError,
    counters,
    fetchDashboardData
  } = useDashboardData(view);

  const [queueSort, setQueueSort] = useState<QueueSort>({ field: 'priority', direction: 'desc' });
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [calendarEventTask, setCalendarEventTask] = useState<Task | null>(null);
  const [focusedSharedNoteId, setFocusedSharedNoteId] = useState('');

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('task-app:theme', theme);
  }, [darkMode]);

  const googleCalendar = useGoogleCalendar({ setError });
  const { settings, settingsLoading, settingsSaving, refreshSettings, saveSettings } = useAppSettings({ setError });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--blue', settings.ui.accentColor);
    root.style.setProperty('--accent-color', settings.ui.accentColor);
    root.style.setProperty('--break-color', settings.ui.breakColor);
    root.style.setProperty('--surface', settings.ui.surfaceColor);
  }, [settings.ui.accentColor, settings.ui.breakColor, settings.ui.surfaceColor]);

  const { productivitySummary, productivityLoading, refreshProductivitySummary } = useProductivitySummary({ setError });

  const {
    quickQueueItems,
    quickQueueLoading,
    addQuickQueueItem,
    toggleQuickQueueItem,
    editQuickQueueItem,
    deleteQuickQueueItem,
    moveQuickQueueItem,
    reorderQuickQueueItems,
    clearDoneQuickQueueItems
  } = useQuickQueue({ setError });

  const advisorController = useAdvisorController({
    allTasks,
    fetchDashboardData,
    filters,
    setError,
    setViewingTask
  });

  const taskForm = useTaskFormController({
    allTasks,
    loading,
    filters,
    fetchDashboardData,
    setError,
    deleteQuickQueueItem,
    onTaskMutation: advisorController.clearAdvisorProposals
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
    clearFormDraft: taskForm.clearFormDraft,
    onTaskMutation: advisorController.clearAdvisorProposals
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
    navigate(viewPath('sharedNotes'));
  }

  function refreshAfterCalendarEventCreated(event: TaskCalendarEvent) {
    setViewingTask((current) => current?.id === event.taskId
      ? { ...current, calendarEvents: [...(current.calendarEvents || []), event] }
      : current);
    fetchDashboardData(filters);
    googleCalendar.loadCalendarWeekEvents();
    googleCalendar.loadCalendarEvents();
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
    onCreateCalendarEvent: setCalendarEventTask,
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

  if (!routeView && !isLoginRoute) {
    return <Navigate to="/" replace />;
  }

  if (isLoginRoute && googleCalendar.googleStatus.connected) {
    return <Navigate to={loginReturnTo} replace />;
  }

  if (!isLoginRoute && googleCalendar.googleSessionExpired) {
    return <Navigate to="/login" replace />;
  }

  if (!isLoginRoute && !googleCalendar.googleLoading && !googleCalendar.googleStatus.connected) {
    return <Navigate to={loginPath(protectedReturnTo)} replace />;
  }

  if (isLoginRoute || !googleCalendar.googleStatus.connected) {
    return (
      <div className="app-shell">
        <GoogleLoginScreen
          status={googleCalendar.googleStatus}
          loading={googleCalendar.googleLoading}
          error={error}
          onConnect={() => googleCalendar.connectGoogle(loginReturnTo)}
        />
      </div>
    );
  }

  return (
    <GoogleCalendarProvider value={googleCalendar}>
      <AdvisorProvider value={advisorController}>
        <div className="app-shell">
      <AppHeader
        onCreateTask={taskForm.openCreateTaskForm}
        onOpenSettings={() => navigate(viewPath('settings'))}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((current) => !current)}
        todayXp={productivitySummary.todayXp}
        currentStreak={productivitySummary.currentStreak}
      />

      <main>
        {view !== 'productivity' && view !== 'settings' && settings.productivity.showDashboardPanel && <ProductivityPanel summary={productivitySummary} loading={productivityLoading} />}

        {view !== 'productivity' && view !== 'settings' && <DashboardCounters counters={counters} />}

        <ViewTabs view={view} />

        {view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'periodicTasks' && view !== 'scheduledReview' && view !== 'productivity' && view !== 'settings' && view !== 'learnedRules' && view !== 'schedulerRules' && view !== 'logs' && (
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

        {view !== 'archived' && view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'periodicTasks' && view !== 'scheduledReview' && view !== 'productivity' && view !== 'settings' && view !== 'learnedRules' && view !== 'schedulerRules' && view !== 'logs' && (
          <AdvisorPanelContainer
            allTasks={allTasks}
          />
        )}


        {view !== 'archived' && view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'periodicTasks' && view !== 'scheduledReview' && view !== 'productivity' && view !== 'settings' && view !== 'learnedRules' && view !== 'schedulerRules' && view !== 'logs' && (
          <BulkArchiveActions
            onArchiveDone={() => taskActions.archiveTasksWithStatus('done')}
            onArchiveCancelled={() => taskActions.archiveTasksWithStatus('cancelled')}
          />
        )}

        {view !== 'quickQueue' && view !== 'sharedNotes' && view !== 'calendar' && view !== 'periodicTasks' && view !== 'scheduledReview' && view !== 'productivity' && view !== 'settings' && view !== 'learnedRules' && view !== 'schedulerRules' && view !== 'logs' && (
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
            <button type="button" onClick={() => setError('')} aria-label="Fechar">Ã—</button>
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
          productivitySummary={productivitySummary}
          productivityLoading={productivityLoading}
          onProductivityRefresh={refreshProductivitySummary}
          settings={settings}
          settingsLoading={settingsLoading}
          settingsSaving={settingsSaving}
          onSettingsSave={saveSettings}
          onSettingsRefresh={refreshSettings}
          onQuickQueueAdd={addQuickQueueItem}
          onQuickQueueToggle={toggleQuickQueueItem}
          onQuickQueueEdit={editQuickQueueItem}
          onQuickQueueDelete={deleteQuickQueueItem}
          onQuickQueueMove={moveQuickQueueItem}
          onQuickQueueReorder={reorderQuickQueueItems}
          onQuickQueueClearDone={clearDoneQuickQueueItems}
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
      </AdvisorProvider>
    </GoogleCalendarProvider>
  );
}




