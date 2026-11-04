'use client'

import { useId, useMemo, useState } from 'react'

import {
  type FlowNode,
  type ParsedFlowchart,
  type ParsedSequence,
  parseMermaidDiagram,
} from '@/app/(frontend)/lib/mermaid-lite'

import { CopyCodeButton } from './CopyCodeButton'

type DiagramBlockViewProps = {
  title?: string | null
  engine?: 'mermaid' | 'ascii' | string | null
  code?: string | null
  caption?: string | null
}

function renderFlowNodeShape(node: FlowNode) {
  const stroke = 'rgba(214, 166, 79, 0.55)'
  const fill = '#151923'
  if (node.shape === 'diamond') {
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2
    const pts = `${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}`
    return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.4} />
  }
  const rx = node.shape === 'pill' ? node.height / 2 : node.shape === 'round' ? 10 : 6
  return (
    <rect
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      rx={rx}
      ry={rx}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.4}
    />
  )
}

function FlowchartSvg({ chart, markerId }: { chart: ParsedFlowchart; markerId: string }) {
  const nodeById = new Map(chart.nodes.map((n) => [n.id, n]))

  return (
    <svg
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      className="rich-diagram-svg"
      role="img"
      aria-label="Architecture flowchart diagram"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#d8a852" />
        </marker>
      </defs>

      {chart.edges.map((edge, idx) => {
        const from = nodeById.get(edge.from)
        const to = nodeById.get(edge.to)
        if (!from || !to) return null

        const isHorizontal = chart.direction === 'LR'
        const x1 = isHorizontal ? from.x + from.width : from.x + from.width / 2
        const y1 = isHorizontal ? from.y + from.height / 2 : from.y + from.height
        const x2 = isHorizontal ? to.x : to.x + to.width / 2
        const y2 = isHorizontal ? to.y + to.height / 2 : to.y

        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2
        const d = isHorizontal
          ? `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

        return (
          <g key={`${edge.from}-${edge.to}-${idx}`}>
            <path
              d={d}
              fill="none"
              stroke="rgba(216, 168, 82, 0.72)"
              strokeWidth={1.6}
              strokeDasharray={edge.dashed ? '5 4' : undefined}
              markerEnd={`url(#${markerId})`}
            />
            {edge.label ? (
              <g transform={`translate(${midX}, ${midY - 7})`}>
                <rect
                  x={-Math.max(24, edge.label.length * 3.7)}
                  y={-10}
                  width={Math.max(48, edge.label.length * 7.4)}
                  height={18}
                  rx={4}
                  fill="#0e1118"
                  stroke="rgba(255,255,255,0.12)"
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fill="#cfd6e3"
                  fontSize="11"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {edge.label}
                </text>
              </g>
            ) : null}
          </g>
        )
      })}

      {chart.nodes.map((node) => (
        <g key={node.id}>
          {renderFlowNodeShape(node)}
          <text
            x={node.x + node.width / 2}
            y={node.y + node.height / 2 + 4}
            textAnchor="middle"
            fill="#f2f4f8"
            fontSize="12.5"
            fontWeight={500}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function SequenceSvg({ seq, markerId }: { seq: ParsedSequence; markerId: string }) {
  const topBoxY = 18
  const boxH = 36
  const bottomY = seq.height - 26

  return (
    <svg
      viewBox={`0 0 ${seq.width} ${seq.height}`}
      className="rich-diagram-svg"
      role="img"
      aria-label="Sequence architecture diagram"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#d8a852" />
        </marker>
      </defs>

      {seq.actors.map((actor) => {
        const boxW = Math.max(96, actor.label.length * 8 + 26)
        return (
          <g key={actor.id}>
            <line
              x1={actor.cx}
              y1={topBoxY + boxH}
              x2={actor.cx}
              y2={bottomY}
              stroke="rgba(255,255,255,0.16)"
              strokeDasharray="4 4"
            />
            <rect
              x={actor.cx - boxW / 2}
              y={topBoxY}
              width={boxW}
              height={boxH}
              rx={6}
              fill="#151923"
              stroke="rgba(214, 166, 79, 0.55)"
              strokeWidth={1.4}
            />
            <text
              x={actor.cx}
              y={topBoxY + 22}
              textAnchor="middle"
              fill="#f2f4f8"
              fontSize="12.5"
              fontWeight={600}
            >
              {actor.label}
            </text>
          </g>
        )
      })}

      {seq.messages.map((msg, idx) => {
        const from = seq.actors[msg.fromIndex]
        const to = seq.actors[msg.toIndex]
        if (!from || !to) return null
        const y = topBoxY + boxH + 38 + idx * 50
        const midX = (from.cx + to.cx) / 2

        return (
          <g key={idx}>
            <line
              x1={from.cx}
              y1={y}
              x2={to.cx}
              y2={y}
              stroke="rgba(216, 168, 82, 0.78)"
              strokeWidth={1.6}
              strokeDasharray={msg.dashed ? '5 4' : undefined}
              markerEnd={`url(#${markerId})`}
            />
            <text
              x={midX}
              y={y - 8}
              textAnchor="middle"
              fill="#d5dce8"
              fontSize="11.5"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {msg.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function DiagramBlockView({ title, engine, code, caption }: DiagramBlockViewProps) {
  const rawCode = code?.trim() ?? ''
  const markerId = useId().replace(/:/g, '')
  const [viewMode, setViewMode] = useState<'diagram' | 'source'>('diagram')
  const [expanded, setExpanded] = useState(false)

  const parsed = useMemo(() => {
    if (!rawCode || engine === 'ascii') return null
    return parseMermaidDiagram(rawCode)
  }, [rawCode, engine])

  if (!rawCode) return null

  const canRenderSvg = Boolean(parsed)
  const effectiveMode = canRenderSvg ? viewMode : 'source'

  return (
    <figure className={`rich-diagram-block${expanded ? ' is-expanded' : ''}`}>
      <div className="rich-code-header">
        <div className="rich-code-meta">
          <span className="rich-code-filename">{title || 'Architecture Diagram'}</span>
          <span className="rich-code-lang">{engine === 'ascii' ? 'Blueprint' : 'Mermaid'}</span>
        </div>
        <div className="rich-diagram-controls">
          {canRenderSvg ? (
            <>
              <button
                type="button"
                className={`rich-code-copy${effectiveMode === 'diagram' ? ' is-active' : ''}`}
                onClick={() => setViewMode(effectiveMode === 'diagram' ? 'source' : 'diagram')}
              >
                {effectiveMode === 'diagram' ? 'Source' : 'Diagram'}
              </button>
              <button
                type="button"
                className="rich-code-copy"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? 'Fit' : 'Expand'}
              </button>
            </>
          ) : null}
          <CopyCodeButton code={rawCode} />
        </div>
      </div>

      {effectiveMode === 'diagram' && parsed ? (
        <div className="rich-diagram-canvas">
          {parsed.kind === 'flowchart' ? (
            <FlowchartSvg chart={parsed} markerId={markerId} />
          ) : (
            <SequenceSvg seq={parsed} markerId={markerId} />
          )}
        </div>
      ) : (
        <pre className="rich-code-pre rich-diagram-source">
          <code>{rawCode}</code>
        </pre>
      )}

      {caption ? <figcaption className="rich-diagram-caption">{caption}</figcaption> : null}
    </figure>
  )
}
