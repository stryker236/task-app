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
  createGoogleOAuthState,
  consumeGoogleOAuthState,
  checkConnection
} = require('./db/database');
const { createHealthRouter } = require('./routes/healthRoutes');
const { createTagRouter } = require('./routes/tagRoutes');
const { createSharedNoteRouter } = require('./routes/sharedNoteRoutes');
const { createTaskRouter } = require('./routes/taskRoutes');
const { createAdvisorRouter } = require('./routes/advisorRoutes');
const { createQuickQueueRouter } = require('./routes/quickQueueRoutes');
const { createGoogleRouter } = require('./routes/googleRoutes');

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
app.use(createQuickQueueRouter(routeDependencies));
app.use(createGoogleRouter(routeDependencies));

app.use((req: Request, res: Response) => res.status(404).json({ error: 'Route not found' }));
app.use((error: HttpError, req: Request, res: Response, next: NextFunction) => {
  console.error(error);
  const databaseErrors: Record<string, string> = { '23505': 'A record with the same value already exists', '23503': 'A referenced task does not exist', '23514': 'Database constraint validation failed' };
  res.status(error.status || (error.code ? 400 : 500)).json({
    error: (error.code ? databaseErrors[error.code] : undefined) || error.message || 'Internal server error',
    ...(error.details ? { details: error.details } : {})
  });
});

let server: Server | undefined;

async function shutdown(signal) {
  console.log(`${signal} received. Closing HTTP server and PostgreSQL pool...`);
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
  console.log(`Task App API listening on http://${HOST}:${PORT}`);
  checkConnection()
    .then((connection) => console.log(`Connected to Supabase PostgreSQL database: ${connection.database}`))
    .catch((error) => console.error('Supabase PostgreSQL is not ready:', error.message));
});

export {};
