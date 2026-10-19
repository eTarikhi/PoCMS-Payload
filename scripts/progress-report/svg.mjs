/**
 * Minimal SVG chart helpers for the progress report: scales, axes, and the chart types the report
 * uses (Gantt, bars, lines, stacked rows, dependency graph, risk matrix, roadmap). Output is plain SVG
 * markup that prints sharply and needs no script. Colours come from the caller.
 */

export const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

const r1 = (n) => Math.round(n * 10) / 10

export const FONT = { size: 10.5, small: 9.5, tiny: 8.5 }
const INK = '#1c1917'
const MUTED = '#57534e'
const GRID = '#e7e5e4'
const AXIS = '#a8a29e'

/** Rough text width for layout decisions (Inter, average glyph about 0.56 em). */
export const textWidth = (text, size = FONT.size) => String(text).length * size * 0.56

export function linear([d0, d1], [r0, r2]) {
  const scale = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r2 - r0)
  scale.domain = [d0, d1]
  scale.range = [r0, r2]
  return scale
}

/** "Nice" tick values covering [min, max]. */
export function niceTicks(min, max, count = 5) {
  if (max === min) return [min]
  const raw = (max - min) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw
  const ticks = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step)
    ticks.push(r1(v * 1000) / 1000)
  return ticks
}

export const niceMax = (max, count = 5) => {
  const ticks = niceTicks(0, max, count)
  const last = ticks.at(-1)
  return last >= max ? last : last + (ticks[1] - ticks[0])
}

const fmtNumber = (n) =>
  Math.abs(n) >= 1000 ? `${r1(n / 1000)}k`.replace('.0k', 'k') : String(r1(n)).replace(/\.0$/, '')

export function svg(width, height, body, { title, desc, className = 'chart' } = {}) {
  const id = `t${Math.random().toString(36).slice(2, 8)}`
  return `<svg class="${className}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}" xmlns="http://www.w3.org/2000/svg">${
    title ? `<title id="${id}">${esc(title)}</title>` : ''
  }${desc ? `<desc>${esc(desc)}</desc>` : ''}${body}</svg>`
}

const text = (
  x,
  y,
  content,
  {
    size = FONT.size,
    anchor = 'start',
    fill = INK,
    weight = 400,
    baseline = 'middle',
    extra = '',
  } = {},
) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${fill}"${
    weight !== 400 ? ` font-weight="${weight}"` : ''
  }${extra}>${esc(content)}</text>`

const line = (x1, y1, x2, y2, stroke = GRID, extra = '') =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}"${extra}/>`

const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(w, 0))}" height="${r1(Math.max(h, 0))}" fill="${fill}"${extra}/>`

const diamond = (x, y, size, fill, extra = '') =>
  `<path d="M${r1(x)} ${r1(y - size)}L${r1(x + size)} ${r1(y)}L${r1(x)} ${r1(y + size)}L${r1(x - size)} ${r1(y)}Z" fill="${fill}"${extra}/>`

/** Hatch pattern definition, referenced as url(#id). */
export const hatch = (id, color, bg = 'none') =>
  `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">${
    bg !== 'none' ? `<rect width="5" height="5" fill="${bg}"/>` : ''
  }<line x1="0" y1="0" x2="0" y2="5" stroke="${color}" stroke-width="2"/></pattern>`

/**
 * Gantt / timeline. rows: { heading } | { label, note, bars: [{ from, to, color, fill, label, dash }],
 * marks: [{ at, color, shape, label }] }. Times are epoch ms.
 */
