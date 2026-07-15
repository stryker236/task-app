type AppHeaderProps = {
  onCreateTask: () => void;
  onOpenSettings: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  todayXp: number;
  currentStreak: number;
};

export default function AppHeader({ onCreateTask, onOpenSettings, darkMode, onToggleDarkMode, todayXp, currentStreak }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <button className="settings-icon-button" type="button" onClick={onOpenSettings} aria-label="Abrir settings" title="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
        </button>
        <span className="brand-mark">T</span>
        <div>
          <h1>Task App</h1>
          <p>Organizacao de trabalho</p>
        </div>
      </div>
      <div className="header-actions">
        <div className="header-productivity" aria-label="Resumo de produtividade">
          <span>{todayXp} XP</span>
          <span>{currentStreak} dias</span>
        </div>
        <label className="theme-toggle">
          <input type="checkbox" checked={darkMode} onChange={onToggleDarkMode} />
          <span>{darkMode ? 'Light' : 'Dark'}</span>
        </label>
        <button className="button primary add-task" type="button" onClick={onCreateTask}>
          + Nova tarefa
        </button>
      </div>
    </header>
  );
}