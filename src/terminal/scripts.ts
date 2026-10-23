import type { Env } from '@/system/status'

/**
 * The terminal's allow-list (CR-12 E7). The browser can only name one of these slugs; it can never
 * send a command, an argument, an environment variable or a working directory. Every entry is a
 * fixed `pnpm` invocation in the repository, and the page exists only while NODE_ENV is not
 * "production" (see `isTerminalEnabled` and docs/ui-modernization/terminal-security.md).
 */
export type TerminalScript = {
  slug: string
  label: string
  description: string
  /** Arguments for pnpm, never user input. */
  args: readonly string[]
  /** Kill the process after this long (the endpoint streams and then stops it). */
  timeoutMs: number
  /** The command writes files in the repository, so the page warns before running it. */
  writes?: boolean
  /** The command changes the database, so the page warns in stronger terms before running it. */
  database?: boolean
  /**
   * Whether to spawn the command in a shell (`bash` on Linux/macOS, `cmd.exe` on Windows).
   *
   * True for the scripts that are themselves shell-shaped — anything whose package.json entry uses
   * `cross-env`, which is a shell command, and anything that needs the shell's own lookup of
   * `pnpm`. Without it those invocations work by accident on some platforms and not on others; the
   * migration generator (`src/endpoints/devMigrate.ts`) runs the same way. The arguments still come
   * from this file and never from the browser, so the shell has nothing to interpret.
   */
  shell?: boolean
}

const MINUTE = 60_000

export const TERMINAL_SCRIPTS: readonly TerminalScript[] = [
  {
    slug: 'lint',
    label: 'Lint',
    description: 'ESLint over the repository.',
    args: ['run', 'lint'],
    timeoutMs: 3 * MINUTE,
    shell: true,
  },
  {
    slug: 'typecheck',
    label: 'Typecheck',
    description: 'TypeScript, no emit.',
    args: ['run', 'typecheck'],
    timeoutMs: 5 * MINUTE,
    shell: true,
  },
  {
    slug: 'tw-prefix',
    label: 'Tailwind prefix check',
    description: 'Every admin class carries the acn: prefix.',
    args: ['run', 'check:tw-prefix'],
    timeoutMs: 3 * MINUTE,
    shell: true,
  },
  {
    slug: 'contrast',
    label: 'Contrast check',
    description: 'Every admin token pair meets WCAG 2.2 AA.',
    args: ['run', 'check:contrast'],
    timeoutMs: 2 * MINUTE,
    shell: true,
  },
  {
    slug: 'generate',
    label: 'Regenerate',
    description: 'Types, import map, Drizzle schema, GraphQL schema and nav icons.',
    args: ['run', 'generate:all'],
    timeoutMs: 5 * MINUTE,
    writes: true,
    shell: true,
  },
  {
    slug: 'migrate-status',
    label: 'Migration status',
    description: 'Which migrations the database has applied.',
    args: ['run', 'migrate:status'],
    timeoutMs: 2 * MINUTE,
    shell: true,
  },
  {
    slug: 'schema-from',
    label: 'Migration from this database',
    description:
      'Writes src/migrations/<timestamp>_schema_snapshot.ts from the connected database (DATABASE_DIRECT_URL, so the Neon branch when one is set) and registers it in index.ts. Guarded: every statement is safe to run twice. Read the file before `pnpm migrate`.',
    args: ['run', 'db:schema-from:neon'],
    timeoutMs: 5 * MINUTE,
    writes: true,
    shell: true,
  },
  {
    slug: 'seed-pull',
    label: 'Seed from this database',
    description:
      'Writes src/seed/snapshot.json: the content collections and globals of the connected database (the Neon branch when one is set), never users, roles, jobs or the audit log. Review it before committing.',
    args: ['run', 'db:seed-from:neon'],
    timeoutMs: 5 * MINUTE,
    writes: true,
    shell: true,
  },
  {
    slug: 'seed-load',
    label: 'Load that seed into the local database',
    description:
      'Applies src/seed/snapshot.json to POSTGRES_URL: replaces the rows of the tables it names, in one transaction, and sets the sequences past the highest id. Run “Seed from this database” first.',
    args: ['run', 'db:seed-load'],
    timeoutMs: 5 * MINUTE,
    writes: true,
    database: true,
    shell: true,
  },
  {
    slug: 'drift',
    label: 'Migration drift check',
    description:
      'Compares the connected database with the up() of every migration in src/migrations and names any table, column, index or enum type no migration declares. Read-only; exits non-zero on drift, which is what a pipeline wants.',
    args: ['run', 'db:drift'],
    timeoutMs: 2 * MINUTE,
    shell: true,
  },
  {
    slug: 'test-int',
    label: 'Integration tests',
    description: 'Vitest against the configured database.',
    args: ['run', 'test:int'],
    timeoutMs: 15 * MINUTE,
    shell: true,
  },
] as const

export const scriptBySlug = (slug: string | null | undefined): TerminalScript | undefined =>
  TERMINAL_SCRIPTS.find((script) => script.slug === slug)

/** Development only: a production build hides the page and answers 404 at the endpoint. */
export const isTerminalEnabled = (env: Env = process.env): boolean =>
  env.NODE_ENV !== 'production'

/** The command to spawn for a script. Kept separate so tests can assert it holds no user input. */
export const commandFor = (script: TerminalScript): { command: string; args: string[]; shell: boolean } => ({
  command: 'pnpm',
  args: [...script.args],
  shell: script.shell ?? false,
})

/** For the client: the list without the internal timeout field. */
export type TerminalScriptOption = Pick<
  TerminalScript,
  'slug' | 'label' | 'description' | 'writes' | 'database'
> & { timeoutSeconds: number }

export const optionsFor = (
  scripts: readonly TerminalScript[] = TERMINAL_SCRIPTS,
): TerminalScriptOption[] =>
  scripts.map((script) => ({
    slug: script.slug,
    label: script.label,
    description: script.description,
    writes: script.writes ?? false,
    database: script.database ?? false,
    timeoutSeconds: Math.round(script.timeoutMs / 1000),
  }))
