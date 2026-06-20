export default function Filters({ filters, onChange, onClear }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });
  return (
    <section className="filters" aria-label="Filtros de tarefas">
      <input className="search-input" type="search" value={filters.search} onChange={set('search')} placeholder="Pesquisar tarefas…" />
      <select value={filters.status} onChange={set('status')} aria-label="Estado">
        <option value="">Todos os estados</option>
        <option value="novo">Novo</option><option value="em_curso">Em curso</option><option value="a_espera">À espera</option><option value="feito">Feito</option><option value="cancelado">Cancelado</option>
      </select>
      <select value={filters.priority} onChange={set('priority')} aria-label="Prioridade">
        <option value="">Todas as prioridades</option>
        <option value="4">Urgente</option><option value="3">Alta</option><option value="2">Média</option><option value="1">Baixa</option>
      </select>
      <input value={filters.requestedBy} onChange={set('requestedBy')} placeholder="Pedido por…" />
      <input value={filters.tag} onChange={set('tag')} placeholder="Etiqueta…" />
      <label className="check-filter"><input type="checkbox" checked={filters.overdue} onChange={set('overdue')} /> Atrasadas</label>
      <label className="check-filter"><input type="checkbox" checked={filters.today} onChange={set('today')} /> Hoje</label>
      <label className="check-filter"><input type="checkbox" checked={filters.noDueDate} onChange={set('noDueDate')} /> Sem prazo</label>
      <label className="check-filter"><input type="checkbox" checked={filters.hideBlocked} onChange={set('hideBlocked')} /> Ocultar bloqueadas</label>
      <button type="button" className="button ghost" onClick={onClear}>Limpar</button>
    </section>
  );
}
