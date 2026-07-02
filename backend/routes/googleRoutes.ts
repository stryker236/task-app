const express = require('express');
const { randomBytes } = require('crypto');
const { encryptJson, decryptJson } = require('../google/tokenCrypto');
const { parseDateOnly } = require('../utils/date');
const {
  GMAIL_SEND_SCOPE,
  GOOGLE_SCOPES,
  createCalendarClient,
  createGmailClient,
  createGoogleAuthUrl,
  createOAuthClient,
  getAccountEmail
} = require('../google/googleClient');

function toCalendar(calendar) {
  return {
    id: calendar.id,
    summary: calendar.summary || '(Sem nome)',
    description: calendar.description || '',
    backgroundColor: calendar.backgroundColor || null,
    foregroundColor: calendar.foregroundColor || null,
    primary: Boolean(calendar.primary),
    selected: calendar.selected !== false,
    accessRole: calendar.accessRole || null
  };
}

function toCalendarEvent(event, sourceCalendar) {
  return {
    id: `${sourceCalendar.id}:${event.id}`,
    calendarId: sourceCalendar.id,
    calendarSummary: sourceCalendar.summary,
    calendarColor: sourceCalendar.backgroundColor,
    summary: event.summary || '(Sem título)',
    description: event.description || '',
    location: event.location || '',
    status: event.status,
    start: event.start?.dateTime || event.start?.date || null,
    end: event.end?.dateTime || event.end?.date || null,
    htmlLink: event.htmlLink || null
  };
}

function getLocalDayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatTaskLine(task) {
  const due = task.dueDateTime
    ? new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(task.dueDateTime))
    : 'Sem hora';
  const priority = ['Baixa', 'Normal', 'Alta', 'Urgente'][Math.max(0, Number(task.priority || 1) - 1)] || `P${task.priority}`;
  const tags = task.tags?.length ? ` [${task.tags.join(', ')}]` : '';
  return `- ${due} · ${task.title} · ${priority} · ${task.status}${tags}`;
}

function buildDailyTasksEmail(tasks) {
  const { start, end } = getLocalDayBounds();
  const active = (task) => !task.isArchived && !['done', 'cancelled'].includes(task.status);
  const todayTasks = tasks
    .filter((task) => active(task) && task.dueDateTime && new Date(task.dueDateTime) >= start && new Date(task.dueDateTime) < end)
    .sort((left, right) => new Date(left.dueDateTime).getTime() - new Date(right.dueDateTime).getTime());
  const overdueTasks = tasks
    .filter((task) => active(task) && task.dueDateTime && new Date(task.dueDateTime) < start)
    .sort((left, right) => new Date(left.dueDateTime).getTime() - new Date(right.dueDateTime).getTime());
  const dateLabel = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(start);
  const lines = [
    `Plano do dia - ${dateLabel}`,
    '',
    `Para hoje (${todayTasks.length})`,
    ...(todayTasks.length ? todayTasks.map(formatTaskLine) : ['- Sem tarefas com prazo para hoje.']),
    '',
    `Atrasadas (${overdueTasks.length})`,
    ...(overdueTasks.length ? overdueTasks.map(formatTaskLine) : ['- Sem tarefas atrasadas.'])
  ];
  return {
    subject: `Plano do dia - ${dateLabel}`,
    body: lines.join('\n'),
    todayCount: todayTasks.length,
    overdueCount: overdueTasks.length
  };
}

function encodeEmail({ to, from, subject, body }) {
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body
  ].join('\r\n');
  return Buffer.from(message, 'utf8').toString('base64url');
}

