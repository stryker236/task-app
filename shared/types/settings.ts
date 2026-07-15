export type FeedbackMemoryStrength = 'low' | 'normal' | 'strong';

export interface AppSettings {
  productivity: {
    dailyGoalXp: number;
    showDashboardPanel: boolean;
  };
  ai: {
    advisorEnabled: boolean;
    feedbackMemoryEnabled: boolean;
    feedbackMemoryStrength: FeedbackMemoryStrength;
    agendaRulesEnabled: boolean;
  };
  calendar: {
    defaultEventDurationMinutes: number;
    workingHoursStart: string;
    workingHoursEnd: string;
    weekdaysOnly: boolean;
  };
  ui: {
    compactMode: boolean;
  };
}

export type AppSettingsUpdate = Partial<{
  productivity: Partial<AppSettings['productivity']>;
  ai: Partial<AppSettings['ai']>;
  calendar: Partial<AppSettings['calendar']>;
  ui: Partial<AppSettings['ui']>;
}>;