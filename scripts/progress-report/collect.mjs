/**
 * Collects the measurable part of the progress report from the repository itself: commits, lines
 * changed by area, commit types, test declarations per commit, code size by area, and (when the
 * GitHub CLI is available) the retained CI runs. Everything is derived from git and `gh`, so the
 * numbers can be re-checked with the commands listed in the report's appendix.
 *
 * Used by build.mjs; it has no dependencies beyond Node itself.
 */
import { execFileSync } from 'node:child_process'

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trimEnd()

/** Generated or vendored files: tracked, but produced by tools, so not counted as authored work. */
const GENERATED = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /^schema\.graphql$/,
  /^src\/payload-types\.ts$/,
  /^src\/payload-generated-schema\.ts$/,
  /^src\/app\/\(payload\)\/admin\/importMap\.js$/,
  /^src\/styles\/admin\/nav-icons\.css$/,
]

/** Areas in display order. The first matching rule wins. */
export const AREAS = [
  { id: 'generated', label: 'Generated files', test: (p) => GENERATED.some((r) => r.test(p)) },
  {
    id: 'tests',
    label: 'Tests',
    test: (p) =>
      /^tests\//.test(p) || /^(playwright\.config|vitest\.config|vitest\.setup)\./.test(p),
  },
  {
    id: 'docs',
    label: 'Documentation',
    test: (p) => /^docs\//.test(p) || /\.md$/i.test(p) || p === 'LICENSE',
  },
  {
    id: 'admin',
    label: 'Admin UI',
    test: (p) =>
      /^src\/components\/admin\//.test(p) ||
      /^src\/styles\/admin\//.test(p) ||
      /^src\/app\/\(payload\)\//.test(p) ||
      /^src\/plugins\//.test(p),
  },
  {
    id: 'backend',
    label: 'CMS back end',
    test: (p) =>
      /^src\/(collections|globals|access|hooks|endpoints|integrations|fields|migrations|utilities|lib)\//.test(
        p,
      ) ||
      p === 'src/payload.config.ts' ||
      /^src\/app\/my-route\//.test(p),
  },
  { id: 'seed', label: 'Seed data', test: (p) => /^src\/seed\//.test(p) },
  {
    id: 'frontend',
    label: 'Public site',
    test: (p) =>
      /^src\/app\/\(frontend\)\//.test(p) ||
      /^public\//.test(p) ||
      /^vTarikhi\//.test(p) ||
      /^src\/(components|styles)\//.test(p),
  },
  { id: 'tooling', label: 'Tooling, CI and config', test: () => true },
]

export const areaOf = (path) => AREAS.find((area) => area.test(path)).id

const TYPE_RE = /^(\w+)(\([^)]*\))?!?:\s/

/** Conventional-commit type, or `merge` / `other` for commits without one. */
export function commitType(subject, parents) {
  if (parents > 1) return 'merge'
  const match = TYPE_RE.exec(subject)
  return match ? match[1].toLowerCase() : 'other'
}

/** Calendar day (YYYY-MM-DD) and clock time of an ISO timestamp in the report's time zone. */
export function localParts(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  )
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

const offsetOf = (iso) => iso.slice(19)

/**
 * Every commit reachable from `rev`, oldest first, with lines added/deleted per area. Renames are
 * detected (a moved file counts only its changed lines). Merge commits carry no diff of their own.
 * Binary files are counted, not measured.
 */