export function gantt({
  width = 600,
  rows,
  from,
  to,
  ticks,
  today,
  todayLabel = 'Today',
  labelWidth = 190,
  rowHeight = 16,
  headingHeight = 18,
  bands = [],
  defs = '',
  title,
  desc,
  minBar = 3,
}) {
  const twoTier = ticks.some((tick) => tick.tier === 1)
  const top = twoTier ? 32 : 22
  const left = labelWidth
  const right = width - 8
  const x = linear([from, to], [left, right])
  let y = top
  let body = defs ? `<defs>${defs}</defs>` : ''
  const layout = rows.map((row) => {
    const h = row.heading ? headingHeight : rowHeight
    const entry = { row, y, h }
    y += h
    return entry
  })
  const rowsBottom = y
  const height = y + (today ? 18 : 6)
  for (const band of bands) {
    body += rect(
      x(band.from),
      top,
      x(band.to) - x(band.from),
      rowsBottom - top,
      band.color ?? '#f5f5f4',
    )
    if (band.label)
      body += text((x(band.from) + x(band.to)) / 2, top - 4, band.label, {
        size: FONT.tiny,
        anchor: 'middle',
        fill: MUTED,
      })
  }
  for (const tick of ticks) {
    const tx = x(tick.at)
    body += line(tx, top, tx, rowsBottom, tick.major ? '#d6d3d1' : GRID)
    if (!tick.label) continue
    const anchor = tick.anchor ?? 'middle'
    const w = textWidth(tick.label, FONT.tiny)
    const overflow =
      anchor === 'start' ? tx + w > width : anchor === 'middle' ? tx + w / 2 > width : false
    if (overflow) continue
    body += text(tx + (anchor === 'start' ? 2 : 0), top - (tick.tier === 1 ? 20 : 8), tick.label, {
      size: FONT.tiny,
      anchor,
      fill: tick.tier === 1 ? INK : MUTED,
      weight: tick.tier === 1 ? 600 : 400,
    })
  }
  for (const { row, y: ry, h } of layout) {
    if (row.heading) {
      body += rect(0, ry + 2, width, h - 3, '#f5f5f4')
      body += text(6, ry + h / 2 + 0.5, row.heading, { size: FONT.small, weight: 600, fill: MUTED })
      continue
    }
    const cy = ry + h / 2
    body += line(0, ry + h, width, ry + h, '#f5f5f4')
    const room = left - 14 - (row.note ? textWidth(row.note, FONT.tiny) + 6 : 0)
    let label = row.label
    while (textWidth(label, FONT.small) > room && label.length > 4)
      label = `${label.slice(0, -2).trimEnd()}…`
    body += text(6, cy, label, {
      size: FONT.small,
      fill: row.muted ? MUTED : INK,
      weight: row.bold ? 600 : 400,
    })
    if (row.note)
      body += text(left - 6, cy, row.note, { size: FONT.tiny, anchor: 'end', fill: MUTED })
    for (const link of row.links ?? []) {
      body += line(
        x(link.from),
        cy,
        x(link.to),
        cy,
        link.color ?? AXIS,
        ' stroke-dasharray="1.5 2" stroke-width="1"',
      )
    }
    for (const bar of row.bars ?? []) {
      const bx = x(bar.from)
      const bw = Math.max(x(bar.to) - bx, minBar)
      const bh = bar.thin ? h * 0.3 : h * 0.56
      const by = bar.offset ? cy + bar.offset - bh / 2 : cy - bh / 2
      body += rect(
        bx,
        by,
        bw,
        bh,
        bar.fill ?? bar.color,
        `${bar.stroke ? ` stroke="${bar.stroke}" stroke-width="1"` : ''}${bar.dash ? ' stroke-dasharray="3 2"' : ''} rx="1.5"`,
      )
      if (bar.label) {
        const inside = bw > textWidth(bar.label, FONT.tiny) + 6
        body += text(inside ? bx + 4 : bx + bw + 4, cy + (bar.offset ?? 0), bar.label, {
          size: FONT.tiny,
          fill: inside ? '#fff' : MUTED,
          weight: inside ? 600 : 400,
        })
      }
    }
    for (const mark of row.marks ?? []) {
      const mx = x(mark.at)
      if (mark.shape === 'dot')
        body += `<circle cx="${r1(mx)}" cy="${r1(cy)}" r="${mark.size ?? 3}" fill="${mark.color}"/>`
      else
        body += diamond(
          mx,
          cy,
          mark.size ?? 4.5,
          mark.color,
          mark.stroke ? ` stroke="${mark.stroke}"` : '',
        )
      if (mark.label) body += text(mx + 7, cy, mark.label, { size: FONT.tiny, fill: MUTED })
    }
  }
  if (today) {
    const tx = x(today)
    body += line(
      tx,
      top,
      tx,
      rowsBottom + 4,
      '#b91c1c',
      ' stroke-width="1.2" stroke-dasharray="3 2"',
    )
    body += text(tx, rowsBottom + 11, todayLabel, {
      size: FONT.tiny,
      anchor: tx + 30 > width ? 'end' : 'middle',
      fill: '#b91c1c',
      weight: 600,
    })
  }
  return svg(width, height, body, { title, desc })
}

