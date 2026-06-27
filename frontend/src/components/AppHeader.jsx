export default function AppHeader({ onCreateTask }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">T</span>
        <div>
          <h1>Task App</h1>
          <p>Organização de trabalho</p>
        </div>
      </div>
      <button className="button primary add-task" type="button" onClick={onCreateTask}>
        + Nova tarefa
      </button>
    </header>
  );
}
