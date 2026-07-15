import { useEffect, useState } from 'react';
import type { AppSettings, AppSettingsUpdate } from '../api';

type SettingsViewProps = {
  settings: AppSettings;
  loading: boolean;
  saving: boolean;
  onSave: (patch: AppSettingsUpdate) => Promise<AppSettings> | AppSettings;
  onRefresh: () => void | Promise<void>;
};

type SettingsSection = keyof AppSettings;

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="settings-toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function SettingsView({ settings, loading, saving, onSave, onRefresh }: SettingsViewProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  function updateSection<T extends SettingsSection>(section: T, patch: Partial<AppSettings[T]>) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], ...patch }
    }));
  }

  async function saveSection<T extends SettingsSection>(section: T) {
    await onSave({ [section]: draft[section] } as AppSettingsUpdate);
    setSaved(true);
  }

  return (
    <section className="settings-view" aria-label="Settings">
      <header className="settings-header">
        <div>
          <span>Settings</span>
          <h2>Preferencias da app</h2>
          <p>Controlos persistidos para produtividade, AI, calendario e interface.</p>
        </div>
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading || saving}>{loading ? 'A carregar...' : 'Atualizar'}</button>
      </header>

      {saved && <p className="settings-saved">Settings guardadas.</p>}

      <div className="settings-grid">
        <article className="settings-card">
          <header>
            <div>
              <span>Produtividade</span>
              <h3>XP e dashboard</h3>
            </div>
            <button type="button" className="button primary small" onClick={() => saveSection('productivity')} disabled={saving}>Guardar</button>
          </header>
          <div className="settings-fields">
            <NumberField label="Objetivo diario de XP" value={draft.productivity.dailyGoalXp} min={10} max={500} step={5} onChange={(value) => updateSection('productivity', { dailyGoalXp: value })} />
            <ToggleField label="Mostrar painel de produtividade no dashboard" checked={draft.productivity.showDashboardPanel} onChange={(value) => updateSection('productivity', { showDashboardPanel: value })} />
          </div>
        </article>

        <article className="settings-card">
          <header>
            <div>
              <span>AI</span>
              <h3>Advisor, FeedbackAI e Agenda AI</h3>
            </div>
            <button type="button" className="button primary small" onClick={() => saveSection('ai')} disabled={saving}>Guardar</button>
          </header>
          <div className="settings-fields">
            <ToggleField label="Ativar Advisor AI" checked={draft.ai.advisorEnabled} onChange={(value) => updateSection('ai', { advisorEnabled: value })} />
            <ToggleField label="Usar memoria FeedbackAI" checked={draft.ai.feedbackMemoryEnabled} onChange={(value) => updateSection('ai', { feedbackMemoryEnabled: value })} />
            <label>
              <span>Forca das regras FeedbackAI</span>
              <select value={draft.ai.feedbackMemoryStrength} onChange={(event) => updateSection('ai', { feedbackMemoryStrength: event.target.value as AppSettings['ai']['feedbackMemoryStrength'] })}>
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="strong">Forte</option>
              </select>
            </label>
            <ToggleField label="Ativar regras Agenda AI" checked={draft.ai.agendaRulesEnabled} onChange={(value) => updateSection('ai', { agendaRulesEnabled: value })} />
          </div>
        </article>

        <article className="settings-card">
          <header>
            <div>
              <span>Calendario</span>
              <h3>Defaults de scheduling</h3>
            </div>
            <button type="button" className="button primary small" onClick={() => saveSection('calendar')} disabled={saving}>Guardar</button>
          </header>
          <div className="settings-fields settings-fields-inline">
            <NumberField label="Duracao default" value={draft.calendar.defaultEventDurationMinutes} min={15} max={480} step={15} onChange={(value) => updateSection('calendar', { defaultEventDurationMinutes: value })} />
            <label>
              <span>Inicio do dia</span>
              <input type="time" value={draft.calendar.workingHoursStart} onChange={(event) => updateSection('calendar', { workingHoursStart: event.target.value })} />
            </label>
            <label>
              <span>Fim do dia</span>
              <input type="time" value={draft.calendar.workingHoursEnd} onChange={(event) => updateSection('calendar', { workingHoursEnd: event.target.value })} />
            </label>
            <ToggleField label="Preferir dias de semana" checked={draft.calendar.weekdaysOnly} onChange={(value) => updateSection('calendar', { weekdaysOnly: value })} />
          </div>
        </article>

        <article className="settings-card">
          <header>
            <div>
              <span>Interface</span>
              <h3>Estado visual</h3>
            </div>
            <button type="button" className="button primary small" onClick={() => saveSection('ui')} disabled={saving}>Guardar</button>
          </header>
          <div className="settings-fields">
            <ToggleField label="Modo compacto" checked={draft.ui.compactMode} onChange={(value) => updateSection('ui', { compactMode: value })} />
          </div>
        </article>
      </div>
    </section>
  );
}