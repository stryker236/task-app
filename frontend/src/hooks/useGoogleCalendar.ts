import { useEffect, useMemo, useState } from 'react';
import type { GoogleCalendarEvent, GoogleStatus } from '../../../shared/types';
import {
  disconnectGoogle,
  getGoogleCalendarEvents,
  getGoogleOAuthUrl,
  getGoogleStatus
} from '../api';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type UseGoogleCalendarOptions = {
  setError?: (message: string) => void;
};

export default function useGoogleCalendar({ setError }: UseGoogleCalendarOptions = {}) {
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ connected: false, accountEmail: null, scopes: [] });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState(todayInputValue);
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [calendarAccountEmail, setCalendarAccountEmail] = useState<string | null>(null);

  const calendarBusyCount = useMemo(() => calendarEvents.length, [calendarEvents]);

  async function refreshGoogleStatus() {
    try {
      setGoogleStatus(await getGoogleStatus());
    } catch (error) {
      setError?.(errorMessage(error));
    }
  }

  async function connectGoogle() {
    setGoogleLoading(true);
    setError?.('');
    try {
      const { url } = await getGoogleOAuthUrl();
      window.location.href = url;
    } catch (error) {
      setError?.(errorMessage(error));
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
      setError?.(errorMessage(error));
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
      setCalendarAccountEmail(null);
    } catch (error) {
      setError?.(errorMessage(error));
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
