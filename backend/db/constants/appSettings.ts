import type { AppSettings } from '../../../shared/types';

const DEFAULT_APP_SETTINGS: AppSettings = {
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

module.exports = {
	DEFAULT_APP_SETTINGS
};

export {};
