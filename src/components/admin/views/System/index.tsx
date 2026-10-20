import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import {
  DatabaseIcon,
  PackageIcon,
  PlugZapIcon,
  ServerCogIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { execFileSync } from 'node:child_process'
import React from 'react'

import { hasCapability } from '@/access/permissions'
import { Badge } from '@/components/admin/elements/Badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/admin/elements/Card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/elements/Table'
import { migrations } from '@/migrations'
import {
  type IntegrationStatus,
  type PackageVersions,
  commitInfo,
  environmentInfo,
  formatBytes,
  integrationStatuses,
  isNewer,
  packageVersions,
} from '@/system/status'
import { databaseSnapshot } from '@/system/database'

import manifest from '../../../../../package.json'

/** Versions shown on the page, from the manifest (see packageVersions). */
const VERSIONS: PackageVersions = packageVersions(manifest)

type UpdateCheck = { name: string; current: string; latest: string | null; error: boolean }

/** The newest release on npm, cached for a day; a failure is shown as “not checked”. */
async function latestVersions(): Promise<UpdateCheck[]> {
  const packages = [
    { name: 'payload', current: VERSIONS.payload },
    { name: 'next', current: VERSIONS.next },
  ]
  return Promise.all(
    packages.map(async ({ name, current }): Promise<UpdateCheck> => {
      try {
        const response = await fetch(`https://registry.npmjs.org/${name}/latest`, {
          next: { revalidate: 86_400, tags: ['npm-versions'] },
          signal: AbortSignal.timeout(5_000),
        })
        if (!response.ok) return { name, current, latest: null, error: true }
        const data = (await response.json()) as { version?: string }
        return { name, current, latest: data.version ?? null, error: !data.version }
      } catch {
        return { name, current, latest: null, error: true }
      }
    }),
  )
}

/** The local checkout's HEAD, for development (Vercel supplies its own variables). */
function localGit(): { short: string; full: string; message: string } | null {
  if (process.env.VERCEL_GIT_COMMIT_SHA || process.env.NODE_ENV === 'production') return null
  try {
    const [short, full, message] = execFileSync(
      'git',
      ['log', '-1', '--format=%h%n%H%n%s'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 2_000 },
    )
      .trim()
      .split('\n')
    if (!short || !full) return null
    return { short, full, message }
  } catch {
    return null
  }
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="acn:rounded-sm acn:bg-muted acn:px-1.5 acn:py-0.5 acn:font-mono acn:text-xs acn:text-foreground">
    {children}
  </code>
)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="acn:grid acn:grid-cols-[9rem_1fr] acn:gap-3 acn:py-1.5">
      <dt className="acn:m-0 acn:text-muted-foreground">{label}</dt>
      <dd className="acn:m-0 acn:min-w-0 acn:break-words">{children}</dd>
    </div>
  )
}

function IntegrationRow({ integration }: { integration: IntegrationStatus }) {
  return (
    <li className="acn:flex acn:flex-col acn:gap-1 acn:py-2">
      <div className="acn:flex acn:items-center acn:gap-2">
        <span className="acn:text-sm acn:font-medium acn:text-foreground">
          {integration.label}
        </span>
        <Badge variant={integration.configured ? 'secondary' : 'outline'}>
          {integration.configured ? 'Set' : 'Missing'}
        </Badge>
      </div>
      <span className="acn:text-xs acn:text-muted-foreground">{integration.powers}</span>
      {integration.configured ? null : (
        <span className="acn:text-xs acn:text-muted-foreground">
          Needs {integration.needs.map((name) => <Code key={name}>{name}</Code>)}
        </span>
      )}
    </li>
  )
}

/**
 * /admin/system (CR-12 E6, `viewSystem` capability): what this deployment runs, which integrations
 * are configured (never their values), the size of the database and its migration state, and
 * whether newer Payload or Next releases exist on npm.
 */
