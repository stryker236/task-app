const { pool } = require('../pool');
const { DEFAULT_APP_SETTINGS } = require('../constants/appSettings');

import type { AppSettings, AppSettingsUpdate } from '../../../shared/types';
import type { Queryable } from '../types';

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
	const number = Math.round(Number(value));
	if (!Number.isFinite(number)) return fallback;
	return Math.max(min, Math.min(max, number));
}

function boolValue(value: unknown, fallback: boolean) {
	return typeof value === 'boolean' ? value : fallback;
}

function timeValue(value: unknown, fallback: string) {
	const text = String(value || '').trim();
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(String(value) as T) ? String(value) as T : fallback;
}

function colorValue(value: unknown, fallback: string) {
	const text = String(value || '').trim();
	return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function normalizeAppSettings(value: unknown): AppSettings {
	const source = value && typeof value === 'object' ? value as Partial<AppSettings> : {};
	return {
		productivity: {
			dailyGoalXp: clampInteger(source.productivity?.dailyGoalXp, DEFAULT_APP_SETTINGS.productivity.dailyGoalXp, 10, 500),
			showDashboardPanel: boolValue(source.productivity?.showDashboardPanel, DEFAULT_APP_SETTINGS.productivity.showDashboardPanel)
		},
		ai: {
			advisorEnabled: boolValue(source.ai?.advisorEnabled, DEFAULT_APP_SETTINGS.ai.advisorEnabled),
			feedbackMemoryEnabled: boolValue(source.ai?.feedbackMemoryEnabled, DEFAULT_APP_SETTINGS.ai.feedbackMemoryEnabled),
			feedbackMemoryStrength: enumValue(source.ai?.feedbackMemoryStrength, ['low', 'normal', 'strong'] as const, DEFAULT_APP_SETTINGS.ai.feedbackMemoryStrength),
			agendaRulesEnabled: boolValue(source.ai?.agendaRulesEnabled, DEFAULT_APP_SETTINGS.ai.agendaRulesEnabled)
		},
		calendar: {
			defaultEventDurationMinutes: clampInteger(source.calendar?.defaultEventDurationMinutes, DEFAULT_APP_SETTINGS.calendar.defaultEventDurationMinutes, 15, 480),
			workingHoursStart: timeValue(source.calendar?.workingHoursStart, DEFAULT_APP_SETTINGS.calendar.workingHoursStart),
			workingHoursEnd: timeValue(source.calendar?.workingHoursEnd, DEFAULT_APP_SETTINGS.calendar.workingHoursEnd),
			weekdaysOnly: boolValue(source.calendar?.weekdaysOnly, DEFAULT_APP_SETTINGS.calendar.weekdaysOnly)
		},
		ui: {
			compactMode: boolValue(source.ui?.compactMode, DEFAULT_APP_SETTINGS.ui.compactMode),
			accentColor: colorValue(source.ui?.accentColor, DEFAULT_APP_SETTINGS.ui.accentColor),
			breakColor: colorValue(source.ui?.breakColor, DEFAULT_APP_SETTINGS.ui.breakColor),
			surfaceColor: colorValue(source.ui?.surfaceColor, DEFAULT_APP_SETTINGS.ui.surfaceColor),
			calendarEventColor: colorValue(source.ui?.calendarEventColor, DEFAULT_APP_SETTINGS.ui.calendarEventColor),
			calendarPreviewColor: colorValue(source.ui?.calendarPreviewColor, DEFAULT_APP_SETTINGS.ui.calendarPreviewColor),
			calendarDueDateColor: colorValue(source.ui?.calendarDueDateColor, DEFAULT_APP_SETTINGS.ui.calendarDueDateColor)
		}
	};
}

function mergeAppSettings(current: AppSettings, patch: AppSettingsUpdate): AppSettings {
	return normalizeAppSettings({
		productivity: { ...current.productivity, ...(patch.productivity || {}) },
		ai: { ...current.ai, ...(patch.ai || {}) },
		calendar: { ...current.calendar, ...(patch.calendar || {}) },
		ui: { ...current.ui, ...(patch.ui || {}) }
	});
}

async function fetchAppSettings(db: Queryable = pool): Promise<AppSettings> {
	const result = await db.query('SELECT value FROM app_settings WHERE key = $1', ['app']);
	return normalizeAppSettings(result.rows[0]?.value || DEFAULT_APP_SETTINGS);
}

async function updateAppSettings(db: Queryable = pool, patch: AppSettingsUpdate): Promise<AppSettings> {
	const current = await fetchAppSettings(db);
	const next = mergeAppSettings(current, patch || {});
	const result = await db.query(
		`INSERT INTO app_settings (key, value)
		 VALUES ($1, $2::jsonb)
		 ON CONFLICT (key)
		 DO UPDATE SET value = EXCLUDED.value, updated_at = now()
		 RETURNING value`,
		['app', JSON.stringify(next)]
	);
	return normalizeAppSettings(result.rows[0]?.value || next);
}

module.exports = {
	clampInteger,
	fetchAppSettings,
	mergeAppSettings,
	normalizeAppSettings,
	updateAppSettings
};

export {};
