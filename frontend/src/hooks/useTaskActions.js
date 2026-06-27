import { useState } from 'react';
import {
  archiveTask,
  archiveTasksByStatus,
  deleteTask,
  duplicateTask,
  restoreTask,
  toggleChecklistItem,
  updateTask
} from '../api';

export default function useTaskActions({
  filters,
  fetchDashboardData,
  setError,
  setViewingTask,
  clearFormDraft
}) {
  const [postponeTask, setPostponeTask] = useState(null);
  const [postponing, setPostponing] = useState(false);

  async function deleteSingleTask(task) {
    if (!window.confirm(`Eliminar "${task.title}"? Esta ação não pode ser anulada.`)) return;
    try {
      await deleteTask(task.id);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function duplicateSingleTask(task) {
    try {
      const duplicate = await duplicateTask(task.id);
      await fetchDashboardData(filters);
      clearFormDraft();
      setViewingTask(duplicate);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateTaskStatus(task, status) {
    try {
      await updateTask(task.id, { ...task, status });
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateTaskPriority(task, priority) {
    if (priority < 1 || priority > 4 || priority === task.priority) return;
    try {
      await updateTask(task.id, { ...task, priority });
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateTaskFavoriteFlag(task, isFavorite) {
    try {
      await updateTask(task.id, { ...task, isFavorite });
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function archiveSingleTask(task) {
    if (!window.confirm(`Arquivar "${task.title}"?`)) return;
    try {
      await archiveTask(task.id);
      setViewingTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function restoreArchivedTask(task) {
    try {
      await restoreTask(task.id);
      setViewingTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function archiveTasksWithStatus(status) {
    const label = status === 'done' ? 'Done' : 'Cancelled';
    if (!window.confirm(`Arquivar todas as tarefas em ${label}?`)) return;
    try {
      const result = await archiveTasksByStatus(status);
      await fetchDashboardData(filters);
      if (result.archivedCount === 0) setError(`Não existem tarefas ${label} por arquivar.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateTaskChecklistItemStatus(task, item, isDone) {
    try {
      const updated = await toggleChecklistItem(task.id, item.id, isDone);
      setViewingTask(updated);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateTaskFromDetails(task, changes) {
    try {
      const updated = await updateTask(task.id, { ...task, ...changes });
      setViewingTask(updated);
      await fetchDashboardData(filters);
      return updated;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    }
  }

  async function postponeTaskDueDate(task, dueDateTime) {
    setPostponing(true);
    setError('');
    try {
      await updateTask(task.id, { ...task, dueDateTime });
      setPostponeTask(null);
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
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
    updateTaskFromDetails,
    postponeTaskDueDate
  };
}
