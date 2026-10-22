#!/usr/bin/env node
/**
 * Admin accounts without the browser.
 *
 *   pnpm admin:create --email you@example.com [--password …] [--name "Your name"]
 *   pnpm admin:status
 *
 * `admin:create` is idempotent: a new email creates the account with the built-in Administrator
 * role, an existing one gets the new password and, if it had no full-access role, one is added.
 * That covers the three ways a fresh database locks someone out — no user yet, a forgotten
 * password, and an account created without a role.
 *
 * The password can also come from `ADMIN_PASSWORD` (keeps it out of the shell history) or from a
 * hidden prompt when the terminal is interactive.
 */
import 'dotenv/config'

import { spawnSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline'

import { getPayload } from 'payload'

import {
  MIN_PASSWORD_LENGTH,
  describeAccounts,
  ensureAdminAccount,
  normaliseEmail,
} from '../src/lib/admin-accounts'
import config from '../src/payload.config'

const USAGE = `Usage:
  pnpm admin:create --email <address> [--password <password>] [--name "<name>"] [--migrate]
  pnpm admin:status

  ADMIN_PASSWORD=<password> pnpm admin:create --email <address>   (no password in the history)
  When no password is given and the terminal is interactive, it is asked for.
  --migrate runs \`pnpm migrate\` first when the database has no schema (a new Neon/Vercel
  database does not have one until the migrations run).`

const args = process.argv.slice(2)
const command = args[0]

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  if (index !== -1) return args[index + 1]
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : undefined
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

/** Read a line without echoing it, for the password prompt. */
const askHidden = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true })
    const onData = (char: Buffer) => {
      // Ctrl-C: leave the terminal usable instead of hanging on a password that never arrives.
      if (char.toString() === '\u0003') {
        rl.close()
        console.log()
        process.exit(130)
      }
    }
    // @ts-expect-error _writeToOutput is the documented way to mute readline's echo.
    rl._writeToOutput = (text: string) => {
      if (text.includes(question)) stdout.write(question)
    }
    stdin.on('data', onData)
    rl.question(question, (answer) => {
      stdin.off('data', onData)
      rl.close()
      stdout.write('\n')
      resolve(answer)
    })
  })

/** Where the script is pointed, without the credentials — the usual first question. */
const describeTarget = (): string => {
  const url = process.env.POSTGRES_URL
  if (!url) return 'POSTGRES_URL is not set'
  try {
    const parsed = new URL(url)
    const database = parsed.pathname.replace(/^\//, '')
    return `${parsed.hostname}:${parsed.port || '5432'}/${database}`
  } catch {
    return 'POSTGRES_URL is not a valid URL'
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** onInit's wording for a database that has never been migrated (`src/lib/database-readiness.ts`). */
const isMissingSchema = (message: string): boolean => /has no schema \(missing tables?/i.test(message)

/**
 * Payload, migrating first when asked. A brand-new Neon/Vercel database has no tables until the
 * migrations run, and `--migrate` turns the two steps into one — but it is never automatic: the
 * command says which database it is about to change.
 */
const connect = async (migrate: boolean) => {
  try {
    return await getPayload({ config })
  } catch (error) {
    const message = messageOf(error)
    if (!migrate || !isMissingSchema(message)) throw new Error(message)

    console.log(`\n… This database has no schema. Running \`pnpm migrate\` first:\n`)
    const result = spawnSync('pnpm', ['migrate'], { shell: true, stdio: 'inherit' })
    if (result.status !== 0) throw new Error('The migrations failed; nothing was created.')

    console.log('')
    return await getPayload({ config })
  }
}

const run = async () => {
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }

  console.log(`Database: ${describeTarget()}`)

  const payload = await connect(args.includes('--migrate'))

  if (command === 'status') {
    const summary = await describeAccounts(payload)

    if (summary.users.length === 0) {
      console.log('\nNo accounts yet. Create the first one:')
      console.log('  pnpm admin:create --email you@example.com\n')
    } else {
      console.log(`\n${summary.users.length} account(s), ${summary.administrators} administrator(s):\n`)
      for (const user of summary.users) {
        const roles = user.roles.length > 0 ? user.roles.join(', ') : '— no role'
        const note = summary.fromTests.includes(user.email) ? '  (left by a test run)' : ''
        console.log(`  ${user.email.padEnd(36)} ${roles}${note}`)
      }
      console.log()
    }

    if (summary.users.length > 0 && summary.administrators === 0) {
      console.warn('⚠ Nobody has a full-access role, so nobody can open the admin.')
      console.warn('  Fix: pnpm admin:create --email <one of the accounts above>\n')
      process.exitCode = 1
    }
    if (summary.users.length > 0 && summary.administrators === 0 && summary.fromTests.length > 0) {
      console.warn('⚠ The accounts above were created by `pnpm test:int`, which uses the database in .env.')
      console.warn('  An interrupted run leaves them behind; the admin then asks for a password nobody has.')
      console.warn('  Fix: pnpm admin:create --email you@example.com\n')
    }
    if (summary.roleless.length > 0) {
      console.warn(`⚠ Without a role these accounts are refused by the admin: ${summary.roleless.join(', ')}`)
      console.warn('  Fix: pnpm admin:create --email <address>   (adds Administrator)\n')
      process.exitCode = 1
    }
    return
  }

  if (command !== 'create') fail(`Unknown command "${command}".\n\n${USAGE}`)

  const email = flag('email')
  if (!email) fail(`--email is required.\n\n${USAGE}`)

  let password = flag('password') ?? process.env.ADMIN_PASSWORD ?? ''
  if (!password) {
    if (!stdin.isTTY) fail(`No password. Pass --password or set ADMIN_PASSWORD.\n\n${USAGE}`)
    password = await askHidden(`Password for ${normaliseEmail(email)} (min ${MIN_PASSWORD_LENGTH}): `)
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }

  const result = await ensureAdminAccount(payload, { email, password, name: flag('name') })

  if (result.created) console.log(`\n✔ Created ${result.email} with the Administrator role.`)
  else {
    console.log(`\n✔ Updated ${result.email}: new password${result.roleAdded ? ', Administrator role added' : ''}.`)
  }
  console.log('  Sign in at /admin with that email and password.\n')
}

run()
  // `status` sets process.exitCode when something needs fixing; keep it instead of forcing 0.
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    const message = messageOf(error)
    fail(
      isMissingSchema(message) && !args.includes('--migrate')
        ? `${message}\n\n  Create the schema with \`pnpm migrate\`, or run this command with --migrate\n  (\`pnpm admin:create --migrate --email …\`) to do both.`
        : message,
    )
  })
