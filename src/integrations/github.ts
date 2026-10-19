import { fetchJSON, type IntegrationResult, settle } from './result'

/**
 * GitHub REST API: the repository's GitHub Actions runs.
 * The repository comes from GITHUB_REPOSITORY ("owner/name") or, on Vercel, from the system
 * variables VERCEL_GIT_REPO_OWNER and VERCEL_GIT_REPO_SLUG. GITHUB_TOKEN (read-only "Actions"
 * permission) is needed for private repositories and raises the rate limit.
 * Docs: https://docs.github.com/en/rest/actions/workflow-runs
 */
const API = 'https://api.github.com'

export function githubRepository(): string | null {
  const explicit = process.env.GITHUB_REPOSITORY?.trim()
  if (explicit && /^[\w.-]+\/[\w.-]+$/.test(explicit)) return explicit
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim()
  const slug = process.env.VERCEL_GIT_REPO_SLUG?.trim()
  return owner && slug ? `${owner}/${slug}` : null
}

type ApiRun = {
  id: number
  name?: string | null
  display_title?: string
  head_branch?: string | null
  head_sha?: string
  status?: string | null
  conclusion?: string | null
  html_url: string
  event?: string
  created_at: string
  updated_at: string
  run_started_at?: string
  actor?: { login?: string }
}

export type WorkflowRun = {
  id: number
  workflow: string
  title: string
  branch: string | null
  commitSha: string | null
  /** queued, in_progress, completed, … */
  status: string
  /** success, failure, cancelled, skipped, … (null while running) */
  conclusion: string | null
  url: string
  event: string | null
  actor: string | null
  createdAt: string
  /** Seconds from start to the last update, once completed. */
  durationSeconds: number | null
}

export type CIReport = { repository: string; runs: WorkflowRun[] }

/** The latest workflow runs of the repository (newest first), cached for a minute. */
export async function latestWorkflowRuns(limit = 6): Promise<IntegrationResult<CIReport>> {
  const repository = githubRepository()
  if (!repository) return { status: 'not-configured', missing: ['GITHUB_REPOSITORY'] }
  const token = process.env.GITHUB_TOKEN?.trim()
  return settle(async () => {
    const { workflow_runs: runs } = await fetchJSON<{ workflow_runs: ApiRun[] }>(
      `${API}/repos/${repository}/actions/runs?per_page=${limit}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        revalidate: 60,
      },
    )
    return {
      repository,
      runs: runs.map((run) => {
        const started = new Date(run.run_started_at ?? run.created_at).getTime()
        return {
          id: run.id,
          workflow: run.name ?? 'Workflow',
          title: run.display_title ?? run.name ?? '',
          branch: run.head_branch ?? null,
          commitSha: run.head_sha ?? null,
          status: run.status ?? 'unknown',
          conclusion: run.conclusion ?? null,
          url: run.html_url,
          event: run.event ?? null,
          actor: run.actor?.login ?? null,
          createdAt: run.created_at,
          durationSeconds:
            run.status === 'completed'
              ? Math.max(0, Math.round((new Date(run.updated_at).getTime() - started) / 1000))
              : null,
        }
      }),
    }
  })
}
