import { useEffect, useRef, useState } from 'react';
import type { QuickQueueItem, Task } from '../../../../../shared/types';
import { createBlockingTask, createTask, updateTask, type TaskFilters } from '../api';
import { TASK_DRAFT_KEY, type TaskDraft, type TaskFormPayload } from '../components/TaskForm';
import { createTaskDraftFromQuickQueueItem } from '../../quick-queue/hooks/useQuickQueue';

type UseTaskFormControllerOptions = {
  allTasks: Task[];
  loading: boolean;
  filters: TaskFilters;
  fetchDashboardData: (filters?: TaskFilters) => Promise<void>;
  setError: (message: string) => void;
  deleteQuickQueueItem: (id: string) => Promise<void>;
  onTaskMutation?: () => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readStoredDraft(): TaskDraft | null {
  const raw = localStorage.getItem(TASK_DRAFT_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as TaskDraft;
}

export default function useTaskFormController({
  allTasks,
  loading,
  filters,
  fetchDashboardData,
  setError,
  deleteQuickQueueItem,
  onTaskMutation
}: UseTaskFormControllerOptions) {
  const [editingTask, setEditingTask] = useState<Task | null | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDraft, setFormDraft] = useState<TaskDraft | null>(null);
  const [blockingTarget, setBlockingTarget] = useState<Task | null>(null);
  const [quickQueueTaskSourceId, setQuickQueueTaskSourceId] = useState<string | null>(null);
  const draftRestored = useRef(false);

  useEffect(() => {
    if (loading || draftRestored.current) return;

    draftRestored.current = true;
    try {
      const storedDraft = readStoredDraft();
      if (!storedDraft?.mode) return;

      if (storedDraft.mode === 'create' || storedDraft.mode === 'create-blocker') {
        setEditingTask(null);
        if (storedDraft.mode === 'create-blocker' && storedDraft.blockingTarget) {
          setBlockingTarget(allTasks.find((task) => task.id === storedDraft.blockingTarget?.id) || storedDraft.blockingTarget);
        }
      } else {
        const sourceTask = allTasks.find((task) => task.id === storedDraft.taskId) || ({
          ...storedDraft.form,
          id: storedDraft.taskId
        } as Task);
        setEditingTask(sourceTask);
      }

      setFormDraft(storedDraft);
      setFormOpen(true);
    } catch {
      localStorage.removeItem(TASK_DRAFT_KEY);
    }
  }, [loading, allTasks]);

  function clearFormDraft() {
    localStorage.removeItem(TASK_DRAFT_KEY);
    setFormDraft(null);
  }

  function createTaskFromQuickQueueItem(item: QuickQueueItem) {
    const draft = createTaskDraftFromQuickQueueItem(item);
    localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify(draft));
    setQuickQueueTaskSourceId(item.id);
    setFormDraft(draft);
    setEditingTask(null);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function openCreateTaskForm() {
    clearFormDraft();
    setQuickQueueTaskSourceId(null);
    setEditingTask(null);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function openEditTaskForm(task: Task) {
    clearFormDraft();
    setQuickQueueTaskSourceId(null);
    setEditingTask(task);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function openCreateBlockingTaskForm(task: Task) {
    clearFormDraft();
    setQuickQueueTaskSourceId(null);
    setEditingTask(null);
    setBlockingTarget(task);
    setFormOpen(true);
  }

  function closeTaskForm() {
    if (!window.confirm('Descartar este rascunho e fechar o editor?')) return;
    clearFormDraft();
    setQuickQueueTaskSourceId(null);
    setBlockingTarget(null);
    setFormOpen(false);
  }

  async function saveTaskForm(taskData: TaskFormPayload) {
    setSaving(true);
    setError('');
    try {
      if (editingTask) await updateTask(editingTask.id, taskData);
      else if (blockingTarget) await createBlockingTask(blockingTarget.id, taskData);
      else await createTask(taskData);

      if (!editingTask && !blockingTarget && quickQueueTaskSourceId) {
        await deleteQuickQueueItem(quickQueueTaskSourceId);
        setQuickQueueTaskSourceId(null);
      }

      clearFormDraft();
      setBlockingTarget(null);
      setFormOpen(false);
      onTaskMutation?.();
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return {
    editingTask,
    formOpen,
    saving,
    formDraft,
    blockingTarget,
    clearFormDraft,
    createTaskFromQuickQueueItem,
    openCreateTaskForm,
    openEditTaskForm,
    openCreateBlockingTaskForm,
    closeTaskForm,
    saveTaskForm
  };
}


