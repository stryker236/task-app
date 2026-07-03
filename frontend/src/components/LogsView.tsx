import { Fragment, useEffect, useState } from 'react';
import { getLogs, type AppLogEntry } from '../api';

type LogsViewProps = {
  onError: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function levelLabel(level: string | number) {
  if (level === 10) return 'debug';
  if (level === 20) return 'debug';
  if (level === 30) return 'info';
  if (level === 40) return 'warn';
  if (level === 50) return 'error';
  return String(level || 'info');
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function metadataSummary(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).filter(([, value]) => value != null && value !== '');
  if (!entries.length) return '';
  return entries.slice(0, 3).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: ${value.length}`;
    if (typeof value === 'object') return `${key}: {...}`;
    return `${key}: ${String(value)}`;
  }).join(' | ');
}

function addUnique(list: string[], value: string) {
  const trimmed = value.trim();
  if (!trimmed || list.includes(trimmed)) return list;
  return [...list, trimmed];
}

export default function LogsView({ onError }: LogsViewProps) {
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState('');
  const [event, setEvent] = useState('');
  const [requestId, setRequestId] = useState('');
  const [eventDraft, setEventDraft] = useState('');
  const [includeRequestIds, setIncludeRequestIds] = useState<string[]>([]);
  const [excludeRequestIds, setExcludeRequestIds] = useState<string[]>([]);
  const [includeEvents, setIncludeEvents] = useState<string[]>([]);
  const [excludeEvents, setExcludeEvents] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  async function loadLogs() {
    setLoading(true);
    try {
      const result = await getLogs({
        level,
        requestIds: [...includeRequestIds, ...(requestId.trim() ? [requestId.trim()] : [])],
        excludeRequestIds,
        events: [...includeEvents, ...(event.trim() ? [event.trim()] : [])],
        excludeEvents,
        search,
        limit
      });
      setLogs(result.logs || []);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function filterByRequestId(value: string) {
    const nextInclude = addUnique(includeRequestIds, value);
    setIncludeRequestIds(nextInclude);
    setRequestId('');
    setLoading(true);
    try {
      const result = await getLogs({
        level,
        requestIds: nextInclude,
        excludeRequestIds,
        events: [...includeEvents, ...(event.trim() ? [event.trim()] : [])],
        excludeEvents,
        search,
        limit
      });
      setLogs(result.logs || []);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function includeRequestId(value: string) {
    setIncludeRequestIds((current) => addUnique(current, value));
    setExcludeRequestIds((current) => current.filter((item) => item !== value));
  }

  function excludeRequestId(value: string) {
    setExcludeRequestIds((current) => addUnique(current, value));
    setIncludeRequestIds((current) => current.filter((item) => item !== value));
  }

  function includeEventValue(value: string) {
    setIncludeEvents((current) => addUnique(current, value));
    setExcludeEvents((current) => current.filter((item) => item !== value));
  }

  function excludeEventValue(value: string) {
    setExcludeEvents((current) => addUnique(current, value));
    setIncludeEvents((current) => current.filter((item) => item !== value));
  }

  function clearAdvancedFilters() {
    setRequestId('');
    setEvent('');
    setEventDraft('');
    setIncludeRequestIds([]);
    setExcludeRequestIds([]);
    setIncludeEvents([]);
    setExcludeEvents([]);
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <section className="logs-view">
      <header className="logs-toolbar">
        <div>
          <span>Observabilidade</span>
          <h2>Logs</h2>
        </div>
        <button type="button" className="button primary small" onClick={loadLogs} disabled={loading}>
          {loading ? 'A carregar...' : 'Atualizar'}
        </button>
      </header>

      <div className="logs-filters">
        <label>
          Level
          <select value={level} onChange={(item) => setLevel(item.target.value)}>
            <option value="">Todos</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label>
          Event
          <input value={event} onChange={(item) => setEvent(item.target.value)} placeholder="contém advisor.calendar" />
        </label>
        <label>
          Pesquisa
          <input value={search} onChange={(item) => setSearch(item.target.value)} placeholder="task, id, titulo..." />
        </label>
        <label>
          Limite
          <input type="number" min={20} max={1000} value={limit} onChange={(item) => setLimit(Number(item.target.value) || 200)} />
        </label>
      </div>

      <div className="logs-advanced-filters">
        <div className="logs-chip-editor">
          <label>
            Request IDs
            <input
              value={requestId}
              onChange={(item) => setRequestId(item.target.value)}
              onKeyDown={(item) => {
                if (item.key === 'Enter' && requestId.trim()) {
                  item.preventDefault();
                  includeRequestId(requestId);
                  setRequestId('');
                }
              }}
              placeholder="Adicionar requestId e Enter"
            />
          </label>
          <button type="button" className="button secondary small" disabled={!requestId.trim()} onClick={() => { includeRequestId(requestId); setRequestId(''); }}>Incluir</button>
          <button type="button" className="button ghost small" disabled={!requestId.trim()} onClick={() => { excludeRequestId(requestId); setRequestId(''); }}>Excluir</button>
        </div>
        <div className="logs-chip-editor">
          <label>
            Events
            <input
              value={eventDraft}
              onChange={(item) => setEventDraft(item.target.value)}
              onKeyDown={(item) => {
                if (item.key === 'Enter' && eventDraft.trim()) {
                  item.preventDefault();
                  includeEventValue(eventDraft);
                  setEventDraft('');
                }
              }}
              placeholder="Adicionar event e Enter"
            />
          </label>
          <button type="button" className="button secondary small" disabled={!eventDraft.trim()} onClick={() => { includeEventValue(eventDraft); setEventDraft(''); }}>Incluir</button>
          <button type="button" className="button ghost small" disabled={!eventDraft.trim()} onClick={() => { excludeEventValue(eventDraft); setEventDraft(''); }}>Excluir</button>
        </div>
        <button type="button" className="button ghost small" onClick={clearAdvancedFilters}>Limpar filtros multi</button>
      </div>

      <div className="logs-filter-chips">
        {includeRequestIds.map((item) => (
          <span className="include" key={`include-request-${item}`}>+ request {item}<button type="button" onClick={() => setIncludeRequestIds((current) => current.filter((value) => value !== item))}>x</button></span>
        ))}
        {excludeRequestIds.map((item) => (
          <span className="exclude" key={`exclude-request-${item}`}>- request {item}<button type="button" onClick={() => setExcludeRequestIds((current) => current.filter((value) => value !== item))}>x</button></span>
        ))}
        {includeEvents.map((item) => (
          <span className="include" key={`include-event-${item}`}>+ event {item}<button type="button" onClick={() => setIncludeEvents((current) => current.filter((value) => value !== item))}>x</button></span>
        ))}
        {excludeEvents.map((item) => (
          <span className="exclude" key={`exclude-event-${item}`}>- event {item}<button type="button" onClick={() => setExcludeEvents((current) => current.filter((value) => value !== item))}>x</button></span>
        ))}
      </div>

      <div className="logs-list">
        {logs.length ? (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Level</th>
                  <th>Event</th>
                  <th>Request ID</th>
                  <th>Route</th>
                  <th>Duração</th>
                  <th>Metadata</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => {
                  const metadata = log.metadata || {};
                  const request = String(log.requestId || '');
                  const rowKey = `${log.time || log.timestamp}-${index}`;
                  const expanded = expandedRows[rowKey] === true;
                  return (
                    <Fragment key={rowKey}>
                      <tr className={`log-row log-level-${levelLabel(log.level)}`} key={rowKey}>
                        <td><time>{formatTime(log.time || log.timestamp)}</time></td>
                        <td><span className="log-level-badge">{levelLabel(log.level)}</span></td>
                        <td className="log-event-cell" title={log.event || log.msg || 'log'}>
                          <button type="button" onClick={() => includeEventValue(log.event || log.msg || 'log')}>{log.event || log.msg || 'log'}</button>
                        </td>
                        <td className="log-request-cell">
                          {request ? (
                            <span className="log-request-actions">
                              <button type="button" onClick={() => filterByRequestId(request)} title={`Filtrar por ${request}`}>{request}</button>
                              <button type="button" aria-label="Excluir request id" onClick={() => excludeRequestId(request)}>Excluir</button>
                              <button type="button" aria-label="Copiar request id" onClick={() => navigator.clipboard?.writeText(request)}>Copiar</button>
                            </span>
                          ) : <span>-</span>}
                        </td>
                        <td className="log-route-cell" title={log.route || ''}>{log.route || '-'}</td>
                        <td>{typeof log.durationMs === 'number' ? `${log.durationMs}ms` : '-'}</td>
                        <td className="log-metadata-cell" title={metadataSummary(metadata)}>{metadataSummary(metadata) || '-'}</td>
                        <td>
                          <button type="button" className="button ghost small" onClick={() => setExpandedRows((current) => ({ ...current, [rowKey]: !expanded }))}>
                            {expanded ? 'Fechar' : 'Ver'}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="log-details-row" key={`${rowKey}-details`}>
                          <td colSpan={8}>
                            <pre>{JSON.stringify(metadata, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="logs-empty">Sem logs para estes filtros.</p>}
      </div>
    </section>
  );
}