/** Axis frame for x/y charts. Returns { body, x, y, plot }. */
function frame({
  width,
  height,
  xScale,
  yDomain,
  yTicks,
  yLabel,
  margin,
  yFormat = fmtNumber,
  grid = true,
}) {
  const m = { top: yLabel ? 22 : 14, right: 12, bottom: 24, left: 40, ...margin }
  const plot = { left: m.left, right: width - m.right, top: m.top, bottom: height - m.bottom }
  const y = linear(yDomain, [plot.bottom, plot.top])
  let body = ''
  for (const t of yTicks) {
    body += line(plot.left, y(t), plot.right, y(t), grid ? (t === 0 ? AXIS : GRID) : 'none')
    body += text(plot.left - 5, y(t), yFormat(t), { size: FONT.tiny, anchor: 'end', fill: MUTED })
  }
  if (yLabel)
    body += text(4, plot.top - 12, yLabel, { size: FONT.tiny, fill: MUTED, baseline: 'auto' })
  return { body, y, plot, x: xScale }
}

/**
 * Vertical bars by category; series stack (positive values up, negative down).
 * series: [{ id, label, color, values: number[] }]
 */
export function bars({
  width = 600,
  height = 200,
  categories,
  series,
  yLabel,
  title,
  desc,
  totals = true,
  totalFormat = fmtNumber,
  margin,
  categoryLabels,
  highlight = [],
  highlightColor = '#fdf6e3',
  annotations = [],
  barWidth = 0.62,
  yMax,
}) {
  const sums = categories.map((_, i) =>
    series.reduce((s, ser) => s + Math.max(ser.values[i] ?? 0, 0), 0),
  )
  const negs = categories.map((_, i) =>
    series.reduce((s, ser) => s + Math.min(ser.values[i] ?? 0, 0), 0),
  )
  const max = yMax ?? niceMax(Math.max(...sums, 1))
  const min = Math.min(...negs) < 0 ? -niceMax(-Math.min(...negs)) : 0
  const ticks = niceTicks(min, max, 4)
  const f = frame({ width, height, yDomain: [min, max], yTicks: ticks, yLabel, margin })
  const { plot, y } = f
  const band = (plot.right - plot.left) / categories.length
  let body = f.body
  for (const index of highlight)
    body += rect(plot.left + band * index, plot.top, band, plot.bottom - plot.top, highlightColor)
  categories.forEach((cat, i) => {
    const bx = plot.left + band * i + (band * (1 - barWidth)) / 2
    const bw = band * barWidth
    let up = 0
    let down = 0
    for (const ser of series) {
      const v = ser.values[i] ?? 0
      if (!v) continue
      if (v > 0) {
        body += rect(bx, y(up + v), bw, y(up) - y(up + v), ser.color)
        up += v
      } else {
        body += rect(bx, y(down), bw, y(down + v) - y(down), ser.color)
        down += v
      }
    }
    if (totals && up > 0)
      body += text(bx + bw / 2, y(up) - 6, totalFormat(up), {
        size: FONT.tiny,
        anchor: 'middle',
        fill: INK,
        weight: 600,
      })
    const label = categoryLabels ? categoryLabels[i] : cat
    const lines = Array.isArray(label) ? label : [label]
    lines.forEach((l, k) => {
      body += text(plot.left + band * i + band / 2, plot.bottom + 10 + k * 10, l, {
        size: FONT.tiny,
        anchor: 'middle',
        fill: k ? MUTED : INK,
      })
    })
  })
  for (const note of annotations) {
    const ax = plot.left + band * note.index + band / 2
    body += text(ax + (note.dx ?? 0), y(note.y) + (note.dy ?? 0), note.text, {
      size: FONT.tiny,
      anchor: note.anchor ?? 'middle',
      fill: note.color ?? MUTED,
    })
  }
  return svg(width, height, body, { title, desc })
}

