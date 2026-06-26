export default function AdvisorPanel({ advice, loading, onRefresh, onOpenTask }) {
  const actions = advice?.actions || [];
  const blockers = advice?.blockers || [];

  return (
    <section className="advisor-panel" aria-label="Assistente de trabalho">
      <header>
        <div>
          <span>Assistente</span>
          <h2>O que fazer agora</h2>
        </div>
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A pensar...' : 'Atualizar'}
        </button>
      </header>

      {advice?.summary && <p className="advisor-summary">{advice.summary}</p>}
      {advice?.note && <p className="advisor-note">{advice.note}</p>}

      <div className="advisor-grid">
        <div>
          <h3>Proximas acoes</h3>
          {actions.length ? actions.map((item, index) => (
            <button type="button" className="advisor-action" key={`${item.taskId}-${index}`} onClick={() => onOpenTask(item.taskId)}>
              <strong>{index + 1}. {item.title}</strong>
              <span>{item.nextStep}</span>
              <small>{item.urgency} | {item.reason}</small>
            </button>
          )) : <p className="advisor-empty">Sem sugestoes para ja.</p>}
        </div>

        <div>
          <h3>Bloqueios</h3>
          {blockers.length ? blockers.map((item) => (
            <button type="button" className="advisor-blocker" key={item.taskId} onClick={() => onOpenTask(item.taskId)}>
              <strong>{item.title}</strong>
              <span>{item.nextStep}</span>
              <small>{item.reason}</small>
            </button>
          )) : <p className="advisor-empty">Nada bloqueado que precise de atencao.</p>}
        </div>
      </div>
    </section>
  );
}
