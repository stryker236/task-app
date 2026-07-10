import type { GoogleCalendar, GoogleStatus } from '../../../../shared/types';

const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar';

const QUICK_ACTIONS: Array<{ key: string; label: string }> = [
  { key: 'suggest_tags', label: 'Sugerir tags' },
  { key: 'suggest_due_dates', label: 'Sugerir due dates' },
  { key: 'priority_management', label: 'Gestao de prioridades' },
];

type AdvisorPanelHeaderProps = {
  loading: boolean;
  googleStatus: GoogleStatus;
  googleCalendars: GoogleCalendar[];
  advisorDefaultCalendarId: string;
  onRefresh: () => void;
  onRequestActions: (action: string) => void;
  onConnectGoogle: () => void;
  onAdvisorDefaultCalendarChange: (calendarId: string) => void;
};

export function advisorCalendarWriteReady(googleStatus: GoogleStatus) {
  return googleStatus.connected && googleStatus.scopes.includes(CALENDAR_WRITE_SCOPE);
}

export default function AdvisorPanelHeader({
  loading,
  googleStatus,
  googleCalendars,
  advisorDefaultCalendarId,
  onRefresh,
  onRequestActions,
  onConnectGoogle,
  onAdvisorDefaultCalendarChange
}: AdvisorPanelHeaderProps) {
  const calendarWriteReady = advisorCalendarWriteReady(googleStatus);

  return (
    <>
      <header>
        <div>
          <span>Assistente</span>
          <h2>Conselhos e acoes assistidas</h2>
        </div>
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A pensar...' : 'Gerar conselho'}
        </button>
      </header>

      <div className="advisor-request-box">
        <label>Acoes do assistente</label>
        {googleCalendars.length > 0 && (
          <label className="advisor-calendar-select">
            <span>Calendario default para eventos</span>
            <select value={advisorDefaultCalendarId} onChange={(event) => onAdvisorDefaultCalendarChange(event.target.value)}>
              {googleCalendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
              ))}
            </select>
          </label>
        )}
        <div className="advisor-request-actions">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              className="button secondary small"
              onClick={() => onRequestActions(action.key)}
              disabled={loading || (action.key === 'schedule_calendar_events' && !calendarWriteReady)}
            >
              {action.label}
            </button>
          ))}
        </div>
        {!calendarWriteReady && (
          <div className="advisor-permission-warning">
            <span>Para criar eventos, liga ou reconecta o Google Calendar com permissao de escrita.</span>
            <button type="button" className="button secondary small" onClick={onConnectGoogle} disabled={loading}>
              {googleStatus.connected ? 'Reconectar Google' : 'Ligar Google'}
            </button>
          </div>
        )}
        <small>Limite backend: 3 pedidos AI por 10 segundos, por cliente/IP.</small>
      </div>
    </>
  );
}
