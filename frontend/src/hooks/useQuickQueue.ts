import { useEffect, useState } from 'react';
import type { QuickQueueItem, TaskInput } from '../../../shared/types';
import {
  clearDoneQuickQueueItems as clearDoneQuickQueueItemsRequest,
  createQuickQueueItem,
  deleteQuickQueueItem as deleteQuickQueueItemRequest,
  getQuickQueueItems,
  moveQuickQueueItem as moveQuickQueueItemRequest,
  reorderQuickQueueItems as reorderQuickQueueItemsRequest,
  updateQuickQueueItem
} from '../api';

const LEGACY_QUICK_QUEUE_KEY = 'task-app:quick-queue:v1';

type UseQuickQueueOptions = {
  setError?: (message: string) => void;
};

type TaskDraftFromQuickQueue = {
  mode: 'create';
  taskId: null;
  blockingTarget: null;
  form: Partial<TaskInput>;
  dueDate: string;
  dueTime: string;
  blocksTaskIds: string[];
  savedAt: string;
};

type LegacyQuickQueueItem = {
  text?: string;
  done?: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createTaskDraftFromQuickQueueItem(item: Pick<QuickQueueItem, 'text'>): TaskDraftFromQuickQueue {
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

export default function useQuickQueue({ setError }: UseQuickQueueOptions = {}) {
  const [quickQueueItems, setQuickQueueItems] = useState<QuickQueueItem[]>([]);
  const [quickQueueLoading, setQuickQueueLoading] = useState(false);

  async function runQuickQueueAction<T>(action: () => Promise<T>) {
    try {
      setError?.('');
      return await action();
    } catch (error) {
      setError?.(errorMessage(error));
      return null;
    }
  }

  async function refreshQuickQueueItems({ showLoading = true }: { showLoading?: boolean } = {}) {
    if (showLoading) setQuickQueueLoading(true);
    try {
      const items = await getQuickQueueItems();
      setQuickQueueItems(items);
      return items;
    } catch (error) {
      setError?.(errorMessage(error));
      return null;
    } finally {
      if (showLoading) setQuickQueueLoading(false);
    }
  }

  async function importLegacyLocalQueueIfNeeded(remoteItems: QuickQueueItem[] | null | undefined) {
    if (remoteItems?.length) return;
    let storedItems: LegacyQuickQueueItem[] = [];
    try {
      storedItems = JSON.parse(localStorage.getItem(LEGACY_QUICK_QUEUE_KEY) || '[]');
    } catch {
      storedItems = [];
    }
    if (!Array.isArray(storedItems) || !storedItems.length) return;

    try {
      const imported: QuickQueueItem[] = [];
      for (const storedItem of storedItems) {
        const text = String(storedItem.text || '').trim();
        if (!text) continue;
        let item = await createQuickQueueItem(text, 'bottom');
        if (storedItem.done) item = await updateQuickQueueItem(item.id, { done: true });
        imported.push(item);
      }
      localStorage.removeItem(LEGACY_QUICK_QUEUE_KEY);
      setQuickQueueItems(imported);
    } catch (error) {
      setError?.(`Nao foi possivel importar a fila rapida local: ${errorMessage(error)}`);
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

  async function addQuickQueueItem(text: string, placement: 'top' | 'bottom' = 'bottom') {
    await runQuickQueueAction(async () => {
      const item = await createQuickQueueItem(text, placement);
      setQuickQueueItems((current) => placement === 'top' ? [item, ...current] : [...current, item]);
    });
  }

  async function toggleQuickQueueItem(id: string, done: boolean) {
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

  async function deleteQuickQueueItem(id: string) {
    await runQuickQueueAction(async () => {
      await deleteQuickQueueItemRequest(id);
      setQuickQueueItems((current) => current.filter((item) => item.id !== id));
    });
  }

  async function moveQuickQueueItem(id: string, direction: 1 | -1) {
    await runQuickQueueAction(async () => {
      setQuickQueueItems(await moveQuickQueueItemRequest(id, direction));
    });
  }

  async function reorderQuickQueueItems(ids: string[]) {
    await runQuickQueueAction(async () => {
      const previous = quickQueueItems;
      const byId = new Map(previous.map((item) => [item.id, item]));
      const optimistic = ids.map((id, position) => {
        const item = byId.get(id);
        return item ? { ...item, position } : null;
      }).filter(Boolean) as QuickQueueItem[];
      if (optimistic.length === previous.length) setQuickQueueItems(optimistic);
      try {
        setQuickQueueItems(await reorderQuickQueueItemsRequest(ids));
      } catch (error) {
        setQuickQueueItems(previous);
        throw error;
      }
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
    reorderQuickQueueItems,
    clearDoneQuickQueueItems
  };
}
