import type { GoogleCalendar, GoogleStatus } from '../../../../../shared/types';
import { formatDateRange, toggleCalendarId, type CalendarViewMode } from '../calendarWeekUtils';

type DailyEmailResult = {
  to: string;
  date?: string;
  calendarSummary?: string;
  eventCount?: number;
  totalMinutes?: number;
  todayCount: number;
  overdueCount: number;
};

type CalendarWeekHeaderProps = {
  status: GoogleStatus;
  loading: boolean;
  visibleStart: string;
  visibleEnd: string;
  busyCount: number;
  accountEmail: string | null;
  canSendEmail: boolean;
  emailDate: string;
  onEmailDateChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSendDailyTaskEmail: (date?: string) => Promise<DailyEmailResult | null>;
};

export function CalendarWeekHeader({
  status,
  loading,
  visibleStart,
  visibleEnd,
  busyCount,
  accountEmail,
  canSendEmail,
  emailDate,
  onEmailDateChange,
  onConnect,
  onDisconnect,
  onSendDailyTaskEmail
}: CalendarWeekHeaderProps) {
  return (
    <header className="calendar-week-header">
      <div>
        <span>Google Calendar</span>
        <h2>Calendario</h2>
        <p>
          {status.connected
            ? `${formatDateRange(visibleStart, visibleEnd)} - ${busyCount} eventos Google - ${accountEmail || status.accountEmail || 'Google'}`
            : loading
              ? 'A verificar a ligacao Google guardada...'
              : 'Liga o Google Calendar para consultar a tua agenda.'}
        </p>
      </div>
      <div className="calendar-week-actions">
        {status.connected ? (
          <>
            {canSendEmail ? (
              <label className="calendar-email-date">
                <span>Email do dia</span>
                <input type="date" value={emailDate} onChange={(event) => onEmailDateChange(event.target.value)} />
                <button
                  type="button"
                  className="button primary small"
                  onClick={async () => {
                    const result = await onSendDailyTaskEmail(emailDate);
                    if (result) window.alert(`Email enviado para ${result.to}. Data: ${result.date || emailDate}. Calendario: ${result.calendarSummary || 'default'}. Eventos: ${result.eventCount ?? 0}; due dates: ${result.todayCount}; atrasadas: ${result.overdueCount}.`);
                  }}
                  disabled={loading || !emailDate}
                >
                  {loading ? 'A enviar...' : 'Enviar'}
                </button>
              </label>
            ) : (
              <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
                Ativar envio de email
              </button>
            )}
            <button type="button" className="button secondary small" onClick={onDisconnect} disabled={loading}>
              Desligar Google
            </button>
          </>
        ) : !loading && (
          <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
            Ligar Google Calendar
          </button>
        )}
      </div>
    </header>
  );
}

type CalendarAdvisorBarProps = {
  visibleAdvisorPreviewCount: number;
  reservedPreviewCount: number;
  calendars: GoogleCalendar[];
  advisorDefaultCalendarId: string;
  scheduleStartDate: string;
  canCreateCalendarEvents: boolean;
  advisorLoading: boolean;
  loading: boolean;
  advisorConstraintCount: number;
  onAdvisorDefaultCalendarChange: (calendarId: string) => void;
  onScheduleStartDateChange: (value: string) => void;
  onRequestAdvisorCalendarEvents: () => void;
  onConnect: () => void;
  onDeleteDefaultCalendarEvents: () => Promise<{ calendarSummary: string; deletedCount: number; unlinkedCount: number } | null>;
  onClearAdvisorScheduleConstraints: () => void;
};

