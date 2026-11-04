export type MetricCardItem = {
  id?: string | null
  value?: string | null
  label?: string | null
  context?: string | null
  tone?: 'gold' | 'emerald' | 'cyan' | 'slate' | string | null
}

type MetricsBlockViewProps = {
  heading?: string | null
  items?: MetricCardItem[] | null
}

export function MetricsBlockView({ heading, items }: MetricsBlockViewProps) {
  const validItems = (items ?? []).filter(
    (item) => typeof item?.value === 'string' && item.value.trim() && item?.label?.trim(),
  )
  if (validItems.length === 0) return null

  return (
    <section className="rich-metrics-block" aria-label={heading || 'Impact metrics'}>
      {heading ? <h4 className="rich-metrics-heading">{heading}</h4> : null}
      <div className="rich-metrics-grid">
        {validItems.map((item, idx) => {
          const tone =
            item.tone === 'emerald' || item.tone === 'cyan' || item.tone === 'slate'
              ? item.tone
              : 'gold'
          return (
            <div key={item.id || idx} className={`rich-metric-card rich-metric-card--${tone}`}>
              <div className="rich-metric-value">{item.value}</div>
              <div className="rich-metric-label">{item.label}</div>
              {item.context ? <p className="rich-metric-context">{item.context}</p> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
