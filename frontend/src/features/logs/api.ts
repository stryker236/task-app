import { requestJson } from '../../shared/api/requestJson';

export type AppLogEntry = {
  time?: string;
  timestamp?: string;
  level: number | string;
  event?: string;
  requestId?: string | null;
  client?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  msg?: string;
};

export const getLogs = (filters: {
  level?: string;
  event?: string;
  route?: string;
  requestId?: string;
  requestIds?: string[];
  excludeRequestIds?: string[];
  events?: string[];
  excludeEvents?: string[];
  routes?: string[];
  excludeRoutes?: string[];
  search?: string;
  statusCode?: number | '';
  minDurationMs?: number | '';
  limit?: number;
} = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => params.append(key, item));
    } else if (value) {
      params.set(key, String(value));
    }
  });
  return requestJson<{ logs: AppLogEntry[] }>(`/logs${params.toString() ? `?${params}` : ''}`);
};

export const sendClientLog = (log: { level: string; event: string; message?: string; metadata?: Record<string, unknown>; requestId?: string }) => requestJson<void>('/client-logs', { method: 'POST', body: JSON.stringify(log) });
