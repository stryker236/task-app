function formatEventTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export default function GoogleDailyPanel({
  status,
  loading,
  date,
  events,
  accountEmail,
  busyCount,
  onDateChange,
  onConnect,
  onDisconnect,
  onLoadEvents
}) {
  return (
    <section className="google-daily-panel" aria-label="Google Calendar daily">
      <header>
        <div>
          <span>Daily</span>
          <h2>Google Calendar</h2>
          <p>
            {status.connected
              ? `Ligado a ${accountEmail || status.accountEmail || 'Google'}`
              : 'Liga o Google Calendar para gerar daily e planear tarefas com base na tua disponibilidade.'}
          </p>
        </div>
        <div className="google-daily-actions">
          {status.connected ? (
            <button type="button" className="button secondary small" onClick={onDisconnect} disabled={loading}>
              Desligar Google
            </button>
          ) : (
            <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
              Ligar Google Calendar
            </button>
          )}
        </div>
      </header>

      {status.connected && (
        <>
          <div className="google-daily-controls">
            <label>
              Dia
              <input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
            </label>
            <button type="button" className="button secondary small" onClick={() => onLoadEvents(date)} disabled={loading}>
              {loading ? 'A carregar...' : 'Ver eventos'}
            </button>
            <span>{busyCount} eventos no calendário</span>
          </div>

          {events.length ? (
            <ol className="google-event-list">
              {events.map((event) => (
                <li key={event.id}>
                  <time>{formatEventTime(event.start)} - {formatEventTime(event.end)}</time>
                  <strong>{event.summary}</strong>
                  {event.location && <span>{event.location}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="google-empty">Sem eventos carregados para este dia.</p>
          )}
        </>
      )}
    </section>
  );
}
