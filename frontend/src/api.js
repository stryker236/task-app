const API_URL = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
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
    if (value !== '' && value !== false && value != null) params.set(key, String(value));
  });
  const query = params.toString();
  return request(`/tasks${query ? `?${query}` : ''}`);
}

export function getTags(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return request(`/tags${query}`);
}

export const createTask = (task) => request('/tasks', { method: 'POST', body: JSON.stringify(task) });
export const updateTask = (id, task) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) });
export const deleteTask = (id) => request(`/tasks/${id}`, { method: 'DELETE' });
export const duplicateTask = (id) => request(`/tasks/${id}/duplicate`, { method: 'POST' });
export const addProgress = (id, message) => request(`/tasks/${id}/progress`, { method: 'POST', body: JSON.stringify({ message }) });
export const editProgress = (id, entryId, message) => request(`/tasks/${id}/progress/${entryId}`, { method: 'PUT', body: JSON.stringify({ message }) });
export const createBlocker = (id, task) => request(`/tasks/${id}/blockers`, { method: 'POST', body: JSON.stringify(task) });
