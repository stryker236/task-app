import { useState } from 'react';
import { addTaskProgressEntry, editTaskProgressEntry } from '../api';

export default function useProgressLogController({ filters, fetchDashboardData, setError }) {
  const [progressTask, setProgressTask] = useState(null);
  const [savingProgress, setSavingProgress] = useState(false);

  async function saveTaskProgressEntry(task, message) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await addTaskProgressEntry(task.id, message);
      setProgressTask(result.task);
      await fetchDashboardData(filters);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  async function saveTaskProgressEntryEdit(task, entryId, message) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await editTaskProgressEntry(task.id, entryId, message);
      setProgressTask(result.task);
      await fetchDashboardData(filters);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  function openProgressLogFromTaskDetails(task, setViewingTask) {
    setViewingTask(null);
    setProgressTask(task);
  }

  return {
    progressTask,
    setProgressTask,
    savingProgress,
    saveTaskProgressEntry,
    saveTaskProgressEntryEdit,
    openProgressLogFromTaskDetails
  };
}
