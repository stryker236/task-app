import type { ProductivitySummary } from '../../../../shared/types';
import { requestJson } from '../../shared/api/requestJson';

export const getProductivitySummary = () => requestJson<ProductivitySummary>('/productivity/summary');