export async function SystemView({
  i18n,
  initPageResult,
  params,
  payload,
  searchParams,
  user,
  viewActions,
}: AdminViewServerProps) {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = payload.config.routes.admin

  if (!req.user) {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}/system`)}`)
  }
  if (!hasCapability(req.user, 'viewSystem')) notFound()

  const environment = environmentInfo()
  const commit = commitInfo(process.env, localGit())
  const integrations = integrationStatuses()
  const database = await databaseSnapshot(
    payload,
    migrations.map((migration) => migration.name),
  )
  const updates = await latestVersions()

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      viewActions={viewActions}
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <Gutter>
        <SetStepNav nav={[{ label: 'System' }]} />
        <div data-testid="system" className="acn:space-y-6 acn:pt-6 acn:pb-16">
          <header className="acn:space-y-1">
            <h1 className="acn:m-0 acn:text-3xl acn:font-semibold acn:tracking-tight">
              System
            </h1>
            <p className="acn:m-0 acn:max-w-3xl acn:text-sm acn:text-muted-foreground">
              What this deployment runs, which integrations are configured, the database and its
              migrations, and the releases the packages are on. Secret values are never shown, only
              whether they are set.
            </p>
          </header>

          <div className="acn:grid acn:gap-6 acn:lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                    <ServerCogIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Application
                  </h2>
                </CardTitle>
                <CardDescription>The running build and its environment.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="acn:m-0 acn:divide-y acn:divide-border">
                  <Row label="Environment">
                    <Badge variant="outline">{environment.label}</Badge>
                    <span className="acn:ml-2 acn:text-xs acn:text-muted-foreground">
                      {environment.detail}
                    </span>
                  </Row>
                  <Row label="Commit">
                    <Code>{commit.short}</Code>
                    {commit.ref ? (
                      <span className="acn:ml-2 acn:text-xs acn:text-muted-foreground">
                        {commit.ref}
                      </span>
                    ) : null}
                    {commit.message ? (
                      <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                        {commit.message}
                      </p>
                    ) : null}
                    <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                      Read from {commit.source}.
                    </p>
                  </Row>
                  <Row label="Node">
                    <Code>{VERSIONS.node}</Code>
                  </Row>
                  <Row label="Next.js">
                    <Code>{VERSIONS.next}</Code>
                  </Row>
                  <Row label="Payload">
                    <Code>{VERSIONS.payload}</Code>
                  </Row>
                  <Row label="React">
                    <Code>{VERSIONS.react}</Code>
                  </Row>
                  <Row label="App">
                    <Code>{VERSIONS.app}</Code>
                  </Row>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                    <PlugZapIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Integrations
                  </h2>
                </CardTitle>
                <CardDescription>
                  Set or missing. Values stay in the environment; see .env.example for how to get
                  each one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="acn:m-0 acn:flex acn:list-none acn:flex-col acn:divide-y acn:divide-border acn:p-0">
                  {integrations.map((integration) => (
                    <IntegrationRow key={integration.name} integration={integration} />
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                    <DatabaseIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Database
                  </h2>
                </CardTitle>
                <CardDescription>
                  {formatBytes(database.totalBytes)} in the largest tables
                  {database.connections === null ? '' : ` · ${database.connections} connections`}
                  {' · '}
                  {database.migrations.length} migrations applied
                  {database.pending.length > 0 ? `, ${database.pending.length} pending` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="acn:space-y-4">
                {database.error ? (
                  <p className="acn:m-0 acn:flex acn:items-start acn:gap-2 acn:text-sm acn:text-destructive">
                    <TriangleAlertIcon aria-hidden className="acn:mt-0.5 acn:size-4 acn:shrink-0" />
                    Could not read the database: {database.error}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table</TableHead>
                        <TableHead className="acn:text-right">Rows (estimate)</TableHead>
                        <TableHead className="acn:text-right">Size</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {database.tables.map((table) => (
                        <TableRow key={table.name}>
                          <TableCell className="acn:font-mono acn:text-xs">{table.name}</TableCell>
                          <TableCell className="acn:text-right acn:tabular-nums">
                            {table.rows.toLocaleString(i18n.language)}
                          </TableCell>
                          <TableCell className="acn:text-right acn:tabular-nums">
                            {formatBytes(table.bytes)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {database.pending.length > 0 ? (
                  <div className="acn:rounded-lg acn:bg-muted acn:p-3 acn:text-sm">
                    <p className="acn:m-0 acn:font-medium">Not applied yet</p>
                    <p className="acn:m-0 acn:mt-1 acn:text-xs acn:text-muted-foreground">
                      Run the <strong>Migrate database</strong> workflow after deploying:
                    </p>
                    <ul className="acn:m-0 acn:mt-2 acn:list-disc acn:space-y-0.5 acn:pl-5 acn:text-xs">
                      {database.pending.map((name) => (
                        <li key={name}>
                          <Code>{name}</Code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="acn:m-0 acn:text-xs acn:text-muted-foreground">
                    Every committed migration is recorded on this database.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="acn:m-0 acn:flex acn:items-center acn:gap-2 acn:text-base">
                    <PackageIcon aria-hidden className="acn:size-4 acn:text-muted-foreground" />
                    Updates
                  </h2>
                </CardTitle>
                <CardDescription>
                  The latest release on npm, checked at most once a day. Upgrades go through the
                  roadmap (ADR 0006 for Payload 4).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Declared</TableHead>
                      <TableHead>Latest</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {updates.map((update) => {
                      const newer = update.latest ? isNewer(update.latest, update.current) : false
                      return (
                        <TableRow key={update.name}>
                          <TableCell className="acn:font-medium">{update.name}</TableCell>
                          <TableCell>
                            <Code>{update.current}</Code>
                          </TableCell>
                          <TableCell>
                            {update.latest ? (
                              <a
                                className="acn:text-primary acn:underline-offset-4 acn:hover:underline"
                                href={`https://www.npmjs.com/package/${update.name}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {update.latest}
                                <span className="acn:sr-only"> (opens in a new tab)</span>
                              </a>
                            ) : (
                              '–'
                            )}
                          </TableCell>
                          <TableCell>
                            {update.error ? (
                              <Badge variant="outline">Not checked</Badge>
                            ) : newer ? (
                              <Badge variant="destructive">Update available</Badge>
                            ) : (
                              <Badge variant="secondary">Up to date</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

export default SystemView