/**
 * Lines over a linear or time x axis.
 * series: [{ label, color, points: [[x, y]], step, dash, width, markers, area }]
 * steps: [{ points: [[x, y]], color, label }] drawn as step lines (budgets, thresholds).
 */
export function lines({
  width = 600,
  height = 200,
  xDomain,
  xTicks,
  yDomain,
  yTicks,
  yLabel,
  series,
  bands = [],
  vlines = [],
  labels = [],
  title,
  desc,
  margin,
  yFormat,
}) {
  const m = { top: yLabel ? 22 : 14, right: 12, bottom: 24, left: 40, ...margin }
  const xScale = linear(xDomain, [m.left, width - m.right])
  const f = frame({
    width,
    height,
    xScale,
    yDomain,
    yTicks: yTicks ?? niceTicks(yDomain[0], yDomain[1], 4),
    yLabel,
    margin: m,
    yFormat,
  })
  const { plot, y } = f
  let body = f.body
  for (const band of bands) {
    const by0 = band.y0 !== undefined ? y(band.y0) : plot.bottom
    const by1 = band.y1 !== undefined ? y(band.y1) : plot.top
    const bx0 = band.x0 !== undefined ? xScale(band.x0) : plot.left
    const bx1 = band.x1 !== undefined ? xScale(band.x1) : plot.right
    body += rect(bx0, by1, bx1 - bx0, by0 - by1, band.color)
    if (band.label) {
      const ly = band.labelAt === 'bottom' ? by0 - 7 : by1 + 8
      body += text((bx0 + bx1) / 2, ly, band.label, {
        size: FONT.tiny,
        fill: band.labelColor ?? MUTED,
        anchor: 'middle',
      })
    }
  }
  for (const tick of xTicks) {
    const tx = xScale(tick.at)
    body += line(tx, plot.bottom, tx, plot.bottom + 3, AXIS)
    if (tick.grid) body += line(tx, plot.top, tx, plot.bottom, GRID)
    const anchor = tick.anchor ?? 'middle'
    const w = textWidth(tick.label, FONT.tiny)
    if (anchor === 'start' ? tx + w > width : tx + w / 2 > width) continue
    body += text(tx + (anchor === 'start' ? 2 : 0), plot.bottom + 12, tick.label, {
      size: FONT.tiny,
      anchor,
      fill: MUTED,
    })
  }
  for (const v of vlines) {
    const vx = xScale(v.at)
    body += line(
      vx,
      plot.top,
      vx,
      plot.bottom,
      v.color ?? '#b91c1c',
      ` stroke-dasharray="${v.dash ?? '3 2'}" stroke-width="1"`,
    )
    if (v.label)
      body += text(vx + (v.dx ?? 3), plot.top + (v.dy ?? 6), v.label, {
        size: FONT.tiny,
        fill: v.color ?? '#b91c1c',
        anchor: v.anchor ?? 'start',
        weight: 600,
      })
  }
  for (const ser of series) {
    const pts = ser.points
    if (!pts.length) continue
    let d = ''
    pts.forEach(([px, py], i) => {
      const sx = xScale(px)
      const sy = y(py)
      if (i === 0) d += `M${r1(sx)} ${r1(sy)}`
      else if (ser.step) d += `H${r1(sx)}V${r1(sy)}`
      else d += `L${r1(sx)} ${r1(sy)}`
    })
    if (ser.extendTo !== undefined) d += `H${r1(xScale(ser.extendTo))}`
    if (ser.area) {
      body += `<path d="${d}V${r1(y(yDomain[0]))}H${r1(xScale(pts[0][0]))}Z" fill="${ser.area}" stroke="none"/>`
    }
    if (ser.width !== 0)
      body += `<path d="${d}" fill="none" stroke="${ser.color}" stroke-width="${ser.width ?? 1.6}"${ser.dash ? ` stroke-dasharray="${ser.dash}"` : ''} stroke-linejoin="round"/>`
    if (ser.markers) {
      for (const [px, py, flag] of pts) {
        const sx = xScale(px)
        const sy = y(py)
        body +=
          flag === 'hollow'
            ? `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="3" fill="#fff" stroke="${ser.color}" stroke-width="1.4"/>`
            : `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="2.6" fill="${ser.color}"/>`
      }
    }
  }
  for (const l of labels) {
    body += text(xScale(l.x) + (l.dx ?? 0), y(l.y) + (l.dy ?? 0), l.text, {
      size: l.size ?? FONT.tiny,
      anchor: l.anchor ?? 'start',
      fill: l.color ?? MUTED,
      weight: l.weight ?? 400,
    })
  }
  return svg(width, height, body, { title, desc })
}

