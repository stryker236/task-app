import type { ChecklistItem, Tag, Task, TaskInput } from '../../../shared/types';
import PostponeDialog from './PostponeDialog';
import ProgressLog from './ProgressLog';
import TaskDetails from './TaskDetails';
import type { TaskDetailsChange } from './TaskDetails';
import TaskForm from './TaskForm';
import type { TaskDraft, TaskFormPayload } from './TaskForm';

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
  onAttachSharedNote: (task: Task, noteId: string) => Promise<Task | null>;
  onCreateSharedNote: (task: Task, title: string, body: string, tags: string[]) => Promise<Task | null>;
  onDetachSharedNote: (task: Task, noteId: string) => Promise<Task | null>;
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
  onAttachSharedNote,
  onCreateSharedNote,
  onDetachSharedNote,
  postponeTask,
  onClosePostpone,
  onSavePostpone,
  postponing
}: AppDialogsProps) {
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
          onAttachSharedNote={onAttachSharedNote}
          onCreateSharedNote={onCreateSharedNote}
          onDetachSharedNote={onDetachSharedNote}
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
