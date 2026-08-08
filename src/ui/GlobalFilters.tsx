import type { JSX } from 'react';
import { useDashboard } from '../app/useDashboard';

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function GlobalFilters(): JSX.Element {
  const { filters, filterOptions, setFilters } = useDashboard();

  return (
    <form className="global-filters" aria-label="全局筛选" onSubmit={(event) => event.preventDefault()}>
      <div className="filter-field filter-date">
        <label id="filter-date-label" htmlFor="filter-start">日期</label>
        <input
          id="filter-start"
          aria-labelledby="filter-date-label"
          type="date"
          value={formatDate(filters.start)}
          onChange={(event) => setFilters((current) => ({ ...current, start: new Date(`${event.target.value}T00:00:00`) }))}
        />
        <input
          aria-labelledby="filter-date-label"
          type="date"
          value={formatDate(filters.end)}
          onChange={(event) => setFilters((current) => ({ ...current, end: new Date(`${event.target.value}T23:59:59`) }))}
        />
      </div>
      <div className="filter-field">
        <label htmlFor="filter-platform">平台</label>
        <select
          id="filter-platform"
          value={filters.platform ?? '全部平台'}
          onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value === '全部平台' ? undefined : event.target.value as typeof current.platform }))}
        >
          <option value="全部平台">全部平台</option>
          {filterOptions.platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="filter-store">店铺</label>
        <select
          id="filter-store"
          value={filters.storeId ?? '全部店铺'}
          onChange={(event) => setFilters((current) => ({ ...current, storeId: event.target.value === '全部店铺' ? undefined : event.target.value }))}
        >
          <option value="全部店铺">全部店铺</option>
          {filterOptions.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="filter-category">类目</label>
        <select
          id="filter-category"
          value={filters.categoryId ?? '全部类目'}
          onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value === '全部类目' ? undefined : event.target.value }))}
        >
          <option value="全部类目">全部类目</option>
          {filterOptions.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
    </form>
  );
}
