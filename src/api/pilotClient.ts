import { z } from 'zod';
import type { PilotAnalysis, PilotFilterOptions, PilotFilters, PilotReplayAction, PilotReplayState, PilotSnapshot, PilotStatus } from '../pilot/types';

const invalidResponse = '璇曠偣鏁版嵁鍝嶅簲鏃犳晥';
const networkError = '璇曠偣鏈嶅姟缃戠粶杩炴帴澶辫触';
const serviceError = '璇曠偣鏈嶅姟鏆傛椂涓嶅彲鐢?';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kpi = z.object({ value: z.number().finite(), comparisonValue: z.number().finite(), changeRate: z.number().finite() }).strict();
const filters = z.object({ start: date, end: date, category: z.string().optional(), sellerId: z.string().optional(), customerState: z.string().optional() }).strict();
const replay = z.object({ sourceLocalNow: z.string(), isRunning: z.boolean() }).strict();
const status = z.union([
  z.object({ ready: z.literal(false), importCommand: z.string() }).strict(),
  z.object({ ready: z.literal(true), range: z.object({ start: date, end: date }).strict(), replay }).strict(),
]);
const filterOptions = z.object({ categories: z.array(z.string()), sellerIds: z.array(z.string()), customerStates: z.array(z.string()) }).strict();
const snapshot = z.object({
  filters,
  sourceLocalNow: z.string(),
  comparisonLabel: z.string(),
  kpis: z.object({ itemGmv: kpi, validOrderCount: kpi, averageOrderValue: kpi, cancellationRate: kpi, onTimeDeliveryRate: kpi, averageDeliveryDays: kpi, averageReviewScore: kpi }).strict(),
  dailyTrend: z.array(z.object({ date, itemGmv: z.number().finite(), validOrderCount: z.number().finite() }).strict()),
  fulfillmentFunnel: z.array(z.object({ stage: z.enum(['purchased', 'approved', 'carrier', 'delivered']), value: z.number().finite() }).strict()),
  categoryRanking: z.array(z.object({ category: z.string(), itemGmv: z.number().finite() }).strict()),
  sellerRanking: z.array(z.object({ sellerId: z.string(), itemGmv: z.number().finite() }).strict()),
  customerStateRanking: z.array(z.object({ customerState: z.string(), itemGmv: z.number().finite() }).strict()),
  recentOrders: z.array(z.object({ orderId: z.string(), purchasedAt: z.string(), status: z.string(), itemGmv: z.number().finite(), itemCount: z.number().finite(), customerState: z.string() }).strict()),
  capabilities: z.array(z.object({ key: z.string(), status: z.enum(['available', 'unavailable']), reason: z.string().optional() }).strict()),
}).strict();
const analysis = z.object({
  summary: z.string(), signals: z.array(z.object({ label: z.string(), value: z.number().finite(), direction: z.enum(['up', 'down', 'flat']) }).strict()),
  causes: z.array(z.object({ label: z.string(), contribution: z.number().finite(), evidence: z.string() }).strict()), risks: z.array(z.object({ severity: z.enum(['critical', 'warning']), title: z.string(), evidence: z.string() }).strict()),
  actions: z.array(z.object({ priority: z.enum(['high', 'medium', 'low']), title: z.string(), rationale: z.string(), ownerRole: z.string(), expectedImpact: z.string(), validationMetric: z.string() }).strict()),
  followUps: z.array(z.string()), source: z.enum(['deepseek', 'local']), generatedAt: z.string(), fallbackReason: z.enum(['not_configured', 'upstream_error', 'timeout', 'invalid_response', 'network_error']).optional(), metadata: z.object({ sourceLocalNow: z.string() }).strict(),
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
