import { databaseTarget } from './connection'

/**
 * Neon control-plane operations: branches and point-in-time restore.
 *
 * These cannot be done in SQL. A branch is a copy-on-write view of the project's storage and its
 * history is the project's WAL; only the Neon API (or console) can move a branch in time. So the
 * page does two different things and says which is which:
 *
 *   - Backup / restore *inside* Postgres → `backup.ts`, `restore.ts` (works on any Postgres)
 *   - Branch backup / PITR / delete → this file, and only when `NEON_API_KEY` is set
 *
 * The API is documented at https://api-docs.neon.tech/reference/ . Every call here is one of:
 *
 *   GET    /projects
 *   GET    /projects/{id}/endpoints
 *   GET    /projects/{id}/branches
 *   POST   /projects/{id}/branches                         (a backup branch)
 *   POST   /projects/{id}/branches/{branch}/restore        (point-in-time restore)
 *   DELETE /projects/{id}/branches/{branch}
 *   GET    /projects/{id}/operations/{operation}
 *
 * The connection string a serverless app uses names a *compute endpoint* (`ep-…-pooler.…`), not the
 * project, so the project is found by matching that endpoint id. `NEON_PROJECT_ID` and
 * `NEON_BRANCH_ID` skip the discovery (and the two extra requests it costs).
 */

export const NEON_API = 'https://console.neon.tech/api/v2'

export class NeonError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'NeonError'
  }
}

export type NeonBranch = {
  id: string
  name: string
  default: boolean
  protected: boolean
  state: string
  createdAt: string
  /** The branch this one was forked from, when it is a backup branch. */
  parentId: string | null
  lastResetAt: string | null
  /** Branch this one was restored from, when it was. */
  restoredFrom: string | null
}

export type NeonConnection = {
  configured: boolean
  /** Why it is not usable, when it is not. */
  reason?: string
  projectId?: string
  projectName?: string
  branchId?: string
  /** True when the ids came from the environment, false when discovered from the connection URL. */
  fromEnvironment?: boolean
  branches?: NeonBranch[]
  /** The Neon console URL for this project, for anything the API does not cover. */
  consoleUrl?: string
}

type Json = Record<string, unknown>

const asRecord = (value: unknown): Json =>
  value && typeof value === 'object' ? (value as Json) : {}
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const toBranch = (raw: unknown): NeonBranch => {
  const branch = asRecord(raw)
  return {
    id: String(branch.id ?? ''),
    name: String(branch.name ?? ''),
    default: branch.default === true,
    protected: branch.protected === true,
    state: String(branch.current_state ?? branch.state ?? ''),
    createdAt: String(branch.created_at ?? ''),
    parentId: branch.parent_id ? String(branch.parent_id) : null,
    lastResetAt: branch.last_reset_at ? String(branch.last_reset_at) : null,
    restoredFrom: branch.restored_from ? String(branch.restored_from) : null,
  }
}

