export default function DashboardCounters({ counters }) {
  return (
    <section className="counter-grid" aria-label="Resumo">
      <div>
        <span>Total</span>
        <strong>{counters.total}</strong>
      </div>
      <div>
        <span>Hoje</span>
        <strong>{counters.today}</strong>
      </div>
      <div className={counters.overdue ? 'counter-alert' : ''}>
        <span>Atrasadas</span>
        <strong>{counters.overdue}</strong>
      </div>
      <div>
        <span>Waiting</span>
        <strong>{counters.waiting}</strong>
      </div>
      <div>
        <span>Sem prazo</span>
        <strong>{counters.noDue}</strong>
      </div>
    </section>
  );
}
