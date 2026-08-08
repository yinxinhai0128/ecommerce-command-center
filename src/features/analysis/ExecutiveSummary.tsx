import type { JSX } from 'react';
import type { AnalysisResult } from '../../domain/types';
import { Panel } from '../../ui/Panel';

type ExecutiveSummaryProps = { result?: AnalysisResult };

export function ExecutiveSummary({ result }: ExecutiveSummaryProps): JSX.Element {
  return (
    <div className="executive-summary">
      <Panel title="今日经营结论">
        {result ? (
          <>
            <p className="analysis-summary">{result.summary}</p>
            <div className="analysis-metadata">
              <span>{result.source === 'deepseek' ? 'DeepSeek 分析' : '本地分析'}</span>
              <time dateTime={result.generatedAt}>生成于 {new Date(result.generatedAt).toLocaleString('zh-CN', { hour12: false })}</time>
            </div>
            <ul className="analysis-signals" aria-label="关键经营信号">
              {result.signals.map((signal) => (
                <li key={`${signal.label}-${signal.value}`} data-direction={signal.direction}>
                  <span>{signal.label}</span>
                  <strong>{signal.value.toLocaleString('zh-CN')}</strong>
                </li>
              ))}
            </ul>
            {result.risks.length > 0 && (
              <ul className="analysis-risks" aria-label="经营风险">
                {result.risks.map((risk) => (
                  <li key={`${risk.title}-${risk.evidence}`} data-severity={risk.severity}>
                    <strong>{risk.title}</strong>
                    <span>{risk.evidence}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : <p className="panel-empty">进入智能分析后生成经营结论</p>}
      </Panel>
    </div>
  );
}
