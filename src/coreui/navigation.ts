export type ProductView = 'overview' | 'realtime' | 'analysis' | 'operations';

export const navigation: ReadonlyArray<{ view: ProductView; label: string }> = [
  { view: 'overview', label: '概览' },
  { view: 'realtime', label: '实时监控' },
  { view: 'analysis', label: '智能分析' },
  { view: 'operations', label: '经营数据' },
];
