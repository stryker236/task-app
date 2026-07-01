import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChecklistItem, Task, TaskPriority, TaskStatus } from '../../../shared/types';
import {
  addTaskProgressEntry,
  attachSharedNoteToTask,
  archiveTask,
  archiveTasksByStatus,
  createTaskSharedNote,
  deleteTask,
  detachSharedNoteFromTask,
  duplicateTask,
  editTaskProgressEntry,
  restoreTask,
  toggleChecklistItem,
  updateTask,
  type TaskFilters
} from '../api';
import type { TaskDetailsChange } from '../components/TaskDetails';

type UseTaskActionsOptions = {
  filters: TaskFilters;
  fetchDashboardData: (filters?: TaskFilters) => Promise<void>;
  setError: (message: string) => void;
  setViewingTask: Dispatch<SetStateAction<Task | null>>;
  clearFormDraft: () => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function useTaskActions({
  filters,
  fetchDashboardData,
  setError,
  setViewingTask,
  clearFormDraft
}: UseTaskActionsOptions) {
  const [postponeTask, setPostponeTask] = useState<Task | null>(null);
  const [postponing, setPostponing] = useState(false);

  async function deleteSingleTask(task: Task) {
    if (!window.confirm(`Eliminar "${task.title}"? Esta acao nao pode ser anulada.`)) return;
    try {
      await deleteTask(task.id);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function duplicateSingleTask(task: Task) {
    try {
      const duplicate = await duplicateTask(task.id);
      await fetchDashboardData(filters);
      clearFormDraft();
      setViewingTask(duplicate);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function updateTaskStatus(task: Task, status: TaskStatus) {
    try {
      await updateTask(task.id, { ...task, status });
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function updateTaskPriority(task: Task, priority: TaskPriority) {
    if (priority < 1 || priority > 4 || priority === task.priority) return;
    try {
      await updateTask(task.id, { ...task, priority });
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function updateTaskFavoriteFlag(task: Task, isFavorite: boolean) {
    try {
      await updateTask(task.id, { ...task, isFavorite });
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function archiveSingleTask(task: Task) {
    if (!window.confirm(`Arquivar "${task.title}"?`)) return;
    try {
      await archiveTask(task.id);
      setViewingTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function restoreArchivedTask(task: Task) {
    try {
      await restoreTask(task.id);
      setViewingTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function archiveTasksWithStatus(status: Extract<TaskStatus, 'done' | 'cancelled'>) {
    const label = status === 'done' ? 'Done' : 'Cancelled';
    if (!window.confirm(`Arquivar todas as tarefas em ${label}?`)) return;
    try {
      const result = await archiveTasksByStatus(status);
      await fetchDashboardData(filters);
      if (result.archivedCount === 0) setError(`Nao existem tarefas ${label} por arquivar.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function updateTaskChecklistItemStatus(task: Task, item: ChecklistItem, isDone: boolean) {
    try {
      const updated = await toggleChecklistItem(task.id, item.id, isDone);
      setViewingTask(updated);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function addTaskProgressFromDetails(task: Task, message: string) {
    try {
      const result = await addTaskProgressEntry(task.id, message);
      setViewingTask(result.task);
      await fetchDashboardData(filters);
      return result.task;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  }

  async function editTaskProgressFromDetails(task: Task, entryId: string, message: string) {
    try {
      const result = await editTaskProgressEntry(task.id, entryId, message);
      setViewingTask(result.task);
      await fetchDashboardData(filters);
      return result.task;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  }

  async function attachTaskSharedNote(task: Task, noteId: string) {
    try {
      const updated = await attachSharedNoteToTask(task.id, noteId);
      setViewingTask(updated);
      await fetchDashboardData(filters);
      return updated;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  }

  async function createTaskLinkedSharedNote(task: Task, title: string, body: string, tags: string[] = []) {
    try {
      const updated = await createTaskSharedNote(task.id, { title, body, tags });
      setViewingTask(updated);
      await fetchDashboardData(filters);
      return updated;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  }

  async function detachTaskSharedNote(task: Task, noteId: string) {
    try {
      const updated = await detachSharedNoteFromTask(task.id, noteId);
      setViewingTask(updated);
      await fetchDashboardData(filters);
      return updated;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  }

  async function updateTaskFromDetails(task: Task, changes: TaskDetailsChange) {
    try {
      const updated = await updateTask(task.id, { ...task, ...changes });
      setViewingTask(updated);
      await fetchDashboardData(filters);
      return updated;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  }

  async function postponeTaskDueDate(task: Task, dueDateTime: string) {
    setPostponing(true);
    setError('');
    try {
      await updateTask(task.id, { ...task, dueDateTime });
      setPostponeTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPostponing(false);
    }
  }

  return {
    postponeTask,
    setPostponeTask,
    postponing,
    deleteSingleTask,
    duplicateSingleTask,
    updateTaskStatus,
    updateTaskPriority,
    updateTaskFavoriteFlag,
    archiveSingleTask,
    restoreArchivedTask,
    archiveTasksWithStatus,
    updateTaskChecklistItemStatus,
    addTaskProgressFromDetails,
    editTaskProgressFromDetails,
    attachTaskSharedNote,
    createTaskLinkedSharedNote,
    detachTaskSharedNote,
    updateTaskFromDetails,
    postponeTaskDueDate
  };
}