export function CalendarAdvisorBar({
  visibleAdvisorPreviewCount,
  reservedPreviewCount,
  calendars,
  advisorDefaultCalendarId,
  scheduleStartDate,
  canCreateCalendarEvents,
  advisorLoading,
  loading,
  advisorConstraintCount,
  onAdvisorDefaultCalendarChange,
  onScheduleStartDateChange,
  onRequestAdvisorCalendarEvents,
  onConnect,
  onDeleteDefaultCalendarEvents,
  onClearAdvisorScheduleConstraints
}: CalendarAdvisorBarProps) {
  return (
    <div className="calendar-advisor-bar">
      <div>
        <strong>AIAdvisor</strong>
        <span>{visibleAdvisorPreviewCount || reservedPreviewCount ? `${visibleAdvisorPreviewCount} previews - ${reservedPreviewCount} breaks` : 'Criar eventos a partir das tasks'}</span>
      </div>
      {calendars.length > 0 && (
        <label>
          <span>Calendario default</span>
          <select value={advisorDefaultCalendarId} onChange={(event) => onAdvisorDefaultCalendarChange(event.target.value)}>
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span>Agendar desde</span>
        <input type="date" value={scheduleStartDate} onChange={(event) => onScheduleStartDateChange(event.target.value)} />
      </label>
      <button
        type="button"
        className="button primary small"
        onClick={canCreateCalendarEvents ? onRequestAdvisorCalendarEvents : onConnect}
        disabled={advisorLoading || loading}
      >
        {advisorLoading ? 'A preparar...' : canCreateCalendarEvents ? 'Criar eventos' : 'Ativar criacao'}
      </button>
      <button
        type="button"
        className="button secondary small"
        onClick={async () => {
          const calendar = calendars.find((item) => item.id === advisorDefaultCalendarId);
          const calendarName = calendar?.summary || advisorDefaultCalendarId || 'default';
          if (!window.confirm(`Apagar TODOS os eventos do calendario "${calendarName}"? Esta acao nao pode ser desfeita.`)) return;
          const result = await onDeleteDefaultCalendarEvents();
          if (result) window.alert(`Eventos apagados de "${result.calendarSummary}": ${result.deletedCount}. Ligacoes locais removidas: ${result.unlinkedCount}.`);
        }}
        disabled={!canCreateCalendarEvents || loading}
      >
        Apagar eventos default
      </button>
      {advisorConstraintCount > 0 && (
        <button type="button" className="button ghost small" onClick={onClearAdvisorScheduleConstraints} disabled={advisorLoading || loading}>
          Limpar ajustes ({advisorConstraintCount})
        </button>
      )}
    </div>
  );
}

type CalendarWeekControlsProps = {
  calendarMode: CalendarViewMode;
  visibleStart: string;
  visibleEnd: string;
  selectedDate: string;
  loading: boolean;
  selectedCalendarIds: string[];
  onChangeView: (mode: CalendarViewMode) => void;
  onMoveCalendar: (direction: 'prev' | 'next') => void;
  onGoToCurrentWeek: () => void;
  onChangeDate: (date: string) => void;
  onRefresh: () => void;
};

export function CalendarWeekControls({
  calendarMode,
  visibleStart,
  visibleEnd,
  selectedDate,
  loading,
  onChangeView,
  onMoveCalendar,
  onGoToCurrentWeek,
  onChangeDate,
  onRefresh
}: CalendarWeekControlsProps) {
  return (
    <div className="calendar-week-controls">
      <div className="calendar-mode-toggle" aria-label="Modo de calendario">
        <button type="button" className={calendarMode === 'timeGridDay' ? 'is-active' : ''} onClick={() => onChangeView('timeGridDay')}>
          Dia
        </button>
        <button type="button" className={calendarMode === 'timeGridWeek' ? 'is-active' : ''} onClick={() => onChangeView('timeGridWeek')}>
          Semana
        </button>
        <button type="button" className={calendarMode === 'dayGridMonth' ? 'is-active' : ''} onClick={() => onChangeView('dayGridMonth')}>
          Mes
        </button>
      </div>
      <button type="button" className="button secondary small" onClick={() => onMoveCalendar('prev')} disabled={loading}>
        Anterior
      </button>
      <button type="button" className="button secondary small" onClick={onGoToCurrentWeek} disabled={loading}>
        Semana atual
      </button>
      <label>
        Data
        <input type="date" value={selectedDate} onChange={(event) => onChangeDate(event.target.value)} />
      </label>
      <button type="button" className="button secondary small" onClick={() => onMoveCalendar('next')} disabled={loading}>
        Seguinte
      </button>
      <button type="button" className="button primary small" onClick={onRefresh} disabled={loading}>
        {loading ? 'A carregar...' : 'Atualizar'}
      </button>
      <strong className="calendar-current-range">{formatDateRange(visibleStart, visibleEnd)}</strong>
    </div>
  );
}

type CalendarFilterBarProps = {
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];
  visibleEventCount: number;
  loading: boolean;
  onCalendarIdsChange: (calendarIds: string[]) => void;
};

export function CalendarFilterBar({
  calendars,
  selectedCalendarIds,
  visibleEventCount,
  loading,
  onCalendarIdsChange
}: CalendarFilterBarProps) {
  return (
    <div className="calendar-filter-bar" aria-label="Filtrar calendarios">
      <div>
        <strong>Calendarios</strong>
        <span>{selectedCalendarIds.length} de {calendars.length} ativos - {visibleEventCount} eventos visiveis</span>
      </div>
      <div className="calendar-filter-options">
        <button
          type="button"
          className="button secondary small"
          onClick={() => onCalendarIdsChange(calendars.map((calendar) => calendar.id))}
          disabled={loading || selectedCalendarIds.length === calendars.length}
        >
          Todos
        </button>
        <button
          type="button"
          className="button ghost small"
          onClick={() => onCalendarIdsChange([])}
          disabled={loading || selectedCalendarIds.length === 0}
        >
          Limpar
        </button>
        {calendars.map((calendar) => (
          <label className="calendar-filter-option" key={calendar.id}>
            <input
              type="checkbox"
              checked={selectedCalendarIds.includes(calendar.id)}
              onChange={() => onCalendarIdsChange(toggleCalendarId(selectedCalendarIds, calendar.id))}
            />
            <span style={{ backgroundColor: calendar.backgroundColor || undefined }} aria-hidden="true" />
            {calendar.summary}
          </label>
        ))}
      </div>
    </div>
  );
}
