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

import type { Credentials, OAuth2Client } from 'google-auth-library';
import type { calendar_v3 } from 'googleapis';
import type { Pool, PoolClient } from 'pg';
import type {
  GoogleCalendar,
  GoogleCalendarEvent,
  GoogleOAuthUrlRequest,
  Task,
  TaskCalendarEvent
} from '../../shared/types';

const GOOGLE_CONNECTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const GOOGLE_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type Queryable = Pool | PoolClient;

type GoogleConnection = {
  id: string;
  accountEmail: string | null;
  scopes: string[];
  encryptedTokens: unknown;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type OAuthStatePayload = {
  returnTo: string;
};

type EncodedOAuthStateInput = OAuthStatePayload & {
  nonce: string;
};

type AuthorizedGoogleClient = {
  connection: GoogleConnection;
  authClient: OAuth2Client;
};

type GoogleRouteDependencies = {
  pool: Pool;
  withTransaction: <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
  fetchTasks: () => Promise<Task[]>;
  fetchGoogleConnection: () => Promise<GoogleConnection | null>;
  saveGoogleConnection: (db: Queryable, connection: {
    accountEmail: string | null;
    scopes: string[];
    encryptedTokens: unknown;
    expiresAt: string;
  }) => Promise<GoogleConnection>;
  deleteGoogleConnection: (db?: Queryable) => Promise<void>;
  createGoogleOAuthState: (db: Queryable, state: string, expiresAt: string) => Promise<void>;
  consumeGoogleOAuthState: (db: Queryable, state: string) => Promise<boolean>;
  fetchTaskCalendarEvents: (db: Queryable, taskId: string) => Promise<TaskCalendarEvent[]>;
  insertTaskCalendarEvent: (db: Queryable, event: {
    taskId: string;
    googleEventId: string;
    calendarId: string;
    summary: string;
    start: string;
    end: string;
    htmlLink: string | null;
  }) => Promise<TaskCalendarEvent>;
  deleteTaskCalendarEventsByCalendarId?: (db: Queryable, calendarId: string) => Promise<number>;
  createProductivityEvent?: (db: Queryable, event: { eventType: string; xp: number; taskId?: string | null; calendarEventId?: string | null; metadata?: Record<string, unknown> }) => Promise<unknown>;
};

function frontendFallbackUrl(): string {
  return process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')?.[0] || 'http://localhost:5173';
}

function allowedFrontendOrigins(): string[] {
  return [
    frontendFallbackUrl(),
    ...(process.env.CORS_ORIGIN || '').split(',')
  ].map((origin) => {
    try {
      return new URL(origin.trim()).origin;
    } catch {
      return '';
    }
  }).filter(Boolean);
}

function safeFrontendReturnTo(value: unknown): string {
  const fallback = frontendFallbackUrl().replace(/\/$/, '');
  if (!value) return fallback;
  try {
    const parsed = new URL(String(value));
    if (!allowedFrontendOrigins().includes(parsed.origin)) return fallback;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function encodeOAuthState({ nonce, returnTo }: EncodedOAuthStateInput): string {
  const payload = Buffer.from(JSON.stringify({ returnTo }), 'utf8').toString('base64url');
  return `${nonce}.${payload}`;
}

function decodeOAuthStateReturnTo(state: unknown): string {
  const encoded = String(state || '').split('.')[1] || '';
  if (!encoded) return '';
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    return safeFrontendReturnTo(payload.returnTo);
  } catch {
    return '';
  }
}

function toCalendar(calendar: calendar_v3.Schema$CalendarListEntry): GoogleCalendar {
  return {
    id: calendar.id || '',
    summary: calendar.summary || '(Sem nome)',
    description: calendar.description || '',
    backgroundColor: calendar.backgroundColor || null,
    foregroundColor: calendar.foregroundColor || null,
    primary: Boolean(calendar.primary),
    selected: calendar.selected !== false,
    accessRole: calendar.accessRole || null
  };
}

function toCalendarEvent(event: calendar_v3.Schema$Event, sourceCalendar: GoogleCalendar): GoogleCalendarEvent {
  return {
    id: `${sourceCalendar.id}:${event.id}`,
    rawId: event.id || undefined,
    googleEventId: event.id || undefined,
    calendarId: sourceCalendar.id,
    calendarSummary: sourceCalendar.summary,
    calendarColor: sourceCalendar.backgroundColor,
    summary: event.summary || '(Sem tÃ­tulo)',
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
  return `- ${due} Â· ${task.title} Â· ${priority} Â· ${task.status}${tags}`;
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

function shouldRefreshGoogleToken(tokens: Credentials | null | undefined): boolean {
  const expiryDate = Number(tokens?.expiry_date || 0);
  return !tokens?.access_token || !expiryDate || expiryDate <= Date.now() + GOOGLE_TOKEN_REFRESH_WINDOW_MS;
}

function isGoogleAuthRefreshError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.response?.status || error?.code || error?.status || 0);
  const reason = String(error?.response?.data?.error || '').toLowerCase();
  return status === 400 || status === 401 || message.includes('invalid_grant') || reason.includes('invalid_grant');
}

async function fetchWritableGoogleCalendars(calendar: calendar_v3.Calendar): Promise<GoogleCalendar[]> {
  const result = await calendar.calendarList.list({
    minAccessRole: 'writer',
    showDeleted: false,
    showHidden: false
  });
  return (result.data.items || []).map(toCalendar);
}

function resolveDefaultWritableCalendar(calendars: GoogleCalendar[], requestedCalendarId = ''): GoogleCalendar | null {
  return calendars.find((item) => requestedCalendarId && item.id === requestedCalendarId)
    || calendars.find((item) => String(item.summary || '').toLocaleLowerCase() === 'aiadvisor')
    || calendars.find((item) => item.primary)
    || calendars[0]
    || null;
}

async function deleteAllCalendarEvents(calendar: calendar_v3.Calendar, calendarId: string): Promise<number> {
  let pageToken: string | undefined = undefined;
  let deletedCount = 0;
  do {
    const result = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      pageToken,
      showDeleted: false
    });
    const events = result.data.items || [];
    for (const event of events) {
      if (!event.id) continue;
      try {
        await calendar.events.delete({ calendarId, eventId: event.id });
        deletedCount += 1;
      } catch (error: any) {
        const status = Number(error?.response?.status || error?.code || error?.status || 0);
        if (![404, 410].includes(status)) throw error;
      }
    }
    pageToken = result.data.nextPageToken || undefined;
  } while (pageToken);
  return deletedCount;
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
  insertTaskCalendarEvent,
  deleteTaskCalendarEventsByCalendarId,
  createProductivityEvent
}: GoogleRouteDependencies) {
  const router = express.Router();
  // Get 
  async function getAuthorizedClient(): Promise<AuthorizedGoogleClient> {
    const connection = await fetchGoogleConnection();
    if (!connection) {
      const error = new Error('Google Calendar is not connected');
      (error as any).status = 409;
      throw error;
    }
    const storedTokens = decryptJson(connection.encryptedTokens) as Credentials;
    const authClient = createOAuthClient(storedTokens);
    authClient.on('tokens', (tokens) => {
      saveGoogleConnection(pool, {
        accountEmail: connection.accountEmail,
        scopes: connection.scopes,
        encryptedTokens: { ...storedTokens, ...tokens },
        expiresAt: new Date(Date.now() + GOOGLE_CONNECTION_TTL_MS).toISOString()
        }).catch((error: Error) => logger.error('calendar.connection.token_refresh_failed', { metadata: { message: error.message } }));
    });
    if (shouldRefreshGoogleToken(storedTokens)) {
      try {
        await authClient.getAccessToken();
        await saveGoogleConnection(pool, {
          accountEmail: connection.accountEmail,
          scopes: connection.scopes,
          encryptedTokens: { ...storedTokens, ...authClient.credentials },
          expiresAt: new Date(Date.now() + GOOGLE_CONNECTION_TTL_MS).toISOString()
        });
        logger.info('calendar.connection.token_refreshed', { metadata: { accountEmail: connection.accountEmail } });
      } catch (error: any) {
        logger.warn('calendar.connection.token_refresh_failed', { metadata: { message: error.message } });
        if (isGoogleAuthRefreshError(error)) {
          await deleteGoogleConnection(pool);
          const authError = new Error('Google session expired. Reconnect Google to continue.');
          (authError as any).status = 401;
          throw authError;
        }
        throw error;
      }
    }
    return {
      connection,
      authClient
    };
  }

  router.get('/google/status', async (req, res, next) => {
    try {
      const connection = await fetchGoogleConnection();
      if (!connection) {
        (req as any).log?.('info', 'calendar.connection.status', {
          metadata: { connected: false, scopes: [] }
        });
        return res.json({
          connected: false,
          accountEmail: null,
          scopes: [],
          expiresAt: null
        });
      }

      try {
        const authorized = await getAuthorizedClient();
        (req as any).log?.('info', 'calendar.connection.status', {
          metadata: { connected: true, scopes: authorized.connection.scopes || [], tokenChecked: true }
        });
        return res.json({
          connected: true,
          accountEmail: authorized.connection.accountEmail || null,
          scopes: authorized.connection.scopes || [],
          expiresAt: authorized.connection.expiresAt || null
        });
      } catch (error: any) {
        if (Number(error?.status || error?.code || 0) === 401) {
          (req as any).log?.('warn', 'calendar.connection.status_expired', {
            metadata: { connected: false, accountEmail: connection.accountEmail || null }
          });
          return res.json({
            connected: false,
            accountEmail: null,
            scopes: [],
            expiresAt: null,
            requiresReconnect: true
          });
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/google/oauth/url', async (req, res, next) => {
    try {
      const body = (req.body || {}) as GoogleOAuthUrlRequest;
      // this generates a random value and sets a returnTo URL to return to the app
      const state = encodeOAuthState({
        nonce: randomBytes(24).toString('hex'),
        returnTo: safeFrontendReturnTo(body.returnTo)
      });
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      // Save the token in the database
      await withTransaction((client) => createGoogleOAuthState(client, state, expiresAt));
      // Generate the Google OAuth URL with the state
      res.json({ url: createGoogleAuthUrl(state), expiresAt }); // This url is not mine, it is generated by the Google OAuth client library and is used to redirect the user to Google's OAuth 2.0 server for authentication and authorization.
    } catch (error) {
      next(error);
    }
  });

  router.get('/google/oauth/callback', async (req, res, next) => {
    try {
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      if (!code || !state) return res.status(400).send('Missing OAuth code or state');
      const returnTo = decodeOAuthStateReturnTo(state) || frontendFallbackUrl().replace(/\/$/, '');

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
          expiresAt: new Date(Date.now() + GOOGLE_CONNECTION_TTL_MS).toISOString()
        });
      });

      const redirectUrl = new URL(returnTo);
      redirectUrl.searchParams.set('google', 'connected');
      if (connection.accountEmail) redirectUrl.searchParams.set('email', connection.accountEmail);
      return res.redirect(redirectUrl.toString());
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

  router.delete('/google/calendar/events/default', async (req, res, next) => {
    try {
      const calendarId = String(req.body?.calendarId || '').trim();
      const confirmation = String(req.body?.confirmation || '').trim();
      if (confirmation !== 'DELETE_DEFAULT_CALENDAR_EVENTS') {
        const error = new Error('confirmation must be DELETE_DEFAULT_CALENDAR_EVENTS');
        (error as any).status = 400;
        throw error;
      }

      const { connection, authClient } = await getAuthorizedClient();
      if (!connection.scopes?.includes(CALENDAR_SCOPE)) {
        const error = new Error('Google Calendar write permission is required. Reconnect Google to grant calendar event access.');
        (error as any).status = 409;
        throw error;
      }

      const calendar = createCalendarClient(authClient);
      const calendars = await fetchWritableGoogleCalendars(calendar);
      const defaultCalendar = resolveDefaultWritableCalendar(calendars, calendarId);
      if (!defaultCalendar) {
        const error = new Error('No writable calendar is available');
        (error as any).status = 404;
        throw error;
      }

      (req as any).log?.('info', 'calendar.events.delete_all.started', {
        metadata: { calendarId: defaultCalendar.id, calendarSummary: defaultCalendar.summary }
      });
      const deletedCount = await deleteAllCalendarEvents(calendar, defaultCalendar.id);
      const unlinkedCount = deleteTaskCalendarEventsByCalendarId
        ? await deleteTaskCalendarEventsByCalendarId(pool, defaultCalendar.id)
        : 0;
      (req as any).log?.('info', 'calendar.events.delete_all.completed', {
        metadata: { calendarId: defaultCalendar.id, deletedCount, unlinkedCount }
      });

      res.json({
        calendarId: defaultCalendar.id,
        calendarSummary: defaultCalendar.summary || defaultCalendar.id,
        deletedCount,
        unlinkedCount
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
      if (!result.data.id) {
        const error = new Error('Google Calendar did not return an event id');
        (error as any).status = 502;
        throw error;
      }
      const linkedEvent = await insertTaskCalendarEvent(pool, {
        taskId,
        googleEventId: result.data.id,
        calendarId,
        summary: result.data.summary || task.title,
        start: result.data.start?.dateTime || start,
        end: result.data.end?.dateTime || end,
        htmlLink: result.data.htmlLink || null
      });
      if (createProductivityEvent) {
        await createProductivityEvent(pool, {
          eventType: 'task_scheduled',
          xp: 15,
          taskId,
          calendarEventId: linkedEvent.id,
          metadata: { title: task.title, start, end, calendarId }
        });
      }

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