export function readCommits(rev, timeZone) {
  const SEP = '\x1f'
  const END = '\x1e'
  const raw = git(
    'log',
    '--reverse',
    '-M',
    `--format=${END}%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%cI${SEP}%P${SEP}%s`,
    '--numstat',
    rev,
  )
  return raw
    .split(END)
    .filter(Boolean)
    .map((chunk) => {
      const [header, ...rest] = chunk.split('\n')
      const [sha, short, author, authored, committed, parents, subject] = header.split(SEP)
      const parentCount = parents ? parents.split(' ').length : 0
      const areas = {}
      let binaryFiles = 0
      const files = []
      for (const line of rest) {
        if (!line.trim()) continue
        const [added, deleted, rawPath] = line.split('\t')
        // Renames are reported as `dir/{old => new}/file` or `old => new`; count them at the new path.
        const path = rawPath
          .replace(/\{[^}]* => ([^}]*)\}/g, '$1')
          .replace(/^.* => /, '')
          .replace(/\/\//g, '/')
        const area = areaOf(path)
        files.push(path)
        if (added === '-') {
          binaryFiles += 1
          continue
        }
        areas[area] ??= { added: 0, deleted: 0, files: 0 }
        areas[area].added += Number(added)
        areas[area].deleted += Number(deleted)
        areas[area].files += 1
      }
      const authoredAreas = Object.entries(areas).filter(([id]) => id !== 'generated')
      const sum = (entries, key) => entries.reduce((total, [, value]) => total + value[key], 0)
      // Commits made in the agent sessions carry UTC timestamps; the owner's carry +03:30.
      const origin =
        offsetOf(authored) === '+00:00' && offsetOf(committed) === '+00:00' ? 'agent' : 'owner'
      return {
        sha,
        short,
        author,
        authored,
        committed,
        origin,
        parents: parentCount,
        subject,
        type: commitType(subject, parentCount),
        // Committer time is when the change landed on the branch (author time can be older).
        at: committed,
        ...localParts(committed, timeZone),
        files: files.length,
        binaryFiles,
        areas,
        added: sum(authoredAreas, 'added'),
        deleted: sum(authoredAreas, 'deleted'),
        generatedAdded: areas.generated?.added ?? 0,
        generatedDeleted: areas.generated?.deleted ?? 0,
      }
    })
}

const TEST_DECLARATION = '^\\s*(test|it)(\\.(only|skip|fixme|fail))?\\('

/** Static count of test declarations per suite at a commit (loops that create tests count once). */
export function testsAt(sha) {
  let out = ''
  try {
    out = git('grep', '-E', '-c', TEST_DECLARATION, sha, '--', 'tests')
  } catch {
    return { int: 0, e2e: 0, visual: 0 }
  }
  const counts = { int: 0, e2e: 0, visual: 0 }
  for (const line of out.split('\n')) {
    const match = /^tests\/(int|e2e|visual)\/.*:(\d+)$/.exec(line.slice(sha.length + 1))
    if (match) counts[match[1]] += Number(match[2])
  }
  return counts
}

/** Lines of text per area at a commit (binary files skipped, generated files reported separately). */
export function sizeAt(sha) {
  const out = git('grep', '-I', '-c', '', sha, '--', '.')
  const size = {}
  for (const line of out.split('\n')) {
    const match = /^(.*):(\d+)$/.exec(line.slice(sha.length + 1))
    if (!line.startsWith(`${sha}:`) || !match) continue
    const area = areaOf(match[1])
    size[area] ??= { lines: 0, files: 0 }
    size[area].lines += Number(match[2])
    size[area].files += 1
  }
  return size
}

/** Workflow runs GitHub still keeps for the repository, with job timings. Null without `gh`. */
export function readCiRuns(repo) {
  const gh = (path) =>
    JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  try {
    const runs = []
    for (let page = 1; page < 20; page += 1) {
      const { workflow_runs: batch } = gh(`repos/${repo}/actions/runs?per_page=100&page=${page}`)
      runs.push(...batch)
      if (batch.length < 100) break
    }
    return runs
      .map((run) => {
        const { jobs } = gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=20`)
        const minutes = (from, to) =>
          Math.round(((Date.parse(to) - Date.parse(from)) / 60000) * 10) / 10
        return {
          id: run.id,
          number: run.run_number,
          sha: run.head_sha.slice(0, 7),
          branch: run.head_branch,
          event: run.event,
          status: run.status,
          conclusion: run.conclusion,
          started: run.run_started_at,
          updated: run.updated_at,
          minutes: minutes(run.run_started_at, run.updated_at),
          jobs: jobs.map((job) => ({
            name: job.name,
            conclusion: job.conclusion,
            minutes: job.completed_at ? minutes(job.started_at, job.completed_at) : null,
          })),
        }
      })
      .sort((a, b) => a.started.localeCompare(b.started))
  } catch {
    return null
  }
}

export const headOf = (rev) => git('rev-parse', '--short', rev)
