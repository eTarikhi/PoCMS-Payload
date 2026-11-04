/**
 * Zero-dependency Mermaid Flowchart & Sequence Diagram parser + deterministic SVG layout engine.
 *
 * Works identically in React Server Components, Payload Admin Live Preview, and Vitest without
 * shipping `mermaid`'s ~1.2 MB browser bundle or requiring DOM measurement APIs.
 */

export type FlowNodeShape = 'rect' | 'round' | 'pill' | 'diamond' | 'cylinder'

export type FlowNode = {
  id: string
  label: string
  shape: FlowNodeShape
  layer: number
  order: number
  x: number
  y: number
  width: number
  height: number
}

export type FlowEdge = {
  from: string
  to: string
  label?: string
  dashed: boolean
}

export type ParsedFlowchart = {
  kind: 'flowchart'
  direction: 'LR' | 'TD'
  width: number
  height: number
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export type SequenceMessage = {
  fromIndex: number
  toIndex: number
  label: string
  dashed: boolean
}

export type ParsedSequence = {
  kind: 'sequence'
  width: number
  height: number
  actors: { id: string; label: string; cx: number }[]
  messages: SequenceMessage[]
}

export type ParsedMermaidDiagram = ParsedFlowchart | ParsedSequence | null

function parseNodeToken(raw: string): { id: string; label?: string; shape?: FlowNodeShape } | null {
  const token = raw.trim()
  if (!token) return null

  // Cylinder: id[(Label)]
  const cyl = /^([A-Za-z0-9_.-]+)\[\((.+)\)\]$/.exec(token)
  if (cyl) return { id: cyl[1], label: cyl[2].trim().replace(/^"|"$/g, ''), shape: 'cylinder' }

  // Pill / stadium: id([Label]) or id((Label))
  const pill = /^([A-Za-z0-9_.-]+)(?:\(\[(.+)\]\)|\(\((.+)\)\))$/.exec(token)
  if (pill) {
    return {
      id: pill[1],
      label: (pill[2] ?? pill[3] ?? '').trim().replace(/^"|"$/g, ''),
      shape: 'pill',
    }
  }

  // Diamond: id{Label}
  const dia = /^([A-Za-z0-9_.-]+)\{(.+)\}$/.exec(token)
  if (dia) return { id: dia[1], label: dia[2].trim().replace(/^"|"$/g, ''), shape: 'diamond' }

  // Rounded: id(Label)
  const rnd = /^([A-Za-z0-9_.-]+)\((.+)\)$/.exec(token)
  if (rnd) return { id: rnd[1], label: rnd[2].trim().replace(/^"|"$/g, ''), shape: 'round' }

  // Rect: id[Label]
  const rect = /^([A-Za-z0-9_.-]+)\[(.+)\]$/.exec(token)
  if (rect) return { id: rect[1], label: rect[2].trim().replace(/^"|"$/g, ''), shape: 'rect' }

  // Bare identifier
  const bare = /^([A-Za-z0-9_.-]+)$/.exec(token)
  if (bare) return { id: bare[1] }

  return null
}

function parseFlowchart(lines: string[], direction: 'LR' | 'TD'): ParsedFlowchart | null {
  const nodeMap = new Map<string, { id: string; label: string; shape: FlowNodeShape }>()
  const edges: FlowEdge[] = []

  const ensureNode = (spec: { id: string; label?: string; shape?: FlowNodeShape }) => {
    const existing = nodeMap.get(spec.id)
    if (!existing) {
      nodeMap.set(spec.id, {
        id: spec.id,
        label: spec.label || spec.id,
        shape: spec.shape || 'rect',
      })
    } else {
      if (spec.label) existing.label = spec.label
      if (spec.shape) existing.shape = spec.shape
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/;$/, '')
    if (!line || line.startsWith('%%') || /^(subgraph|end|style|classDef|class)\b/i.test(line)) {
      continue
    }

    // Match edge formats:
    // A -->|label| B, A -.->|label| B, A -- label --> B, A --> B, A --- B
    const pipeEdge = /^(.+?)\s*(-+\.?->+|==+>+|---+)\s*(?:\|([^|]+)\|)?\s*(.+)$/.exec(line)
    const inlineLabelEdge = !pipeEdge
      ? /^(.+?)\s*--\s*([^-][^>]*?)\s*(-->|\.-+>)\s*(.+)$/.exec(line)
      : null

    if (inlineLabelEdge) {
      const left = parseNodeToken(inlineLabelEdge[1])
      const right = parseNodeToken(inlineLabelEdge[4])
      if (left && right) {
        ensureNode(left)
        ensureNode(right)
        edges.push({
          from: left.id,
          to: right.id,
          label: inlineLabelEdge[2].trim(),
          dashed: inlineLabelEdge[3].includes('.'),
        })
        continue
      }
    }

    if (pipeEdge) {
      const left = parseNodeToken(pipeEdge[1])
      const right = parseNodeToken(pipeEdge[4])
      if (left && right) {
        ensureNode(left)
        ensureNode(right)
        edges.push({
          from: left.id,
          to: right.id,
          label: pipeEdge[3]?.trim() || undefined,
          dashed: pipeEdge[2].includes('.'),
        })
        continue
      }
    }

    const standalone = parseNodeToken(line)
    if (standalone) {
      ensureNode(standalone)
    }
  }

  if (nodeMap.size === 0) return null

  // Assign topological layers via longest bounded path so cycles remain safe.
  const layers = new Map<string, number>()
  for (const id of nodeMap.keys()) layers.set(id, 0)
  const maxPasses = nodeMap.size
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false
    for (const edge of edges) {
      if (edge.from === edge.to) continue
      const fromLayer = layers.get(edge.from) ?? 0
      const toLayer = layers.get(edge.to) ?? 0
      if (toLayer < fromLayer + 1 && fromLayer + 1 < maxPasses) {
        layers.set(edge.to, fromLayer + 1)
        changed = true
      }
    }
    if (!changed) break
  }

  const byLayer = new Map<number, FlowNode[]>()
  for (const rawNode of nodeMap.values()) {
    const layer = layers.get(rawNode.id) ?? 0
    const width = Math.min(230, Math.max(128, rawNode.label.length * 8.2 + 34))
    const height = rawNode.shape === 'diamond' ? 62 : 48
    const bucket = byLayer.get(layer) ?? []
    const flowNode: FlowNode = {
      ...rawNode,
      layer,
      order: bucket.length,
      x: 0,
      y: 0,
      width,
      height,
    }
    bucket.push(flowNode)
    byLayer.set(layer, bucket)
  }

  const sortedLayers = Array.from(byLayer.keys()).sort((a, b) => a - b)
  const padX = 36
  const padY = 34

  if (direction === 'LR') {
    const colGap = 86
    const rowGap = 32
    const maxRows = Math.max(...sortedLayers.map((l) => byLayer.get(l)?.length ?? 1))
    const totalHeight = Math.max(150, padY * 2 + maxRows * 52 + Math.max(0, maxRows - 1) * rowGap)

    let cursorX = padX
    for (const layer of sortedLayers) {
      const colNodes = byLayer.get(layer) ?? []
      const colWidth = Math.max(...colNodes.map((n) => n.width))
      const colStackHeight =
        colNodes.reduce((acc, n) => acc + n.height, 0) + Math.max(0, colNodes.length - 1) * rowGap
      let cursorY = (totalHeight - colStackHeight) / 2
      for (const n of colNodes) {
        n.x = cursorX + (colWidth - n.width) / 2
        n.y = cursorY
        cursorY += n.height + rowGap
      }
      cursorX += colWidth + colGap
    }

    const totalWidth = Math.max(320, cursorX - colGap + padX)
    return {
      kind: 'flowchart',
      direction,
      width: Math.round(totalWidth),
      height: Math.round(totalHeight),
      nodes: sortedLayers.flatMap((l) => byLayer.get(l) ?? []),
      edges,
    }
  }

  // Top-Down (TD / TB)
  const rowGap = 72
  const colGap = 34
  const maxRowWidth = Math.max(
    ...sortedLayers.map((l) => {
      const rowNodes = byLayer.get(l) ?? []
      return (
        rowNodes.reduce((acc, n) => acc + n.width, 0) + Math.max(0, rowNodes.length - 1) * colGap
      )
    }),
  )
  const totalWidth = Math.max(340, maxRowWidth + padX * 2)
  let cursorY = padY

  for (const layer of sortedLayers) {
    const rowNodes = byLayer.get(layer) ?? []
    const rowWidth =
      rowNodes.reduce((acc, n) => acc + n.width, 0) + Math.max(0, rowNodes.length - 1) * colGap
    const rowHeight = Math.max(...rowNodes.map((n) => n.height))
    let cursorX = (totalWidth - rowWidth) / 2
    for (const n of rowNodes) {
      n.x = cursorX
      n.y = cursorY + (rowHeight - n.height) / 2
      cursorX += n.width + colGap
    }
    cursorY += rowHeight + rowGap
  }

  const totalHeight = Math.max(160, cursorY - rowGap + padY)
  return {
    kind: 'flowchart',
    direction,
    width: Math.round(totalWidth),
    height: Math.round(totalHeight),
    nodes: sortedLayers.flatMap((l) => byLayer.get(l) ?? []),
    edges,
  }
}

