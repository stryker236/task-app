import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Task } from '../../../shared/types';
import { addTaskProgressEntry, editTaskProgressEntry, type TaskFilters } from '../api';

type UseProgressLogControllerOptions = {
  filters: TaskFilters;
  fetchDashboardData: (filters?: TaskFilters) => Promise<void>;
  setError: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function useProgressLogController({ filters, fetchDashboardData, setError }: UseProgressLogControllerOptions) {
  const [progressTask, setProgressTask] = useState<Task | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);

  async function saveTaskProgressEntry(task: Task, message: string) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await addTaskProgressEntry(task.id, message);
      setProgressTask(result.task);
      await fetchDashboardData(filters);
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  async function saveTaskProgressEntryEdit(task: Task, entryId: string, message: string) {
    setSavingProgress(true);
    setError('');
    try {
      const result = await editTaskProgressEntry(task.id, entryId, message);
      setProgressTask(result.task);
      await fetchDashboardData(filters);
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    } finally {
      setSavingProgress(false);
    }
  }

  function openProgressLogFromTaskDetails(task: Task, setViewingTask: Dispatch<SetStateAction<Task | null>>) {
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
