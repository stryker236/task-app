import { useEffect, useMemo, useState } from 'react';
import type { GoogleCalendar, GoogleCalendarEvent, GoogleStatus } from '../../../../../shared/types';
import {
  deleteDefaultGoogleCalendarEvents,
  disconnectGoogle,
  getGoogleCalendars,
  getGoogleCalendarEvents,
  getGoogleCalendarEventsRange,
  getGoogleOAuthUrl,
  getGoogleStatus,
  sendGoogleDailyTaskEmail
} from '../api';
import { clientLog } from '../../../logger';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function dateFromInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function inputValueFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeekInputValue(value: string) {
  const date = dateFromInputValue(value);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return inputValueFromDate(date);
}

function addDaysInputValue(value: string, days: number) {
  const date = dateFromInputValue(value);
  date.setDate(date.getDate() + days);
  return inputValueFromDate(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isGoogleSessionExpired(error: unknown) {
  return errorMessage(error).toLowerCase().includes('google session expired');
}

function storedAdvisorCalendarId() {
  return localStorage.getItem('task-app:advisor-calendar-id') || '';
}

type UseGoogleCalendarOptions = {
  setError?: (message: string) => void;
};

export default function useGoogleCalendar({ setError }: UseGoogleCalendarOptions = {}) {
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ connected: false, accountEmail: null, scopes: [] });
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleSessionExpired, setGoogleSessionExpired] = useState(false);
  const [calendarDate, setCalendarDate] = useState(todayInputValue);
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [calendarWeekStart, setCalendarWeekStartState] = useState(() => startOfWeekInputValue(todayInputValue()));
  const [weeklyCalendarEvents, setWeeklyCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [advisorDefaultCalendarId, setAdvisorDefaultCalendarIdState] = useState(storedAdvisorCalendarId);
  const [calendarAccountEmail, setCalendarAccountEmail] = useState<string | null>(null);

  const calendarBusyCount = useMemo(() => calendarEvents.length, [calendarEvents]);
  const calendarWeekEnd = useMemo(() => addDaysInputValue(calendarWeekStart, 6), [calendarWeekStart]);
  const weeklyCalendarBusyCount = useMemo(() => weeklyCalendarEvents.length, [weeklyCalendarEvents]);

  function setCalendarWeekStart(value: string) {
    setCalendarWeekStartState(startOfWeekInputValue(value));
  }

  function setAdvisorDefaultCalendarId(calendarId: string) {
    setAdvisorDefaultCalendarIdState(calendarId);
    clientLog('info', 'calendar.default.changed', '', { calendarId });
    if (calendarId) {
      localStorage.setItem('task-app:advisor-calendar-id', calendarId);
    } else {
      localStorage.removeItem('task-app:advisor-calendar-id');
    }
  }

  async function refreshGoogleStatus() {
    setGoogleLoading(true);
    try {
      const status = await getGoogleStatus();
      if (status.requiresReconnect) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [], requiresReconnect: true });
        setGoogleSessionExpired(true);
        setGoogleCalendars([]);
        setSelectedCalendarIds([]);
        setCalendarEvents([]);
        setWeeklyCalendarEvents([]);
        setCalendarAccountEmail(null);
        return;
      }
      setGoogleStatus(status);
      setGoogleSessionExpired(false);
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function connectGoogle(returnToPath = `${window.location.pathname}${window.location.search}`) {
    setGoogleLoading(true);
    setError?.('');
    try {
      const returnTo = returnToPath.startsWith('http')
        ? returnToPath
        : `${window.location.origin}${returnToPath.startsWith('/') ? returnToPath : `/${returnToPath}`}`;
      const { url } = await getGoogleOAuthUrl(returnTo);
      window.location.href = url; // Redirect the user to the Google OAuth URL for authentication and authorization
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
      setGoogleLoading(false);
    }
  }

  async function disconnectGoogleAccount() {
    if (!window.confirm('Desligar a conta Google deste app?')) return;
    setGoogleLoading(true);
    setError?.('');
    try {
      await disconnectGoogle();
      setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
      setCalendarEvents([]);
      setWeeklyCalendarEvents([]);
      setGoogleCalendars([]);
      setSelectedCalendarIds([]);
      setCalendarAccountEmail(null);
      setGoogleSessionExpired(false);
    } catch (error) {
      setError?.(errorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function loadGoogleCalendars() {
    if (!googleStatus.connected) return [];
    setGoogleLoading(true);
    setError?.('');
    try {
      const data = await getGoogleCalendars();
      const calendars = data.calendars || [];
      setGoogleCalendars(calendars);
      setSelectedCalendarIds((current) => current.length ? current.filter((id) => calendars.some((calendar) => calendar.id === id)) : calendars.map((calendar) => calendar.id));
      setAdvisorDefaultCalendarIdState((current) => {
        const stored = current || storedAdvisorCalendarId();
        if (stored && calendars.some((calendar) => calendar.id === stored)) return stored;
        const fallback = calendars.find((calendar) => calendar.summary.toLocaleLowerCase() === 'aiadvisor')?.id
          || calendars.find((calendar) => calendar.primary)?.id
          || calendars[0]?.id
          || '';
        if (fallback) localStorage.setItem('task-app:advisor-calendar-id', fallback);
        return fallback;
      });
      setCalendarAccountEmail(data.accountEmail || null);
      return calendars;
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
      return [];
    } finally {
      setGoogleLoading(false);
    }
  }

  async function loadCalendarEvents(date = calendarDate, calendarIds = selectedCalendarIds, options: { forceRefresh?: boolean } = {}) {
    if (!googleStatus.connected) return;
    if (!calendarIds.length) {
      setCalendarEvents([]);
      return;
    }
    setGoogleLoading(true);
    setError?.('');
    try {
      clientLog('info', 'calendar.events.load.started', '', { mode: 'day', date, calendarIds });
      const data = await getGoogleCalendarEvents(date, calendarIds, options);
      setCalendarEvents(data.events || []);
      setCalendarAccountEmail(data.accountEmail || null);
      clientLog('info', 'calendar.events.load.completed', '', { mode: 'day', date, calendarIds, eventCount: data.events?.length || 0 });
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function loadCalendarWeekEvents(start = calendarWeekStart, calendarIds = selectedCalendarIds, options: { forceRefresh?: boolean } = {}) {
    if (!googleStatus.connected) return;
    const normalizedStart = startOfWeekInputValue(start);
    const end = addDaysInputValue(normalizedStart, 6);
    if (!calendarIds.length) {
      setCalendarWeekStartState(normalizedStart);
      setWeeklyCalendarEvents([]);
      return;
    }
    setGoogleLoading(true);
    setError?.('');
    setCalendarWeekStartState(normalizedStart);
    try {
      clientLog('info', 'calendar.events.load.started', '', { mode: 'week', start: normalizedStart, end, calendarIds });
      const data = await getGoogleCalendarEventsRange(normalizedStart, end, calendarIds, options);
      setWeeklyCalendarEvents(data.events || []);
      setCalendarAccountEmail(data.accountEmail || null);
      clientLog('info', 'calendar.events.load.completed', '', { mode: 'week', start: normalizedStart, end, calendarIds, eventCount: data.events?.length || 0 });
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function loadCalendarRangeEvents(start: string, end: string, calendarIds = selectedCalendarIds, options: { forceRefresh?: boolean } = {}) {
    if (!googleStatus.connected) return;
    if (!calendarIds.length) {
      setCalendarWeekStartState(start);
      setWeeklyCalendarEvents([]);
      return;
    }
    setGoogleLoading(true);
    setError?.('');
    setCalendarWeekStartState(start);
    try {
      clientLog('info', 'calendar.events.load.started', '', { mode: 'range', start, end, calendarIds });
      const data = await getGoogleCalendarEventsRange(start, end, calendarIds, options);
      setWeeklyCalendarEvents(data.events || []);
      setCalendarAccountEmail(data.accountEmail || null);
      clientLog('info', 'calendar.events.load.completed', '', { mode: 'range', start, end, calendarIds, eventCount: data.events?.length || 0 });
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  function changeSelectedCalendarIds(calendarIds: string[]) {
    setSelectedCalendarIds(calendarIds);
    loadCalendarWeekEvents(calendarWeekStart, calendarIds);
  }

  async function sendDailyTaskEmail(date = '') {
    if (!googleStatus.connected) return null;
    setGoogleLoading(true);
    setError?.('');
    try {
      return await sendGoogleDailyTaskEmail(advisorDefaultCalendarId, date);
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
      return null;
    } finally {
      setGoogleLoading(false);
    }
  }

  async function deleteDefaultCalendarEvents() {
    if (!googleStatus.connected) return null;
    setGoogleLoading(true);
    setError?.('');
    try {
      const result = await deleteDefaultGoogleCalendarEvents(advisorDefaultCalendarId);
      await loadCalendarWeekEvents(calendarWeekStart, selectedCalendarIds, { forceRefresh: true });
      await loadCalendarEvents(calendarDate, selectedCalendarIds, { forceRefresh: true });
      return result;
    } catch (error) {
      setError?.(errorMessage(error));
      if (isGoogleSessionExpired(error)) {
        setGoogleStatus({ connected: false, accountEmail: null, scopes: [] });
        setGoogleSessionExpired(true);
      }
      return null;
    } finally {
      setGoogleLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('google')) {
      params.delete('google');
      params.delete('email');
      const nextSearch = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`);
    }
    refreshGoogleStatus();
  }, []);

  useEffect(() => {
    if (googleStatus.connected) {
      loadGoogleCalendars().then((calendars) => {
        const calendarIds = calendars.map((calendar) => calendar.id);
        loadCalendarEvents(calendarDate, calendarIds);
        loadCalendarWeekEvents(calendarWeekStart, calendarIds);
      });
    }
  }, [googleStatus.connected]);

  return {
    googleStatus,
    googleSessionExpired,
    googleLoading,
    calendarDate,
    setCalendarDate,
    calendarEvents,
    calendarWeekStart,
    calendarWeekEnd,
    setCalendarWeekStart,
    weeklyCalendarEvents,
    googleCalendars,
    selectedCalendarIds,
    setSelectedCalendarIds: changeSelectedCalendarIds,
    advisorDefaultCalendarId,
    setAdvisorDefaultCalendarId,
    calendarAccountEmail,
    calendarBusyCount,
    weeklyCalendarBusyCount,
    refreshGoogleStatus,
    connectGoogle,
    disconnectGoogleAccount,
    loadGoogleCalendars,
    loadCalendarEvents,
    loadCalendarWeekEvents,
    loadCalendarRangeEvents,
    sendDailyTaskEmail,
    deleteDefaultCalendarEvents
  };
}

