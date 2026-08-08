import { useState, type FormEvent, type JSX } from 'react';
import type { AnalysisResult } from '../../domain/types';
import { Panel } from '../../ui/Panel';

export type AnalysisHistoryEntry = { id: number; question: string; summary: string };

type AnalysisChatProps = {
  result?: AnalysisResult;
  loading: boolean;
  history: AnalysisHistoryEntry[];
  onQuestion: (question: string) => void;
};

const presets = [
  '今天 GMV 变化的主要原因是什么？',
  '当前最需要关注的经营风险是什么？',
  '接下来应该优先采取什么行动？',
];

export function AnalysisChat({ result, loading, history, onQuestion }: AnalysisChatProps): JSX.Element {
  const [question, setQuestion] = useState('');
  const disabled = loading || !result;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || disabled) return;
    onQuestion(trimmed);
    setQuestion('');
  }

  return (
    <div className="analysis-chat-panel">
      <Panel title="经营问答">
        <div className="analysis-presets" aria-label="预置问题">
          {presets.map((preset) => <button key={preset} type="button" disabled={disabled} onClick={() => onQuestion(preset)}>{preset}</button>)}
        </div>
        {result && result.followUps.length > 0 && (
          <div className="analysis-follow-ups" aria-label="后续问题">
            <span>继续追问</span>
            {result.followUps.map((followUp) => <button key={followUp} type="button" disabled={loading} onClick={() => onQuestion(followUp)}>{followUp}</button>)}
          </div>
        )}
        <div className="analysis-history" role="log" aria-label="分析对话记录">
          {history.length === 0 ? <p className="panel-empty">提问后仅保留问题与本次结论</p> : history.map((entry) => (
            <article key={entry.id}>
              <strong>{entry.question}</strong>
              <p>{entry.summary}</p>
            </article>
          ))}
        </div>
        <form className="analysis-question-form" onSubmit={submit}>
          <label htmlFor="analysis-question">自由提问</label>
          <textarea
            id="analysis-question"
            maxLength={500}
            value={question}
            disabled={loading}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="输入一个经营问题"
          />
          <button type="submit" disabled={disabled || !question.trim()}>发送问题</button>
        </form>
      </Panel>
    </div>
  );
}
