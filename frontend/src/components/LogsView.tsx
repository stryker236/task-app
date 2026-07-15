import { Fragment, useEffect, useMemo, useState } from 'react';
import { getLogs, type AppLogEntry } from '../api';

type LogsViewProps = {
  onError: (message: string) => void;
};

type LogColumn = 'time' | 'level' | 'event' | 'requestId' | 'method' | 'route' | 'statusCode' | 'durationMs' | 'metadata' | 'message';
type LogPreset = 'all' | 'advisor' | 'calendar' | 'slow' | 'errors';

type RequestGroup = {
  requestId: string;
  logs: AppLogEntry[];
  startedAt: string;
  route: string;
  method: string;
  durationMs: number | null;
  statusCode: number | null;
  errorCount: number;
  warnCount: number;
};

const COLUMN_LABELS: Record<LogColumn, string> = {
  time: 'Hora',
  level: 'Level',
  event: 'Event',
  requestId: 'Request',
  method: 'Metodo',
  route: 'Route',
  statusCode: 'Status',
  durationMs: 'Duracao',
  metadata: 'Metadata',
  message: 'Mensagem'
};

const DEFAULT_COLUMNS: LogColumn[] = ['time', 'level', 'event', 'requestId', 'route', 'statusCode', 'durationMs', 'metadata'];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function levelLabel(level: string | number) {
  if (level === 10) return 'debug';
  if (level === 20) return 'debug';
  if (level === 30) return 'info';
  if (level === 40) return 'warn';
  if (level === 50) return 'error';
  return String(level || 'info').toLowerCase();
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
  const nested = metadata.metadata && typeof metadata.metadata === 'object' && !Array.isArray(metadata.metadata)
    ? metadata.metadata as Record<string, unknown>
    : {};
  const entries = Object.entries({ ...metadata, ...nested })
    .filter(([key, value]) => key !== 'metadata' && value != null && value !== '');
  if (!entries.length) return '';
  return entries.slice(0, 4).map(([key, value]) => {
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

function removeValue(list: string[], value: string) {
  return list.filter((item) => item !== value);
}

function groupLogsByRequest(logs: AppLogEntry[]): RequestGroup[] {
  const map = new Map<string, AppLogEntry[]>();
  logs.forEach((log, index) => {
    const key = String(log.requestId || `no-request-${index}`);
    map.set(key, [...(map.get(key) || []), log]);
  });
  return [...map.entries()].map(([requestId, entries]) => {
    const sorted = [...entries].sort((left, right) => Date.parse(left.time || left.timestamp || '') - Date.parse(right.time || right.timestamp || ''));
    const finished = [...sorted].reverse().find((log) => typeof log.durationMs === 'number' || log.statusCode != null);
    return {
      requestId,
      logs: sorted,
      startedAt: sorted[0]?.time || sorted[0]?.timestamp || '',
      route: finished?.route || sorted.find((log) => log.route)?.route || '-',
      method: finished?.method || sorted.find((log) => log.method)?.method || '-',
      durationMs: typeof finished?.durationMs === 'number' ? finished.durationMs : null,
      statusCode: typeof finished?.statusCode === 'number' ? finished.statusCode : null,
      errorCount: sorted.filter((log) => levelLabel(log.level) === 'error').length,
      warnCount: sorted.filter((log) => levelLabel(log.level) === 'warn').length
    };
  }).sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}

function presetFilters(preset: LogPreset) {
  if (preset === 'advisor') return { events: ['advisor'], routes: ['/ai/advisor', '/ai/commands'] };
  if (preset === 'calendar') return { events: ['calendar'], routes: ['/google/calendar', '/ai/advisor'] };
  if (preset === 'slow') return { minDurationMs: 750 };
  if (preset === 'errors') return { level: 'error' };
  return {};
}

export default function LogsView({ onError }: LogsViewProps) {
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState<LogPreset>('advisor');
  const [level, setLevel] = useState('');
  const [event, setEvent] = useState('');
  const [route, setRoute] = useState('');
  const [requestId, setRequestId] = useState('');
  const [statusCode, setStatusCode] = useState<number | ''>('');
  const [minDurationMs, setMinDurationMs] = useState<number | ''>('');
  const [eventDraft, setEventDraft] = useState('');
  const [routeDraft, setRouteDraft] = useState('');
  const [includeRequestIds, setIncludeRequestIds] = useState<string[]>([]);
  const [excludeRequestIds, setExcludeRequestIds] = useState<string[]>([]);
  const [includeEvents, setIncludeEvents] = useState<string[]>([]);
  const [excludeEvents, setExcludeEvents] = useState<string[]>([]);
  const [includeRoutes, setIncludeRoutes] = useState<string[]>([]);
  const [excludeRoutes, setExcludeRoutes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(300);
  const [groupByRequest, setGroupByRequest] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState<LogColumn[]>(DEFAULT_COLUMNS);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});

  const requestGroups = useMemo(() => groupLogsByRequest(logs), [logs]);
  const uniqueEvents = useMemo(() => [...new Set(logs.map((log) => log.event || log.msg || '').filter(Boolean))].slice(0, 16), [logs]);
  const uniqueRoutes = useMemo(() => [...new Set(logs.map((log) => log.route || '').filter(Boolean))].slice(0, 16), [logs]);

  async function loadLogs(nextPreset = preset) {
    setLoading(true);
    try {
      const presetValues = presetFilters(nextPreset);
      const result = await getLogs({
        level: level || presetValues.level,
        event,
        route,
        requestIds: [...includeRequestIds, ...(requestId.trim() ? [requestId.trim()] : [])],
        excludeRequestIds,
        events: [...includeEvents, ...(presetValues.events || [])],
        excludeEvents,
        routes: [...includeRoutes, ...(presetValues.routes || [])],
        excludeRoutes,
        statusCode,
        minDurationMs: minDurationMs || presetValues.minDurationMs || '',
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

  function applyPreset(nextPreset: LogPreset) {
    setPreset(nextPreset);
    loadLogs(nextPreset);
  }

  function filterByRequestId(value: string) {
    setIncludeRequestIds((current) => addUnique(current, value));
    setRequestId('');
    setGroupByRequest(false);
  }

  function includeRequestId(value: string) {
    setIncludeRequestIds((current) => addUnique(current, value));
    setExcludeRequestIds((current) => removeValue(current, value));
  }

  function excludeRequestId(value: string) {
    setExcludeRequestIds((current) => addUnique(current, value));
    setIncludeRequestIds((current) => removeValue(current, value));
  }

  function includeEventValue(value: string) {
    setIncludeEvents((current) => addUnique(current, value));
    setExcludeEvents((current) => removeValue(current, value));
  }

  function excludeEventValue(value: string) {
    setExcludeEvents((current) => addUnique(current, value));
    setIncludeEvents((current) => removeValue(current, value));
  }

  function includeRouteValue(value: string) {
    setIncludeRoutes((current) => addUnique(current, value));
    setExcludeRoutes((current) => removeValue(current, value));
  }

  function excludeRouteValue(value: string) {
    setExcludeRoutes((current) => addUnique(current, value));
    setIncludeRoutes((current) => removeValue(current, value));
  }

  function clearAdvancedFilters() {
    setRequestId('');
    setEvent('');
    setRoute('');
    setEventDraft('');
    setRouteDraft('');
    setStatusCode('');
    setMinDurationMs('');
    setIncludeRequestIds([]);
    setExcludeRequestIds([]);
    setIncludeEvents([]);
    setExcludeEvents([]);
    setIncludeRoutes([]);
    setExcludeRoutes([]);
  }

  function toggleColumn(column: LogColumn) {
    setVisibleColumns((current) => current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column]
    );
  }

  function renderCell(log: AppLogEntry, column: LogColumn, rowKey: string) {
    const metadata = log.metadata || {};
    const request = String(log.requestId || '');
    if (column === 'time') return <time>{formatTime(log.time || log.timestamp)}</time>;
    if (column === 'level') return <span className="log-level-badge">{levelLabel(log.level)}</span>;
    if (column === 'event') return <button type="button" className="log-inline-link" onClick={() => includeEventValue(log.event || log.msg || 'log')}>{log.event || log.msg || 'log'}</button>;
    if (column === 'requestId') return request ? <span className="log-request-actions"><button type="button" onClick={() => filterByRequestId(request)}>{request}</button><button type="button" onClick={() => excludeRequestId(request)}>Excluir</button><button type="button" onClick={() => navigator.clipboard?.writeText(request)}>Copiar</button></span> : <span>-</span>;
    if (column === 'method') return log.method || '-';
    if (column === 'route') return <button type="button" className="log-inline-link" onClick={() => includeRouteValue(log.route || '')}>{log.route || '-'}</button>;
    if (column === 'statusCode') return log.statusCode ?? '-';
    if (column === 'durationMs') return typeof log.durationMs === 'number' ? `${log.durationMs}ms` : '-';
    if (column === 'message') return log.msg || '-';
    return metadataSummary(metadata) || '-';
  }

  useEffect(() => {
    loadLogs('advisor');
  }, []);

  return (
    <section className="logs-view">
      <header className="logs-toolbar">
        <div>
          <span>Observabilidade</span>
          <h2>Logs</h2>
          <p>{logs.length} entradas - {requestGroups.length} requests</p>
        </div>
        <div className="logs-toolbar-actions">
          <label><input type="checkbox" checked={groupByRequest} onChange={(item) => setGroupByRequest(item.target.checked)} /> <span>Agrupar por request</span></label>
          <button type="button" className="button primary small" onClick={() => loadLogs()} disabled={loading}>{loading ? 'A carregar...' : 'Atualizar'}</button>
        </div>
      </header>

      <div className="logs-presets" aria-label="Presets de logs">
        {([
          ['advisor', 'Advisor'],
          ['calendar', 'Calendar'],
          ['slow', 'Lentos'],
          ['errors', 'Erros'],
          ['all', 'Todos']
        ] as Array<[LogPreset, string]>).map(([value, label]) => (
          <button key={value} type="button" className={preset === value ? 'is-active' : ''} onClick={() => applyPreset(value)}>{label}</button>
        ))}
      </div>

      <div className="logs-filters">
        <label>Level<select value={level} onChange={(item) => setLevel(item.target.value)}><option value="">Todos</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option></select></label>
        <label>Event<input value={event} onChange={(item) => setEvent(item.target.value)} placeholder="contém advisor.calendar" /></label>
        <label>Route<input value={route} onChange={(item) => setRoute(item.target.value)} placeholder="/ai/advisor" /></label>
        <label>Pesquisa<input value={search} onChange={(item) => setSearch(item.target.value)} placeholder="task, id, titulo..." /></label>
        <label>Status<input type="number" min={100} max={599} value={statusCode} onChange={(item) => setStatusCode(item.target.value ? Number(item.target.value) : '')} /></label>
        <label>Min ms<input type="number" min={0} max={600000} value={minDurationMs} onChange={(item) => setMinDurationMs(item.target.value ? Number(item.target.value) : '')} /></label>
        <label>Limite<input type="number" min={20} max={1000} value={limit} onChange={(item) => setLimit(Number(item.target.value) || 300)} /></label>
      </div>

      <div className="logs-columns">
        <strong>Colunas</strong>
        {(Object.keys(COLUMN_LABELS) as LogColumn[]).map((column) => (
          <label key={column}><input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => toggleColumn(column)} /> <span>{COLUMN_LABELS[column]}</span></label>
        ))}
      </div>

      <div className="logs-advanced-filters">
        <div className="logs-chip-editor">
          <label>Request IDs<input value={requestId} onChange={(item) => setRequestId(item.target.value)} onKeyDown={(item) => { if (item.key === 'Enter' && requestId.trim()) { item.preventDefault(); includeRequestId(requestId); setRequestId(''); } }} placeholder="Adicionar requestId e Enter" /></label>
          <button type="button" className="button secondary small" disabled={!requestId.trim()} onClick={() => { includeRequestId(requestId); setRequestId(''); }}>Incluir</button>
          <button type="button" className="button ghost small" disabled={!requestId.trim()} onClick={() => { excludeRequestId(requestId); setRequestId(''); }}>Excluir</button>
        </div>
        <div className="logs-chip-editor">
          <label>Events<input value={eventDraft} onChange={(item) => setEventDraft(item.target.value)} onKeyDown={(item) => { if (item.key === 'Enter' && eventDraft.trim()) { item.preventDefault(); includeEventValue(eventDraft); setEventDraft(''); } }} placeholder="Adicionar event e Enter" /></label>
          <button type="button" className="button secondary small" disabled={!eventDraft.trim()} onClick={() => { includeEventValue(eventDraft); setEventDraft(''); }}>Incluir</button>
          <button type="button" className="button ghost small" disabled={!eventDraft.trim()} onClick={() => { excludeEventValue(eventDraft); setEventDraft(''); }}>Excluir</button>
        </div>
        <div className="logs-chip-editor">
          <label>Routes<input value={routeDraft} onChange={(item) => setRouteDraft(item.target.value)} onKeyDown={(item) => { if (item.key === 'Enter' && routeDraft.trim()) { item.preventDefault(); includeRouteValue(routeDraft); setRouteDraft(''); } }} placeholder="Adicionar route e Enter" /></label>
          <button type="button" className="button secondary small" disabled={!routeDraft.trim()} onClick={() => { includeRouteValue(routeDraft); setRouteDraft(''); }}>Incluir</button>
          <button type="button" className="button ghost small" disabled={!routeDraft.trim()} onClick={() => { excludeRouteValue(routeDraft); setRouteDraft(''); }}>Excluir</button>
        </div>
        <button type="button" className="button ghost small" onClick={clearAdvancedFilters}>Limpar filtros</button>
      </div>

      <div className="logs-filter-chips">
        {includeRequestIds.map((item) => <span className="include" key={`include-request-${item}`}>+ request {item}<button type="button" onClick={() => setIncludeRequestIds((current) => removeValue(current, item))}>x</button></span>)}
        {excludeRequestIds.map((item) => <span className="exclude" key={`exclude-request-${item}`}>- request {item}<button type="button" onClick={() => setExcludeRequestIds((current) => removeValue(current, item))}>x</button></span>)}
        {includeEvents.map((item) => <span className="include" key={`include-event-${item}`}>+ event {item}<button type="button" onClick={() => setIncludeEvents((current) => removeValue(current, item))}>x</button></span>)}
        {excludeEvents.map((item) => <span className="exclude" key={`exclude-event-${item}`}>- event {item}<button type="button" onClick={() => setExcludeEvents((current) => removeValue(current, item))}>x</button></span>)}
        {includeRoutes.map((item) => <span className="include" key={`include-route-${item}`}>+ route {item}<button type="button" onClick={() => setIncludeRoutes((current) => removeValue(current, item))}>x</button></span>)}
        {excludeRoutes.map((item) => <span className="exclude" key={`exclude-route-${item}`}>- route {item}<button type="button" onClick={() => setExcludeRoutes((current) => removeValue(current, item))}>x</button></span>)}
      </div>

      {(uniqueEvents.length || uniqueRoutes.length) ? (
        <div className="logs-suggestions">
          {uniqueEvents.length ? <div><strong>Events recentes</strong>{uniqueEvents.map((item) => <button key={item} type="button" onClick={() => includeEventValue(item)}>{item}</button>)}</div> : null}
          {uniqueRoutes.length ? <div><strong>Routes recentes</strong>{uniqueRoutes.map((item) => <button key={item} type="button" onClick={() => includeRouteValue(item)}>{item}</button>)}</div> : null}
        </div>
      ) : null}

      {groupByRequest && requestGroups.length ? (
        <div className="logs-request-groups">
          {requestGroups.map((group) => {
            const open = expandedRequests[group.requestId] === true;
            return (
              <article key={group.requestId} className={`logs-request-card ${group.errorCount ? 'has-error' : group.warnCount ? 'has-warn' : ''}`}>
                <header>
                  <div>
                    <strong>{group.method} {group.route}</strong>
                    <span>{formatTime(group.startedAt)} - {group.logs.length} logs - {group.durationMs != null ? `${group.durationMs}ms` : 'sem duracao'} - {group.statusCode || '-'}</span>
                    <code>{group.requestId}</code>
                  </div>
                  <div>
                    <button type="button" className="button secondary small" onClick={() => filterByRequestId(group.requestId)}>Isolar</button>
                    <button type="button" className="button ghost small" onClick={() => setExpandedRequests((current) => ({ ...current, [group.requestId]: !open }))}>{open ? 'Fechar' : 'Ver fluxo'}</button>
                  </div>
                </header>
                {open && (
                  <ol>
                    {group.logs.map((log, index) => <li key={`${group.requestId}-${index}`}><span className={`log-dot is-${levelLabel(log.level)}`} /><time>{formatTime(log.time || log.timestamp)}</time><strong>{log.event || log.msg}</strong><small>{metadataSummary(log.metadata || {})}</small></li>)}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="logs-list">
        {logs.length ? (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead><tr>{visibleColumns.map((column) => <th key={column}>{COLUMN_LABELS[column]}</th>)}<th /></tr></thead>
              <tbody>
                {logs.map((log, index) => {
                  const metadata = log.metadata || {};
                  const rowKey = `${log.time || log.timestamp}-${index}`;
                  const expanded = expandedRows[rowKey] === true;
                  return (
                    <Fragment key={rowKey}>
                      <tr className={`log-row log-level-${levelLabel(log.level)}`}>
                        {visibleColumns.map((column) => <td key={`${rowKey}-${column}`} className={`log-cell-${column}`}>{renderCell(log, column, rowKey)}</td>)}
                        <td><button type="button" className="button ghost small" onClick={() => setExpandedRows((current) => ({ ...current, [rowKey]: !expanded }))}>{expanded ? 'Fechar' : 'JSON'}</button></td>
                      </tr>
                      {expanded && <tr className="log-details-row"><td colSpan={visibleColumns.length + 1}><pre>{JSON.stringify({ ...log, metadata }, null, 2)}</pre></td></tr>}
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