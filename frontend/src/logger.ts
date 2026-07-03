import { sendClientLog } from './api';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogMetadata = Record<string, unknown>;

function shouldSendToBackend() {
  return import.meta.env.PROD || localStorage.getItem('task-app:send-client-logs') === 'true';
}

export function clientLog(level: LogLevel, event: string, message = '', metadata: LogMetadata = {}, requestId = '') {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    metadata,
    requestId
  };
  if (import.meta.env.DEV) {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method]('[task-app]', entry);
  }
  if (shouldSendToBackend()) {
    sendClientLog(entry).catch(() => {
      // Avoid recursive logging failures.
    });
  }
}