/**
 * Horizontal stacked rows (shares or totals). rows: [{ label, note, segments: [{ value, color, label }] }]
 */
export function stackedRows({
  width = 600,
  rows,
  max,
  labelWidth = 150,
  rowHeight = 20,
  valueFormat = fmtNumber,
  title,
  desc,
  showValues = true,
  noteWidth = 60,
  axis = false,
}) {
  const left = labelWidth
  const right = width - noteWidth
  const total =
    max ?? Math.max(...rows.map((row) => row.segments.reduce((s, seg) => s + seg.value, 0)))
  const x = linear([0, total], [left, right])
  let body = ''
  let y = 4
  if (axis) {
    for (const t of niceTicks(0, total, 4)) {
      body += line(x(t), 4, x(t), 4 + rows.length * rowHeight, GRID)
      body += text(x(t), 10 + rows.length * rowHeight, valueFormat(t), {
        size: FONT.tiny,
        anchor: 'middle',
        fill: MUTED,
      })
    }
  }
  for (const row of rows) {
    const cy = y + rowHeight / 2
    body += text(0, cy, row.label, { size: FONT.small, weight: row.bold ? 600 : 400 })
    let acc = 0
    for (const seg of row.segments) {
      if (!seg.value) continue
      const sx = x(acc)
      const sw = x(acc + seg.value) - sx
      body += rect(
        sx,
        y + rowHeight * 0.18,
        sw,
        rowHeight * 0.64,
        seg.color,
        seg.stroke ? ` stroke="${seg.stroke}"` : '',
      )
      if (showValues && sw > textWidth(seg.label ?? valueFormat(seg.value), FONT.tiny) + 4) {
        body += text(sx + sw / 2, cy, seg.label ?? valueFormat(seg.value), {
          size: FONT.tiny,
          anchor: 'middle',
          fill: seg.textColor ?? '#fff',
          weight: 600,
        })
      }
      acc += seg.value
    }
    if (row.note) body += text(x(acc) + 5, cy, row.note, { size: FONT.tiny, fill: MUTED })
    y += rowHeight
  }
  return svg(width, y + (axis ? 14 : 4), body, { title, desc })
}

