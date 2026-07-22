import type { ChecklistItem, SharedNote, Tag, Task, TaskCalendarEvent, TaskInput } from '../../../shared/types';
import { useGoogleCalendarContext } from '../features/calendar/context/GoogleCalendarContext';
import CalendarEventDialog from '../features/calendar/components/CalendarEventDialog';
import PostponeDialog from './PostponeDialog';
import ProgressLog from './ProgressLog';
import TaskDetails from '../features/tasks/components/TaskDetails';
import type { TaskDetailsChange } from '../features/tasks/components/TaskDetails';
import TaskForm from '../features/tasks/components/TaskForm';
import type { TaskDraft, TaskFormPayload } from '../features/tasks/components/TaskForm';

type AppDialogsProps = {
  formOpen: boolean;
  editingTask: Task | null | undefined;
  allTasks: Task[];
  availableTags: Tag[];
  formDraft: TaskDraft | null;
  blockingTarget: Task | null;
  onSaveTaskForm: (taskData: TaskFormPayload) => Promise<void> | void;
  onCloseTaskForm: () => void;
  onOpenProgress: (task: Task) => void;
  savingTask: boolean;
  progressTask: Task | null;
  onCloseProgress: () => void;
  onAddProgressEntry: (task: Task, message: string) => Promise<boolean>;
  onEditProgressEntry: (task: Task, entryId: string, message: string) => Promise<boolean>;
  savingProgress: boolean;
  viewingTask: Task | null;
  onCloseTaskDetails: () => void;
  onChangeTaskDetails: (task: Task, changes: TaskDetailsChange) => Promise<Task | null> | Task | null;
  onOpenTask: (task: Task) => void;
  onProgressFromDetails: (task: Task) => void;
  onArchiveTask: (task: Task) => void;
  onRestoreTask: (task: Task) => void;
  onToggleChecklist: (task: Task, item: ChecklistItem, isDone: boolean) => void;
  onAddProgressFromDetails: (task: Task, message: string) => Promise<Task | null>;
  onEditProgressFromDetails: (task: Task, entryId: string, message: string) => Promise<Task | null>;
  onAttachSharedNote: (task: Task, noteId: string) => Promise<Task | null>;
  onCreateSharedNote: (task: Task, title: string, body: string, tags: string[]) => Promise<Task | null>;
  onDetachSharedNote: (task: Task, noteId: string) => Promise<Task | null>;
  onOpenSharedNote: (note: SharedNote) => void;
  calendarEventTask: Task | null;
  onOpenCalendarEvent: (task: Task) => void;
  onCloseCalendarEvent: () => void;
  onCalendarEventCreated: (event: TaskCalendarEvent) => void;
  onError: (message: string) => void;
  postponeTask: Task | null;
  onClosePostpone: () => void;
  onSavePostpone: (task: Task, dueDateTime: string) => void;
  postponing: boolean;
};

export default function AppDialogs({
  formOpen,
  editingTask,
  allTasks,
  availableTags,
  formDraft,
  blockingTarget,
  onSaveTaskForm,
  onCloseTaskForm,
  onOpenProgress,
  savingTask,
  progressTask,
  onCloseProgress,
  onAddProgressEntry,
  onEditProgressEntry,
  savingProgress,
  viewingTask,
  onCloseTaskDetails,
  onChangeTaskDetails,
  onOpenTask,
  onProgressFromDetails,
  onArchiveTask,
  onRestoreTask,
  onToggleChecklist,
  onAddProgressFromDetails,
  onEditProgressFromDetails,
  onAttachSharedNote,
  onCreateSharedNote,
  onDetachSharedNote,
  onOpenSharedNote,
  calendarEventTask,
  onOpenCalendarEvent,
  onCloseCalendarEvent,
  onCalendarEventCreated,
  onError,
  postponeTask,
  onClosePostpone,
  onSavePostpone,
  postponing
}: AppDialogsProps) {
  const googleCalendar = useGoogleCalendarContext();

  return (
    <>
      {formOpen && (
        <TaskForm
          task={editingTask}
          tasks={allTasks}
          availableTags={availableTags}
          draft={formDraft}
          blockingTarget={blockingTarget}
          onSave={onSaveTaskForm}
          onClose={onCloseTaskForm}
          onProgress={onOpenProgress}
          saving={savingTask}
        />
      )}
      {progressTask && (
        <ProgressLog
          task={progressTask}
          onClose={onCloseProgress}
          onAdd={onAddProgressEntry}
          onEdit={onEditProgressEntry}
          saving={savingProgress}
        />
      )}
      {viewingTask && (
        <TaskDetails
          task={viewingTask}
          allTasks={allTasks}
          availableTags={availableTags}
          onClose={onCloseTaskDetails}
          onChange={onChangeTaskDetails}
          onOpenTask={onOpenTask}
          onProgress={onProgressFromDetails}
          onArchive={onArchiveTask}
          onRestore={onRestoreTask}
          onToggleChecklist={onToggleChecklist}
          onAddProgressEntry={onAddProgressFromDetails}
          onEditProgressEntry={onEditProgressFromDetails}
          onAttachSharedNote={onAttachSharedNote}
          onCreateSharedNote={onCreateSharedNote}
          onDetachSharedNote={onDetachSharedNote}
          onOpenSharedNote={onOpenSharedNote}
          onCreateCalendarEvent={onOpenCalendarEvent}
        />
      )}
      {calendarEventTask && (
        <CalendarEventDialog
          task={calendarEventTask}
          calendars={googleCalendar.googleCalendars}
          defaultCalendarId={googleCalendar.advisorDefaultCalendarId}
          onClose={onCloseCalendarEvent}
          onCreated={onCalendarEventCreated}
          onError={onError}
        />
      )}
      {postponeTask && (
        <PostponeDialog
          task={postponeTask}
          onClose={onClosePostpone}
          onSave={onSavePostpone}
          saving={postponing}
        />
      )}
    </>
  );
}


