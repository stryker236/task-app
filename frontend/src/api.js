const API_URL = import.meta.env.VITE_API_URL || '/api';

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = data.details?.length ? `: ${data.details.join('; ')}` : '';
    throw new Error(`${data.error || 'O pedido falhou'}${details}`);
  }
  return data;
}

export function getTasks(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key === 'tags' ? 'tag' : key, String(item)));
    } else if (value !== '' && value !== false && value != null) {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return requestJson(`/tasks${query ? `?${query}` : ''}`);
}

export function getTags(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return requestJson(`/tags${query}`);
}

export function getTaskAdvisorAdvice(limit = 5) {
  return requestJson(`/advisor?limit=${encodeURIComponent(limit)}`);
}

export function requestTaskAdvisorCommands(action) {
  return requestJson('/ai/advisor/request', {
    method: 'POST',
    body: JSON.stringify({ action })
  });
}

export function applyAiCommands(commands) {
  return requestJson('/ai/commands/apply', {
    method: 'POST',
    body: JSON.stringify({ commands })
  });
}

export const deleteTag = (id, { force = false } = {}) => requestJson(`/tags/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
export const deleteTags = (ids, { force = false } = {}) => requestJson('/tags', { method: 'DELETE', body: JSON.stringify({ ids, force }) });

export const createTask = (task) => requestJson('/tasks', { method: 'POST', body: JSON.stringify(task) });
export const updateTask = (id, task) => requestJson(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) });
export const deleteTask = (id) => requestJson(`/tasks/${id}`, { method: 'DELETE' });
export const duplicateTask = (id) => requestJson(`/tasks/${id}/duplicate`, { method: 'POST' });
export const archiveTask = (id) => requestJson(`/tasks/${id}/archive`, { method: 'POST' });
export const archiveTasksByStatus = (status) => requestJson('/tasks/archive-bulk', { method: 'POST', body: JSON.stringify({ status }) });
export const restoreTask = (id) => requestJson(`/tasks/${id}/archive`, { method: 'DELETE' });
export const toggleChecklistItem = (taskId, itemId, isDone) => requestJson(`/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isDone }) });
export const addTaskProgressEntry = (taskId, message) => requestJson(`/tasks/${taskId}/progress`, { method: 'POST', body: JSON.stringify({ message }) });
export const editTaskProgressEntry = (taskId, entryId, message) => requestJson(`/tasks/${taskId}/progress/${entryId}`, { method: 'PUT', body: JSON.stringify({ message }) });
export const createBlockingTask = (blockedTaskId, task) => requestJson(`/tasks/${blockedTaskId}/blockers`, { method: 'POST', body: JSON.stringify(task) });
