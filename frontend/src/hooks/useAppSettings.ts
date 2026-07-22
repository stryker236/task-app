import { useCallback, useEffect, useState } from 'react';
import { getAppSettings, updateAppSettings, type AppSettings, type AppSettingsUpdate } from '../features/settings/api';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  productivity: {
    dailyGoalXp: 50,
    showDashboardPanel: true
  },
  ai: {
    advisorEnabled: true,
    feedbackMemoryEnabled: true,
    feedbackMemoryStrength: 'strong',
    agendaRulesEnabled: true
  },
  calendar: {
    defaultEventDurationMinutes: 60,
    workingHoursStart: '09:00',
    workingHoursEnd: '18:00',
    weekdaysOnly: true
  },
  ui: {
    compactMode: false,
    accentColor: '#315efb',
    breakColor: '#0f8f7e',
    surfaceColor: '#ffffff',
    calendarEventColor: '#315efb',
    calendarPreviewColor: '#6f48eb',
    calendarDueDateColor: '#447276'
  }
};

export default function useAppSettings({ setError }: { setError: (message: string) => void }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      setSettings(await getAppSettings());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao carregar settings');
    } finally {
      setSettingsLoading(false);
    }
  }, [setError]);

  const saveSettings = useCallback(async (patch: AppSettingsUpdate) => {
    setSettingsSaving(true);
    try {
      const updated = await updateAppSettings(patch);
      setSettings(updated);
      window.dispatchEvent(new CustomEvent('task-app:settings-updated', { detail: updated }));
      return updated;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao guardar settings');
      throw error;
    } finally {
      setSettingsSaving(false);
    }
  }, [setError]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return { settings, settingsLoading, settingsSaving, refreshSettings, saveSettings };
}