function createGoogleRouter({
  pool,
  withTransaction,
  fetchTasks,
  fetchGoogleConnection,
  saveGoogleConnection,
  deleteGoogleConnection,
  createGoogleOAuthState,
  consumeGoogleOAuthState
}) {
  const router = express.Router();

  async function getAuthorizedClient() {
    const connection = await fetchGoogleConnection();
    if (!connection) {
      const error = new Error('Google Calendar is not connected');
      (error as any).status = 409;
      throw error;
    }
    const storedTokens = decryptJson(connection.encryptedTokens);
    const authClient = createOAuthClient(storedTokens);
    authClient.on('tokens', (tokens) => {
      saveGoogleConnection(pool, {
        accountEmail: connection.accountEmail,
        scopes: connection.scopes,
        encryptedTokens: { ...storedTokens, ...tokens },
        expiresAt: connection.expiresAt
      }).catch((error) => console.error('Failed to persist refreshed Google tokens:', error.message));
    });
    return {
      connection,
      authClient
    };
  }

  router.get('/google/status', async (req, res, next) => {
    try {
      const connection = await fetchGoogleConnection();
      res.json({
        connected: Boolean(connection),
        accountEmail: connection?.accountEmail || null,
        scopes: connection?.scopes || [],
        expiresAt: connection?.expiresAt || null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/oauth/url', async (req, res, next) => {
    try {
      const state = randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await withTransaction((client) => createGoogleOAuthState(client, state, expiresAt));
      res.json({ url: createGoogleAuthUrl(state), expiresAt });
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/oauth/callback', async (req, res, next) => {
    try {
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      if (!code || !state) return res.status(400).send('Missing OAuth code or state');

      const connection = await withTransaction(async (client) => {
        const validState = await consumeGoogleOAuthState(client, state);
        if (!validState) {
          const error = new Error('Invalid or expired OAuth state');
          (error as any).status = 400;
          throw error;
        }

        const authClient = createOAuthClient();
        const tokenResult = await authClient.getToken(code);
        authClient.setCredentials(tokenResult.tokens);
        const accountEmail = await getAccountEmail(authClient);
        return saveGoogleConnection(client, {
          accountEmail,
          scopes: GOOGLE_SCOPES,
          encryptedTokens: encryptJson(tokenResult.tokens),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
      });

      const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')?.[0] || 'http://localhost:5173';
      return res.redirect(`${frontendUrl.replace(/\/$/, '')}?google=connected&email=${encodeURIComponent(connection.accountEmail || '')}`);
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/google/connection', async (req, res, next) => {
    try {
      await deleteGoogleConnection(pool);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/calendars', async (req, res, next) => {
    try {
      const { connection, authClient } = await getAuthorizedClient();
      const calendar = createCalendarClient(authClient);
      const result = await calendar.calendarList.list({
        minAccessRole: 'reader',
        showDeleted: false,
        showHidden: false
      });

      res.json({
        accountEmail: connection.accountEmail,
        calendars: (result.data.items || []).map(toCalendar)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/gmail/daily-tasks', async (req, res, next) => {
    try {
      const { connection, authClient } = await getAuthorizedClient();
      if (!connection.scopes?.includes(GMAIL_SEND_SCOPE)) {
        const error = new Error('Gmail send permission is required. Reconnect Google to grant email access.');
        (error as any).status = 409;
        throw error;
      }
      const to = String(req.body?.to || connection.accountEmail || '').trim();
      if (!to) {
        const error = new Error('No destination email is available');
        (error as any).status = 400;
        throw error;
      }
      const email = buildDailyTasksEmail(await fetchTasks());
      const gmail = createGmailClient(authClient);
      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodeEmail({
            to,
            from: connection.accountEmail || to,
            subject: email.subject,
            body: email.body
          })
        }
      });
      res.json({
        id: result.data.id,
        to,
        todayCount: email.todayCount,
        overdueCount: email.overdueCount
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/calendar/events', async (req, res, next) => {
    try {
      const start = parseDateOnly(req.query.start);
      const end = parseDateOnly(req.query.end);
      const date = parseDateOnly(req.query.date) || new Date().toISOString().slice(0, 10);
      const rangeStart = start || date;
      const rangeEnd = end || date;
      const timeMin = new Date(`${rangeStart}T00:00:00`).toISOString();
      const timeMax = new Date(`${rangeEnd}T23:59:59.999`).toISOString();
      const { connection, authClient } = await getAuthorizedClient();
      const calendar = createCalendarClient(authClient);
      const requestedCalendarIds = Array.isArray(req.query.calendarId)
        ? req.query.calendarId.map(String).filter(Boolean)
        : req.query.calendarId ? [String(req.query.calendarId)] : ['primary'];
      const calendarListResult = await calendar.calendarList.list({
        minAccessRole: 'reader',
        showDeleted: false,
        showHidden: false
      });
      const calendars = (calendarListResult.data.items || []).map(toCalendar);
      const calendarsById = new Map(calendars.map((item) => [item.id, item]));
      const requestedCalendars = requestedCalendarIds
        .map((calendarId) => calendarsById.get(calendarId) || (calendarId === 'primary' ? calendars.find((item) => item.primary) : null))
        .filter(Boolean);
      const eventResults = await Promise.all(requestedCalendars.map(async (sourceCalendar) => {
        const result = await calendar.events.list({
          calendarId: sourceCalendar.id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime'
        });
        return (result.data.items || []).map((event) => toCalendarEvent(event, sourceCalendar));
      }));
      const events = eventResults.flat().sort((left, right) => String(left.start || '').localeCompare(String(right.start || '')));

      res.json({
        date: start && end ? undefined : date,
        start: rangeStart,
        end: rangeEnd,
        accountEmail: connection.accountEmail,
        calendars: requestedCalendars,
        events
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createGoogleRouter };

export {};