export type NeonOptions = {
  apiKey?: string
  projectId?: string
  branchId?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export class NeonClient {
  private readonly fetchImpl: typeof fetch
  private readonly apiKey: string
  private readonly timeoutMs: number
  readonly projectId?: string
  readonly branchId?: string
  private resolved?: {
    projectId: string
    projectName: string
    branchId: string
    fromEnvironment: boolean
  }

  constructor(options: NeonOptions = {}) {
    // `||`, not `??`: an empty line in `.env` (`NEON_BRANCH_ID=`) is not a configured value. With
    // `??` it would become the branch id `''` and a restore would POST to `/branches//restore`.
    this.apiKey = options.apiKey || process.env.NEON_API_KEY || ''
    this.projectId = options.projectId || process.env.NEON_PROJECT_ID || undefined
    this.branchId = options.branchId || process.env.NEON_BRANCH_ID || undefined
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? 20_000
  }

  get configured(): boolean {
    return this.apiKey.length > 0
  }

  private async request(method: string, path: string, body?: unknown): Promise<Json> {
    if (!this.configured) {
      throw new NeonError('NEON_API_KEY is not set, so the Neon API cannot be used.')
    }
    let response: Response
    try {
      response = await this.fetchImpl(`${NEON_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new NeonError(`Could not reach the Neon API (${reason}).`)
    }

    const text = await response.text()
    let json: Json = {}
    try {
      json = text ? (JSON.parse(text) as Json) : {}
    } catch {
      json = {}
    }

    if (!response.ok) {
      // Neon sends `{ message, code, request_id }`. The message is safe to show; it never contains a key.
      const message = typeof json.message === 'string' ? json.message : response.statusText
      const suffix =
        response.status === 401
          ? ' The API key was rejected — check NEON_API_KEY.'
          : response.status === 403
            ? ' The key does not have access to this project.'
            : response.status === 404
              ? ' The project or branch was not found.'
              : response.status === 423
                ? ' The branch is locked by another operation; try again shortly.'
                : response.status === 429
                  ? ' The Neon API rate limit was reached; try again in a minute.'
                  : ''
      throw new NeonError(
        `${message || `Neon API returned ${response.status}`}${suffix}`,
        response.status,
      )
    }
    return json
  }

  /**
   * Find the project and branch this database belongs to. The connection URL names the compute
   * endpoint, so match it against each project's endpoints; a project with a single endpoint
   * (the common case) matches on the first try.
   */
  async resolve(): Promise<{
    projectId: string
    projectName: string
    branchId: string
    fromEnvironment: boolean
  }> {
    if (this.resolved) return this.resolved

    // The pooled host is `<endpoint-id>-pooler.<region>…`; the endpoint's own host has no suffix.
    const endpointLabel = (host: string): string =>
      (host.split('.')[0] ?? '').replace(/-pooler$/, '')
    const host = endpointLabel(databaseTarget().host)
    if (this.projectId) {
      const project = await this.request('GET', `/projects/${this.projectId}`)
      const name = String(asRecord(project.project).name ?? this.projectId)
      const branchId = this.branchId ?? (await this.defaultBranch(this.projectId))
      this.resolved = {
        projectId: this.projectId,
        projectName: name,
        branchId,
        fromEnvironment: true,
      }
      return this.resolved
    }

    const list = await this.request('GET', '/projects')
    const projects = asArray(list.projects).map(asRecord)
    for (const project of projects) {
      const projectId = String(project.id ?? '')
      if (!projectId) continue
      const endpoints = asArray(
        (await this.request('GET', `/projects/${projectId}/endpoints`)).endpoints,
      ).map(asRecord)
      const match = endpoints.find(
        (endpoint) => host.length > 0 && endpointLabel(String(endpoint.host ?? '')) === host,
      )
      if (!match) continue
      const branchId =
        this.branchId ??
        (match.branch_id ? String(match.branch_id) : await this.defaultBranch(projectId))
      this.resolved = {
        projectId,
        projectName: String(project.name ?? projectId),
        branchId,
        fromEnvironment: false,
      }
      return this.resolved
    }

    throw new NeonError(
      'This database’s host does not match any project the API key can see. Set NEON_PROJECT_ID and NEON_BRANCH_ID, or check that the key belongs to the same Neon account.',
    )
  }

  private async defaultBranch(projectId: string): Promise<string> {
    const list = await this.request('GET', `/projects/${projectId}/branches`)
    const branches = asArray(list.branches).map(toBranch)
    const branch = branches.find((candidate) => candidate.default) ?? branches[0]
    if (!branch) throw new NeonError('The project has no branches.')
    return branch.id
  }

  async branches(): Promise<NeonBranch[]> {
    const { projectId } = await this.resolve()
    const list = await this.request('GET', `/projects/${projectId}/branches`)
    return asArray(list.branches)
      .map(toBranch)
      .sort(
        (a, b) => Number(b.default) - Number(a.default) || b.createdAt.localeCompare(a.createdAt),
      )
  }

  /**
   * Create a branch from the current state of `parent`: Neon's copy-on-write backup. It costs only
   * the data that later diverges, and needs no compute endpoint unless someone will query it.
   */
  async createBackupBranch({
    name,
    parentId,
    withEndpoint = false,
  }: {
    name: string
    parentId?: string
    withEndpoint?: boolean
  }): Promise<NeonBranch> {
    const { projectId, branchId } = await this.resolve()
    const payload = {
      branch: { name, parent_id: parentId ?? branchId },
      ...(withEndpoint ? { endpoints: [{ type: 'read_write' }] } : {}),
    }
    const result = await this.request('POST', `/projects/${projectId}/branches`, payload)
    return toBranch(result.branch)
  }

  /**
   * Point-in-time restore: replace the branch with its state at `timestamp`, keeping the current
   * state under `preserveUnderName` (Neon requires a name when the branch has children — its
   * backups — because they would otherwise be moved).
   */
  async restoreTo({
    branchId,
    timestamp,
    preserveUnderName,
  }: {
    branchId?: string
    timestamp: string
    preserveUnderName?: string
  }): Promise<NeonBranch> {
    const resolved = await this.resolve()
    const target = branchId ?? resolved.branchId
    const body = {
      source_branch_id: target,
      source_timestamp: timestamp,
      ...(preserveUnderName ? { preserve_under_name: preserveUnderName } : {}),
    }
    const result = await this.request(
      'POST',
      `/projects/${resolved.projectId}/branches/${target}/restore`,
      body,
    )
    return toBranch(result.branch)
  }

  async deleteBranch(branchId: string): Promise<void> {
    const { projectId } = await this.resolve()
    await this.request('DELETE', `/projects/${projectId}/branches/${branchId}`)
  }

  /** Branch operations are asynchronous; this is the one the page polls to report a result. */
  async operation(
    operationId: string,
  ): Promise<{ status: string; action: string; error?: string }> {
    const { projectId } = await this.resolve()
    const result = await this.request('GET', `/projects/${projectId}/operations/${operationId}`)
    const operation = asRecord(result.operation)
    return {
      status: String(operation.status ?? 'unknown'),
      action: String(operation.action ?? ''),
      error: operation.error ? String(operation.error) : undefined,
    }
  }
}

/** What the page can show without making a single request. */
export const neonEnvironment = (): {
  configured: boolean
  projectId?: string
  branchId?: string
} => ({
  configured: Boolean(process.env.NEON_API_KEY),
  projectId: process.env.NEON_PROJECT_ID || undefined,
  branchId: process.env.NEON_BRANCH_ID || undefined,
})

/** The console page for the project, so every card can link to the source of truth. */
export const neonConsoleUrl = (projectId?: string): string =>
  projectId ? `https://console.neon.tech/app/projects/${projectId}` : 'https://console.neon.tech'
