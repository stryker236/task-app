require('dotenv').config();

const express = require('express');
const cors = require('cors');
const {
  pool,
  withTransaction,
  fetchTasks,
  insertTask,
  updateTask: updateTaskRecord,
  insertActivity,
  syncInverseRelationships,
  fetchTags,
  deleteUnusedTag,
  deleteUnusedTags,
  checkConnection
} = require('./db/database');
const { createHealthRouter } = require('./routes/healthRoutes');
const { createTagRouter } = require('./routes/tagRoutes');
const { createTaskRouter } = require('./routes/taskRoutes');
const { createAdvisorRouter } = require('./routes/advisorRoutes');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGIN is required in production');
}

async function findTaskById(db, id) {
  return (await fetchTasks(db)).find((task) => task.id === id);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS');
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
  deleteUnusedTag,
  deleteUnusedTags,
  checkConnection,
  findTaskById
};

app.use(createHealthRouter(routeDependencies));
app.use(createTagRouter(routeDependencies));
app.use(createTaskRouter(routeDependencies));
app.use(createAdvisorRouter(routeDependencies));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  console.error(error);
  const databaseErrors = { '23505': 'A record with the same value already exists', '23503': 'A referenced task does not exist', '23514': 'Database constraint validation failed' };
  res.status(error.status || (error.code ? 400 : 500)).json({
    error: databaseErrors[error.code] || error.message || 'Internal server error',
    ...(error.details ? { details: error.details } : {})
  });
});

let server;

async function shutdown(signal) {
  console.log(`${signal} received. Closing HTTP server and PostgreSQL pool...`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
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
