#!/usr/bin/env node
/**
 * Builds the development progress report: measures the repository (collect.mjs), combines it with
 * the curated plan and status (model.mjs), and writes a self-contained HTML report with inline SVG
 * charts, the data behind it as JSON and, with --pdf, an A4 PDF printed by Chromium.
 *
 *   node scripts/progress-report/build.mjs            # HTML + JSON (CI runs read with `gh`)
 *   node scripts/progress-report/build.mjs --pdf      # also the PDF (Playwright's Chromium, or
 *                                                     #   PLAYWRIGHT_CHROMIUM_EXECUTABLE)
 *   node scripts/progress-report/build.mjs --offline  # reuse the CI runs saved in the JSON
 *
 * Output: docs/reports/<date>-progress-report.html|.pdf and <date>-progress-data.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AREAS, headOf, readCiRuns, readCommits, sizeAt, testsAt } from './collect.mjs'
import * as model from './model.mjs'
import {
  bars,
  bullet,
  dag,
  esc,
  gantt,
  hatch,
  lines,
  niceMax,
  riskMatrix,
  roadmap,
  stackedRows,
} from './svg.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(root)
const args = new Set(process.argv.slice(2))
const { meta, STATUS } = model
const outDir = path.join(root, 'docs/reports')
const stem = `${meta.reportDate}-progress-report`
const dataFile = path.join(outDir, `${meta.reportDate}-progress-data.json`)
const previous = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : null

// ---------------------------------------------------------------------------------------------
// Time and number helpers (calendar days in the report's zone, which has no DST)
// ---------------------------------------------------------------------------------------------
const OFFSET = '+03:30'
const HOUR = 3600e3
const DAY = 24 * HOUR
const ms = (iso) => Date.parse(iso)
const dayStart = (day) => Date.parse(`${day}T00:00:00${OFFSET}`)
const fmtParts = (t, options) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: meta.timeZone, ...options }).format(new Date(t))
const fmtDay = (t) => fmtParts(t, { day: 'numeric', month: 'short' })
const fmtTime = (t) => fmtParts(t, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const fmtDayTime = (t) => `${fmtDay(t)} ${fmtTime(t)}`
const fmtWeekday = (t) => fmtParts(t, { weekday: 'short', day: 'numeric', month: 'short' })
const fmtLong = (t) => fmtParts(t, { day: 'numeric', month: 'long', year: 'numeric' })
const localDay = (t) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: meta.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}`
}
const daysBetween = (from, to) => {
  const out = []
  for (let t = dayStart(from); t <= dayStart(to); t += DAY) out.push(localDay(t + HOUR))
  return out
}
const sum = (values) => values.reduce((a, b) => a + b, 0)
const r1 = (n) => Math.round(n * 10) / 10
const f1 = (n) => r1(n).toFixed(1)
const int = (n) => Math.round(n).toLocaleString('en-GB')
const kLines = (n) => (Math.abs(n) >= 1000 ? `${r1(n / 1000)}k` : String(n))
const pct = (n) => `${Math.round(n * 100)}%`
const median = (values) => {
  const s = [...values].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

// ---------------------------------------------------------------------------------------------
// Measure the repository
// ---------------------------------------------------------------------------------------------
const head = headOf('HEAD')
const commits = readCommits('HEAD', meta.timeZone)
const bySha = new Map(commits.map((c) => [c.short.slice(0, 7), c]))
const commitOf = (sha) => {
  const found = bySha.get(sha.slice(0, 7))
  if (!found) throw new Error(`Commit ${sha} (model.mjs) is not in the history of HEAD`)
  return found
}
const baselineCommit = commitOf(meta.baseline)
const baselineIndex = commits.indexOf(baselineCommit)
const programme = commits.slice(baselineIndex + 1)
const foundation = commits.slice(0, baselineIndex + 1)
const testSeries = [baselineCommit, ...programme].map((c) => ({
  sha: c.short.slice(0, 7),
  at: c.at,
  ...testsAt(c.sha),
}))
const sizeBaseline = sizeAt(baselineCommit.sha)
const sizeHead = sizeAt('HEAD')
const ciRuns = (args.has('--offline') ? null : readCiRuns(meta.repo)) ?? previous?.ci?.runs ?? []
const measuredAt = ms(meta.measuredAt)
const reportDay = meta.reportDate

// ---------------------------------------------------------------------------------------------
// Derive the metrics
// ---------------------------------------------------------------------------------------------
const WEIGHT = { done: 1, changed: 1, partial: 0.5, open: 0, deferred: 0 }
const phases = model.phases.map((phase) => {
  const items = phase.items.map(([title, status, evidence, optional]) => ({
    title,
    status,
    evidence,
    optional: Boolean(optional),
  }))
  const base = items.filter((item) => !item.optional)
  const completion = sum(base.map((item) => WEIGHT[item.status])) / base.length
  const mid = (phase.min + phase.max) / 2
  return {
    ...phase,
    items,
    base,
    completion,
    mid,
    ev: mid * completion,
    remaining: mid * (1 - completion),
  }
})
const allItems = phases.flatMap((phase) =>
  phase.items.map((item) => ({ ...item, phase: phase.id })),
)
const statusCount = (status) => allItems.filter((item) => item.status === status).length
const roadmapPlanned = sum(phases.map((p) => p.mid))
const roadmapEv = sum(phases.map((p) => p.ev))
const roadmapRemaining = roadmapPlanned - roadmapEv

const cr12Items = model.cr12.items.map((item) => ({
  ...item,
  at: item.commit ? ms(commitOf(item.commit).at) : null,
}))
const cr12Total = sum(cr12Items.map((i) => i.estimate))
const cr12Done = cr12Items.filter((i) => i.at)
const cr12Ev = sum(cr12Done.map((i) => i.estimate))
const cr12Remaining = cr12Total - cr12Ev

const SOURCES = {
  plan: { label: 'Analysis and planning', color: '#57534e' },
  roadmap: { label: 'Roadmap P0–P6 and decisions', color: '#996600' },
  request: { label: 'Owner change requests', color: '#2563eb' },
  unplanned: { label: 'Unplanned fixes and rework', color: '#b91c1c' },
  foundation: { label: 'Foundation (owner)', color: '#78716c' },
  owner: { label: 'Owner commits', color: '#a8a29e' },
}

const deliverables = model.deliverables.map((d) => {
  const cs = d.commits.map(commitOf)
  const times = cs.map((c) => ms(c.at))
  const phase = phases.find((p) => p.id === d.id)
  const estimate = phase ? phase.mid : d.id === 'CR-12' ? cr12Total : (d.estimate ?? 0)
  const ev = d.reverted ? 0 : phase ? phase.ev : d.id === 'CR-12' ? cr12Ev : (d.estimate ?? 0)
  return {
    ...d,
    cs,
    title: d.title ?? d.row,
    start: Math.min(...times),
    end: Math.max(...times),
    estimate,
    ev,
    added: sum(cs.map((c) => c.added)),
    deleted: sum(cs.map((c) => c.deleted)),
    day: localDay(Math.max(...times)),
  }
})
const work = deliverables.filter((d) =>
  ['plan', 'roadmap', 'request', 'unplanned'].includes(d.source),
)
const programmeStart = ms(programme[0].at)
const programmeEnd = ms(programme.at(-1).at)
const lastPlanned = Math.max(
  ...work.filter((d) => d.source !== 'unplanned').map((d) => d.end),
  ...cr12Done.map((i) => i.at),
)

// Velocity: effort delivered per calendar day, by source.
const progDays = daysBetween(localDay(programmeStart), reportDay)
const velocity = progDays.map((day) => {
  const row = {
    day,
    plan: 0,
    roadmap: 0,
    request: 0,
    unplanned: 0,
    reverted: 0,
    commits: 0,
    deliverables: 0,
  }
  for (const d of work.filter((w) => w.day === day)) {
    row[d.source] += d.ev
    if (d.reverted) row.reverted += d.estimate
    row.deliverables += 1
  }
  row.commits = programme.filter((c) => c.day === day).length
  row.total = row.plan + row.roadmap + row.request + row.unplanned
  return row
})
const crDays = velocity.filter((v) => v.day > progDays[0] && v.total > 0)
const crRates = crDays.map((v) => v.total)
const rate = { low: Math.min(...crRates), mid: median(crRates), high: Math.max(...crRates) }
const totalEv = sum(work.map((d) => d.ev))
const unplannedEv = sum(work.filter((d) => d.source === 'unplanned').map((d) => d.estimate))
const activeDays = velocity.filter((v) => v.total > 0).length

// Working sessions: agent commits less than 90 minutes apart.
const agentCommits = programme
  .filter((c) => c.origin === 'agent')
  .sort((a, b) => ms(a.at) - ms(b.at))
const sessions = []
for (const c of agentCommits) {
  const t = ms(c.at)
  const last = sessions.at(-1)
  if (last && t - last.end <= 1.5 * HOUR) {
    last.end = t
    last.commits.push(c)
  } else sessions.push({ start: t, end: t, commits: [c] })
}
for (const s of sessions)
  s.delivered = work.filter((d) => d.end >= s.start && d.end <= s.end).map((d) => d.id)

// Burn-up: scope and delivered effort over time.
const scopeEvents = [
  [
    programmeStart,
    sum(work.filter((d) => ['plan', 'roadmap'].includes(d.source)).map((d) => d.estimate)),
  ],
]
const doneEvents = []
for (const d of work) {
  if (d.source === 'request' || d.source === 'unplanned')
    scopeEvents.push([d.id === 'CR-12' ? ms(model.cr12.started) : d.start, d.estimate])
  if (d.id === 'CR-12') for (const item of cr12Done) doneEvents.push([item.at, item.estimate])
  else if (d.ev) doneEvents.push([d.end, d.ev])
}
const revertCommit = deliverables.find((d) => d.id === 'CR-14')
scopeEvents.push([revertCommit.end, -deliverables.find((d) => d.id === 'CR-13').estimate])
const cumulative = (events) => {
  let acc = 0
  return events.sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, (acc += v)])
}
const scopeLine = cumulative(scopeEvents)
const doneLine = cumulative(doneEvents)

// Forecast: list schedule of the backlog at three throughputs, from the next session.
const backlog = model.backlog
const nextSession = dayStart(meta.nextSession)
function schedule(perDay, delayDays) {
  const out = {}
  let cursor = delayDays
  const ownerEnd = delayDays + 0.5 // owner steps take up to half a day, in parallel
  out.DEC = { start: delayDays, end: delayDays }
  out.ENV = { start: delayDays, end: ownerEnd }
  for (const id of ['MIG', 'E5', 'E6', 'E4', 'E4b', 'E7', 'E8', 'QA', 'CNT']) {
    const task = backlog.find((b) => b.id === id)
    const ready = Math.max(cursor, ...task.after.map((dep) => out[dep]?.end ?? 0))
    out[id] = { start: ready, end: ready + task.estimate / perDay }
    cursor = out[id].end
  }
  const at = (days) => nextSession + days * DAY
  return Object.fromEntries(
    Object.entries(out).map(([id, v]) => [id, { start: at(v.start), end: at(v.end) }]),
  )
}
const plans = {
  optimistic: schedule(rate.high, 0),
  likely: schedule(rate.mid, 0),
  pessimistic: schedule(rate.low, 1),
}
const closeOut = backlog.filter((b) => b.group === 'CR-12 close-out' || b.id === 'MIG')
const closeOutEffort = sum(closeOut.map((b) => b.estimate))
const milestones = [
  {
    id: 'M1',
    title: 'CI green again',
    when: (p) => p.DEC.end + 0.05 * DAY,
    note: 'Owner decision DEC, then re-apply two fixes',
  },
  {
    id: 'M2',
    title: 'CR-12 complete (E4–E8)',
    when: (p) => p.E8.end,
    note: `${f1(closeOutEffort)} engineer-days incl. the migration baseline`,
  },
  {
    id: 'M3',
    title: 'Roadmap gaps closed, quality gates in CI',
    when: (p) => p.QA.end,
    note: 'Visual suite, bundle check, changelog, tests',
  },
  {
    id: 'M4',
    title: 'Content and publishing release',
    when: (p) => p.CNT.end,
    note: 'If the owner schedules it next: drafts, scheduling, SEO, i18n, globals',
  },
]
for (const m of milestones) {
  m.likely = m.when(plans.likely)
  m.optimistic = m.when(plans.optimistic)
  m.pessimistic = m.when(plans.pessimistic)
}

// Code, tests, CI, bundle.
const areaTotals = (list) => {
  const totals = {}
  for (const c of list)
    for (const [id, v] of Object.entries(c.areas)) {
      totals[id] ??= { added: 0, deleted: 0 }
      totals[id].added += v.added
      totals[id].deleted += v.deleted
    }
  return totals
}
const programmeAreas = areaTotals(programme)
const typeCounts = {}
for (const c of programme) typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1
const authoredAdded = sum(programme.map((c) => c.added))
const authoredDeleted = sum(programme.map((c) => c.deleted))
const lastTests = testSeries.at(-1)
const firstTests = testSeries[0]
const runtimeTests = { int: 51, intFiles: 7, e2e: 48, e2eFiles: 13, visual: 6 }
const retained = ciRuns.filter((r) => r.branch === meta.branch)
const runNumbers = retained.map((r) => r.number).filter(Boolean)
const maxRunNumber = Math.max(53, ...runNumbers)
const ciFirst = retained[0]
const ciLast = retained.at(-1)
const bundleNow = model.bundle.points.at(-1)
const jsUsed = bundleNow.js - model.bundle.baseline.js
const cssUsed = bundleNow.css - model.bundle.baseline.css
const budgetNow = model.bundle.budgets.at(-1)
const authoredSize = (size) =>
  sum(
    Object.entries(size)
      .filter(([id]) => id !== 'generated')
      .map(([, v]) => v.lines),
  )
const adrCount = fs
  .readdirSync('docs/ui-modernization/adr')
  .filter((f) => /^\d{4}-.*\.md$/.test(f)).length

// ---------------------------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------------------------
const W = 600
const legend = (items) =>
  `<div class="legend">${items.map(([label, color, style = '']) => `<span><i style="background:${color};${style}"></i>${esc(label)}</span>`).join('')}</div>`
const figure = (n, title, chart, caption, legendHtml = '') =>
  `<figure id="fig-${n}"><figcaption class="fig-title"><b>Figure ${n}.</b> ${esc(title)}</figcaption>${chart}${legendHtml}${caption ? `<figcaption class="fig-note">${caption}</figcaption>` : ''}</figure>`

// Figure 1: whole project by day.
const fig1 = (() => {
  const from = dayStart(meta.periodStart)
  const to = dayStart(reportDay) + 3 * DAY
  const ticks = daysBetween(meta.periodStart, localDay(to)).map((day, i) => ({
    at: dayStart(day),
    label: i % 2 === 0 ? fmtDay(dayStart(day)).replace(' Oct', '') : '',
    major: day.endsWith('01'),
  }))
  const dayBar = (startT, endT, color, extra = {}) => ({
    from: dayStart(localDay(startT)),
    to: dayStart(localDay(endT)) + DAY,
    color,
    ...extra,
  })
  const group = (ids) => deliverables.filter((d) => ids.includes(d.id))
  const span = (ids) => {
    const ds = group(ids)
    return [Math.min(...ds.map((d) => d.start)), Math.max(...ds.map((d) => d.end))]
  }
  const rows = [{ heading: 'Foundation (owner)' }]
  for (const d of deliverables.filter((x) => x.source === 'foundation'))
    rows.push({
      label: d.row.replace(/ \(.*\)$/, ''),
      note: `${d.cs.length} commit${d.cs.length > 1 ? 's' : ''}`,
      bars: [dayBar(d.start, d.end, SOURCES.foundation.color)],
    })
  rows.push({ heading: 'Admin modernisation programme' })
  const stream = (label, ids, color, extra) => {
    const [s, e] = span(ids)
    const n = sum(group(ids).map((d) => d.cs.length))
    rows.push({ label, note: `${n} commits`, bars: [dayBar(s, e, color, extra)] })
  }
  stream(
    'Analysis, roadmap P0–P6, roles',
    ['PLN', 'P0', 'P1', 'P2', 'D8', 'P3', 'P4', 'P5', 'P6'],
    SOURCES.roadmap.color,
  )
  stream(
    'Frontier UI, change requests 1–10',
    [
      'UI',
      'CR-01',
      'CR-02',
      'CR-03',
      'CR-04',
      'CR-05',
      'CR-06',
      'CR-07',
      'CR-08',
      'CR-09',
      'CR-10',
    ],
    SOURCES.request.color,
  )
  stream('Restructure and gallery (CR-11)', ['CR-11'], SOURCES.request.color)
  const cr12 = deliverables.find((d) => d.id === 'CR-12')
  rows.push({
    label: 'Settings, access, tools (CR-12)',
    note: `${cr12.cs.length} commits`,
    bars: [
      dayBar(cr12.start, cr12.end, SOURCES.request.color),
      {
        from: nextSession,
        to: plans.likely.E8.end,
        color: 'none',
        fill: 'url(#h-blue)',
        stroke: SOURCES.request.color,
        dash: true,
      },
    ],
  })
  stream('Unplanned fixes (CR-13 to CR-15)', ['CR-13', 'CR-14', 'CR-15'], SOURCES.unplanned.color)
  rows.push({
    label: 'This report',
    note: 'today',
    bars: [{ from: dayStart(reportDay), to: dayStart(reportDay) + DAY, color: '#d6d3d1' }],
  })
  return gantt({
    width: W,
    rows,
    from,
    to,
    ticks,
    today: measuredAt,
    todayLabel: 'Report',
    labelWidth: 236,
    defs: hatch('h-blue', '#93c5fd', '#eff6ff'),
    title: 'Project timeline, 1 to 20 October 2026',
    desc: 'Foundation work by the owner from 1 to 12 October; the admin programme from 16 to 19 October; the hatched bar is the forecast for the rest of CR-12.',
  })
})()

// Figure 2: programme detail by hour, with working sessions shaded.
const fig2 = (() => {
  const from = dayStart(localDay(programmeStart))
  const to = dayStart(reportDay) + 6 * HOUR
  const ticks = []
  for (let t = from; t <= to; t += 6 * HOUR) {
    const hour = Number(fmtParts(t, { hour: '2-digit', hourCycle: 'h23' }))
    if (hour === 0)
      ticks.push({ at: t, label: fmtWeekday(t), major: true, anchor: 'start', tier: 1 })
    ticks.push({ at: t, label: hour === 0 ? '0' : String(hour), major: hour === 0 })
  }
  const rows = []
  const add = (d) => {
    const color = SOURCES[d.source].color
    const name = d.short ?? d.title
    const label =
      d.id === 'D8'
        ? name
        : d.id.startsWith('CR') || d.id === 'UI' || d.id === 'PLN'
          ? `${d.id === 'UI' ? 'Port' : d.id} ${name}`
          : name
    // Commits of one deliverable in the same working session form a cluster; idle gaps are dotted.
    const clusters = []
    for (const c of [...d.cs].sort((a, b) => ms(a.at) - ms(b.at))) {
      const t = ms(c.at)
      const last = clusters.at(-1)
      if (last && t - last.to <= 1.5 * HOUR) last.to = t
      else clusters.push({ from: t, to: t })
    }
    const fill = d.reverted ? 'url(#h-red)' : color
    rows.push({
      label,
      note: `${fmtTime(d.end)}`,
      links: clusters.slice(1).map((cl, i) => ({ from: clusters[i].to, to: cl.from, color })),
      bars: clusters
        .filter((cl) => cl.to - cl.from >= 25 * 60e3)
        .map((cl) => ({
          from: cl.from,
          to: cl.to,
          color: d.reverted ? 'none' : color,
          fill,
          stroke: d.reverted ? color : undefined,
        })),
      marks: clusters
        .filter((cl) => cl.to - cl.from < 25 * 60e3)
        .map((cl) => ({
          at: cl.to,
          color: d.reverted ? '#fff' : color,
          stroke: d.reverted ? color : undefined,
        })),
    })
  }
  rows.push({ heading: 'Analysis and roadmap (16 Oct)' })
  for (const id of ['PLN', 'P0', 'P1', 'P2', 'D8', 'P3', 'P4', 'P5', 'P6'])
    add(deliverables.find((d) => d.id === id))
  rows.push({ heading: 'Change requests (17–19 Oct)' })
  for (const id of [
    'UI',
    'CR-01',
    'CR-02',
    'CR-03',
    'CR-04',
    'CR-05',
    'CR-06',
    'CR-07',
    'CR-08',
    'CR-09',
    'CR-10',
    'CR-11',
    'CR-12',
  ])
    add(deliverables.find((d) => d.id === id))
  rows.push({ heading: 'Unplanned (19 Oct)' })
  for (const id of ['CR-13', 'CR-14', 'CR-15']) add(deliverables.find((d) => d.id === id))
  rows.push({ heading: 'Owner' })
  const own = deliverables.find((d) => d.id === 'OWN')
  rows.push({
    label: 'Owner commits (config, merge)',
    note: `${own.cs.length}`,
    marks: own.cs.map((c) => ({ at: ms(c.at), color: SOURCES.owner.color, shape: 'dot' })),
  })
  return gantt({
    width: W,
    rows,
    from,
    to,
    ticks,
    today: measuredAt,
    todayLabel: 'Report',
    labelWidth: 222,
    rowHeight: 14,
    headingHeight: 16,
    bands: sessions.map((s) => ({
      from: s.start - 10 * 60e3,
      to: s.end + 10 * 60e3,
      color: '#f3f1ec',
    })),
    defs: hatch('h-red', '#fca5a5', '#fff'),
    title: 'Programme timeline by hour, 16 to 20 October',
    desc: 'Each row is a deliverable: bars run from its first to its last commit, diamonds mark single-commit deliverables. Shaded columns are working sessions.',
  })
})()

// Figure 3: plan vs actual for P0–P6.
const fig3 = (() => {
  const workday = (start, n) => {
    let t = start
    let left = n
    while (left > 0) {
      const wd = new Date(t + 12 * HOUR).getUTCDay()
      if (wd !== 0 && wd !== 6) left -= 1
      if (left > 0) t += DAY
    }
    return t + DAY
  }
  const planStart = dayStart('2026-10-19')
  let lo = planStart
  let hi = planStart
  const nextWorkday = (t) => {
    let x = t
    while ([0, 6].includes(new Date(x + 12 * HOUR).getUTCDay())) x += DAY
    return x
  }
  const rows = []
  for (const p of phases) {
    const loStart = nextWorkday(lo)
    const loEnd = workday(loStart, p.min)
    const hiStart = nextWorkday(hi)
    const hiEnd = workday(hiStart, p.max)
    const d = deliverables.find((x) => x.id === p.id)
    p.plan = { loStart, loEnd, hiStart, hiEnd }
    rows.push({
      label: `${p.id} ${p.name}`,
      note: `${p.min}–${p.max} d`,
      bars: [
        { from: loStart, to: loEnd, color: '#a8a29e', thin: true, offset: -3.2 },
        { from: hiStart, to: hiEnd, color: '#d6d3d1', thin: true, offset: 3.2 },
      ],
      marks: [{ at: d.end, color: SOURCES.roadmap.color }],
    })
    lo = loEnd
    hi = hiEnd
  }
  const from = dayStart('2026-10-12')
  const to = dayStart('2027-01-04')
  const ticks = []
  for (let t = dayStart('2026-10-12'); t <= to; t += 7 * DAY)
    ticks.push({ at: t, label: fmtDay(t), major: false })
  return gantt({
    width: W,
    rows,
    from,
    to,
    ticks,
    today: measuredAt,
    labelWidth: 170,
    rowHeight: 18,
    title: 'Roadmap P0–P6: planned schedule against actual delivery',
    desc: `Planned bars follow the roadmap's illustrative schedule from 19 October (weekends excluded) at the lower and upper estimates; diamonds mark the actual delivery on 16 October.`,
  })
})()
const planEndLo = phases.at(-1).plan.loEnd
const planEndHi = phases.at(-1).plan.hiEnd
// The schedule's end times are the midnight after the last working day; text names that day.
const lastWorkday = (t) => t - HOUR

// Figure 4: roadmap scope coverage by phase.
const fig4 = stackedRows({
  width: W,
  labelWidth: 150,
  noteWidth: 92,
  rows: phases.map((p) => ({
    label: `${p.id} ${p.name}`,
    note: `${pct(p.completion)} of ${f1(p.mid)} d`,
    segments: ['done', 'changed', 'partial', 'open', 'deferred'].map((status) => ({
      value: p.items.filter((i) => i.status === status).length,
      color: STATUS[status].color,
      label: String(p.items.filter((i) => i.status === status).length),
    })),
  })),
  max: Math.max(...phases.map((p) => p.items.length)),
  title: 'Roadmap items by status and phase',
  desc: 'Number of planned items per phase by status; the note gives the effort-weighted completion of the non-optional items against the plan midpoint.',
})

// Figure 5: velocity by day.
const fig5 = bars({
  width: W,
  height: 190,
  categories: velocity.map((v) => v.day),
  categoryLabels: velocity.map((v) => [fmtWeekday(dayStart(v.day)), `${v.commits} commits`]),
  series: [
    {
      label: SOURCES.plan.label,
      color: SOURCES.plan.color,
      values: velocity.map((v) => r1(v.plan)),
    },
    {
      label: SOURCES.roadmap.label,
      color: SOURCES.roadmap.color,
      values: velocity.map((v) => r1(v.roadmap)),
    },
    {
      label: SOURCES.request.label,
      color: SOURCES.request.color,
      values: velocity.map((v) => r1(v.request)),
    },
    {
      label: SOURCES.unplanned.label,
      color: SOURCES.unplanned.color,
      values: velocity.map((v) => r1(v.unplanned)),
    },
  ],
  yLabel: 'engineer-days delivered',
  margin: { bottom: 30, left: 34 },
  totalFormat: (v) => f1(v),
  highlight: [velocity.length - 1],
  annotations: [{ index: velocity.length - 1, y: 4, text: 'report day', color: '#78716c' }],
  barWidth: 0.5,
  title: 'Velocity: estimated effort delivered per day',
  desc: 'Engineer-days of planned effort delivered each day of the programme, stacked by source.',
})

// Figure 6: burn-up.
const fig6 = (() => {
  const from = dayStart(localDay(programmeStart))
  const to = dayStart(reportDay) + 6 * HOUR
  const yMax = niceMax(scopeLine.at(-1)[1] * 1.05)
  const xTicks = []
  for (let t = from; t <= to; t += DAY)
    xTicks.push({ at: t, label: fmtWeekday(t), grid: true, anchor: 'start' })
  const final = scopeLine.at(-1)[1]
  const done = doneLine.at(-1)[1]
  return lines({
    width: W,
    height: 210,
    xDomain: [from, to],
    xTicks,
    yDomain: [0, yMax],
    yLabel: 'engineer-days (cumulative)',
    margin: { left: 34, right: 70 },
    series: [
      {
        label: 'Scope',
        color: '#57534e',
        points: [[from, 0], ...scopeLine],
        step: true,
        extendTo: measuredAt,
        dash: '4 2',
      },
      {
        label: 'Delivered',
        color: SOURCES.roadmap.color,
        points: [[from, 0], ...doneLine],
        step: true,
        extendTo: measuredAt,
        width: 2,
        area: 'rgba(153,102,0,0.10)',
      },
    ],
    vlines: [
      {
        at: lastPlanned,
        label: 'last planned delivery',
        color: '#b91c1c',
        dy: 8,
        anchor: 'end',
        dx: -3,
      },
    ],
    labels: [
      { x: measuredAt, y: final, text: `scope ${f1(final)}`, dx: 4, color: '#44403c', weight: 600 },
      { x: measuredAt, y: done, text: `done ${f1(done)}`, dx: 4, color: '#996600', weight: 600 },
      {
        x: measuredAt,
        y: (final + done) / 2,
        text: `open ${f1(final - done)}`,
        dx: 4,
        color: '#b91c1c',
      },
    ],
    title: 'Burn-up: scope and delivered effort',
    desc: 'Cumulative estimated effort in scope (dashed) and delivered (solid). Scope grows as change requests arrive.',
  })
})()

// Figure 7: commits and authored lines per day across the whole period.
const allDays = daysBetween(meta.periodStart, reportDay)
const TYPE_GROUPS = [
  ['Features', '#996600', ['feat']],
  ['Fixes and reverts', '#b91c1c', ['fix', 'revert']],
  ['Refactor, perf, style', '#7c3aed', ['refactor', 'perf', 'style']],
  ['Docs', '#0f766e', ['docs']],
  ['Tests, CI, chores', '#2563eb', ['test', 'ci', 'chore', 'build']],
  ['Untyped and merges', '#a8a29e', ['other', 'merge']],
]
const fig7a = bars({
  width: W,
  height: 150,
  categories: allDays,
  categoryLabels: allDays.map((d, i) => (i % 2 === 0 ? d.slice(8).replace(/^0/, '') : '')),
  series: TYPE_GROUPS.map(([label, color, types]) => ({
    label,
    color,
    values: allDays.map(
      (day) => commits.filter((c) => c.day === day && types.includes(c.type)).length,
    ),
  })),
  yLabel: 'commits',
  margin: { left: 30, bottom: 18 },
  barWidth: 0.7,
  title: 'Commits per day by type, 1 to 20 October',
})
const churnCap = 6000
const churnDays = allDays.map((day) => {
  const cs = commits.filter((c) => c.day === day)
  return { day, added: sum(cs.map((c) => c.added)), deleted: sum(cs.map((c) => c.deleted)) }
})
const fig7b = bars({
  width: W,
  height: 150,
  categories: allDays,
  categoryLabels: allDays.map((d, i) => (i % 2 === 0 ? d.slice(8).replace(/^0/, '') : '')),
  series: [
    { label: 'Added', color: '#996600', values: churnDays.map((c) => Math.min(c.added, churnCap)) },
    {
      label: 'Deleted',
      color: '#d6d3d1',
      values: churnDays.map((c) => -Math.min(c.deleted, churnCap)),
    },
  ],
  totals: false,
  yMax: churnCap,
  yLabel: 'authored lines',
  margin: { left: 30, bottom: 18 },
  barWidth: 0.7,
  annotations: churnDays.flatMap((c, i) =>
    c.added > churnCap
      ? [{ index: i, y: churnCap, dy: -6, text: `+${kLines(c.added)}`, color: '#44403c' }]
      : [],
  ),
  title: 'Authored lines added and deleted per day',
})

// Figure 8: tests over the programme.
const fig8 = (() => {
  const from = dayStart(localDay(programmeStart))
  const to = dayStart(reportDay) + 6 * HOUR
  const xTicks = []
  for (let t = from; t <= to; t += DAY)
    xTicks.push({ at: t, label: fmtWeekday(t), grid: true, anchor: 'start' })
  const pts = (key) => testSeries.map((s, i) => [i === 0 ? from : ms(s.at), s[key]])
  const yMax = niceMax(Math.max(runtimeTests.int, runtimeTests.e2e) * 1.1)
  return lines({
    width: 290,
    height: 190,
    xDomain: [from, to],
    xTicks: xTicks.map((t) => ({ ...t, label: t.label.split(' ')[1] })),
    yDomain: [0, yMax],
    yLabel: 'test declarations',
    margin: { left: 28, right: 34 },
    series: [
      {
        label: 'Integration',
        color: '#0f766e',
        points: pts('int'),
        step: true,
        extendTo: measuredAt,
        width: 1.8,
      },
      {
        label: 'End-to-end',
        color: '#2563eb',
        points: pts('e2e'),
        step: true,
        extendTo: measuredAt,
        width: 1.8,
      },
    ],
    labels: [
      {
        x: measuredAt,
        y: lastTests.int,
        text: String(lastTests.int),
        dx: 3,
        dy: lastTests.int >= lastTests.e2e ? -5 : 6,
        color: '#0f766e',
        weight: 600,
      },
      {
        x: measuredAt,
        y: lastTests.e2e,
        text: String(lastTests.e2e),
        dx: 3,
        dy: lastTests.int >= lastTests.e2e ? 6 : -5,
        color: '#2563eb',
        weight: 600,
      },
    ],
    title: 'Test declarations over the programme',
  })
})()

// Figure 9: CI runs by run number.
const fig9 = (() => {
  const numbers = Array.from({ length: maxRunNumber + 3 }, (_, i) => i + 1)
  const byNumber = new Map(retained.map((r) => [r.number, r]))
  const job = (r, re) => r?.jobs?.find((j) => re.test(j.name))?.minutes ?? 0
  const missing = numbers.map((n, i) => (byNumber.has(n) ? -1 : i)).filter((i) => i >= 0)
  return bars({
    width: 290,
    height: 190,
    categories: numbers,
    categoryLabels: numbers.map((n) => (n % 10 === 0 ? String(n) : '')),
    series: [
      {
        label: 'Lint, types, int tests',
        color: '#996600',
        values: numbers.map((n) => r1(job(byNumber.get(n), /^Lint/))),
      },
      {
        label: 'Build and e2e',
        color: '#2563eb',
        values: numbers.map((n) => r1(job(byNumber.get(n), /^Build/))),
      },
    ],
    totals: false,
    highlight: missing,
    highlightColor: '#fee2e2',
    yLabel: 'minutes per job',
    margin: { left: 24, right: 6, bottom: 18 },
    barWidth: 0.8,
    title: 'CI runs by run number',
  })
})()

// Figure 10: bundle against the budget.
const bundlePoints = model.bundle.points.map((p) => ({
  ...p,
  t: p.at ? ms(p.at) : ms(commitOf(p.sha).at),
}))
const budgetSteps = (key) => {
  const base = model.bundle.baseline[key]
  const start = dayStart(localDay(programmeStart))
  const pts = model.bundle.budgets.map((b, i) => [i === 0 ? start : ms(b.from), base + b[key]])
  return pts
}
const bundleChart = (key, label, domain, width) => {
  const from = dayStart(localDay(programmeStart))
  const to = dayStart(reportDay) + 6 * HOUR
  const xTicks = []
  for (let t = from; t <= to; t += DAY)
    xTicks.push({ at: t, label: fmtDay(t).split(' ')[0], grid: true, anchor: 'start' })
  const kept = bundlePoints.filter((p) => !p.interim && p[key] !== undefined)
  const interim = bundlePoints.filter((p) => p.interim && p[key] !== undefined)
  const base = model.bundle.baseline[key]
  const steps = budgetSteps(key)
  return lines({
    width,
    height: 190,
    xDomain: [from, to],
    xTicks,
    yDomain: domain,
    yLabel: `${label} kB (compressed)`,
    margin: { left: 30, right: 8 },
    series: [
      {
        label: 'Budget',
        color: '#b91c1c',
        points: steps,
        step: true,
        extendTo: to,
        dash: '4 2',
        width: 1.2,
      },
      {
        label: 'Baseline',
        color: '#a8a29e',
        points: [
          [from, base],
          [to, base],
        ],
        dash: '2 2',
        width: 1,
      },
      {
        label: 'Shipped',
        color: '#996600',
        points: kept.map((p) => [p.t, p[key]]),
        markers: true,
        width: 1.8,
      },
      ...(interim.length
        ? [
            {
              label: 'Interim',
              color: '#b91c1c',
              points: interim.map((p) => [p.t, p[key], 'hollow']),
              markers: true,
              width: 0,
            },
          ]
        : []),
    ],
    labels: [
      {
        x: to,
        y: steps.at(-1)[1],
        text: `budget ${f1(steps.at(-1)[1])}`,
        dx: -2,
        dy: -6,
        anchor: 'end',
        color: '#b91c1c',
      },
      {
        x: kept.at(-1).t,
        y: kept.at(-1)[key],
        text: f1(kept.at(-1)[key]),
        dx: -4,
        dy: -8,
        anchor: 'end',
        color: '#996600',
        weight: 600,
      },
      ...interim.map((p, i) => ({
        x: p.t,
        y: p[key],
        text: `${f1(p[key])} (not kept)`,
        dx: 6,
        dy: i === interim.length - 1 && interim.length > 1 ? 11 : 0,
        color: '#b91c1c',
      })),
    ],
    title: `${label} on /admin against the budget`,
  })
}
const fig10a = bundleChart('js', 'JavaScript', [600, 920], 290)
const fig10b = bundleChart('css', 'CSS', [40, 90], 290)

// Figure 11: code size by area, baseline vs now.
const AREA_COLORS = {
  admin: '#996600',
  backend: '#0f766e',
  frontend: '#db2777',
  tests: '#2563eb',
  docs: '#7c3aed',
  tooling: '#57534e',
  seed: '#65a30d',
  generated: '#d6d3d1',
}
const areaIds = AREAS.map((a) => a.id).filter((id) => id !== 'generated')
const fig11 = stackedRows({
  width: W,
  labelWidth: 132,
  noteWidth: 132,
  rows: areaIds
    .map((id) => {
      const before = sizeBaseline[id]?.lines ?? 0
      const now = sizeHead[id]?.lines ?? 0
      return { id, before, now }
    })
    .sort((a, b) => b.now - a.now)
    .map(({ id, before, now }) => ({
      label: AREAS.find((a) => a.id === id).label,
      note: `${kLines(before)} to ${kLines(now)}${before ? ` (${now >= before ? '+' : ''}${kLines(now - before)})` : ''}`,
      segments: [
        { value: Math.min(before, now), color: '#d6d3d1', label: '', textColor: '#44403c' },
        {
          value: Math.max(now - before, 0),
          color: AREA_COLORS[id],
          label: now - before > 1500 ? `+${kLines(now - before)}` : '',
        },
      ],
    })),
  axis: true,
  valueFormat: kLines,
  title: 'Lines of code by area: 12 October baseline and today',
})

// Figure 12: authored churn by area during the programme.
const fig12 = stackedRows({
  width: 290,
  labelWidth: 96,
  noteWidth: 64,
  rows: areaIds
    .filter((id) => programmeAreas[id])
    .sort(
      (a, b) =>
        programmeAreas[b].added +
        programmeAreas[b].deleted -
        (programmeAreas[a].added + programmeAreas[a].deleted),
    )
    .map((id) => ({
      label: AREAS.find((a) => a.id === id).label.replace(', CI and config', ', CI'),
      note: `+${kLines(programmeAreas[id].added)} / -${kLines(programmeAreas[id].deleted)}`,
      segments: [
        { value: programmeAreas[id].added, color: AREA_COLORS[id], label: '' },
        { value: programmeAreas[id].deleted, color: '#e7e5e4', label: '' },
      ],
    })),
  title: 'Authored lines changed by area, programme',
})
const fig12b = stackedRows({
  width: 290,
  labelWidth: 96,
  noteWidth: 30,
  rows: Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => ({
      label: type === 'other' ? 'untyped' : type,
      note: String(n),
      segments: [
        {
          value: n,
          color: (TYPE_GROUPS.find(([, , t]) => t.includes(type)) ?? [])[1] ?? '#a8a29e',
          label: '',
        },
      ],
    })),
  rowHeight: 15,
  title: 'Programme commits by conventional-commit type',
})

// Figure 13: CR-12 burn-down with forecasts.
const fig13 = (() => {
  const from = dayStart('2026-10-19')
  const to = dayStart('2026-10-25')
  const xTicks = []
  for (let t = from; t < to; t += DAY)
    xTicks.push({ at: t, label: fmtWeekday(t), grid: true, anchor: 'start' })
  const start = ms(model.cr12.started)
  let remaining = cr12Total
  const actual = [[start, remaining]]
  for (const item of [...cr12Done].sort((a, b) => a.at - b.at))
    actual.push([item.at, (remaining -= item.estimate)])
  const mig = backlog.find((b) => b.id === 'MIG').estimate
  const withMig = cr12Remaining + mig
  const forecast = (name, color, dash) => ({
    label: name,
    color,
    dash,
    width: 1.4,
    points: [
      [nextSession + (name === 'Pessimistic' ? DAY : 0), withMig],
      [plans[name.toLowerCase()].E8.end, 0],
    ],
  })
  return lines({
    width: W,
    height: 220,
    xDomain: [from, to],
    xTicks,
    yDomain: [0, niceMax(cr12Total)],
    yLabel: 'engineer-days remaining',
    margin: { left: 34, right: 16 },
    bands: [
      {
        x0: measuredAt,
        x1: nextSession,
        color: '#f5f5f4',
        label: 'no session yet',
        labelAt: 'bottom',
      },
    ],
    series: [
      {
        label: 'Actual',
        color: SOURCES.request.color,
        points: actual,
        step: true,
        extendTo: nextSession,
        width: 2.2,
      },
      {
        label: 'Scope added',
        color: '#b91c1c',
        points: [
          [nextSession, cr12Remaining],
          [nextSession, withMig],
        ],
        width: 1.4,
      },
      forecast('Optimistic', '#15803d', '4 2'),
      forecast('Likely', '#996600', '6 2'),
      forecast('Pessimistic', '#b91c1c', '2 2'),
    ],
    vlines: [{ at: measuredAt, label: 'report', color: '#57534e', dy: 8 }],
    labels: [
      {
        x: start,
        y: cr12Total,
        text: `${cr12Items.length} items, ${f1(cr12Total)} d`,
        dx: 4,
        dy: -8,
        color: '#1e3a8a',
        weight: 600,
      },
      {
        x: cr12Done.at(-1).at,
        y: cr12Remaining,
        text: `${cr12Items.length - cr12Done.length} items, ${f1(cr12Remaining)} d left`,
        dx: 3,
        dy: -9,
        color: '#1e3a8a',
        weight: 600,
      },
      {
        x: nextSession,
        y: withMig,
        text: `+${f1(mig)} d migration baseline (MIG)`,
        dx: 5,
        dy: -7,
        color: '#b91c1c',
      },
      {
        x: plans.optimistic.E8.end,
        y: 0,
        text: fmtDay(plans.optimistic.E8.end),
        dx: -4,
        dy: -7,
        anchor: 'end',
        color: '#15803d',
        weight: 600,
      },
      {
        x: plans.likely.E8.end,
        y: 0,
        text: fmtDay(plans.likely.E8.end),
        dx: 4,
        dy: -7,
        anchor: 'start',
        color: '#996600',
        weight: 600,
      },
      {
        x: plans.pessimistic.E8.end,
        y: 0,
        text: fmtDay(plans.pessimistic.E8.end),
        dx: 4,
        dy: -7,
        anchor: 'start',
        color: '#b91c1c',
        weight: 600,
      },
    ],
    title: 'CR-12 burn-down with forecast',
    desc: 'Remaining estimated effort of the current change request; forecasts start at the next session at the highest, median and lowest observed daily velocity (the pessimistic case adds a day for owner decisions).',
  })
})()

// Figure 14: dependency graph.
const DAG_COLORS = {
  owner: { fill: '#fef3c7', stroke: '#d97706', text: '#78350f', subText: '#92400e' },
  work: { fill: '#eff6ff', stroke: '#93c5fd', text: '#1e3a8a', subText: '#1e40af' },
  milestone: { fill: '#996600', stroke: '#996600', text: '#ffffff', subText: '#fdf3dc' },
  later: { fill: '#f5f5f4', stroke: '#a8a29e', text: '#44403c', subText: '#57534e' },
  external: { fill: '#ffffff', stroke: '#a8a29e', text: '#44403c', subText: '#57534e', dash: true },
}
const est = (id) => `${f1(backlog.find((b) => b.id === id).estimate)} d`
const fig14 = dag({
  width: W,
  cols: 5,
  rowsCount: 5,
  nodeW: 104,
  nodeH: 34,
  colors: DAG_COLORS,
  colLabels: ['Owner and external', 'Enable', 'Build', 'Build and close', 'Milestones'],
  nodes: [
    {
      id: 'DEC',
      col: 0,
      row: 0,
      label: 'DEC CI decision',
      sub: 'owner: 2 CI fixes',
      kind: 'owner',
      critical: true,
    },
    {
      id: 'EXT',
      col: 0,
      row: 4,
      label: 'Payload 4 stable',
      sub: 'external, date open',
      kind: 'external',
    },
    {
      id: 'MIG',
      col: 1,
      row: 0,
      label: 'MIG Migrations',
      sub: `baseline, ${est('MIG')}`,
      kind: 'work',
      critical: true,
    },
    { id: 'ENV', col: 1, row: 1, label: 'ENV Variables', sub: 'owner: Vercel keys', kind: 'owner' },
    { id: 'E6', col: 1, row: 2, label: 'E6 System page', sub: est('E6'), kind: 'work' },
    {
      id: 'QA',
      col: 1,
      row: 3,
      label: 'QA Quality gates',
      sub: `roadmap gaps, ${est('QA')}`,
      kind: 'work',
    },
    {
      id: 'E4',
      col: 2,
      row: 0,
      label: 'E4 Jobs panel',
      sub: `cron, tasks, ${est('E4')}`,
      kind: 'work',
      critical: true,
    },
    { id: 'E5', col: 2, row: 1, label: 'E5 Audit log', sub: est('E5'), kind: 'work' },
    { id: 'E7', col: 2, row: 2, label: 'E7 Terminal', sub: `dev only, ${est('E7')}`, kind: 'work' },
    {
      id: 'E4b',
      col: 3,
      row: 0,
      label: 'E4b History',
      sub: `Page speed, ${est('E4b')}`,
      kind: 'work',
      critical: true,
    },
    {
      id: 'E8',
      col: 3,
      row: 1,
      label: 'E8 Close-out',
      sub: `docs, bundle, ${est('E8')}`,
      kind: 'work',
      critical: true,
    },
    {
      id: 'CNT',
      col: 3,
      row: 3,
      label: 'CNT Content',
      sub: `drafts, SEO, ${est('CNT')}`,
      kind: 'later',
    },
    {
      id: 'P7',
      col: 3,
      row: 4,
      label: 'P7 Payload 4',
      sub: `migration, ${est('P7')}`,
      kind: 'later',
    },
    {
      id: 'M2',
      col: 4,
      row: 1,
      label: 'M2 CR-12 done',
      sub: `likely ${fmtDay(plans.likely.E8.end)}`,
      kind: 'milestone',
    },
    {
      id: 'M4',
      col: 4,
      row: 3,
      label: 'M4 Content live',
      sub: `likely ${fmtDay(plans.likely.CNT.end)}`,
      kind: 'milestone',
    },
  ],
  edges: [
    ['DEC', 'MIG', true],
    ['DEC', 'E6'],
    ['DEC', 'QA'],
    ['ENV', 'E4'],
    ['MIG', 'E4', true],
    ['MIG', 'E5'],
    ['E6', 'E7'],
    ['E4', 'E4b', true],
    ['E4', 'CNT'],
    ['QA', 'CNT'],
    ['QA', 'P7'],
    ['EXT', 'P7'],
    ['E4b', 'E8', true],
    ['E5', 'E8'],
    ['E7', 'E8'],
    ['E8', 'M2', true],
    ['CNT', 'M4'],
  ],
  title: 'Dependencies of the remaining work',
  desc: 'Owner actions and enabling work on the left; the highlighted path is the critical path to closing CR-12.',
})

// Figure 15: forecast schedule.
const fig15 = (() => {
  const from = dayStart(reportDay)
  const to = dayStart('2026-10-28')
  const ticks = daysBetween(reportDay, '2026-10-28').map((day) => ({
    at: dayStart(day),
    label: fmtWeekday(dayStart(day)),
    anchor: 'start',
  }))
  const L = plans.likely
  const P = plans.pessimistic
  const O = plans.optimistic
  const row = (id, label, color, extra = {}) => ({
    label,
    note: backlog.find((b) => b.id === id)?.estimate
      ? `${f1(backlog.find((b) => b.id === id).estimate)} d`
      : 'owner',
    bars: [
      { from: O[id].start, to: P[id].end, color: '#e7e5e4', thin: true, offset: 5 },
      { from: L[id].start, to: Math.max(L[id].end, L[id].start + 0.05 * DAY), color },
    ],
    ...extra,
  })
  const rows = [
    { heading: 'Unblock' },
    { label: 'DEC CI decision', note: 'owner', marks: [{ at: L.DEC.end, color: '#d97706' }] },
    row('ENV', 'ENV Vercel variables', '#d97706'),
    row('MIG', 'MIG Migration baseline', '#2563eb'),
    { heading: 'CR-12 close-out' },
    row('E5', 'E5 Audit log', '#2563eb'),
    row('E6', 'E6 System page', '#2563eb'),
    row('E4', 'E4 Jobs panel and tasks', '#2563eb'),
    row('E4b', 'E4b Page speed history', '#2563eb'),
    row('E7', 'E7 Terminal page', '#2563eb'),
    row('E8', 'E8 Docs and bundle', '#2563eb'),
    {
      label: 'M2 CR-12 complete',
      bold: true,
      note: '',
      bars: [{ from: O.E8.end, to: P.E8.end, color: '#fde68a', thin: true }],
      marks: [{ at: L.E8.end, color: '#996600', size: 5.5 }],
    },
    { heading: 'Next horizons' },
    row('QA', 'QA Quality gates', '#7c3aed'),
    {
      label: 'M3 Hardening complete',
      bold: true,
      note: '',
      bars: [{ from: O.QA.end, to: P.QA.end, color: '#fde68a', thin: true }],
      marks: [{ at: L.QA.end, color: '#996600', size: 5.5 }],
    },
    row('CNT', 'CNT Content release', '#7c3aed'),
    {
      label: 'M4 Content release',
      bold: true,
      note: '',
      bars: [{ from: O.CNT.end, to: P.CNT.end, color: '#fde68a', thin: true }],
      marks: [{ at: L.CNT.end, color: '#996600', size: 5.5 }],
    },
    {
      label: 'P7 Payload 4 migration',
      note: 'gated',
      bars: [
        {
          from: dayStart('2026-10-25'),
          to: to - 2 * HOUR,
          color: 'none',
          fill: 'url(#h-grey)',
          stroke: '#a8a29e',
          dash: true,
          label: 'after Payload 4 is stable',
        },
      ],
    },
  ]
  return gantt({
    width: W,
    rows,
    from,
    to,
    ticks,
    today: measuredAt,
    todayLabel: 'Report',
    labelWidth: 176,
    rowHeight: 15,
    headingHeight: 16,
    defs: hatch('h-grey', '#d6d3d1', '#fafaf9'),
    title: 'Forecast schedule, likely case with optimistic to pessimistic range',
    desc: 'Coloured bars: likely schedule at the median velocity from the next session. Grey whiskers: optimistic start to pessimistic end. Diamonds: milestones.',
  })
})()

// Figure 16: roadmap position.
const ROADMAP_COLORS = {
  done: { fill: '#dcfce7', stroke: '#86efac', text: '#14532d', sub: '#166534' },
  current: { fill: '#fdf3dc', stroke: '#996600', text: '#5c3d00', sub: '#7a5200' },
  next: { fill: '#eff6ff', stroke: '#93c5fd', text: '#1e3a8a', sub: '#1e40af' },
  later: { fill: '#fafaf9', stroke: '#d6d3d1', text: '#44403c', sub: '#57534e', dash: true },
}
const horizonWhen = {
  H3: `19–${fmtDay(plans.likely.E8.end)}`,
  H4: `to ${fmtDay(plans.likely.QA.end)}`,
}
const horizons = model.horizons.map((h) => ({ ...h, when: horizonWhen[h.id] ?? h.when }))
const fig16 =
  roadmap({
    width: W,
    stages: horizons,
    colors: ROADMAP_COLORS,
    title: 'Long-term roadmap and current position',
  }) +
  `<div class="stages">${horizons.map((h) => `<div><b>${esc(h.id)} ${esc(h.name)}</b><br>${esc(h.sub)}</div>`).join('')}</div>`

const remainingByHorizon = [
  {
    label: 'H3 Operations & governance',
    parts: [
      ['CR-12 open items', cr12Remaining, '#2563eb'],
      ['Migration baseline', backlog.find((b) => b.id === 'MIG').estimate, '#60a5fa'],
    ],
  },
  {
    label: 'H4 Hardening',
    parts: [['Roadmap gaps, CI gates', backlog.find((b) => b.id === 'QA').estimate, '#7c3aed']],
  },
  {
    label: 'H5 Content & publishing',
    parts: [['Content release', backlog.find((b) => b.id === 'CNT').estimate, '#a78bfa']],
  },
  {
    label: 'H6 Payload 4 (gated)',
    parts: [['P7 migration', backlog.find((b) => b.id === 'P7').estimate, '#d6d3d1']],
  },
]
const fig17 = stackedRows({
  width: W,
  labelWidth: 160,
  noteWidth: 150,
  rows: remainingByHorizon.map((h) => {
    const total = sum(h.parts.map((p) => p[1]))
    return {
      label: h.label,
      note: `${f1(total)} d, about ${f1(total / rate.mid)} active days`,
      segments: h.parts.map(([, value, color]) => ({
        value,
        color,
        label: value >= 3 ? `${f1(value)} d` : '',
        textColor: color === '#d6d3d1' ? '#44403c' : '#fff',
      })),
    }
  }),
  axis: true,
  valueFormat: (v) => `${v}`,
  title: 'Remaining estimated effort by horizon',
})

const fig18 = riskMatrix({ size: 230, risks: model.risks, title: 'Risk heat map' })

// ---------------------------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------------------------
const doneItems = statusCount('done')
const changedItems = statusCount('changed')
const partialItems = statusCount('partial')
const openItems = statusCount('open')
const deferredItems = statusCount('deferred')
const gaps = allItems.filter((i) => ['partial', 'open'].includes(i.status))
const cr15 = deliverables.find((d) => d.id === 'CR-15')
const planStartDate = dayStart('2026-10-19')
const weeksAhead = (planEndHi - measuredAt) / (7 * DAY)
const ciLatestSuccess = ciLast
const hoursSinceLastPlanned = (measuredAt - lastPlanned) / HOUR
const v = Object.fromEntries(velocity.map((x) => [x.day, x]))
const firstDay = velocity[0]
const crPhaseEv = sum(crDays.map((d) => d.total))

const rag = (tone, text) => `<span class="rag ${tone}">${esc(text)}</span>`
const kpi = (label, value, sub, tone = '') =>
  `<div class="kpi ${tone}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`
const chip = (status) =>
  `<span class="chip" style="--c:${STATUS[status].color}">${esc(STATUS[status].label)}</span>`
const sha = (s) => `<code>${esc(s)}</code>`
const table = (head, rows, cls = '') =>
  `<table class="${cls}"><thead><tr>${head.map((h) => `<th${h.startsWith('#') ? ' class="num"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr>${r.map((cell, i) => `<td${head[i]?.startsWith('#') ? ' class="num"' : ''}>${cell}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table>`

const milestoneRows = work.map((d) => [
  `<b>${esc(d.id === 'UI' ? 'Port' : d.id)}</b>`,
  `<b>${esc(d.title)}</b><br><span class="muted">${esc(d.work ?? '')}</span>`,
  esc(fmtDayTime(d.end)),
  `${d.cs.length}`,
  `+${int(d.added)} / -${int(d.deleted)}`,
  d.reverted
    ? `<s>${f1(d.estimate)}</s>`
    : d.ev < d.estimate
      ? `${f1(d.ev)} <span class="muted">of ${f1(d.estimate)}</span>`
      : f1(d.ev),
])

const sessionRows = sessions.map((s, i) => [
  `${i + 1}`,
  `${esc(fmtDayTime(s.start))} to ${esc(fmtTime(s.end))}`,
  `${s.commits.length}`,
  esc(s.delivered.map((id) => (id === 'UI' ? 'Port' : id)).join(', ') || 'partial work'),
])

const gapRows = gaps.map((g) => [
  esc(g.phase),
  esc(g.title) + (g.optional ? ' <span class="muted">(optional)</span>' : ''),
  chip(g.status),
  esc(g.evidence),
])

const backlogRows = backlog.map((b) => [
  `<b>${esc(b.id)}</b>`,
  `<b>${esc(b.title)}</b><br><span class="muted">${esc(b.detail)}</span>`,
  b.owner ? 'owner' : `${f1(b.estimate)}`,
  esc(b.after.join(', ') || '–') +
    (b.external ? `<br><span class="muted">${esc(b.external)}</span>` : ''),
  b.id === 'P7'
    ? 'not scheduled'
    : b.id === 'DEC'
      ? esc(fmtDay(plans.likely.DEC.end))
      : `${esc(fmtDay(plans.likely[b.id].end))}<br><span class="muted">${esc(fmtDay(plans.optimistic[b.id].end))} to ${esc(fmtDay(plans.pessimistic[b.id].end))}</span>`,
])

const milestoneForecastRows = milestones.map((m) => [
  `<b>${m.id}</b>`,
  esc(m.title),
  `<b class="nw">${esc(fmtWeekday(m.likely))}</b>`,
  `<span class="nw">${esc(fmtDay(m.optimistic))} to ${esc(fmtDay(m.pessimistic))}</span>`,
  `<span class="muted">${esc(m.note)}</span>`,
])

const riskRows = [...model.risks]
  .sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact)
  .map((r) => {
    const score = r.likelihood * r.impact
    const tone = score >= 15 ? 'red' : score >= 8 ? 'amber' : 'green'
    return [
      `<b>${r.id}</b>`,
      esc(r.title),
      `${r.likelihood}`,
      `${r.impact}`,
      rag(tone, String(score)),
      esc(r.mitigation),
    ]
  })

const principleRows = model.principles.map((p) => [
  esc(p.title),
  p.rating === 'aligned' ? rag('green', 'Aligned') : rag('amber', 'Partly aligned'),
  esc(p.evidence),
])

const itemRows = phases.flatMap((p) =>
  p.items.map((i, k) => [
    `${p.id}.${k + 1}`,
    esc(i.title) + (i.optional ? ' <span class="muted">(optional)</span>' : ''),
    chip(i.status),
    esc(i.evidence),
  ]),
)

const commitRows = programme.map((c) => [
  esc(fmtDayTime(ms(c.at))),
  sha(c.short.slice(0, 7)),
  esc(c.origin),
  esc(c.type === 'other' ? 'untyped' : c.type),
  esc(c.subject),
  `+${int(c.added)} / -${int(c.deleted)}`,
])

const latestBundleRows = model.bundle.latest.map(
  ([route, jsFiles, js, jsDec, cssFiles, css, cssDec]) => [
    sha(route),
    `${jsFiles}`,
    f1(js),
    f1(jsDec),
    `${cssFiles}`,
    f1(css),
    f1(cssDec),
  ],
)

const fontPath = path.join(
  root,
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
)
const fontFace = fs.existsSync(fontPath)
  ? `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(fontPath).toString('base64')}) format('woff2')}`
  : ''

const css = `${fontFace}
:root{--ink:#1c1917;--ink2:#44403c;--muted:#57534e;--faint:#78716c;--line:#e7e5e4;--soft:#f5f5f4;--brand:#996600;--brand-soft:#fdf3dc}
@page{size:A4;margin:14mm 13mm 15mm}
*{box-sizing:border-box}
html{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:9.4pt;line-height:1.45;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
td.num,.kpi .value,.meta{font-variant-numeric:tabular-nums}
body{margin:0;background:#fff}
main{max-width:184mm;margin:0 auto}
@media screen{body{background:#e9e7e2}main{background:#fff;padding:14mm 13mm;margin:10mm auto;box-shadow:0 1px 3px rgba(0,0,0,.12)}}
h1{font-size:21pt;line-height:1.15;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:14pt;margin:0 0 8px;padding-bottom:4px;border-bottom:2px solid var(--brand);break-after:avoid}
h3{font-size:10.6pt;margin:14px 0 5px;break-after:avoid}
h4{font-size:9.4pt;margin:10px 0 4px;break-after:avoid}
p{margin:0 0 7px}
ul,ol{margin:0 0 8px;padding-left:16px}
li{margin:0 0 3px}
a{color:#7a5200}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:var(--soft);padding:0 3px;border-radius:3px}
section.chapter{margin-top:22px}
section.appendix{break-before:page}
.lede{font-size:10.6pt;color:var(--ink2);margin:0 0 10px}
.muted{color:var(--muted)}
.small{font-size:8pt}
.cover{border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:12px}
.eyebrow{font-size:8pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--brand);margin-bottom:6px}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 14px;margin-top:10px;font-size:8pt}
.meta div b{display:block;color:var(--muted);font-weight:600;font-size:7.2pt;text-transform:uppercase;letter-spacing:.05em}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 12px}
.kpi{border:1px solid var(--line);border-radius:6px;padding:7px 9px;break-inside:avoid}
.kpi .label{font-size:7.2pt;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.kpi .value{font-size:15.5pt;font-weight:700;line-height:1.2;margin:2px 0}
.kpi .value small{font-size:9pt;font-weight:600;color:var(--muted);font-variant-numeric:normal}
.kpi .sub{font-size:7.6pt;color:var(--muted);line-height:1.35}
.kpi.red{border-color:#fca5a5;background:#fef2f2}
.kpi.amber{border-color:#fcd34d;background:#fffbeb}
.rag{display:inline-block;padding:1px 7px;border-radius:99px;font-size:7.4pt;font-weight:700;white-space:nowrap}
.rag.green{background:#dcfce7;color:#14532d}
.rag.amber{background:#fef3c7;color:#78350f}
.rag.red{background:#fee2e2;color:#7f1d1d}
.rag.blue{background:#dbeafe;color:#1e3a8a}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:7.6pt;font-weight:600;white-space:nowrap;color:var(--ink2)}
.chip::before{content:'';width:8px;height:8px;border-radius:2px;background:var(--c)}
table{width:100%;border-collapse:collapse;font-size:8pt;margin:4px 0 10px}
th,td{padding:3px 5px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-weight:600;color:var(--muted);background:var(--soft);font-size:7.4pt;text-transform:uppercase;letter-spacing:.03em}
td.num,th.num{text-align:right;white-space:nowrap}
tr{break-inside:avoid}
table.status td:first-child{width:120px;font-weight:600}
table.compact td,table.compact th{padding:2px 4px;font-size:7.4pt}
table.compact td:first-child{white-space:nowrap}
.stages{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;font-size:7.2pt;color:var(--muted);line-height:1.35;margin-top:4px}
.stages b{color:var(--ink)}
.nw{white-space:nowrap}
figure{margin:8px 0 12px;break-inside:avoid}
figure svg.chart{width:100%;height:auto;display:block}
svg text{font-family:Inter,system-ui,sans-serif}
.fig-title{font-size:8.6pt;margin:0 0 4px;color:var(--ink)}
.fig-note{font-size:7.6pt;color:var(--muted);margin-top:4px;line-height:1.4}
.legend{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:7.4pt;color:var(--muted);margin-top:4px}
.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
.two>figure{margin-top:0}
.callout{border-left:3px solid var(--brand);background:#fdf8ec;padding:6px 10px;margin:8px 0 10px;break-inside:avoid}
.callout.red{border-color:#b91c1c;background:#fef2f2}
.callout p:last-child,.callout ul:last-child{margin-bottom:0}
.bulletrow{display:grid;grid-template-columns:150px 170px 1fr;gap:8px;align-items:center;font-size:8pt;padding:3px 0;border-bottom:1px solid var(--line)}
.bulletrow svg{display:block}
.toc{columns:2;font-size:8.4pt;margin:6px 0 0;padding-left:16px}
.keep{break-inside:avoid}
`

const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} · ${esc(fmtLong(dayStart(reportDay) + HOUR))}</title>
<style>${css}</style>
</head>
<body>
<main>

<header class="cover">
  <div class="eyebrow">PoCMS · ${esc(meta.repo)}</div>
  <h1>Development progress report</h1>
  <p class="lede">${esc(meta.subtitle)}</p>
  <div class="meta">
    <div><b>Reporting date</b>${esc(fmtLong(dayStart(reportDay) + HOUR))}</div>
    <div><b>Period</b>1 to ${esc(fmtDay(dayStart(reportDay)))} 2026</div>
    <div><b>Branch and commit</b><code>${esc(meta.branch.replace('arena/', ''))}</code> at <code>${esc(head)}</code></div>
    <div><b>Time zone</b>${esc(meta.timeZoneLabel)}</div>
    <div><b>Sources</b>git history (${commits.length} commits), GitHub Actions (${retained.length} retained runs), repository docs, measurements taken for this report</div>
    <div><b>Effort unit</b>Ideal engineer-days for one senior engineer, as in the roadmap</div>
    <div><b>Prepared by</b>Arena agent (the programme's implementer), for the project owner</div>
    <div><b>Status</b>Measured facts, with estimates and forecasts labelled as such</div>
  </div>
</header>

<h2>Executive summary</h2>
<div class="kpis">
  ${kpi('Effort delivered', `${f1(totalEv)} <small>eng-days</small>`, `in ${activeDays} active days (${fmtDay(programmeStart)} to ${fmtDay(programmeEnd)}); ${f1(firstDay.total)} on day one, median ${f1(rate.mid)} per day since`)}
  ${kpi('Roadmap P0–P6', pct(roadmapEv / roadmapPlanned), `${doneItems + changedItems} of ${allItems.length} items delivered, ${partialItems} partial, ${openItems} not started, ${deferredItems} deferred`)}
  ${kpi('Current iteration CR-12', `${cr12Done.length}/${cr12Items.length} <small>items</small>`, `${f1(cr12Ev)} of ${f1(cr12Total)} eng-days (${pct(cr12Ev / cr12Total)}); planned work idle for ${Math.round(hoursSinceLastPlanned)} h`, 'amber')}
  ${kpi('Commits', `${programme.length} <small>of ${commits.length}</small>`, `${agentCommits.length} by the agent, ${programme.length - agentCommits.length} by the owner since ${fmtDay(ms(baselineCommit.at))}; +${kLines(authoredAdded)} / -${kLines(authoredDeleted)} authored lines`)}
  ${kpi('Tests', `${runtimeTests.int + runtimeTests.e2e}`, `${runtimeTests.int} integration and ${runtimeTests.e2e} end-to-end tests run today (${runtimeTests.visual} visual on demand); baseline had ${firstTests.int} and ${firstTests.e2e} declared`)}
  ${kpi('CI pipeline', 'Red', `since the revert on 19 Oct (prefix check); last green run ${ciLatestSuccess ? `${sha(ciLatestSuccess.sha)} ${esc(fmtDayTime(ms(ciLatestSuccess.started)))}` : 'n/a'}`, 'red')}
  ${kpi('Admin bundle', `+${f1(jsUsed)} <small>kB JS</small>`, `${pct(jsUsed / budgetNow.js)} of the +${budgetNow.js} kB budget; CSS +${f1(cssUsed)} kB (${pct(cssUsed / budgetNow.css)} of +${budgetNow.css}); measured today`)}
  ${kpi('Forecast', esc(fmtDay(plans.likely.E8.end)), `CR-12 complete, likely case (${esc(fmtDay(plans.optimistic.E8.end))} to ${esc(fmtDay(plans.pessimistic.E8.end))}), if daily sessions resume on ${esc(fmtDay(nextSession))}`)}
</div>

<table class="status">
<thead><tr><th>Dimension</th><th>Status</th><th>Assessment</th></tr></thead>
<tbody>
<tr><td>Scope</td><td>${rag('green', 'On track')}</td><td>The approved roadmap (P0–P6) is ${pct(roadmapEv / roadmapPlanned)} delivered by effort: ${doneItems + changedItems} of ${allItems.length} items done, ${partialItems} partial, ${openItems} not started. On top, the owner asked for the frontier-UI port and 15 change requests (three of them fixes); scope grew from ${f1(scopeLine[0][1])} to ${f1(scopeLine.at(-1)[1])} engineer-days.</td></tr>
<tr><td>Schedule</td><td>${rag('green', 'Ahead of plan')}</td><td>The roadmap planned 35–52 working days from ${esc(fmtDay(planStartDate))} (finishing between ${esc(fmtDay(lastWorkday(planEndLo)))} and ${esc(fmtDay(lastWorkday(planEndHi)))}). All seven phases landed on ${esc(fmtDay(deliverables.find((d) => d.id === 'P6').end))}, before the planned start: about ${Math.round(weeksAhead)} weeks ahead of the upper-bound plan end.</td></tr>
<tr><td>Momentum</td><td>${rag('amber', 'Slowing')}</td><td>No planned item has landed since ${esc(fmtDayTime(lastPlanned))} (${Math.round(hoursSinceLastPlanned)} h). The two sessions since then went to unplanned work: the Vercel build fix, its revert at the owner’s request, and the Page speed fix (${f1(unplannedEv)} engineer-days, ${f1(deliverables.find((d) => d.id === 'CR-13').estimate)} of it reverted).</td></tr>
<tr><td>Quality</td><td>${rag('red', 'At risk')}</td><td>CI fails at the Tailwind prefix check since the revert, so integration and end-to-end tests don’t run in CI. Locally all ${runtimeTests.int} integration tests pass; the dashboard, gallery and roles e2e suites pass, and the responsive suite fails on the overflow that the reverted fix <code>1238587</code> addressed. Failed CI runs are deleted from GitHub, so a pass rate can’t be computed.</td></tr>
<tr><td>Performance</td><td>${rag('green', 'Within budget')}</td><td><code>/admin</code> ships ${f1(bundleNow.js)} kB JS and ${f1(bundleNow.css)} kB CSS (compressed), measured today on a production build: ${pct(jsUsed / budgetNow.js)} and ${pct(cssUsed / budgetNow.css)} of the budgets. Two heavy builds were caught and rebuilt before they stayed: the first P5 build (899.5 kB, over budget) and the Recharts chart (787.2 kB, 95% of the budget).</td></tr>
<tr><td>Risk</td><td>${rag('amber', 'Elevated')}</td><td>Highest risks: red CI (R1), no database migrations for production (R2), Preview builds without secrets (R3). Each has a concrete mitigation and two need an owner action.</td></tr>
</tbody>
</table>

<h3>Key messages</h3>
<ol>
<li><b>Delivered.</b> In ${activeDays} active days the programme turned a stock, unbranded Payload admin into a themed, role-aware admin with a widget dashboard, TanStack lists, developer tools, a component gallery and four live integrations, documented in ${adrCount} ADRs and a guide.</li>
<li><b>Velocity.</b> Measured with the roadmap’s own estimates, ${f1(totalEv)} engineer-days of scope landed: ${f1(firstDay.total)} on ${esc(fmtDay(dayStart(firstDay.day)))} (analysis and P0–P6), then ${crDays.map((d) => f1(d.total)).join(', ')} per day on change requests (median ${f1(rate.mid)}). This compares scope against human-effort estimates; it is not a measure of hours worked.</li>
<li><b>Momentum.</b> Throughput is high but the last ${Math.round(hoursSinceLastPlanned)} hours produced no planned scope. Rework is low over the whole programme (${pct(unplannedEv / (totalEv + deliverables.find((d) => d.id === 'CR-13').estimate))} of effort) but concentrated on 19 Oct.</li>
<li><b>Outlook.</b> ${f1(cr12Remaining)} engineer-days remain in CR-12 (Jobs, Audit log, System page, Terminal, close-out), plus a ${f1(backlog.find((b) => b.id === 'MIG').estimate)}-day migration baseline that the new collections need. Likely completion ${esc(fmtWeekday(plans.likely.E8.end))} (range ${esc(fmtDay(plans.optimistic.E8.end))} to ${esc(fmtDay(plans.pessimistic.E8.end))}), gated by two owner actions.</li>
<li><b>Alignment.</b> The work follows four of the roadmap’s six principles fully and two partly (accessibility: no screen-reader pass and gates off while CI is red; Payload 4 portability: more custom views to re-check). ${gaps.length} roadmap items are partial or not started (${f1(roadmapRemaining)} engineer-days).</li>
</ol>

<div class="callout red">
<p><b>Decisions needed from the owner</b></p>
<ul>
<li><b>DEC</b>: re-apply the two CI fixes (<code>2b7cde3</code>, <code>1238587</code>) without the reverted build change, so CI runs the test suites again.</li>
<li><b>ENV</b>: set PAYLOAD_SECRET and POSTGRES_URL for Vercel Preview, GOOGLE_API_KEY (both Google APIs enabled), VERCEL_TOKEN / VERCEL_PROJECT_ID, and CRON_SECRET for the jobs.</li>
<li><b>MIG</b>: approve a baseline database migration and a <code>payload migrate</code> step before Jobs and Audit log add collections.</li>
<li>Confirm the Terminal page scope (development only, allow-listed scripts), and keep failed CI runs from now on so quality can be measured.</li>
</ul>
</div>

<h4>Contents</h4>
<ol class="toc">
<li>Retrospective: timeline, milestones, plan vs actual, velocity and momentum, engineering health</li>
<li>Prospective: current iteration, backlog and estimates, dependencies, forecast schedule</li>
<li>Strategic alignment: roadmap position, principles, guardrails, risks, trajectory</li>
<li>Appendix: method, roadmap item status, latest bundle measurement, commit register</li>
</ol>

<section class="chapter">
<h2>1. Retrospective</h2>
<p>The repository started on ${esc(fmtDay(ms(commits[0].at)))} with the owner’s foundation work: content model, seed data, analytics, GraphQL, the public site and email (${foundation.length} commits to ${esc(fmtDay(ms(baselineCommit.at)))}). The admin modernisation programme began with the analysis committed on ${esc(fmtDayTime(programmeStart))} and ran in ${sessions.length} working sessions to ${esc(fmtDayTime(programmeEnd))}.</p>

${figure(
  1,
  'Project timeline, 1 to 20 October (day resolution)',
  fig1,
  'Bars span the calendar days with commits. The hatched bar is the likely forecast for the rest of CR-12. Days are counted in Asia/Tehran time.',
  legend([
    [SOURCES.foundation.label, SOURCES.foundation.color],
    [SOURCES.roadmap.label, SOURCES.roadmap.color],
    [SOURCES.request.label, SOURCES.request.color],
    [SOURCES.unplanned.label, SOURCES.unplanned.color],
    ['Forecast', '#eff6ff', 'border:1px dashed #2563eb'],
  ]),
)}

<h3>1.1 Milestones and technical work</h3>
${figure(
  2,
  'Programme timeline by hour, 16 to 20 October',
  fig2,
  'Bars run from a deliverable’s first to its last commit; diamonds mark deliverables whose commits landed within 25 minutes; the hatched entry was reverted. Shaded columns are working sessions (agent commits less than 90 minutes apart). The right column of the label area is the landing time.',
  legend([
    [SOURCES.plan.label, SOURCES.plan.color],
    [SOURCES.roadmap.label, SOURCES.roadmap.color],
    [SOURCES.request.label, SOURCES.request.color],
    [SOURCES.unplanned.label, SOURCES.unplanned.color],
    [SOURCES.owner.label, SOURCES.owner.color],
    ['Working session', '#f3f1ec'],
  ]),
)}

<p class="small muted">Commit times record when work was committed, not how long it took: a phase whose commits span 30 minutes may rest on hours of preparation. Durations here are therefore lower bounds of elapsed time, not effort.</p>

${table(['ID', 'Milestone and technical work', 'Landed', '#Commits', '#Lines (authored)', '#Effort (d)'], milestoneRows, 'compact')}
<p class="small muted">Effort is the estimate in ideal engineer-days. Roadmap phases show the plan midpoint scaled by item completion (“of” gives the planned figure); CR-12 shows the seven finished items; the reverted build fix counts zero. Lines exclude generated files and lockfiles; renames count only changed lines.</p>

<h4>Working sessions</h4>
${table(['#', 'Window (local time)', '#Commits', 'Completed'], sessionRows, 'compact')}

<h3>1.2 Plan against actual</h3>
<p>The roadmap estimated P0–P6 at 35–52 working days for one senior engineer, starting in the week of ${esc(fmtDay(planStartDate))}. All seven phases landed between ${esc(fmtTime(deliverables.find((d) => d.id === 'P0').start))} and ${esc(fmtTime(deliverables.find((d) => d.id === 'P6').end))} on ${esc(fmtDay(deliverables.find((d) => d.id === 'P0').start))}, three days before the planned start. Scope coverage is the honest measure of that delivery: ${doneItems} items are done as planned, ${changedItems} were done differently for a stated reason, ${partialItems} are partial and ${openItems} not started; the optional upgrade to 3.91 was not taken (the admin runs on 3.90.2).</p>
${figure(
  3,
  'Roadmap P0–P6: planned schedule against actual delivery',
  fig3,
  `Planned schedule from the roadmap (§9.1): sequential phases from 19 October, weekends excluded, at the lower (dark) and upper (light) estimates, ending ${esc(fmtDay(lastWorkday(planEndLo)))} or ${esc(fmtDay(lastWorkday(planEndHi)))}. Diamonds: actual delivery.`,
  legend([
    ['Plan, lower estimate', '#a8a29e'],
    ['Plan, upper estimate', '#d6d3d1'],
    ['Actual delivery', '#996600'],
  ]),
)}
${figure(4, 'Roadmap items by status and phase', fig4, `Counts of the ${allItems.length} planned items. The percentage is the effort-weighted completion of the non-optional items (done or changed = 1, partial = 0.5) against the phase’s planned midpoint: ${f1(roadmapEv)} of ${f1(roadmapPlanned)} engineer-days overall.`, legend(['done', 'changed', 'partial', 'open', 'deferred'].map((s) => [STATUS[s].label, STATUS[s].color])))}
<h4>Open roadmap items</h4>
${table(['Phase', 'Item', 'Status', 'Evidence'], gapRows, 'compact')}

<h3>1.3 Velocity and momentum</h3>
<p>Velocity is measured as estimated effort delivered per calendar day, using the roadmap’s unit so planned and requested work are comparable. Day one carries the pre-analysed roadmap (${f1(firstDay.total)} engineer-days). From ${esc(fmtDay(dayStart(crDays[0].day)))}, when the work became owner-driven change requests, daily velocity was ${crDays.map((d) => `${f1(d.total)} (${esc(fmtDay(dayStart(d.day)))})`).join(', ')}: median ${f1(rate.mid)}, total ${f1(crPhaseEv)}. These three days are the basis of the forecasts.</p>
${figure(5, 'Velocity: estimated effort delivered per day', fig5, `Each deliverable counts on the day of its last commit. ${esc(fmtDay(dayStart(reportDay)))} is the report day (no code). On ${esc(fmtDay(dayStart('2026-10-19')))} ${f1(v['2026-10-19']?.unplanned ?? 0)} of ${f1(v['2026-10-19']?.total ?? 0)} engineer-days were unplanned; the reverted build fix (${f1(deliverables.find((d) => d.id === 'CR-13').estimate)}) is not counted.`, legend(['plan', 'roadmap', 'request', 'unplanned'].map((s) => [SOURCES[s].label, SOURCES[s].color])))}
${figure(
  6,
  'Burn-up: scope and delivered effort',
  fig6,
  `Scope starts with the analysis, the roadmap midpoint and decision D8 (${f1(scopeLine[0][1])} engineer-days) and grows with each change request, CR-12 adding ${f1(cr12Total)} at once. The gap at the right edge (${f1(scopeLine.at(-1)[1] - doneLine.at(-1)[1])}) is the open CR-12 work (${f1(cr12Remaining)}) plus the partial and open roadmap items (${f1(roadmapRemaining)}).`,
  legend([
    ['Scope', '#57534e'],
    ['Delivered', '#996600'],
  ]),
)}
<div class="callout">
<p><b>Momentum reading.</b> Throughput rose again on ${esc(fmtDay(dayStart('2026-10-19')))} (${f1(v['2026-10-19']?.total ?? 0)} engineer-days), but all of its planned work (${f1((v['2026-10-19']?.total ?? 0) - (v['2026-10-19']?.unplanned ?? 0))}) landed before ${esc(fmtTime(lastPlanned))}. The next two sessions handled a production build failure, the owner’s request to undo that fix, and a Page speed widget that did not work for the owner (fixed ${esc(fmtDayTime(cr15.end))}, about ${Math.round((cr15.end - cr12Items.find((i) => i.id === 'E2').at) / HOUR)} h after it shipped). The pattern is a loss of flow on integration and deployment issues, not a drop in delivery capacity; restoring green CI and setting the Vercel variables removes its two causes.</p>
</div>
<div class="keep">
${figure('7a', 'Commits per day by type, 1 to 20 October', fig7a, '', legend(TYPE_GROUPS.map(([label, color]) => [label, color])))}
${figure(
  '7b',
  'Authored lines added (up) and deleted (down) per day',
  fig7b,
  `Generated files, lockfiles and binaries excluded; bars above ${int(churnCap)} lines are cut and labelled. The ${esc(fmtDay(dayStart('2026-10-09')))} spike is the owner’s import of the public site; ${esc(fmtDay(dayStart('2026-10-16')))} is the roadmap.`,
  legend([
    ['Added', '#996600'],
    ['Deleted', '#d6d3d1'],
  ]),
)}
</div>

<h3>1.4 Engineering health</h3>
<div class="two">
${figure(
  8,
  'Test declarations over the programme',
  fig8,
  `Static count of <code>test()</code>/<code>it()</code> declarations per commit. At run time the suites hold ${runtimeTests.int} integration tests in ${runtimeTests.intFiles} files and ${runtimeTests.e2e} end-to-end tests in ${runtimeTests.e2eFiles} files (some are generated in loops), plus ${runtimeTests.visual} visual tests.`,
  legend([
    ['Integration', '#0f766e'],
    ['End-to-end', '#2563eb'],
  ]),
)}
${figure(
  9,
  'CI runs by run number',
  fig9,
  `${retained.length} runs are retained, all successful (${f1(ciFirst?.minutes ?? 0)} min at run ${ciFirst?.number ?? '?'}, ${f1(Math.max(...retained.map((r) => r.minutes)))} min at the longest). Red columns are run numbers up to #${maxRunNumber} that no longer exist (${maxRunNumber - retained.length}), plus about three later runs; failed and cancelled runs were deleted. The last observed run (${sha(model.ciNotes.lastObserved.sha)}) failed at the prefix check.`,
  legend([
    ['Lint, types, int tests', '#996600'],
    ['Build and e2e', '#2563eb'],
    ['Deleted run', '#fee2e2'],
  ]),
)}
</div>
<div class="two">
${figure('10a', 'JavaScript on /admin against the budget', fig10a, '', '')}
${figure('10b', 'CSS on /admin against the budget', fig10b, '', '')}
</div>
<p class="fig-note" style="margin-top:-6px">Compressed transfer size on a production build, logged in as an administrator (<code>scripts/measure-admin-bundle.mjs</code>). The budget was +${model.bundle.budgets[0].js} kB JS / +${model.bundle.budgets[0].css} kB CSS over the P0 baseline until the owner raised it to +${budgetNow.js} / +${budgetNow.css} on ${esc(fmtDay(ms(model.bundle.budgets[1].from)))}. Hollow red points were measured and rebuilt before they stayed: the first P5 build (899.5 kB, over the budget of the time) and the Recharts chart (787.2 kB, inside the raised budget but using 95% of it). Today’s point was measured for this report at <code>${esc(head)}</code>.</p>
${figure(11, 'Lines of code by area: 12 October baseline and today', fig11, `Text lines in tracked files at <code>${esc(meta.baseline)}</code> (grey) and <code>${esc(head)}</code> (growth in colour), generated files excluded (${kLines(sizeBaseline.generated?.lines ?? 0)} to ${kLines(sizeHead.generated?.lines ?? 0)} lines). Authored code grew from ${kLines(authoredSize(sizeBaseline))} to ${kLines(authoredSize(sizeHead))} lines; the admin from ${int(sizeBaseline.admin?.lines ?? 0)} to ${int(sizeHead.admin?.lines ?? 0)}.`)}
<div class="two">
${figure(12, 'Authored lines changed by area, programme', fig12, 'Added (colour) and deleted (grey) lines since the baseline, generated files excluded.')}
${figure('12b', 'Programme commits by type', fig12b, `${typeCounts.feat ?? 0} feature commits of ${programme.length}; untyped commits are the owner’s.`)}
</div>
</section>

<section class="chapter">
<h2>2. Prospective planning</h2>
<p>The open work is the second half of CR-12 (admin tools E4–E7 and the close-out), two owner actions that unblock it, one enabling task found while preparing this report (database migrations), and the next horizons. Estimates are in ideal engineer-days; calendar dates follow from the observed velocity and assume daily sessions from ${esc(fmtWeekday(nextSession))}.</p>

<h3>2.1 Current iteration: CR-12</h3>
${figure(
  13,
  'CR-12 burn-down with forecast',
  fig13,
  `Actual: remaining effort after each finished item (A to E3 on ${esc(fmtDay(dayStart('2026-10-19')))}). Forecasts start at the next session and use the highest (${f1(rate.high)}), median (${f1(rate.mid)}) and lowest (${f1(rate.low)}) observed daily velocity; the pessimistic case also waits one day for the owner decisions.`,
  legend([
    ['Actual', '#2563eb'],
    ['Optimistic', '#15803d'],
    ['Likely', '#996600'],
    ['Pessimistic', '#b91c1c'],
    ['Scope added (MIG)', '#b91c1c'],
  ]),
)}
${table(
  ['Item', 'Scope', '#Estimate (d)', 'Status'],
  cr12Items.map((i) => [
    `<b>${i.id}</b>`,
    esc(i.title),
    f1(i.estimate),
    i.at
      ? `${chip('done')} <span class="muted">${esc(fmtTime(i.at))}, ${i.also ? `${sha(i.also)} ` : ''}${sha(i.commit)}</span>`
      : chip('open'),
  ]),
  'compact',
)}

<h3>2.2 Backlog, estimates and scheduled deliverables</h3>
${table(['ID', 'Task', '#Est. (d)', 'Depends on', 'Likely finish'], backlogRows, 'compact')}
<p class="small muted">Likely finish: median velocity from ${esc(fmtDay(nextSession))}; second line: optimistic to pessimistic. Owner steps are assumed to take up to half a day and run alongside engineering. P7 waits for a stable Payload 4.</p>

<h3>2.3 Dependencies</h3>
${figure(
  14,
  'Dependencies of the remaining work',
  fig14,
  'Arrows point from a prerequisite to the work it enables. The amber path is the critical path to closing CR-12: the CI decision, the migration baseline, the jobs queue (which the Page speed history and the later scheduled publishing both need), then the close-out.',
  legend([
    ['Owner action', '#fef3c7', 'border:1px solid #d97706'],
    ['Engineering task', '#eff6ff', 'border:1px solid #93c5fd'],
    ['Later horizon', '#f5f5f4', 'border:1px solid #a8a29e'],
    ['Milestone', '#996600'],
    ['External', '#fff', 'border:1px dashed #a8a29e'],
  ]),
)}
<ul class="small">
<li><b>Jobs before scheduling.</b> Payload’s scheduled publish creates jobs and never runs without a job runner [1], so E4 is also a prerequisite of the content release. On Vercel the runner is a cron call to Payload’s jobs endpoints, protected by CRON_SECRET; on the Hobby plan each cron job runs at most once a day, within the hour [2], which suits daily and weekly maintenance.</li>
<li><b>Migrations before new collections.</b> There is no <code>src/migrations</code>; production receives schema changes only through a development-mode push. Roles, trash and dashboard changes already depend on it, and E4/E5 add collections.</li>
<li><b>Terminal after System page.</b> Both need the same environment detection and capability gating; the Terminal also needs a short security review.</li>
<li><b>Payload 4 after quality gates.</b> The visual-regression suite in CI is the safety net for the token re-mapping in P7.</li>
</ul>

<h3>2.4 Forecast schedule</h3>
${figure(
  15,
  'Forecast schedule (likely case, with range)',
  fig15,
  'Coloured bars: likely schedule. Grey whiskers: from the optimistic start to the pessimistic finish. Diamonds: milestones at their likely date, the amber band shows their range.',
  legend([
    ['Owner action', '#d97706'],
    ['CR-12 work', '#2563eb'],
    ['Next horizons', '#7c3aed'],
    ['Milestone range', '#fde68a'],
    ['Gated', '#fafaf9', 'border:1px dashed #a8a29e'],
  ]),
)}
${table(['ID', 'Scheduled deliverable', 'Likely', 'Range', 'Basis'], milestoneForecastRows, 'compact')}
<div class="callout">
<p><b>Forecast assumptions.</b> Sessions continue daily, as on 16–19 October, and the remaining items resemble the CR phase in size and risk. Velocity is measured on only three days, so the range is wide and should be re-based after the next session. Owner availability for the two decisions is the largest single factor; each day of delay moves every date by a day.</p>
</div>
</section>

<section class="chapter">
<h2>3. Strategic alignment</h2>
<p>The long-term roadmap runs from the foundation through the P0–P6 modernisation to operations tooling, hardening, content capabilities and finally Payload 4 (P7, after v4 is stable). The programme sits in horizon H3: operations and governance, ${pct(cr12Ev / cr12Total)} of its estimated effort done.</p>
${figure(
  16,
  'Long-term roadmap and current position',
  fig16,
  'H0–H2 are complete. H3 is in progress (CR-12). H4–H6 are planned; H6 depends on the Payload 4 release.',
  legend([
    ['Complete', '#dcfce7', 'border:1px solid #86efac'],
    ['Current', '#fdf3dc', 'border:1px solid #996600'],
    ['Next', '#eff6ff', 'border:1px solid #93c5fd'],
    ['Later', '#fafaf9', 'border:1px dashed #d6d3d1'],
  ]),
)}
${figure(17, 'Remaining estimated effort by horizon', fig17, `About ${f1(sum(remainingByHorizon.flatMap((h) => h.parts.map((p) => p[1]))))} engineer-days remain across H3–H6, roughly ${f1(sum(remainingByHorizon.flatMap((h) => h.parts.map((p) => p[1]))) / rate.mid)} active days at the median velocity; H6 cannot start before Payload 4 is stable.`)}

<h3>3.1 Alignment with the roadmap’s guiding principles</h3>
${table(['Principle (§8.1)', 'Rating', 'Evidence'], principleRows, 'compact')}

<h3>3.2 Guardrails</h3>
<div class="keep">
<div class="bulletrow"><b>Admin JS budget</b>${bullet({ width: 170, value: jsUsed, max: budgetNow.js, color: '#996600' })}<span>+${f1(jsUsed)} of +${budgetNow.js} kB (${pct(jsUsed / budgetNow.js)}); ${f1(budgetNow.js - jsUsed)} kB of headroom for E4–E7 and beyond</span></div>
<div class="bulletrow"><b>Admin CSS budget</b>${bullet({ width: 170, value: cssUsed, max: budgetNow.css, color: '#996600' })}<span>+${f1(cssUsed)} of +${budgetNow.css} kB (${pct(cssUsed / budgetNow.css)}); grows about 1 kB per feature set</span></div>
<div class="bulletrow"><b>Roadmap effort delivered</b>${bullet({ width: 170, value: roadmapEv, max: roadmapPlanned, color: '#15803d' })}<span>${f1(roadmapEv)} of ${f1(roadmapPlanned)} engineer-days (${pct(roadmapEv / roadmapPlanned)})</span></div>
<div class="bulletrow"><b>CR-12 effort delivered</b>${bullet({ width: 170, value: cr12Ev, max: cr12Total, color: '#2563eb' })}<span>${f1(cr12Ev)} of ${f1(cr12Total)} engineer-days (${pct(cr12Ev / cr12Total)})</span></div>
<div class="bulletrow"><b>CI duration</b>${bullet({ width: 170, value: ciLast?.minutes ?? 0, max: 10, color: '#57534e', marker: ciFirst?.minutes })}<span>${f1(ciLast?.minutes ?? 0)} min at the last retained run against ${f1(ciFirst?.minutes ?? 0)} min at run ${ciFirst?.number ?? '?'} (marker), as the suites grew; well inside the 20 / 30 min job limits</span></div>
<div class="bulletrow"><b>Quality gates in CI</b>${bullet({ width: 170, value: 8, max: 11, color: '#b91c1c' })}<span>8 of 11 gates are in CI: lint, types, generated files, contrast, prefix, integration tests, build, e2e with axe. Missing: visual suite and bundle budget (planned in P6), a migration check (recommended here). While CI is red, nothing after the prefix check runs.</span></div>
</div>

<h3>3.3 Risks</h3>
<div class="two" style="grid-template-columns:230px 1fr">
<figure>${fig18}<figcaption class="fig-note">Likelihood and impact on a 1–5 scale; score = product.</figcaption></figure>
${table(['ID', 'Risk', '#L', '#I', 'Score', 'Mitigation'], riskRows, 'compact')}
</div>

<h3>3.4 Trajectory</h3>
<p>Measured against the original plan, the project is far ahead: everything estimated at 35–52 engineer-days is in place, the owner has added and received about ${f1(sum(work.filter((d) => d.source === 'request').map((d) => d.ev)))} engineer-days of further scope, and the admin stays inside its performance budget with room to spare. Against its own recent pace the trajectory has flattened: delivery of planned scope paused while integration and deployment problems were handled, and the safety net (CI) is off.</p>
<p>The path back to full speed is short and concrete: the CI decision and the Vercel variables (owner), the migration baseline, then the jobs queue that unlocks three later features. On the median velocity CR-12 closes ${esc(fmtWeekday(plans.likely.E8.end))}, hardening ${esc(fmtWeekday(plans.likely.QA.end))}, and the content release ${esc(fmtWeekday(plans.likely.CNT.end))}. Payload 4 remains the one item outside the project’s control; the readiness checklist and a visual suite in CI keep that migration a contained step when it comes.</p>
</section>

<section class="appendix">
<h2>Appendix</h2>
<h3>A. Method and definitions</h3>
<ul class="small">
<li><b>Commits and lines</b> come from <code>git log -M --numstat</code> on <code>${esc(meta.branch)}</code> at <code>${esc(head)}</code>. Authored lines exclude generated files (<code>pnpm-lock.yaml</code>, <code>schema.graphql</code>, <code>payload-types.ts</code>, <code>payload-generated-schema.ts</code>, <code>importMap.js</code>, <code>nav-icons.css</code>), lockfiles and binaries. Renames count only changed lines. Areas are assigned by path (see <code>scripts/progress-report/collect.mjs</code>).</li>
<li><b>Time</b>: commits are placed at their committer time and bucketed into calendar days in ${esc(meta.timeZoneLabel)}. Agent commits carry UTC timestamps, the owner’s +03:30; the report uses the same zone for both.</li>
<li><b>Origin</b>: commits with UTC author and committer times are the agent’s; the rest are the owner’s (all commits use the owner’s git identity).</li>
<li><b>Effort and velocity</b>: ideal engineer-days for one senior engineer. Roadmap phases use the midpoint of the plan’s range, scaled by the completion of their non-optional items (done or changed = 1, partial = 0.5, not started = 0). Other deliverables carry the author’s estimate on the same scale (milestone table in §1.1). These estimates are the implementer’s own and have not been reviewed independently. Velocity is effort delivered per calendar day; it measures scope against human-effort estimates, not time spent.</li>
<li><b>Forecasts</b> schedule the backlog sequentially in dependency order at the highest, median and lowest observed daily velocity since 17 October, starting ${esc(fmtDay(nextSession))}; the pessimistic case adds one day for owner decisions. They are estimates, not commitments.</li>
<li><b>Tests</b>: per-commit counts are static declarations (<code>git grep</code> for <code>test(</code> / <code>it(</code> under <code>tests/</code>); today’s run-time counts come from the test runners (<code>vitest</code>, <code>playwright test --list</code>).</li>
<li><b>CI</b>: GitHub keeps ${retained.length} runs for this branch, all successful. Run numbers show that ${maxRunNumber - retained.length} runs up to #${maxRunNumber} and about three later ones were deleted, so no pass rate is reported. The current red state is from the last observed run.</li>
<li><b>Bundle</b>: compressed transfer sizes from <code>scripts/measure-admin-bundle.mjs</code> against a production build; history from <code>docs/ui-modernization/perf-budget.md</code>, today’s values measured for this report.</li>
</ul>
<h3>B. Reproducing this report</h3>
<p class="small"><code>node scripts/progress-report/build.mjs --pdf</code> regenerates the HTML, the PDF and <code>${esc(path.basename(dataFile))}</code> from git, <code>gh</code> and <code>scripts/progress-report/model.mjs</code> (plan, statuses, estimates, backlog, risks). Every number in the report is in the JSON file.</p>

<h3>C. Roadmap item status (${allItems.length} items)</h3>
${table(['#', 'Item', 'Status', 'Evidence'], itemRows, 'compact')}

<h3>D. Latest bundle measurement (${esc(head)}, ${esc(fmtDay(dayStart(reportDay)))})</h3>
${table(['Route', '#JS files', '#JS kB', '#JS decoded', '#CSS files', '#CSS kB', '#CSS decoded'], latestBundleRows, 'compact')}

<h3>E. Commit register: programme (${programme.length} commits)</h3>
${table(['Landed (local)', 'Commit', 'Origin', 'Type', 'Subject', '#Lines'], commitRows, 'compact')}

<h3>F. External references</h3>
<ol class="small">
<li>Payload CMS, Drafts: scheduled publish needs a job runner. <a href="https://payloadcms.com/docs/versions/drafts">payloadcms.com/docs/versions/drafts</a></li>
<li>Vercel, Usage and pricing for cron jobs: Hobby allows 100 cron jobs per project, each at most once per day, with per-hour precision. <a href="https://vercel.com/docs/cron-jobs/usage-and-pricing">vercel.com/docs/cron-jobs/usage-and-pricing</a></li>
<li>Roadmap baseline: <code>docs/ui-modernization/shadcn-payload-ui-analysis.md</code> §8.1 (principles), §9 (phases, estimates, schedule). Bundle history: <code>docs/ui-modernization/perf-budget.md</code>. Tools plan: <code>docs/ui-modernization/dashboard-integrations.md</code>.</li>
</ol>
</section>

</main>
</body>
</html>
`

// ---------------------------------------------------------------------------------------------
// Write the outputs
// ---------------------------------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true })
const data = {
  generatedFrom: {
    repo: meta.repo,
    branch: meta.branch,
    head,
    reportDate: meta.reportDate,
    timeZone: meta.timeZone,
    measuredAt: meta.measuredAt,
  },
  commits: {
    total: commits.length,
    programme: programme.length,
    agent: agentCommits.length,
    foundation: foundation.length,
    authoredAdded,
    authoredDeleted,
    byType: typeCounts,
  },
  areas: { programme: programmeAreas, sizeBaseline, sizeHead },
  roadmap: {
    plannedMidpoint: roadmapPlanned,
    earned: roadmapEv,
    remaining: roadmapRemaining,
    counts: {
      done: doneItems,
      changed: changedItems,
      partial: partialItems,
      open: openItems,
      deferred: deferredItems,
    },
    phases: phases.map(({ id, name, min, max, mid, completion, ev, items }) => ({
      id,
      name,
      min,
      max,
      mid,
      completion,
      ev,
      items,
    })),
  },
  deliverables: work.map(
    ({ id, title, source, start, end, estimate, ev, added, deleted, cs, reverted }) => ({
      id,
      title,
      source,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      commits: cs.map((c) => c.short.slice(0, 7)),
      estimate,
      earned: ev,
      added,
      deleted,
      reverted: Boolean(reverted),
    }),
  ),
  velocity: velocity.map((x) => ({ ...x, total: r1(x.total) })),
  rates: rate,
  sessions: sessions.map((s) => ({
    start: new Date(s.start).toISOString(),
    end: new Date(s.end).toISOString(),
    commits: s.commits.length,
    delivered: s.delivered,
  })),
  burnUp: {
    scope: scopeLine.map(([t, y]) => [new Date(t).toISOString(), y]),
    delivered: doneLine.map(([t, y]) => [new Date(t).toISOString(), y]),
  },
  cr12: {
    total: cr12Total,
    earned: cr12Ev,
    remaining: cr12Remaining,
    items: cr12Items.map((i) => ({ ...i, at: i.at ? new Date(i.at).toISOString() : null })),
  },
  forecast: {
    nextSession: meta.nextSession,
    plans: Object.fromEntries(
      Object.entries(plans).map(([k, p]) => [
        k,
        Object.fromEntries(
          Object.entries(p).map(([id, w]) => [
            id,
            { start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() },
          ]),
        ),
      ]),
    ),
    milestones: milestones.map(({ id, title, likely, optimistic, pessimistic }) => ({
      id,
      title,
      likely: new Date(likely).toISOString(),
      optimistic: new Date(optimistic).toISOString(),
      pessimistic: new Date(pessimistic).toISOString(),
    })),
  },
  tests: { series: testSeries, runtime: runtimeTests },
  ci: {
    retained: retained.length,
    maxRunNumber,
    runs: ciRuns,
    lastObserved: model.ciNotes.lastObserved,
  },
  bundle: model.bundle,
  risks: model.risks,
}
fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 1)}\n`)
const htmlFile = path.join(outDir, `${stem}.html`)
fs.writeFileSync(htmlFile, html)
console.log(`Wrote ${path.relative(root, htmlFile)} and ${path.relative(root, dataFile)}`)

if (args.has('--pdf')) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.goto(`file://${htmlFile}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const pdfFile = path.join(outDir, `${stem}.pdf`)
  await page.pdf({
    path: pdfFile,
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:7px;color:#78716c;padding:0 13mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>PoCMS development progress report · ${esc(fmtLong(dayStart(reportDay) + HOUR))}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  })
  await browser.close()
  console.log(`Wrote ${path.relative(root, pdfFile)}`)
}
