import { useEffect, useMemo, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { SharedNote, Task, TaskCalendarEvent, TaskStatus } from '../../../shared/types';
import type { QueueSort } from '../features/tasks/components/QueueView';
import type { TaskCardActions } from '../features/tasks/components/TaskCard';
import { createTaskCollectionSections } from '../features/tasks/taskCollections';
import useAdvisorController from '../features/advisor/hooks/useAdvisorController';
import useAppSettings from '../features/settings/hooks/useAppSettings';
import useDashboardData from '../features/tasks/hooks/useDashboardData';
import useGoogleCalendar from '../features/calendar/hooks/useGoogleCalendar';
import useProgressLogController from '../features/tasks/hooks/useProgressLogController';
import useProductivitySummary from '../features/productivity/hooks/useProductivitySummary';
import useQuickQueue from '../features/quick-queue/hooks/useQuickQueue';
import useTagActions from '../features/tasks/hooks/useTagActions';
import useTaskActions from '../features/tasks/hooks/useTaskActions';
import useTaskFormController from '../features/tasks/hooks/useTaskFormController';
import type { ViewKey } from '../constants/tasks';
import { viewPath } from '../utils/routes';

type UseAppControllersOptions = {
  view: ViewKey;
  navigate: NavigateFunction;
};

export default function useAppControllers({ view, navigate }: UseAppControllersOptions) {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('task-app:theme');
    if (stored) return stored === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const dashboard = useDashboardData(view);
  const {
    tasks,
    allTasks,
    availableTags,
    setAvailableTags,
    setFiltersByView,
    filters,
    setError,
    fetchDashboardData
  } = dashboard;

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
  const settingsController = useAppSettings({ setError });
  const { settings } = settingsController;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--blue', settings.ui.accentColor);
    root.style.setProperty('--accent-color', settings.ui.accentColor);
    root.style.setProperty('--break-color', settings.ui.breakColor);
    root.style.setProperty('--surface', settings.ui.surfaceColor);
  }, [settings.ui.accentColor, settings.ui.breakColor, settings.ui.surfaceColor]);

  const productivity = useProductivitySummary({ setError });
  const quickQueue = useQuickQueue({ setError });

  const advisorController = useAdvisorController({
    allTasks,
    fetchDashboardData,
    filters,
    setError,
    setViewingTask
  });

  const taskForm = useTaskFormController({
    allTasks,
    loading: dashboard.loading,
    filters,
    fetchDashboardData,
    setError,
    deleteQuickQueueItem: quickQueue.deleteQuickQueueItem,
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

  const tagActions = useTagActions({
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

  const collectionSections = useMemo(() => createTaskCollectionSections(tasks), [tasks]);

  return {
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
    advisorController,
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
  };
}

export type AppControllers = ReturnType<typeof useAppControllers>;

