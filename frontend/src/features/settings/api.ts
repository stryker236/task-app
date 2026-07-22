import type { AppSettings, AppSettingsUpdate } from '../../../../shared/types';
import { requestJson } from '../../shared/api/requestJson';

export type { AppSettings, AppSettingsUpdate };

export const getAppSettings = () => requestJson<AppSettings>('/settings');
export const updateAppSettings = (patch: AppSettingsUpdate) => requestJson<AppSettings>('/settings', { method: 'PATCH', body: JSON.stringify(patch) });
