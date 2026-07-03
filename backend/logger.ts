const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const pino = require('pino');

import type { NextFunction, Request, Response } from 'express';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogMetadata = Record<string, unknown>;
type RequestWithLogger = Request & {
  requestId?: string;
  log?: (level: LogLevel, event: string, metadata?: LogMetadata) => void;
};

const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
fs.mkdirSync(LOG_DIR, { recursive: true });
const maxLogBytes = Number(process.env.LOG_MAX_BYTES || 10 * 1024 * 1024);
if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > maxLogBytes) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(LOG_FILE, path.join(LOG_DIR, `app-${stamp}.log`));
}

const stream = pino.destination({ dest: LOG_FILE, sync: false, mkdir: true });
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'metadata.cookie',
      'metadata.cookies',
      'metadata.authorization',
      'metadata.oauthCode',
      'metadata.code',
      'metadata.tokens',
      'metadata.encryptedTokens'
    ],
    remove: true
  }
}, stream);

function sanitizeMetadata(metadata: LogMetadata = {}) {
  const copy = { ...metadata };
  delete copy.cookie;
  delete copy.cookies;
  delete copy.authorization;
  delete copy.oauthCode;
  delete copy.code;
  delete copy.tokens;
  delete copy.encryptedTokens;
  return copy;
}

function writeLog(level: LogLevel, event: string, metadata: LogMetadata = {}) {
  baseLogger[level]({
    timestamp: new Date().toISOString(),
    event,
    requestId: metadata.requestId || null,
    client: metadata.client || null,
    route: metadata.route || null,
    durationMs: metadata.durationMs ?? null,
    metadata: sanitizeMetadata(metadata.metadata && typeof metadata.metadata === 'object'
      ? metadata.metadata as LogMetadata
      : metadata)
  });
}

function requestLogger(req: RequestWithLogger, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const requestId = String(req.headers['x-request-id'] || randomUUID());
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  req.log = (level, event, metadata = {}) => writeLog(level, event, {
    requestId,
    client: req.ip,
    route: req.originalUrl || req.url,
    ...metadata
  });
  req.log('info', 'http.request.started', {
    metadata: {
      method: req.method,
      path: req.path
    }
  });
  res.on('finish', () => {
    req.log?.('info', 'http.request.completed', {
      durationMs: Date.now() - startedAt,
      metadata: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode
      }
    });
  });
  next();
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

async function readLogs({
  level = '',
  event = '',
  requestId = '',
  requestIds = [],
  excludeRequestIds = [],
  events = [],
  excludeEvents = [],
  search = '',
  limit = 200
} = {}) {
  if (!fs.existsSync(LOG_FILE)) return [];
  const content = await fs.promises.readFile(LOG_FILE, 'utf8');
  const term = String(search || '').toLocaleLowerCase();
  const includeRequestIds = [...new Set([...normalizeList(requestId), ...normalizeList(requestIds)])];
  const excludedRequestIds = new Set(normalizeList(excludeRequestIds));
  const includeEvents = [...new Set([...normalizeList(event), ...normalizeList(events)])];
  const excludedEvents = normalizeList(excludeEvents);
  const rows = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((row) => !level || row.level === level || pino.levels.labels[row.level] === level)
    .filter((row) => !includeEvents.length || includeEvents.some((item) => String(row.event || '').includes(item)))
    .filter((row) => !excludedEvents.length || !excludedEvents.some((item) => String(row.event || '').includes(item)))
    .filter((row) => !includeRequestIds.length || includeRequestIds.includes(String(row.requestId || '')))
    .filter((row) => !excludedRequestIds.has(String(row.requestId || '')))
    .filter((row) => !term || JSON.stringify(row).toLocaleLowerCase().includes(term));
  return rows.slice(-Math.max(1, Math.min(1000, Number(limit) || 200))).reverse();
}

module.exports = {
  LOG_FILE,
  logger: { log: writeLog, debug: (event, metadata = {}) => writeLog('debug', event, metadata), info: (event, metadata = {}) => writeLog('info', event, metadata), warn: (event, metadata = {}) => writeLog('warn', event, metadata), error: (event, metadata = {}) => writeLog('error', event, metadata) },
  readLogs,
  requestLogger
};

export {};
