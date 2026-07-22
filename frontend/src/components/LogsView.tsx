import { useEffect, useMemo, useState } from 'react';
import { getLogs, type AppLogEntry } from '../features/logs/api';
import LogRequestGroups from '../features/logs/components/LogRequestGroups';
import LogsTable from '../features/logs/components/LogsTable';
import {
  addUnique,
  COLUMN_LABELS,
  DEFAULT_COLUMNS,
  errorMessage,
  groupLogsByRequest,
  presetFilters,
  removeValue,
  type LogColumn,
  type LogPreset
} from '../features/logs/logUtils';

type LogsViewProps = {
  onError: (message: string) => void;
};

const PRESETS: Array<[LogPreset, string]> = [
  ['advisor', 'Advisor'],
  ['calendar', 'Calendar'],
  ['slow', 'Lentos'],
  ['errors', 'Erros'],
  ['all', 'Todos']
];

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
        {PRESETS.map(([value, label]) => (
          <button key={value} type="button" className={preset === value ? 'is-active' : ''} onClick={() => applyPreset(value)}>{label}</button>
        ))}
      </div>

      <div className="logs-filters">
        <label>Level<select value={level} onChange={(item) => setLevel(item.target.value)}><option value="">Todos</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warn</option><option value="error">Error</option></select></label>
        <label>Event<input value={event} onChange={(item) => setEvent(item.target.value)} placeholder="contem advisor.calendar" /></label>
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

      {groupByRequest && (
        <LogRequestGroups
          groups={requestGroups}
          expandedRequests={expandedRequests}
          onFilterByRequestId={filterByRequestId}
          onToggleRequest={(requestIdValue) => setExpandedRequests((current) => ({ ...current, [requestIdValue]: !current[requestIdValue] }))}
        />
      )}

      <LogsTable
        logs={logs}
        visibleColumns={visibleColumns}
        expandedRows={expandedRows}
        onToggleRow={(rowKey) => setExpandedRows((current) => ({ ...current, [rowKey]: !current[rowKey] }))}
        onFilterByRequestId={filterByRequestId}
        onExcludeRequestId={excludeRequestId}
        onIncludeEvent={includeEventValue}
        onIncludeRoute={includeRouteValue}
      />
    </section>
  );
}
