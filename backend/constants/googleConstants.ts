const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const GOOGLE_SCOPES = [CALENDAR_SCOPE, GMAIL_SEND_SCOPE, USERINFO_EMAIL_SCOPE] as const;

module.exports = {
  CALENDAR_SCOPE,
  CALENDAR_READONLY_SCOPE,
  GMAIL_SEND_SCOPE,
  USERINFO_EMAIL_SCOPE,
  GOOGLE_SCOPES
};
