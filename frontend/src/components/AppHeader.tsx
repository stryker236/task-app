type AppHeaderProps = {
  onCreateTask: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
};

export default function AppHeader({ onCreateTask, darkMode, onToggleDarkMode }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">T</span>
        <div>
          <h1>Task App</h1>
          <p>Organizacao de trabalho</p>
        </div>
      </div>
      <div className="header-actions">
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
