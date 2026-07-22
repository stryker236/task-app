import type { QuickQueueItem } from '../../../../shared/types';
import { requestJson } from '../../shared/api/requestJson';

type QuickQueuePatch = Partial<Pick<QuickQueueItem, 'text' | 'done' | 'position'>>;

export const getQuickQueueItems = () => requestJson<QuickQueueItem[]>('/quick-queue');
export const createQuickQueueItem = (text: string, placement: 'top' | 'bottom' = 'bottom') => requestJson<QuickQueueItem>('/quick-queue', { method: 'POST', body: JSON.stringify({ text, placement }) });
export const updateQuickQueueItem = (id: string, patch: QuickQueuePatch) => requestJson<QuickQueueItem>(`/quick-queue/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteQuickQueueItem = (id: string) => requestJson<void>(`/quick-queue/${id}`, { method: 'DELETE' });
export const moveQuickQueueItem = (id: string, direction: 1 | -1) => requestJson<QuickQueueItem[]>(`/quick-queue/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
export const reorderQuickQueueItems = (ids: string[]) => requestJson<QuickQueueItem[]>('/quick-queue/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
export const clearDoneQuickQueueItems = () => requestJson<QuickQueueItem[]>('/quick-queue/done', { method: 'DELETE' });
