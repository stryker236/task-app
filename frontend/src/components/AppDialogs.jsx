import PostponeDialog from './PostponeDialog';
import ProgressLog from './ProgressLog';
import TaskDetails from './TaskDetails';
import TaskForm from './TaskForm';

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
  postponeTask,
  onClosePostpone,
  onSavePostpone,
  postponing
}) {
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
