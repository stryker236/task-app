const { randomUUID } = require('crypto');
const pino = require('pino');
const pinoHttp = require('pino-http');

import type { NextFunction, Request, Response } from 'express';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogMeta = {
  event: string;
  requestId?: string;
  userId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  entity?: string;
  entityId?: string;
  errorCode?: string;
  [key: string]: unknown;
};

type RequestWithLogging = Request & {
  id?: string;
  requestId?: string;
  log?: (level: LogLevel, event: string, metadata?: Record<string, unknown>) => void;
  user?: { id?: string };
};

type StoredLogEntry = {
  time: string;
  level: LogLevel;
  event: string;
  requestId: string | null;
  userId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  metadata: Record<string, unknown>;
  msg: string;
};

const recentLogs: StoredLogEntry[] = [];
const maxRecentLogs = Math.max(100, Math.min(10000, Number(process.env.LOG_BUFFER_SIZE || 2000)));

function rememberLog(level: LogLevel, meta: LogMeta, message: string) {
  const { event, requestId, userId, route, method, statusCode, durationMs, metadata, ...rest } = meta;
  const nested = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  recentLogs.push({
    time: new Date().toISOString(),
    level,
    event,
    requestId: requestId || null,
    userId,
    route,
    method,
    statusCode,
    durationMs,
    metadata: { ...rest, ...nested },
    msg: message
  });
  if (recentLogs.length > maxRecentLogs) recentLogs.splice(0, recentLogs.length - maxRecentLogs);
}

function getRecentLogs() {
  return [...recentLogs].reverse();
}

const redactPaths = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'req.headers.authorization',
  'cookie',
  'req.headers.cookie',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.authorization',
  '*.cookie',
  'metadata.password',
  'metadata.token',
  'metadata.accessToken',
  'metadata.refreshToken',
  'metadata.authorization',
  'metadata.cookie'
];

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]'
  }
});

function normalizeMeta(meta: LogMeta): LogMeta {
  const { event, ...rest } = meta;
  return {
    event,
    ...rest
  };
}

function logInfo(meta: LogMeta, message: string) {
  baseLogger.info(normalizeMeta(meta), message);
}

function logWarn(meta: LogMeta, message: string) {
  baseLogger.warn(normalizeMeta(meta), message);
}

function logError(meta: LogMeta & { err?: unknown }, message: string) {
  baseLogger.error(normalizeMeta(meta), message);
}

function requestLogMeta(req: RequestWithLogging, meta: LogMeta): LogMeta {
  return {
    requestId: req.requestId || String(req.id || req.headers['x-request-id'] || ''),
    userId: req.user?.id,
    route: req.originalUrl || req.url,
    method: req.method,
    ...meta
  };
}

function legacyLog(level: LogLevel, event: string, metadata: Record<string, unknown> = {}) {
  const { metadata: nestedMetadata, ...rest } = metadata;
  const meta = {
    event,
    ...rest,
    ...(nestedMetadata && typeof nestedMetadata === 'object' && !Array.isArray(nestedMetadata)
      ? { metadata: nestedMetadata }
      : {})
  } as LogMeta;
  const message = typeof (nestedMetadata as any)?.message === 'string'
    ? String((nestedMetadata as any).message)
    : event;
  if (level === 'error') return logError(meta, message);
  if (level === 'warn') return logWarn(meta, message);
  return logInfo(meta, message);
}

const httpLogger = pinoHttp({
  logger: baseLogger,
  genReqId(req: RequestWithLogging, res: Response) {
    const requestId = String(req.headers['x-request-id'] || randomUUID());
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    return requestId;
  },
  customProps(req: RequestWithLogging, res: Response) {
    return {
      event: 'http.request.completed',
      requestId: req.requestId || req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      route: req.route?.path ? String(req.route.path) : req.originalUrl || req.url,
      statusCode: res.statusCode,
      userId: req.user?.id
    };
  },
  customSuccessMessage(req: Request, res: Response) {
    return `${req.method} ${req.originalUrl || req.url} ${res.statusCode}`;
  },
  customErrorMessage(req: Request, res: Response) {
    return `${req.method} ${req.originalUrl || req.url} ${res.statusCode}`;
  },
  customAttributeKeys: {
    responseTime: 'durationMs'
  },
  serializers: {
    req(req: any) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort
      };
    },
    res(res: any) {
      return {
        statusCode: res.statusCode
      };
    },
    err: pino.stdSerializers.err
  }
});

function requestLogger(req: RequestWithLogging, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  httpLogger(req, res, () => {
    req.requestId = req.requestId || String(req.id || req.headers['x-request-id'] || randomUUID());
    res.setHeader('x-request-id', req.requestId);
    req.log = (level, event, metadata = {}) => {
      legacyLog(level, event, {
        requestId: req.requestId,
        userId: req.user?.id,
        route: req.originalUrl || req.url,
        method: req.method,
        durationMs: metadata.durationMs,
        ...metadata
      });
    };
    req.log('info', 'http.request.started', {
      path: req.path,
      route: req.originalUrl || req.url,
      method: req.method,
      metadata: {
        path: req.path
      }
    });
    res.on('finish', () => {
      logInfo({
        event: 'http.request.finished',
        requestId: req.requestId,
        userId: req.user?.id,
        route: req.originalUrl || req.url,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      }, 'request finished');
    });
    next();
  });
}

const logger = {
  log: legacyLog,
  debug: (event: string, metadata: Record<string, unknown> = {}) => legacyLog('debug', event, metadata),
  info: (event: string, metadata: Record<string, unknown> = {}) => legacyLog('info', event, metadata),
  warn: (event: string, metadata: Record<string, unknown> = {}) => legacyLog('warn', event, metadata),
  error: (event: string, metadata: Record<string, unknown> = {}) => legacyLog('error', event, metadata)
};

module.exports = {
  logger,
  logInfo,
  logWarn,
  logError,
  requestLogMeta,
  requestLogger
};