/**
 * Dependency graph with fixed positions. nodes: [{ id, col, row, label, sub, kind }],
 * edges: [[from, to, critical?]]. kind: owner | done | work | milestone | external.
 */
export function dag({
  width = 600,
  nodes,
  edges,
  cols,
  rowsCount,
  nodeW = 118,
  nodeH = 34,
  colors,
  title,
  desc,
  colLabels = [],
}) {
  const padX = 2
  const top = colLabels.length ? 18 : 4
  const gapX = (width - padX * 2 - nodeW) / (cols - 1)
  const gapY = nodeH + 14
  const pos = Object.fromEntries(
    nodes.map((n) => [n.id, { x: padX + n.col * gapX, y: top + n.row * gapY, n }]),
  )
  const height = top + rowsCount * gapY
  let body = `<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="${AXIS}"/></marker><marker id="arrowc" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#996600"/></marker></defs>`
  colLabels.forEach((label, i) => {
    body += text(padX + i * gapX + nodeW / 2, 8, label, {
      size: FONT.tiny,
      anchor: 'middle',
      fill: MUTED,
      weight: 600,
    })
  })
  for (const [from, to, critical] of edges) {
    const a = pos[from]
    const b = pos[to]
    if (a.n.col === b.n.col) {
      const cx = a.x + nodeW / 2
      body += `<path d="M${r1(cx)} ${r1(a.y + nodeH)}V${r1(b.y - 2)}" fill="none" stroke="${critical ? '#996600' : AXIS}" stroke-width="${critical ? 1.8 : 1}" marker-end="url(#${critical ? 'arrowc' : 'arrow'})"/>`
      continue
    }
    const x1 = a.x + nodeW
    const y1 = a.y + nodeH / 2
    const x2 = b.x - 2
    const y2 = b.y + nodeH / 2
    const mx = (x1 + x2) / 2
    body += `<path d="M${r1(x1)} ${r1(y1)}C${r1(mx)} ${r1(y1)} ${r1(mx)} ${r1(y2)} ${r1(x2)} ${r1(y2)}" fill="none" stroke="${critical ? '#996600' : AXIS}" stroke-width="${critical ? 1.8 : 1}" marker-end="url(#${critical ? 'arrowc' : 'arrow'})"/>`
  }
  for (const { x, y, n } of Object.values(pos)) {
    const c = colors[n.kind]
    body += `<rect x="${r1(x)}" y="${r1(y)}" width="${nodeW}" height="${nodeH}" rx="5" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${n.critical ? 1.8 : 1}"${c.dash ? ' stroke-dasharray="3 2"' : ''}/>`
    body += text(x + 7, y + 12, n.label, { size: FONT.small, weight: 600, fill: c.text ?? INK })
    if (n.sub) body += text(x + 7, y + 24, n.sub, { size: FONT.tiny, fill: c.subText ?? MUTED })
  }
  return svg(width, height, body, { title, desc })
}

