import type { ViewKey } from '../constants/tasks';

const TABS = [
  ['kanban', 'Kanban'],
  ['queue', 'Fila'],
  ['quickQueue', 'Fila rapida'],
  ['collections', 'Cobrancas provaveis'],
  ['sharedNotes', 'Notas'],
  ['calendar', 'Calendario'],
  ['learnedRules', 'Regras'],
  ['logs', 'Logs'],
  ['archived', 'Arquivadas']
] as const satisfies ReadonlyArray<readonly [ViewKey, string]>;

type ViewTabsProps = {
  view: ViewKey;
  onChange: (view: ViewKey) => void;
};

export default function ViewTabs({ view, onChange }: ViewTabsProps) {
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
