import { z } from 'zod';
import type { PilotAnalysis, PilotFilterOptions, PilotFilters, PilotReplayAction, PilotReplayState, PilotSnapshot, PilotStatus } from '../pilot/types';

const invalidResponse = '璇曠偣鏁版嵁鍝嶅簲鏃犳晥';
const networkError = '璇曠偣鏈嶅姟缃戠粶杩炴帴澶辫触';
const serviceError = '璇曠偣鏈嶅姟鏆傛椂涓嶅彲鐢?';
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isLocalDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && isCalendarDate(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59 && Number(match[4]) <= 59);
}

function isIsoInstant(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return Boolean(match && isCalendarDate(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59 && Number(match[4]) <= 59
    && (match[5] === undefined || (Number(match[5]) <= 14 && Number(match[6]) <= 59 && (Number(match[5]) < 14 || Number(match[6]) === 0)))
    && Number.isFinite(Date.parse(value)));
}

const date = z.string().refine(isCalendarDate);
const localDateTime = z.string().refine(isLocalDateTime);
const isoInstant = z.string().refine(isIsoInstant);
const kpi = z.object({ value: z.number().finite(), comparisonValue: z.number().finite(), changeRate: z.number().finite() }).strict();
const filters = z.object({ start: date, end: date, category: z.string().optional(), sellerId: z.string().optional(), customerState: z.string().optional() }).strict();
const replay = z.object({ sourceLocalNow: localDateTime, isRunning: z.boolean() }).strict();
const status = z.union([
  z.object({ ready: z.literal(false), importCommand: z.string() }).strict(),
  z.object({ ready: z.literal(true), range: z.object({ start: date, end: date }).strict(), replay }).strict(),
]);
const filterOptions = z.object({ categories: z.array(z.string()), sellerIds: z.array(z.string()), customerStates: z.array(z.string()) }).strict();
const snapshot = z.object({
  filters,
  sourceLocalNow: localDateTime,
  comparisonLabel: z.string(),
  kpis: z.object({ itemGmv: kpi, validOrderCount: kpi, averageOrderValue: kpi, cancellationRate: kpi, onTimeDeliveryRate: kpi, averageDeliveryDays: kpi, averageReviewScore: kpi }).strict(),
  dailyTrend: z.array(z.object({ date, itemGmv: z.number().finite(), validOrderCount: z.number().finite() }).strict()),
  fulfillmentFunnel: z.array(z.object({ stage: z.enum(['purchased', 'approved', 'carrier', 'delivered']), value: z.number().finite() }).strict()),
  categoryRanking: z.array(z.object({ category: z.string(), itemGmv: z.number().finite() }).strict()),
  sellerRanking: z.array(z.object({ sellerId: z.string(), itemGmv: z.number().finite() }).strict()),
  customerStateRanking: z.array(z.object({ customerState: z.string(), itemGmv: z.number().finite() }).strict()),
  recentOrders: z.array(z.object({ orderId: z.string(), purchasedAt: localDateTime, status: z.string(), itemGmv: z.number().finite(), itemCount: z.number().finite(), customerState: z.string() }).strict()),
  capabilities: z.array(z.object({ key: z.string(), status: z.enum(['available', 'unavailable']), reason: z.string().optional() }).strict()),
  commerce: z.object({ paymentAmount: kpi, uniqueBuyerCount: kpi, repeatBuyerCount: kpi }).strict(),
  payments: z.object({
    byType: z.array(z.object({ paymentType: z.string(), paymentAmount: z.number().finite() }).strict()),
    installments: z.array(z.object({ installments: z.number().finite(), paymentAmount: z.number().finite() }).strict()),
  }).strict(),
  fulfillment: z.object({
    statusDistribution: z.array(z.object({ status: z.string(), value: z.number().finite() }).strict()),
    averageApprovalDays: z.number().finite(), averageCarrierDays: z.number().finite(), averageDeliveryDays: z.number().finite(), lateDeliveryRate: z.number().finite(), averageLateDays: z.number().finite(),
  }).strict(),
  experience: z.object({
    scoreDistribution: z.array(z.object({ score: z.number().finite(), value: z.number().finite() }).strict()),
    lowScoreRate: z.number().finite(), averageReplyDays: z.number().finite(),
  }).strict(),
  contributions: z.object({
    categories: z.array(z.object({ category: z.string(), label: z.string(), itemGmv: z.number().finite(), itemCount: z.number().finite() }).strict()),
    sellers: z.array(z.object({ sellerId: z.string(), itemGmv: z.number().finite(), validOrderCount: z.number().finite() }).strict()),
    customerStates: z.array(z.object({ customerState: z.string(), itemGmv: z.number().finite(), validOrderCount: z.number().finite() }).strict()),
  }).strict(),
}).strict();
const analysis = z.object({
  summary: z.string(), signals: z.array(z.object({ label: z.string(), value: z.number().finite(), direction: z.enum(['up', 'down', 'flat']) }).strict()),
  causes: z.array(z.object({ label: z.string(), contribution: z.number().finite(), evidence: z.string() }).strict()), risks: z.array(z.object({ severity: z.enum(['critical', 'warning']), title: z.string(), evidence: z.string() }).strict()),
  actions: z.array(z.object({ priority: z.enum(['high', 'medium', 'low']), title: z.string(), rationale: z.string(), ownerRole: z.string(), expectedImpact: z.string(), validationMetric: z.string() }).strict()),
  followUps: z.array(z.string()), source: z.enum(['deepseek', 'local']), generatedAt: isoInstant, fallbackReason: z.enum(['not_configured', 'upstream_error', 'timeout', 'invalid_response', 'network_error']).optional(), metadata: z.object({ sourceLocalNow: localDateTime }).strict(),
}).strict();

function isAbortError(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }

async function request<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, init); } catch (error) { if (isAbortError(error)) throw error; throw new Error(networkError); }
  if (!response.ok) throw new Error(serviceError);
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error(invalidResponse); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(invalidResponse);
  return parsed.data;
}

function queryFor(filters: PilotFilters): string {
  const query = new URLSearchParams();
  query.set('start', filters.start); query.set('end', filters.end);
  if (filters.category) query.set('category', filters.category);
  if (filters.sellerId) query.set('sellerId', filters.sellerId);
  if (filters.customerState) query.set('customerState', filters.customerState);
  return query.toString();
}

export function requestPilotStatus(signal?: AbortSignal): Promise<PilotStatus> { return request('/api/pilot/status', status, { signal }); }
export function requestPilotFilterOptions(signal?: AbortSignal): Promise<PilotFilterOptions> { return request('/api/pilot/filter-options', filterOptions, { signal }); }
export function requestPilotSnapshot(currentFilters: PilotFilters, signal?: AbortSignal): Promise<PilotSnapshot> { return request(`/api/pilot/snapshot?${queryFor(currentFilters)}`, snapshot, { signal }); }
export function controlPilotReplay(action: PilotReplayAction, signal?: AbortSignal): Promise<PilotReplayState> { return request('/api/pilot/replay', replay, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }), signal }); }
export function requestPilotAnalysis(currentFilters: PilotFilters, question: string, signal?: AbortSignal): Promise<PilotAnalysis> { return request('/api/pilot/analysis', analysis, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: currentFilters, question }), signal }); }
