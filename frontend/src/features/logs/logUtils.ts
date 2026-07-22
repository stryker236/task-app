import type { AppLogEntry } from './api';

export type LogColumn = 'time' | 'level' | 'event' | 'requestId' | 'method' | 'route' | 'statusCode' | 'durationMs' | 'metadata' | 'message';
export type LogPreset = 'all' | 'advisor' | 'calendar' | 'slow' | 'errors';

export type RequestGroup = {
  requestId: string;
  logs: AppLogEntry[];
  startedAt: string;
  route: string;
  method: string;
  durationMs: number | null;
  statusCode: number | null;
  errorCount: number;
  warnCount: number;
};

export type LogPresetFilters = {
  level?: string;
  events?: string[];
  routes?: string[];
  minDurationMs?: number;
};

export const COLUMN_LABELS: Record<LogColumn, string> = {
  time: 'Hora',
  level: 'Level',
  event: 'Event',
  requestId: 'Request',
  method: 'Metodo',
  route: 'Route',
  statusCode: 'Status',
  durationMs: 'Duracao',
  metadata: 'Metadata',
  message: 'Mensagem'
};

export const DEFAULT_COLUMNS: LogColumn[] = ['time', 'level', 'event', 'requestId', 'route', 'statusCode', 'durationMs', 'metadata'];

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function levelLabel(level: string | number) {
  if (level === 10) return 'debug';
  if (level === 20) return 'debug';
  if (level === 30) return 'info';
  if (level === 40) return 'warn';
  if (level === 50) return 'error';
  return String(level || 'info').toLowerCase();
}

export function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

export function metadataSummary(metadata: Record<string, unknown>) {
  const nested = metadata.metadata && typeof metadata.metadata === 'object' && !Array.isArray(metadata.metadata)
    ? metadata.metadata as Record<string, unknown>
    : {};
  const entries = Object.entries({ ...metadata, ...nested })
    .filter(([key, value]) => key !== 'metadata' && value != null && value !== '');
  if (!entries.length) return '';
  return entries.slice(0, 4).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: ${value.length}`;
    if (typeof value === 'object') return `${key}: {...}`;
    return `${key}: ${String(value)}`;
  }).join(' | ');
}

export function addUnique(list: string[], value: string) {
  const trimmed = value.trim();
  if (!trimmed || list.includes(trimmed)) return list;
  return [...list, trimmed];
}

export function removeValue(list: string[], value: string) {
  return list.filter((item) => item !== value);
}

export function groupLogsByRequest(logs: AppLogEntry[]): RequestGroup[] {
  const map = new Map<string, AppLogEntry[]>();
  logs.forEach((log, index) => {
    const key = String(log.requestId || `no-request-${index}`);
    map.set(key, [...(map.get(key) || []), log]);
  });
  return [...map.entries()].map(([requestId, entries]) => {
    const sorted = [...entries].sort((left, right) => Date.parse(left.time || left.timestamp || '') - Date.parse(right.time || right.timestamp || ''));
    const finished = [...sorted].reverse().find((log) => typeof log.durationMs === 'number' || log.statusCode != null);
    return {
      requestId,
      logs: sorted,
      startedAt: sorted[0]?.time || sorted[0]?.timestamp || '',
      route: finished?.route || sorted.find((log) => log.route)?.route || '-',
      method: finished?.method || sorted.find((log) => log.method)?.method || '-',
      durationMs: typeof finished?.durationMs === 'number' ? finished.durationMs : null,
      statusCode: typeof finished?.statusCode === 'number' ? finished.statusCode : null,
      errorCount: sorted.filter((log) => levelLabel(log.level) === 'error').length,
      warnCount: sorted.filter((log) => levelLabel(log.level) === 'warn').length
    };
  }).sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}

export function presetFilters(preset: LogPreset): LogPresetFilters {
  if (preset === 'advisor') return { events: ['advisor'], routes: ['/ai/advisor', '/ai/commands'] };
  if (preset === 'calendar') return { events: ['calendar'], routes: ['/google/calendar', '/ai/advisor'] };
  if (preset === 'slow') return { minDurationMs: 750 };
  if (preset === 'errors') return { level: 'error' };
  return {};
}
