import type { ChangeEvent } from 'react'
import type { DatePeriod, DatePeriodValue, DateRangeValue, FilterBarProps, FilterDefinition, FilterValue } from './FilterBar.types'

function updateValue(value: FilterValue, definition: FilterDefinition, onChange: FilterBarProps['onChange'], values: FilterBarProps['values']) {
  onChange({ ...values, [definition.key]: value })
}

export function FilterBar({ definitions, values, onChange, onApply, onReset, resetLabel = '清除', applyLabel = '应用筛选' }: FilterBarProps) {
  const renderControl = (definition: FilterDefinition) => {
    const value = values[definition.key]
    const fieldClass = 'ui-filter-field'
    if (definition.type === 'datePeriod') {
      const datePeriod = typeof value === 'object' && value !== null && !Array.isArray(value) && 'period' in value
        ? value as DatePeriodValue
        : { period: 'all' as DatePeriod, anchorDate: '' }
      const periods: Array<{ value: DatePeriod; label: string }> = [
        { value: 'all', label: '全部' },
        { value: 'day', label: '日' },
        { value: 'week', label: '周' },
        { value: 'month', label: '月' },
      ]
      return <div className={fieldClass} data-filter-type="datePeriod" key={definition.key}>
        <span>{definition.label}</span>
        <div className="ui-filter-date-period">
          <div className="ui-filter-period-segment" role="group" aria-label={`${definition.label}周期`}>
            {periods.map((period) => <button type="button" key={period.value} aria-pressed={datePeriod.period === period.value}
              className={datePeriod.period === period.value ? 'ui-filter-period-active' : ''}
              onClick={() => updateValue({ ...datePeriod, period: period.value }, definition, onChange, values)}>{period.label}</button>)}
          </div>
          <input className="ui-filter-control" type="date" aria-label={`${definition.label}参考日期`} value={datePeriod.anchorDate}
            disabled={datePeriod.period === 'all'}
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateValue({ ...datePeriod, anchorDate: event.target.value }, definition, onChange, values)} />
        </div>
      </div>
    }
    if (definition.type === 'dateRange') {
      const range = typeof value === 'object' && !Array.isArray(value) ? value as DateRangeValue : {}
      return <div className={fieldClass} data-full-width={definition.fullWidth ? 'true' : undefined} key={definition.key}>
        <span>{definition.label}</span>
        <div className="ui-filter-range">
          <input className="ui-filter-control" type="date" aria-label={`${definition.label}开始`} value={range.from ?? ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateValue({ ...range, from: event.target.value || undefined }, definition, onChange, values)} />
          <input className="ui-filter-control" type="date" aria-label={`${definition.label}结束`} value={range.to ?? ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateValue({ ...range, to: event.target.value || undefined }, definition, onChange, values)} />
        </div>
      </div>
    }
    if (definition.type === 'select' || definition.type === 'multiSelect') {
      const multiple = definition.type === 'multiSelect'
      return <label className={fieldClass} data-full-width={definition.fullWidth ? 'true' : undefined} key={definition.key}>
        <span>{definition.label}</span>
        <select className="ui-filter-control" multiple={multiple} value={multiple ? Array.isArray(value) ? value : [] : typeof value === 'string' ? value : ''}
          aria-label={definition.label} onChange={(event) => {
            const nextValue = multiple
              ? Array.from(event.currentTarget.selectedOptions, (option) => option.value)
              : event.currentTarget.value
            updateValue(nextValue, definition, onChange, values)
          }}>
          {!multiple && definition.placeholder && <option value="">{definition.placeholder}</option>}
          {(definition.options ?? []).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
      </label>
    }
    return <label className={fieldClass} data-full-width={definition.fullWidth ? 'true' : undefined} key={definition.key}>
      <span>{definition.label}</span>
      <input className="ui-filter-control" type="text" value={typeof value === 'string' ? value : ''} placeholder={definition.placeholder}
        aria-label={definition.label} onChange={(event) => updateValue(event.target.value, definition, onChange, values)} />
    </label>
  }

  return <div className="ui-filter-bar">
    {definitions.map(renderControl)}
    {(onReset || onApply) && <div className="ui-filter-actions">
      {onReset && <button className="ui-filter-button" type="button" onClick={onReset}>{resetLabel}</button>}
      {onApply && <button className="ui-filter-button ui-filter-button-primary" type="button" onClick={onApply}>{applyLabel}</button>}
    </div>}
  </div>
}
