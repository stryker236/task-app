require('dotenv').config();

const express = require('express');
const cors = require('cors');
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'http';
import type { PoolClient, Pool as PgPool } from 'pg';
const {
  pool,
  withTransaction,
  fetchTasks,
  insertTask,
  updateTask: updateTaskRecord,
  insertActivity,
  syncInverseRelationships,
  fetchTags,
  fetchSharedNotes,
  createSharedNote,
  updateSharedNote,
  archiveSharedNote,
  attachSharedNoteToTask,
  detachSharedNoteFromTask,
  deleteUnusedTag,
  deleteUnusedTags,
  fetchQuickQueueItems,
  createQuickQueueItem,
  updateQuickQueueItem,
  deleteQuickQueueItem,
  clearDoneQuickQueueItems,
  moveQuickQueueItem,
  fetchGoogleConnection,
  saveGoogleConnection,
  deleteGoogleConnection,
  fetchTaskCalendarEvents,
  insertTaskCalendarEvent,
  deleteTaskCalendarEventsByCalendarId,
  fetchAdvisorMemoryRules,
  saveAdvisorFeedback,
  upsertAdvisorMemoryRule,
  deleteAdvisorMemoryRule,
  fetchSchedulerRules,
  fetchActiveSchedulerRules,
  findSchedulerRuleById,
  createSchedulerRule,
  updateSchedulerRule,
  deleteSchedulerRule,
  fetchCommittedSchedulerReservedBlocks,
  createSchedulerScheduleBatch,
  createGoogleOAuthState,
  consumeGoogleOAuthState,
  checkConnection
} = require('./db/database');
const { createHealthRouter } = require('./routes/healthRoutes');
const { createTagRouter } = require('./routes/tagRoutes');
const { createSharedNoteRouter } = require('./routes/sharedNoteRoutes');
const { createTaskRouter } = require('./routes/taskRoutes');
const { createAdvisorRouter } = require('./routes/advisorRoutes');
const { createSchedulerRuleRouter } = require('./routes/schedulerRuleRoutes');
const { createQuickQueueRouter } = require('./routes/quickQueueRoutes');
const { createGoogleRouter } = require('./routes/googleRoutes');
const { createLogRouter } = require('./routes/logRoutes');
const { logger, requestLogger } = require('./logger');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGIN is required in production');
}

type HttpError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

type Queryable = PgPool | PoolClient;
type TaskLike = Record<string, any>;

async function findTaskById(db: Queryable, id: string): Promise<TaskLike | undefined> {
  return (await fetchTasks(db)).find((task) => task.id === id);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS') as HttpError;
    error.status = 403;
    callback(error);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

const routeDependencies = {
  pool,
  withTransaction,
  fetchTasks,
  insertTask,
  updateTaskRecord,
  insertActivity,
  syncInverseRelationships,
  fetchTags,
  fetchSharedNotes,
  createSharedNote,
  updateSharedNote,
  archiveSharedNote,
  attachSharedNoteToTask,
  detachSharedNoteFromTask,
  deleteUnusedTag,
  deleteUnusedTags,
  fetchQuickQueueItems,
  createQuickQueueItem,
  updateQuickQueueItem,
  deleteQuickQueueItem,
  clearDoneQuickQueueItems,
  moveQuickQueueItem,
  fetchGoogleConnection,
  saveGoogleConnection,
  deleteGoogleConnection,
  fetchTaskCalendarEvents,
  insertTaskCalendarEvent,
  deleteTaskCalendarEventsByCalendarId,
  fetchAdvisorMemoryRules,
  saveAdvisorFeedback,
  upsertAdvisorMemoryRule,
  deleteAdvisorMemoryRule,
  fetchSchedulerRules,
  fetchActiveSchedulerRules,
  findSchedulerRuleById,
  createSchedulerRule,
  updateSchedulerRule,
  deleteSchedulerRule,
  fetchCommittedSchedulerReservedBlocks,
  createSchedulerScheduleBatch,
  createGoogleOAuthState,
  consumeGoogleOAuthState,
  checkConnection,
  findTaskById
};

app.use(createHealthRouter(routeDependencies));
app.use(createTagRouter(routeDependencies));
app.use(createSharedNoteRouter(routeDependencies));
app.use(createTaskRouter(routeDependencies));
app.use(createAdvisorRouter(routeDependencies));
app.use(createSchedulerRuleRouter(routeDependencies));
app.use('/api', createSchedulerRuleRouter(routeDependencies));
app.use(createQuickQueueRouter(routeDependencies));
app.use(createGoogleRouter(routeDependencies));
app.use(createLogRouter());

app.use((req: Request, res: Response) => res.status(404).json({ error: 'Route not found' }));
app.use((error: HttpError, req: Request, res: Response, next: NextFunction) => {
  logger.error('http.request.error', {
    requestId: (req as any).requestId || null,
    route: req.originalUrl,
    client: req.ip,
    metadata: {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details
    }
  });
  const databaseErrors: Record<string, string> = { '23505': 'A record with the same value already exists', '23503': 'A referenced task does not exist', '23514': 'Database constraint validation failed' };
  res.status(error.status || (error.code ? 400 : 500)).json({
    error: (error.code ? databaseErrors[error.code] : undefined) || error.message || 'Internal server error',
    ...(error.details ? { details: error.details } : {})
  });
});

let server: Server | undefined;

async function shutdown(signal) {
  logger.info('server.shutdown.started', { metadata: { signal } });
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  if (server) {
    await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
  }
  await pool.end();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server = app.listen(PORT, HOST, () => {
  logger.info('server.started', { metadata: { url: `http://${HOST}:${PORT}` } });
  checkConnection()
    .then((connection) => logger.info('db.connection.ready', { metadata: { database: connection.database } }))
    .catch((error) => logger.error('db.connection.failed', { metadata: { message: error.message } }));
});

export {};
