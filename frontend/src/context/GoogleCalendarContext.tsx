import { createContext, useContext, type ReactNode } from 'react';
import type useGoogleCalendar from '../hooks/useGoogleCalendar';

type GoogleCalendarContextValue = ReturnType<typeof useGoogleCalendar>;

const GoogleCalendarContext = createContext<GoogleCalendarContextValue | null>(null);

export function GoogleCalendarProvider({
  value,
  children
}: {
  value: GoogleCalendarContextValue;
  children: ReactNode;
}) {
  return (
    <GoogleCalendarContext.Provider value={value}>
      {children}
    </GoogleCalendarContext.Provider>
  );
}

export function useGoogleCalendarContext() {
  const value = useContext(GoogleCalendarContext);
  if (!value) throw new Error('useGoogleCalendarContext must be used inside GoogleCalendarProvider');
  return value;
}
