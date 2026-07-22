import type { SharedNote, SharedNoteInput, Task } from '../../../../shared/types';
import { requestJson } from '../../shared/api/requestJson';

export const getSharedNotes = (search = '') => requestJson<SharedNote[]>(`/shared-notes${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const createSharedNote = (note: SharedNoteInput) => requestJson<SharedNote>('/shared-notes', { method: 'POST', body: JSON.stringify(note) });
export const updateSharedNote = (id: string, note: Partial<SharedNoteInput>) => requestJson<SharedNote>(`/shared-notes/${id}`, { method: 'PUT', body: JSON.stringify(note) });
export const archiveSharedNote = (id: string) => requestJson<void>(`/shared-notes/${id}`, { method: 'DELETE' });
export const attachSharedNoteToTask = (taskId: string, noteId: string) => requestJson<Task>(`/tasks/${taskId}/shared-notes`, { method: 'POST', body: JSON.stringify({ noteId }) });
export const createTaskSharedNote = (taskId: string, note: SharedNoteInput) => requestJson<Task>(`/tasks/${taskId}/shared-notes/create`, { method: 'POST', body: JSON.stringify(note) });
export const detachSharedNoteFromTask = (taskId: string, noteId: string) => requestJson<Task>(`/tasks/${taskId}/shared-notes/${noteId}`, { method: 'DELETE' });
