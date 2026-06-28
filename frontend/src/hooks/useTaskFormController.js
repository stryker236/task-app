import { useEffect, useRef, useState } from 'react';
import { createBlockingTask, createTask, updateTask } from '../api';
import { TASK_DRAFT_KEY } from '../components/TaskForm';
import { createTaskDraftFromQuickQueueItem } from './useQuickQueue';

export default function useTaskFormController({
  allTasks,
  loading,
  filters,
  fetchDashboardData,
  setError,
  deleteQuickQueueItem
}) {
  const [editingTask, setEditingTask] = useState(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDraft, setFormDraft] = useState(null);
  const [blockingTarget, setBlockingTarget] = useState(null);
  const [quickQueueTaskSourceId, setQuickQueueTaskSourceId] = useState(null);
  const draftRestored = useRef(false);

  useEffect(() => {
    if (loading || draftRestored.current) return;

    draftRestored.current = true;
    try {
      const storedDraft = JSON.parse(localStorage.getItem(TASK_DRAFT_KEY));
      if (!storedDraft?.mode) return;

      if (storedDraft.mode === 'create' || storedDraft.mode === 'create-blocker') {
        setEditingTask(null);
        if (storedDraft.mode === 'create-blocker' && storedDraft.blockingTarget) {
          setBlockingTarget(allTasks.find((task) => task.id === storedDraft.blockingTarget.id) || storedDraft.blockingTarget);
        }
      } else {
        const sourceTask = allTasks.find((task) => task.id === storedDraft.taskId) || {
          ...storedDraft.form,
          id: storedDraft.taskId
        };
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

  function createTaskFromQuickQueueItem(item) {
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

  function openEditTaskForm(task) {
    clearFormDraft();
    setQuickQueueTaskSourceId(null);
    setEditingTask(task);
    setBlockingTarget(null);
    setFormOpen(true);
  }

  function openCreateBlockingTaskForm(task) {
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

  async function saveTaskForm(taskData) {
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
      await fetchDashboardData(filters);
    } catch (requestError) {
      setError(requestError.message);
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
