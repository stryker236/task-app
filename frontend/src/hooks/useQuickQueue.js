import { useEffect, useState } from 'react';
import {
  clearDoneQuickQueueItems as clearDoneQuickQueueItemsRequest,
  createQuickQueueItem,
  deleteQuickQueueItem as deleteQuickQueueItemRequest,
  getQuickQueueItems,
  moveQuickQueueItem as moveQuickQueueItemRequest,
  updateQuickQueueItem
} from '../api';

const LEGACY_QUICK_QUEUE_KEY = 'task-app:quick-queue:v1';

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

export default function useQuickQueue({ setError } = {}) {
  const [quickQueueItems, setQuickQueueItems] = useState([]);
  const [quickQueueLoading, setQuickQueueLoading] = useState(false);

  async function runQuickQueueAction(action) {
    try {
      setError?.('');
      return await action();
    } catch (error) {
      setError?.(error.message);
      return null;
    }
  }

  async function refreshQuickQueueItems({ showLoading = true } = {}) {
    if (showLoading) setQuickQueueLoading(true);
    try {
      const items = await getQuickQueueItems();
      setQuickQueueItems(items);
      return items;
    } catch (error) {
      setError?.(error.message);
      return null;
    } finally {
      if (showLoading) setQuickQueueLoading(false);
    }
  }

  async function importLegacyLocalQueueIfNeeded(remoteItems) {
    if (remoteItems?.length) return;
    let storedItems = [];
    try {
      storedItems = JSON.parse(localStorage.getItem(LEGACY_QUICK_QUEUE_KEY)) || [];
    } catch {
      storedItems = [];
    }
    if (!Array.isArray(storedItems) || !storedItems.length) return;

    try {
      const imported = [];
      for (const storedItem of storedItems) {
        const text = String(storedItem.text || '').trim();
        if (!text) continue;
        let item = await createQuickQueueItem(text);
        if (storedItem.done) item = await updateQuickQueueItem(item.id, { done: true });
        imported.push(item);
      }
      localStorage.removeItem(LEGACY_QUICK_QUEUE_KEY);
      setQuickQueueItems(imported);
    } catch (error) {
      setError?.(`Não foi possível importar a fila rápida local: ${error.message}`);
    }
  }

  useEffect(() => {
    refreshQuickQueueItems().then(importLegacyLocalQueueIfNeeded);
    const refreshSilently = () => refreshQuickQueueItems({ showLoading: false });
    window.addEventListener('focus', refreshSilently);
    const interval = window.setInterval(refreshSilently, 15_000);
    return () => {
      window.removeEventListener('focus', refreshSilently);
      window.clearInterval(interval);
    };
  }, []);

  async function addQuickQueueItem(text) {
    await runQuickQueueAction(async () => {
      const item = await createQuickQueueItem(text);
      setQuickQueueItems((current) => [...current, item]);
    });
  }

  async function toggleQuickQueueItem(id, done) {
    await runQuickQueueAction(async () => {
      const previous = quickQueueItems;
      setQuickQueueItems((current) => current.map((item) => (item.id === id ? { ...item, done } : item)));
      try {
        const item = await updateQuickQueueItem(id, { done });
        setQuickQueueItems((current) => current.map((currentItem) => (currentItem.id === id ? item : currentItem)));
      } catch (error) {
        setQuickQueueItems(previous);
        throw error;
      }
    });
  }

  async function deleteQuickQueueItem(id) {
    await runQuickQueueAction(async () => {
      await deleteQuickQueueItemRequest(id);
      setQuickQueueItems((current) => current.filter((item) => item.id !== id));
    });
  }

  async function moveQuickQueueItem(id, direction) {
    await runQuickQueueAction(async () => {
      setQuickQueueItems(await moveQuickQueueItemRequest(id, direction));
    });
  }

  async function clearDoneQuickQueueItems() {
    await runQuickQueueAction(async () => {
      setQuickQueueItems(await clearDoneQuickQueueItemsRequest());
    });
  }

  return {
    quickQueueItems,
    quickQueueLoading,
    refreshQuickQueueItems,
    addQuickQueueItem,
    toggleQuickQueueItem,
    deleteQuickQueueItem,
    moveQuickQueueItem,
    clearDoneQuickQueueItems
  };
}
