import { useEffect, useState, type FormEvent, type JSX } from 'react';
import type { PilotFilterOptions, PilotFilters } from '../../pilot/types';

type PilotFiltersProps = { filters: PilotFilters; options: PilotFilterOptions; onChange: (filters: PilotFilters) => void };

export function PilotFilters({ filters, options, onChange }: PilotFiltersProps): JSX.Element {
  const [draft, setDraft] = useState(filters);
  const [validationError, setValidationError] = useState<string>();
  useEffect(() => { setDraft(filters); setValidationError(undefined); }, [filters]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (draft.start > draft.end) { setValidationError('开始日期不能晚于结束日期'); return; }
    setValidationError(undefined);
    onChange({ start: draft.start, end: draft.end, ...(draft.category ? { category: draft.category } : {}), ...(draft.sellerId ? { sellerId: draft.sellerId } : {}), ...(draft.customerState ? { customerState: draft.customerState } : {}) });
  }

  function clear(): void { onChange({ start: filters.start, end: filters.end }); }
  return (
    <form className="global-filters pilot-filters" aria-label="经营数据筛选" onSubmit={submit}>
      <label className="filter-field" htmlFor="pilot-start">开始日期<input id="pilot-start" type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label>
      <label className="filter-field" htmlFor="pilot-end">结束日期<input id="pilot-end" type="date" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label>
      <label className="filter-field" htmlFor="pilot-category">类目<select id="pilot-category" value={draft.category ?? ''} onChange={(event) => setDraft({ ...draft, category: event.target.value || undefined })}><option value="">全部类目</option>{options.categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <label className="filter-field" htmlFor="pilot-seller">卖家<select id="pilot-seller" value={draft.sellerId ?? ''} onChange={(event) => setDraft({ ...draft, sellerId: event.target.value || undefined })}><option value="">全部卖家</option>{options.sellerIds.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <label className="filter-field" htmlFor="pilot-state">客户州<select id="pilot-state" value={draft.customerState ?? ''} onChange={(event) => setDraft({ ...draft, customerState: event.target.value || undefined })}><option value="">全部客户州</option>{options.customerStates.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <button type="submit" className="runtime-control">应用筛选</button>
      <button type="button" className="runtime-control" onClick={clear}>清除筛选</button>
      {validationError && <span className="pilot-filter-error" role="alert">{validationError}</span>}
    </form>
  );
}
