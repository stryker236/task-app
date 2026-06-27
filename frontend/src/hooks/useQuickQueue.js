import { useEffect, useState } from 'react';

const QUICK_QUEUE_KEY = 'task-app:quick-queue:v1';

export function createTaskDraftFromQuickQueueItem(item) {
  return {
    mode: 'create',
    taskId: null,
    blockingTarget: null,
    form: {
      title: item.text,
      status: 'new',
      priority: 2,
      notes: '',
      tags: [],
      blockedByTaskIds: [],
      relations: [],
      checklistItems: []
    },
    dueDate: '',
    dueTime: '',
    blocksTaskIds: [],
    savedAt: new Date().toISOString()
  };
}

export default function useQuickQueue() {
  const [quickQueueItems, setQuickQueueItems] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(QUICK_QUEUE_KEY));
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(QUICK_QUEUE_KEY, JSON.stringify(quickQueueItems));
  }, [quickQueueItems]);

  function addQuickQueueItem(text) {
    setQuickQueueItems((current) => [
      ...current,
      {
        id: `quick_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        text,
        done: false,
        createdAt: new Date().toISOString()
      }
    ]);
  }

  function toggleQuickQueueItem(id, done) {
    setQuickQueueItems((current) => current.map((item) => (item.id === id ? { ...item, done } : item)));
  }

  function deleteQuickQueueItem(id) {
    setQuickQueueItems((current) => current.filter((item) => item.id !== id));
  }

  function moveQuickQueueItem(id, direction) {
    setQuickQueueItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function clearDoneQuickQueueItems() {
    setQuickQueueItems((current) => current.filter((item) => !item.done));
  }

  return {
    quickQueueItems,
    addQuickQueueItem,
    toggleQuickQueueItem,
    deleteQuickQueueItem,
    moveQuickQueueItem,
    clearDoneQuickQueueItems
  };
}
