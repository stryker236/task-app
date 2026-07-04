import { NavLink } from 'react-router-dom';
import type { ViewKey } from '../constants/tasks';
import { viewPath } from '../utils/routes';

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
};

export default function ViewTabs({ view }: ViewTabsProps) {
  return (
    <nav className="view-tabs" aria-label="Vista">
      {TABS.map(([value, label]) => (
        <NavLink
          key={value}
          className={view === value ? 'active' : ''}
          to={viewPath(value)}
          end={value === 'kanban'}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
