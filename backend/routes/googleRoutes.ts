const express = require('express');
const { randomBytes } = require('crypto');
const { encryptJson, decryptJson } = require('../google/tokenCrypto');
const { parseDateOnly } = require('../utils/date');
const {
  GOOGLE_SCOPES,
  createCalendarClient,
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

function createGoogleRouter({
  pool,
  withTransaction,
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
    return {
      connection,
      authClient: createOAuthClient(decryptJson(connection.encryptedTokens))
    };
  }

  router.get('/google/status', async (req, res, next) => {
    try {
      const connection = await fetchGoogleConnection();
      res.json({
        connected: Boolean(connection),
        accountEmail: connection?.accountEmail || null,
        scopes: connection?.scopes || []
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
          encryptedTokens: encryptJson(tokenResult.tokens)
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
