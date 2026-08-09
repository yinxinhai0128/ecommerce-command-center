import type { JSX } from 'react';
import type { AnalysisResult } from '../../domain/types';
import { Panel } from '../../ui/Panel';

const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
const priorityLabel = { high: '高', medium: '中', low: '低' } as const;

type ActionListProps = { actions?: AnalysisResult['actions'] };

export function ActionList({ actions = [] }: ActionListProps): JSX.Element {
  const sortedActions = [...actions].sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);
  return (
    <div className="action-list">
      <Panel title="行动建议">
        {sortedActions.length > 0 ? (
          <ol className="analysis-actions">
            {sortedActions.map((action) => (
              <li key={`${action.priority}-${action.title}`} data-priority={action.priority}>
                <span className="action-priority">{priorityLabel[action.priority]}优先级</span>
                <strong>{action.title}</strong>
                <dl className="action-details">
                  <div><dt>原因</dt><dd>{action.rationale}</dd></div>
                  <div><dt>负责人</dt><dd>{action.ownerRole}</dd></div>
                  <div><dt>预期影响</dt><dd>{action.expectedImpact}</dd></div>
                  <div><dt>验证指标</dt><dd>{action.validationMetric}</dd></div>
                </dl>
              </li>
            ))}
          </ol>
        ) : <p className="panel-empty">等待行动建议</p>}
      </Panel>
    </div>
  );
}