function parseSequenceDiagram(lines: string[]): ParsedSequence | null {
  const actorOrder: string[] = []
  const actorLabels = new Map<string, string>()
  const rawMessages: { from: string; to: string; label: string; dashed: boolean }[] = []

  const ensureActor = (id: string, label?: string) => {
    if (!actorOrder.includes(id)) actorOrder.push(id)
    if (label) actorLabels.set(id, label)
    else if (!actorLabels.has(id)) actorLabels.set(id, id)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('%%')) continue

    const participant = /^(?:participant|actor)\s+([A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)*)(?:\s+as\s+(.+))?$/i.exec(
      line,
    )
    if (participant) {
      ensureActor(participant[1], participant[2]?.trim().replace(/^"|"$/g, ''))
      continue
    }

    const msg = /^([A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)*)\s*(--?>>?|--?\))\s*([A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)*)\s*:\s*(.+)$/.exec(
      line,
    )
    if (msg) {
      ensureActor(msg[1])
      ensureActor(msg[3])
      rawMessages.push({
        from: msg[1],
        to: msg[3],
        label: msg[4].trim(),
        dashed: msg[2].startsWith('--'),
      })
    }
  }

  if (actorOrder.length === 0) return null

  const colSpacing = 190
  const padX = 95
  const actors = actorOrder.map((id, idx) => ({
    id,
    label: actorLabels.get(id) ?? id,
    cx: padX + idx * colSpacing,
  }))
  const messages: SequenceMessage[] = rawMessages.map((m) => ({
    fromIndex: actorOrder.indexOf(m.from),
    toIndex: actorOrder.indexOf(m.to),
    label: m.label,
    dashed: m.dashed,
  }))

  const width = Math.max(360, padX * 2 + Math.max(0, actors.length - 1) * colSpacing)
  const height = 120 + Math.max(1, messages.length) * 52

  return { kind: 'sequence', width, height, actors, messages }
}

/**
 * Parses Mermaid `flowchart` / `graph` (`LR`, `TD`, `TB`) or `sequenceDiagram` source into
 * positioned SVG primitives. Returns `null` for unsupported DSLs so callers can render the raw blueprint.
 */
export function parseMermaidDiagram(source: string): ParsedMermaidDiagram {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('%%'))
  if (nonEmpty.length === 0) return null

  const header = nonEmpty[0]
  const flowMatch = /^(?:flowchart|graph)\s*(LR|RL|TD|TB|BT)?\s*$/i.exec(header)
  if (flowMatch) {
    const dirRaw = (flowMatch[1] ?? 'LR').toUpperCase()
    const direction: 'LR' | 'TD' = dirRaw === 'TD' || dirRaw === 'TB' || dirRaw === 'BT' ? 'TD' : 'LR'
    return parseFlowchart(nonEmpty.slice(1), direction)
  }

  if (/^sequenceDiagram\b/i.test(header)) {
    return parseSequenceDiagram(nonEmpty.slice(1))
  }

  return null
}
