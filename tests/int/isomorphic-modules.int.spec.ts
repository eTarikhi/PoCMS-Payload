import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The modules a browser bundle reaches must not import Node.
 *
 * `src/access/permissions.ts` is documented as isomorphic on purpose: client components read the
 * signed-in user's permissions from it (the nav links, the command menu, the header actions), so it
 * ends up in the admin's browser chunks. It imports `DATABASE_TOOLS_CAPABILITY` from the database
 * tools plugin's `options.ts`, which makes that file part of the same graph — and one `node:fs`
 * import anywhere in it does not produce a warning or a smaller feature. It fails the whole admin
 * bundle: Next.js answers every `/admin/*` page with a 500 and Turbopack reports
 * "the chunking context does not support external modules (request: node:fs)".
 *
 * That happened once, when the drift guard's default migration reader was put in `options.ts`. The
 * type check does not catch it (the import is valid TypeScript), the linter does not catch it, and
 * the unit tests do not catch it, because nothing in them builds a browser bundle. Only a build or a
 * running dev server does — so this asserts the invariant directly, on the source, where a change to
 * either file has to answer for it.
 */

/** Files whose importers include client components, so they must stay free of Node built-ins. */
const ISOMORPHIC = [
  'src/access/permissions.ts',
  'src/access/roles.ts',
  'src/plugins/databaseTools/options.ts',
]

/**
 * Every import specifier that survives compilation.
 *
 * `import type` and `export type` are erased, so a type from a server-only module is not a
 * dependency of the bundle — `options.ts` takes the drift reader's *result type* from a file that
 * does read the filesystem, and that is fine. Counting them would make the guard unusable: the fix
 * for a false positive is to weaken the guard, and then it catches nothing.
 */
const importSpecifiers = (source: string): string[] => {
  const withoutTypes = source
    .replace(/^\s*import\s+type\s[^;]+;/gm, '')
    .replace(/^\s*export\s+type\s[^;]+;\s*from\s*['"][^'"]+['"];?/gm, '')
    // An inline type import inside a value import (`import { type X, y } from …`) still loads the
    // module, so it stays.
    .replace(/^\s*export\s+\{[^}]*\}\s*from\s*['"][^'"]+['"];?/gm, (statement) => statement)

  const specifiers: string[] = []
  const patterns = [
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /export\s+(?:[\w*{}\s,]+\s+)?from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of withoutTypes.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1])
    }
  }
  return specifiers
}

const isNodeBuiltin = (specifier: string): boolean =>
  specifier.startsWith('node:') ||
  [
    'fs',
    'fs/promises',
    'path',
    'os',
    'child_process',
    'crypto',
    'stream',
    'util',
    'zlib',
    'net',
    'tls',
    'http',
    'https',
    'url',
    'buffer',
    'events',
    'assert',
    'readline',
    'worker_threads',
    'perf_hooks',
  ].includes(specifier)

describe('modules a browser bundle reaches', () => {
  for (const file of ISOMORPHIC) {
    it(`${file} imports no Node built-in`, () => {
      const source = fs.readFileSync(path.resolve(file), 'utf8')
      const offenders = importSpecifiers(source).filter(isNodeBuiltin)
      expect(offenders).toEqual([])
    })

    it(`${file} imports nothing that itself reaches the filesystem`, () => {
      const source = fs.readFileSync(path.resolve(file), 'utf8')
      // Only this repository's own modules can be checked this way; a package's internals are its
      // own business (and `payload` is imported for types alone, which compile away).
      const local = importSpecifiers(source)
        .filter((specifier) => specifier.startsWith('.') || specifier.startsWith('@/'))
        .map((specifier) => {
          const base = specifier.startsWith('@/')
            ? path.resolve('src', specifier.slice(2))
            : path.resolve(path.dirname(file), specifier)
          for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
            if (fs.existsSync(candidate)) return candidate
          }
          return null
        })
        .filter((entry): entry is string => entry !== null)

      for (const dependency of local) {
        const offenders = importSpecifiers(fs.readFileSync(dependency, 'utf8')).filter(isNodeBuiltin)
        expect(offenders, `${file} → ${dependency}`).toEqual([])
      }
    })
  }

  it('still exports the capability the plugin documents, so the guard is not satisfied by deleting it', () => {
    const source = fs.readFileSync(path.resolve('src/plugins/databaseTools/options.ts'), 'utf8')
    expect(source).toContain('DATABASE_TOOLS_CAPABILITY')
    expect(source).toContain('manageDatabase')
  })

  it('keeps the filesystem default for the drift guard in a server-only module', () => {
    // The default reader may use the filesystem; it just has to live where only server code reaches
    // it. `migrationSources.ts` is that place, and the endpoint and the view call it themselves.
    const reader = fs.readFileSync(
      path.resolve('src/plugins/databaseTools/server/migrationSources.ts'),
      'utf8',
    )
    expect(reader).toContain("from 'node:fs'")

    const endpoints = fs.readFileSync(
      path.resolve('src/plugins/databaseTools/endpoints.ts'),
      'utf8',
    )
    expect(endpoints).toContain('readMigrationSources')

    const view = fs.readFileSync(
      path.resolve('src/components/admin/views/Database/index.tsx'),
      'utf8',
    )
    expect(view).toContain('readMigrationSources')

    // …and the same rule the email system learned the hard way: describing a configuration must not
    // import the packages that implement it, because `nodemailer` brings `node:fs` with it.
    // Assertions about imports, not about prose: settings.ts explains in a comment why it does not
    // import the provider packages, and a text search would fail on its own explanation.
    const settings = fs.readFileSync(path.resolve('src/email/settings.ts'), 'utf8')
    const settingsImports = importSpecifiers(settings)
    expect(settingsImports.some((specifier) => specifier.includes('nodemailer'))).toBe(false)
    expect(settingsImports.some((specifier) => specifier.includes('email-resend'))).toBe(false)
    expect(settingsImports.filter(isNodeBuiltin)).toEqual([])

    const provider = fs.readFileSync(path.resolve('src/email/provider.ts'), 'utf8')
    expect(importSpecifiers(provider)).toContain('@payloadcms/email-nodemailer')
  })
})
