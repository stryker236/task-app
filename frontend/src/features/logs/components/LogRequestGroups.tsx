import { formatTime, levelLabel, metadataSummary, type RequestGroup } from '../logUtils';

type LogRequestGroupsProps = {
  groups: RequestGroup[];
  expandedRequests: Record<string, boolean>;
  onFilterByRequestId: (requestId: string) => void;
  onToggleRequest: (requestId: string) => void;
};

export default function LogRequestGroups({
  groups,
  expandedRequests,
  onFilterByRequestId,
  onToggleRequest
}: LogRequestGroupsProps) {
  if (!groups.length) return null;

  return (
    <div className="logs-request-groups">
      {groups.map((group) => {
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
                <button type="button" className="button secondary small" onClick={() => onFilterByRequestId(group.requestId)}>Isolar</button>
                <button type="button" className="button ghost small" onClick={() => onToggleRequest(group.requestId)}>{open ? 'Fechar' : 'Ver fluxo'}</button>
              </div>
            </header>
            {open && (
              <ol>
                {group.logs.map((log, index) => (
                  <li key={`${group.requestId}-${index}`}>
                    <span className={`log-dot is-${levelLabel(log.level)}`} />
                    <time>{formatTime(log.time || log.timestamp)}</time>
                    <strong>{log.event || log.msg}</strong>
                    <small>{metadataSummary(log.metadata || {})}</small>
                  </li>
                ))}
              </ol>
            )}
          </article>
        );
      })}
    </div>
  );
}
