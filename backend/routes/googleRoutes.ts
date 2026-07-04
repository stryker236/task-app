const express = require('express');
const { randomBytes } = require('crypto');
const { encryptJson, decryptJson } = require('../google/tokenCrypto');
const { parseDateOnly } = require('../utils/date');
const {
  CALENDAR_SCOPE,
  GMAIL_SEND_SCOPE,
  GOOGLE_SCOPES,
  createCalendarClient,
  createGmailClient,
  createGoogleAuthUrl,
  createOAuthClient,
  getAccountEmail
} = require('../google/googleClient');
const { logger } = require('../logger');

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
    rawId: event.id,
    googleEventId: event.id,
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

function getLocalDayBounds(dateValue = '') {
  const start = parseDateOnly(dateValue) ? new Date(`${dateValue}T00:00:00`) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatTime(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'dia todo';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function durationMinutes(start, end) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(start || '')) || /^\d{4}-\d{2}-\d{2}$/.test(String(end || ''))) return null;
  const startTime = Date.parse(start || '');
  const endTime = Date.parse(end || '');
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) return null;
  return Math.max(1, Math.round((endTime - startTime) / 60000));
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return 'tempo por definir';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h${String(remainder).padStart(2, '0')}` : `${hours}h`;
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

function taskByLinkedGoogleEvent(tasks, calendarId, googleEventId) {
  if (!googleEventId) return null;
  return tasks.find((task) => (task.calendarEvents || []).some((event) => (
    event.googleEventId === googleEventId
    && (!calendarId || event.calendarId === calendarId)
  ))) || null;
}

function formatWarmTaskLine(task) {
  const due = task.dueDateTime ? formatTime(task.dueDateTime) : 'Sem hora';
  const priority = ['Baixa', 'Normal', 'Alta', 'Urgente'][Math.max(0, Number(task.priority || 1) - 1)] || `P${task.priority}`;
  const tags = task.tags?.length ? ` [${task.tags.join(', ')}]` : '';
  const estimate = task.estimatedMinutes ? ` - estimativa ${formatDuration(Number(task.estimatedMinutes))}` : '';
  return `- ${due} - ${task.title} - ${priority} - ${task.status}${estimate}${tags}`;
}

function buildCalendarAgendaEmail({ tasks, events, calendarSummary, date }) {
  const { start, end } = getLocalDayBounds(date);
  const active = (task) => !task.isArchived && !['done', 'cancelled'].includes(task.status);
  const agendaItems = events
    .map((event) => {
      const linkedTask = taskByLinkedGoogleEvent(tasks, event.calendarId, event.googleEventId || event.rawId);
      const eventDuration = durationMinutes(event.start, event.end);
      const taskEstimate = Number(linkedTask?.estimatedMinutes || 0) || null;
      return {
        event,
        linkedTask,
        start: event.start || '',
        title: linkedTask?.title || event.summary || '(Sem titulo)',
        duration: eventDuration || taskEstimate,
        estimateSource: eventDuration ? 'calendario' : taskEstimate ? 'task' : ''
      };
    })
    .sort((left, right) => String(left.start || '').localeCompare(String(right.start || '')));
  const todayTasks = tasks
    .filter((task) => active(task) && task.dueDateTime && new Date(task.dueDateTime) >= start && new Date(task.dueDateTime) < end)
    .sort((left, right) => new Date(left.dueDateTime).getTime() - new Date(right.dueDateTime).getTime());
  const overdueTasks = tasks
    .filter((task) => active(task) && task.dueDateTime && new Date(task.dueDateTime) < start)
    .sort((left, right) => new Date(left.dueDateTime).getTime() - new Date(right.dueDateTime).getTime());
  const dateLabel = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(start);
  const totalMinutes = agendaItems.reduce((total, item) => total + (item.duration || 0), 0);
  const agendaLines = agendaItems.length
    ? agendaItems.map((item) => {
      const time = item.event.start && item.event.end ? `${formatTime(item.event.start)}-${formatTime(item.event.end)}` : formatTime(item.event.start) || 'Sem hora';
      const source = item.estimateSource === 'task' ? 'estimativa da task' : item.estimateSource === 'calendario' ? 'no calendario' : 'estimativa em falta';
      const status = item.linkedTask?.status ? ` - ${item.linkedTask.status}` : '';
      const tags = item.linkedTask?.tags?.length ? ` - #${item.linkedTask.tags.join(' #')}` : '';
      return `- ${time} - ${item.title} - ${formatDuration(item.duration)} (${source})${status}${tags}`;
    })
    : [`- Ainda nao tens eventos no calendario "${calendarSummary}" para hoje.`];
  const lines = [
    'Bom dia! Aqui vai um resumo calmo e pratico do teu dia.',
    '',
    `Hoje e ${dateLabel}. Vou focar-me no calendario "${calendarSummary}".`,
    agendaItems.length
      ? `Tens ${agendaItems.length} bloco${agendaItems.length === 1 ? '' : 's'} planeado${agendaItems.length === 1 ? '' : 's'}, num total aproximado de ${formatDuration(totalMinutes)}.`
      : 'Nao encontrei blocos planeados nesse calendario para hoje.',
    '',
    'Agenda do calendario default',
    ...agendaLines,
    '',
    'Notas rapidas',
    agendaItems.length
      ? '- Segue a ordem dos blocos e ajusta se algum compromisso real mudar.'
      : '- Se quiseres um plano mais acionavel, cria eventos para as tasks que queres mesmo executar hoje.',
    overdueTasks.length
      ? `- Tens ${overdueTasks.length} task${overdueTasks.length === 1 ? '' : 's'} atrasada${overdueTasks.length === 1 ? '' : 's'}; vale reservar um bloco curto para limpar isto.`
      : '- Nao tens tasks atrasadas com prazo, bom sinal.',
    '',
    `Tasks com due date hoje (${todayTasks.length})`,
    ...(todayTasks.length ? todayTasks.map(formatWarmTaskLine) : ['- Sem tarefas com prazo para hoje.']),
    '',
    `Tasks atrasadas (${overdueTasks.length})`,
    ...(overdueTasks.length ? overdueTasks.map(formatWarmTaskLine) : ['- Sem tarefas atrasadas.'])
  ];
  return {
    subject: `O teu plano de hoje - ${dateLabel}`,
    body: lines.join('\n'),
    eventCount: agendaItems.length,
    totalMinutes,
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
  consumeGoogleOAuthState,
  fetchTaskCalendarEvents,
  insertTaskCalendarEvent
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
      }).catch((error) => logger.error('calendar.connection.token_refresh_failed', { metadata: { message: error.message } }));
    });
    return {
      connection,
      authClient
    };
  }

  router.get('/google/status', async (req, res, next) => {
    try {
      const connection = await fetchGoogleConnection();
      (req as any).log?.('info', 'calendar.connection.status', {
        metadata: { connected: Boolean(connection), scopes: connection?.scopes || [] }
      });
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
      const calendar = createCalendarClient(authClient);
      const calendarListResult = await calendar.calendarList.list({
        minAccessRole: 'reader',
        showDeleted: false,
        showHidden: false
      });
      const calendars = (calendarListResult.data.items || []).map(toCalendar);
      const requestedCalendarId = String(req.body?.calendarId || '').trim();
      const requestedDate = parseDateOnly(req.body?.date) || new Date().toISOString().slice(0, 10);
      const defaultCalendar = calendars.find((item) => requestedCalendarId && item.id === requestedCalendarId)
        || calendars.find((item) => String(item.summary || '').toLocaleLowerCase() === 'aiadvisor')
        || calendars.find((item) => item.primary)
        || calendars[0]
        || { id: 'primary', summary: 'primary' };
      const { start, end } = getLocalDayBounds(requestedDate);
      const eventsResult = await calendar.events.list({
        calendarId: defaultCalendar.id,
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });
      const email = buildCalendarAgendaEmail({
        tasks: await fetchTasks(),
        events: (eventsResult.data.items || []).map((event) => toCalendarEvent(event, defaultCalendar)),
        calendarSummary: defaultCalendar.summary || defaultCalendar.id,
        date: requestedDate
      });
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
        date: requestedDate,
        calendarId: defaultCalendar.id,
        calendarSummary: defaultCalendar.summary || defaultCalendar.id,
        eventCount: email.eventCount,
        totalMinutes: email.totalMinutes,
        todayCount: email.todayCount,
        overdueCount: email.overdueCount
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/calendar/events', async (req, res, next) => {
    try {
      const startedAt = Date.now();
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
      (req as any).log?.('info', 'calendar.events.fetch.started', {
        metadata: { rangeStart, rangeEnd, requestedCalendarIds }
      });
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
      (req as any).log?.('info', 'calendar.events.fetch.completed', {
        durationMs: Date.now() - startedAt,
        metadata: { rangeStart, rangeEnd, calendarCount: requestedCalendars.length, eventCount: events.length }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/calendar/events', async (req, res, next) => {
    try {
      const taskId = String(req.body?.taskId || '').trim();
      const summary = String(req.body?.summary || '').trim();
      const calendarId = String(req.body?.calendarId || 'primary').trim() || 'primary';
      const description = String(req.body?.description || '').trim();
      const location = String(req.body?.location || '').trim();
      const start = String(req.body?.start || '').trim();
      const end = String(req.body?.end || '').trim();
      const timeZone = String(req.body?.timeZone || '').trim();
      const startTime = Date.parse(start);
      const endTime = Date.parse(end);

      if (!taskId) return res.status(400).json({ error: 'taskId is required' });
      if (!summary) return res.status(400).json({ error: 'summary is required' });
      if (!start || Number.isNaN(startTime)) return res.status(400).json({ error: 'start must be a valid ISO date-time' });
      if (!end || Number.isNaN(endTime)) return res.status(400).json({ error: 'end must be a valid ISO date-time' });
      if (endTime <= startTime) return res.status(400).json({ error: 'end must be after start' });
      if (startTime < Date.now()) return res.status(400).json({ error: 'start cannot be in the past' });

      const tasks = await fetchTasks();
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const linkedEvents = await fetchTaskCalendarEvents(pool, taskId);
      (req as any).log?.('info', 'calendar.event.duplicate_check', {
        metadata: { taskId, linkedEventCount: linkedEvents.length, calendarId }
      });
      if (linkedEvents.length) {
        return res.status(409).json({ error: 'Task already has a linked calendar event', event: linkedEvents[0] });
      }

      const { connection, authClient } = await getAuthorizedClient();
      if (!connection.scopes?.includes(CALENDAR_SCOPE)) {
        const error = new Error('Google Calendar write permission is required. Reconnect Google to grant calendar event access.');
        (error as any).status = 409;
        throw error;
      }

      const calendar = createCalendarClient(authClient);
      (req as any).log?.('info', 'calendar.event.insert.started', {
        metadata: { taskId, calendarId, start, end }
      });
      const result = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: task.title,
          description,
          location,
          start: {
            dateTime: start,
            ...(timeZone ? { timeZone } : {})
          },
          end: {
            dateTime: end,
            ...(timeZone ? { timeZone } : {})
          }
        }
      });
      const linkedEvent = await insertTaskCalendarEvent(pool, {
        taskId,
        googleEventId: result.data.id,
        calendarId,
        summary: result.data.summary || task.title,
        start: result.data.start?.dateTime || start,
        end: result.data.end?.dateTime || end,
        htmlLink: result.data.htmlLink || null
      });

      res.status(201).json({ event: linkedEvent });
      (req as any).log?.('info', 'calendar.event.insert.completed', {
        metadata: { taskId, calendarId, googleEventId: linkedEvent.googleEventId, start: linkedEvent.start, end: linkedEvent.end }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createGoogleRouter };

export {};