/** 5 × 5 likelihood/impact heat map with risk ids placed in their cells. */
export function riskMatrix({ size = 260, risks, title, desc }) {
  const left = 34
  const top = 6
  const cell = (size - left - 6) / 5
  let body = ''
  for (let l = 1; l <= 5; l += 1) {
    for (let i = 1; i <= 5; i += 1) {
      const score = l * i
      const fill =
        score >= 15 ? '#fecaca' : score >= 8 ? '#fde68a' : score >= 4 ? '#fef3c7' : '#ecfccb'
      body += rect(left + (i - 1) * cell, top + (5 - l) * cell, cell - 2, cell - 2, fill, ' rx="3"')
    }
  }
  const byCell = {}
  for (const risk of risks) (byCell[`${risk.likelihood}-${risk.impact}`] ??= []).push(risk.id)
  for (const [key, ids] of Object.entries(byCell)) {
    const [l, i] = key.split('-').map(Number)
    const cx = left + (i - 1) * cell + (cell - 2) / 2
    const cy = top + (5 - l) * cell + (cell - 2) / 2
    ids.forEach((id, k) => {
      const oy = (k - (ids.length - 1) / 2) * 11
      body += text(cx, cy + oy, id, { size: FONT.small, anchor: 'middle', weight: 700 })
    })
  }
  const bottom = top + 5 * cell
  for (let k = 1; k <= 5; k += 1) {
    body += text(left + (k - 1) * cell + cell / 2 - 1, bottom + 8, String(k), {
      size: FONT.tiny,
      anchor: 'middle',
      fill: MUTED,
    })
    body += text(left - 6, top + (5 - k) * cell + cell / 2 - 1, String(k), {
      size: FONT.tiny,
      anchor: 'end',
      fill: MUTED,
    })
  }
  body += text(left + (5 * cell) / 2, bottom + 20, 'Impact', {
    size: FONT.tiny,
    anchor: 'middle',
    fill: MUTED,
  })
  body += `<text x="10" y="${r1(top + (5 * cell) / 2)}" font-size="${FONT.tiny}" fill="${MUTED}" text-anchor="middle" transform="rotate(-90 10 ${r1(top + (5 * cell) / 2)})">Likelihood</text>`
  return svg(size, bottom + 26, body, { title, desc })
}

/** Roadmap chevrons with a "you are here" marker. stages: [{ title, when, status }] */
export function roadmap({ width = 600, stages, colors, title, desc }) {
  const gap = 3
  const h = 40
  const top = 20
  const w = (width - gap * (stages.length - 1)) / stages.length
  const tip = 9
  let body = ''
  stages.forEach((stage, i) => {
    const x = i * (w + gap)
    const c = colors[stage.status]
    const first = i === 0
    const last = i === stages.length - 1
    const d = `M${r1(x)} ${top}H${r1(x + w - (last ? 0 : tip))}L${r1(x + w)} ${top + h / 2}L${r1(x + w - (last ? 0 : tip))} ${top + h}H${r1(x)}${first ? '' : `L${r1(x + tip)} ${top + h / 2}`}Z`
    body += `<path d="${d}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${stage.status === 'current' ? 1.8 : 1}"${c.dash ? ' stroke-dasharray="3 2"' : ''}/>`
    const cx = x + (first ? 0 : tip / 2) + (w - (last ? 0 : tip / 2) - (first ? 0 : tip / 2)) / 2
    body += text(cx, top + 15, stage.title, {
      size: FONT.small,
      weight: 700,
      fill: c.text,
      anchor: 'middle',
    })
    body += text(cx, top + 28, stage.when, { size: FONT.tiny, fill: c.sub, anchor: 'middle' })
    if (stage.status === 'current') {
      body += `<path d="M${r1(cx - 5)} 6L${r1(cx + 5)} 6L${r1(cx)} 14Z" fill="#b91c1c"/>`
      body += text(cx + 9, 9, 'You are here', { size: FONT.tiny, fill: '#b91c1c', weight: 700 })
    }
  })
  return svg(width, top + h + 2, body, { title, desc })
}

/** Inline bullet bar: value against a limit, with an optional reference marker. */
export function bullet({
  width = 160,
  value,
  max,
  limit,
  color = '#996600',
  track = '#e7e5e4',
  marker,
}) {
  const h = 12
  const x = linear([0, max], [0, width])
  let body = rect(0, 2, width, h - 4, track, ' rx="2"')
  if (limit !== undefined) body += rect(0, 2, x(limit), h - 4, '#d6d3d1', ' rx="2"')
  body += rect(0, 3.5, x(Math.min(value, max)), h - 7, color, ' rx="1.5"')
  if (marker !== undefined) body += line(x(marker), 0, x(marker), h, INK, ' stroke-width="1.5"')
  return svg(width, h, body, { className: 'bullet' })
}
