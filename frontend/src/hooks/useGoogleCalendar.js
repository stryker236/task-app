import { useEffect, useMemo, useState } from 'react';
import {
  disconnectGoogle,
  getGoogleCalendarEvents,
  getGoogleOAuthUrl,
  getGoogleStatus
} from '../api';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function useGoogleCalendar({ setError } = {}) {
  const [googleStatus, setGoogleStatus] = useState({ connected: false, accountEmail: null, scopes: [] });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState(todayInputValue);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarAccountEmail, setCalendarAccountEmail] = useState(null);

  const calendarBusyCount = useMemo(() => calendarEvents.length, [calendarEvents]);

  async function refreshGoogleStatus() {
    try {
      setGoogleStatus(await getGoogleStatus());
    } catch (error) {
      setError?.(error.message);
    }
  }

  async function connectGoogle() {
    setGoogleLoading(true);
    setError?.('');
    try {
      const { url } = await getGoogleOAuthUrl();
      window.location.href = url;
    } catch (error) {
      setError?.(error.message);
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
      setCalendarAccountEmail(null);
    } catch (error) {
      setError?.(error.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function loadCalendarEvents(date = calendarDate) {
    if (!googleStatus.connected) return;
    setGoogleLoading(true);
    setError?.('');
    try {
      const data = await getGoogleCalendarEvents(date);
      setCalendarEvents(data.events || []);
      setCalendarAccountEmail(data.accountEmail || null);
    } catch (error) {
      setError?.(error.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  useEffect(() => {
    refreshGoogleStatus();
  }, []);

  useEffect(() => {
    if (googleStatus.connected) loadCalendarEvents(calendarDate);
  }, [googleStatus.connected]);

  return {
    googleStatus,
    googleLoading,
    calendarDate,
    setCalendarDate,
    calendarEvents,
    calendarAccountEmail,
    calendarBusyCount,
    refreshGoogleStatus,
    connectGoogle,
    disconnectGoogleAccount,
    loadCalendarEvents
  };
}
