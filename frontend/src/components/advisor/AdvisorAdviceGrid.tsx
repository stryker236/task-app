type AdvisorActionItem = {
  taskId: string;
  title: string;
  urgency: string;
  reason: string;
  nextStep: string;
};

type AdvisorAdviceGridProps = {
  actions: AdvisorActionItem[];
  blockers: AdvisorActionItem[];
  onOpenTask: (taskId: string) => void;
};

export type { AdvisorActionItem };

export default function AdvisorAdviceGrid({ actions, blockers, onOpenTask }: AdvisorAdviceGridProps) {
  return (
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
  );
}
