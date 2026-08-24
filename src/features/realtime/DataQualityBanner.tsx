import { useDashboard } from '../../app/useDashboard';

function severityLabel(severity: 'error' | 'warning'): string {
  return severity === 'error' ? '错误' : '警告';
}

/** 数据质量状态条：在页面头部暴露 P0-2 数据质量检查结果。 */
export function DataQualityBanner(): React.ReactNode {
  const { dataQuality } = useDashboard();
  if (dataQuality.passed) {
    return (
      <div
        data-testid="data-quality-banner"
        className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700"
      >
        <span aria-hidden>✓</span>
        <span>
          数据质量检查通过（{dataQuality.checksRun} 项，{new Date(dataQuality.checkedAt).toLocaleTimeString()}）
        </span>
      </div>
    );
  }
  return (
    <div
      data-testid="data-quality-banner"
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
    >
      <span className="font-medium">数据质量检查未通过：</span>
      <ul className="ml-4 list-disc">
        {dataQuality.issues.map((issue, index) => (
          <li key={`${issue.check}-${index}`}>
            [{severityLabel(issue.severity)}] {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
