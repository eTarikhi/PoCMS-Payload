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
  /** The command writes files or the database, so the page warns before running it. */
  writes?: boolean
  /** Whether to spawn the command in a shell (true for scripts, false for binaries). */
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
  'slug' | 'label' | 'description' | 'writes'
> & { timeoutSeconds: number }

export const optionsFor = (
  scripts: readonly TerminalScript[] = TERMINAL_SCRIPTS,
): TerminalScriptOption[] =>
  scripts.map((script) => ({
    slug: script.slug,
    label: script.label,
    description: script.description,
    writes: script.writes ?? false,
    timeoutSeconds: Math.round(script.timeoutMs / 1000),
    shell: script.shell ?? false,
  }))
