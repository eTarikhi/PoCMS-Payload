import { LANGUAGE_LABELS, tokenizeCodeLines } from '@/app/(frontend)/lib/shiki'

import { CodeTabsClient, type PreparedCodeTab } from './CodeTabsClient'

export type RawCodeTabItem = {
  id?: string | null
  label?: string | null
  language?: string | null
  highlightLines?: string | null
  code?: string | null
}

type CodeTabsBlockViewProps = {
  title?: string | null
  tabs?: RawCodeTabItem[] | null
}

export function CodeTabsBlockView({ title, tabs }: CodeTabsBlockViewProps) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null

  const prepared: PreparedCodeTab[] = tabs
    .filter((tab) => typeof tab?.code === 'string' && tab.code.length > 0)
    .map((tab, idx) => {
      const langKey = (tab.language || 'typescript').toLowerCase()
      const rawCode = tab.code ?? ''
      return {
        id: tab.id || `tab-${idx}`,
        label: tab.label?.trim() || `File ${idx + 1}`,
        langLabel: LANGUAGE_LABELS[langKey] ?? langKey,
        rawCode,
        lines: tokenizeCodeLines(rawCode, langKey, tab.highlightLines),
      }
    })

  if (prepared.length === 0) return null

  return <CodeTabsClient title={title} tabs={prepared} />
}
