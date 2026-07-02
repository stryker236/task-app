const { google } = require('googleapis');
const { CALENDAR_SCOPE, GMAIL_SEND_SCOPE, GOOGLE_SCOPES } = require('../constants/googleConstants');

import type { OAuth2Client } from 'google-auth-library';
import type { Credentials } from 'google-auth-library/build/src/auth/credentials';

type HttpError = Error & { status: number };

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const error = new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.') as HttpError;
    error.status = 503;
    throw error;
  }

  return { clientId, clientSecret, redirectUri };
}

function createOAuthClient(tokens: Credentials | null = null): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  if (tokens) client.setCredentials(tokens);
  return client;
}

function createGoogleAuthUrl(state: string) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state
  });
}

async function getAccountEmail(authClient: OAuth2Client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
  const result = await oauth2.userinfo.get();
  return result.data.email || null;
}

function createCalendarClient(authClient: OAuth2Client) {
  return google.calendar({ version: 'v3', auth: authClient });
}

function createGmailClient(authClient: OAuth2Client) {
  return google.gmail({ version: 'v1', auth: authClient });
}

module.exports = {
  CALENDAR_SCOPE,
  GMAIL_SEND_SCOPE,
  GOOGLE_SCOPES,
  createOAuthClient,
  createGoogleAuthUrl,
  getAccountEmail,
  createCalendarClient,
  createGmailClient
};

export {};
