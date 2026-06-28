const { google } = require('googleapis');

const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const GOOGLE_SCOPES = [CALENDAR_READONLY_SCOPE, USERINFO_EMAIL_SCOPE];

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const error = new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.');
    error.status = 503;
    throw error;
  }

  return { clientId, clientSecret, redirectUri };
}

function createOAuthClient(tokens = null) {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  if (tokens) client.setCredentials(tokens);
  return client;
}

function createGoogleAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state
  });
}

async function getAccountEmail(authClient) {
  const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
  const result = await oauth2.userinfo.get();
  return result.data.email || null;
}

function createCalendarClient(authClient) {
  return google.calendar({ version: 'v3', auth: authClient });
}

module.exports = {
  GOOGLE_SCOPES,
  createOAuthClient,
  createGoogleAuthUrl,
  getAccountEmail,
  createCalendarClient
};
