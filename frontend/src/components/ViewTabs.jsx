const TABS = [
  ['kanban', 'Kanban'],
  ['queue', 'Fila'],
  ['quickQueue', 'Fila rápida'],
  ['collections', 'Cobranças prováveis'],
  ['archived', 'Arquivadas']
];

export default function ViewTabs({ view, onChange }) {
  return (
    <nav className="view-tabs" aria-label="Vista">
      {TABS.map(([value, label]) => (
        <button
          key={value}
          className={view === value ? 'active' : ''}
          type="button"
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
