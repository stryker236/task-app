import { Fragment } from 'react';
import type { AppLogEntry } from '../api';
import { COLUMN_LABELS, formatTime, levelLabel, metadataSummary, type LogColumn } from '../logUtils';

type LogsTableProps = {
  logs: AppLogEntry[];
  visibleColumns: LogColumn[];
  expandedRows: Record<string, boolean>;
  onToggleRow: (rowKey: string) => void;
  onFilterByRequestId: (requestId: string) => void;
  onExcludeRequestId: (requestId: string) => void;
  onIncludeEvent: (event: string) => void;
  onIncludeRoute: (route: string) => void;
};

export default function LogsTable({
  logs,
  visibleColumns,
  expandedRows,
  onToggleRow,
  onFilterByRequestId,
  onExcludeRequestId,
  onIncludeEvent,
  onIncludeRoute
}: LogsTableProps) {
  function renderCell(log: AppLogEntry, column: LogColumn) {
    const metadata = log.metadata || {};
    const request = String(log.requestId || '');
    if (column === 'time') return <time>{formatTime(log.time || log.timestamp)}</time>;
    if (column === 'level') return <span className="log-level-badge">{levelLabel(log.level)}</span>;
    if (column === 'event') return <button type="button" className="log-inline-link" onClick={() => onIncludeEvent(log.event || log.msg || 'log')}>{log.event || log.msg || 'log'}</button>;
    if (column === 'requestId') {
      return request ? (
        <span className="log-request-actions">
          <button type="button" onClick={() => onFilterByRequestId(request)}>{request}</button>
          <button type="button" onClick={() => onExcludeRequestId(request)}>Excluir</button>
          <button type="button" onClick={() => navigator.clipboard?.writeText(request)}>Copiar</button>
        </span>
      ) : <span>-</span>;
    }
    if (column === 'method') return log.method || '-';
    if (column === 'route') return <button type="button" className="log-inline-link" onClick={() => onIncludeRoute(log.route || '')}>{log.route || '-'}</button>;
    if (column === 'statusCode') return log.statusCode ?? '-';
    if (column === 'durationMs') return typeof log.durationMs === 'number' ? `${log.durationMs}ms` : '-';
    if (column === 'message') return log.msg || '-';
    return metadataSummary(metadata) || '-';
  }

  return (
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
                      {visibleColumns.map((column) => <td key={`${rowKey}-${column}`} className={`log-cell-${column}`}>{renderCell(log, column)}</td>)}
                      <td><button type="button" className="button ghost small" onClick={() => onToggleRow(rowKey)}>{expanded ? 'Fechar' : 'JSON'}</button></td>
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
  );
}
