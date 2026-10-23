import fs from 'node:fs'
import path from 'node:path'

import type { MigrationSource } from './drift'

/**
 * Where a migration's SQL comes from when the guard needs to read it.
 *
 * The plugin is given migration *names* (`options.migrations`) because that is all a running app
 * needs to compare history. The drift guard needs the *text*, and the text lives in the checkout, so
 * this reads `src/migrations/<name>.ts` from the working directory — the layout Payload's own
 * `migrate:create` writes and the one `src/migrations/index.ts` registers.
 *
 * A packaged plugin in a compiled bundle has no sources to read, which is why the result separates
 * what it found from what it could not: the guard then reports on the migrations it could read and
 * names the rest, instead of quietly declaring nothing and calling every table drift.
 */
export type MigrationSourcesResult = {
  sources: MigrationSource[]
  /** Names whose file could not be read, so a caller can say the comparison was partial. */
  unreadable: string[]
}

export const readMigrationSources = ({
  names,
  dir,
}: {
  names: string[]
  /** @default 'src/migrations' under the working directory */
  dir?: string
}): MigrationSourcesResult => {
  const directory = dir ?? path.resolve(process.cwd(), 'src/migrations')
  const sources: MigrationSource[] = []
  const unreadable: string[] = []

  for (const name of names) {
    // A name comes from the migration registry, not from a request, but it is still a path segment:
    // refuse anything that could walk out of the directory.
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      unreadable.push(name)
      continue
    }
    try {
      sources.push({ name, source: fs.readFileSync(path.join(directory, `${name}.ts`), 'utf8') })
    } catch {
      unreadable.push(name)
    }
  }

  return { sources, unreadable }
}
