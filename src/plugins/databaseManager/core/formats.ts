import {
  LOGICAL_BACKUP_FORMAT,
  NDJSON_BACKUP_FORMAT,
  topologicalSortTables,
  type BackupColumnMeta,
  type BackupContentMode,
  type BackupEnumMeta,
  type BackupTableDump,
  type LogicalBackupArchive,
} from '../shared'

import { quoteIdent } from './connection'
import { computeArchiveChecksum } from './crypto'

/* -------------------------------------------------------------------------- */
/* PII Anonymizer (for safe Production -> Staging / Seed Exports)             */
/* -------------------------------------------------------------------------- */

export function anonymizeTableRowPii(
  tableName: string,
  row: Record<string, unknown>,
  rowIndex: number,
): Record<string, unknown> {
  const copy = { ...row }
  const stableSuffix =
    typeof copy.id === 'number' || typeof copy.id === 'string'
      ? String(copy.id)
      : String(rowIndex + 1)

  if (tableName === 'users') {
    if (typeof copy.email === 'string') {
      copy.email = `user-${stableSuffix}@example.local`
    }
    if (typeof copy.name === 'string' && copy.name.length > 0) {
      copy.name = `Staging User ${stableSuffix}`
    }
  }

  if (tableName === 'audit_logs') {
    if ('ip' in copy && copy.ip !== null) copy.ip = '127.0.0.1'
    if ('user_agent' in copy && copy.user_agent !== null) copy.user_agent = 'Anonymized'
    if (typeof copy.actor_email === 'string') {
      copy.actor_email = `actor-${stableSuffix}@example.local`
    }
  }

  return copy
}

/* -------------------------------------------------------------------------- */
/* PostgreSQL SQL Literal & DDL / DML Serializer                              */
/* -------------------------------------------------------------------------- */

export function escapePgStringLiteral(raw: string): string {
  // Strip NUL bytes (PostgreSQL text columns forbid 0x00) and double single quotes.
  const sanitized = raw.replace(/\0/g, '')
  return `'${sanitized.replace(/'/g, "''")}'`
}

export function formatPgLiteral(
  value: unknown,
  colMeta?: BackupColumnMeta,
): string {
  if (value === null || value === undefined) return 'NULL'

  const udt = colMeta?.udtName?.toLowerCase() ?? ''
  const dt = colMeta?.dataType?.toLowerCase() ?? ''

  if (udt === 'bytea') {
    if (
      typeof value === 'object' &&
      typeof (value as { __byteaBase64?: unknown }).__byteaBase64 === 'string'
    ) {
      const b64 = (value as { __byteaBase64: string }).__byteaBase64.replace(/[^A-Za-z0-9+/=]/g, '')
      return `decode('${b64}', 'base64')`
    }
    if (Buffer.isBuffer(value)) {
      return `decode('${value.toString('base64')}', 'base64')`
    }
  }

  if (udt === 'json' || udt === 'jsonb' || dt === 'json' || dt === 'jsonb') {
    const jsonText = typeof value === 'string' ? value : JSON.stringify(value)
    const castType = udt === 'json' || dt === 'json' ? 'json' : 'jsonb'
    return `${escapePgStringLiteral(jsonText)}::${castType}`
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (value instanceof Date) {
    return escapePgStringLiteral(value.toISOString())
  }

  if (typeof value === 'object') {
    return `${escapePgStringLiteral(JSON.stringify(value))}::jsonb`
  }

  return escapePgStringLiteral(String(value))
}

export function formatPgColumnType(col: BackupColumnMeta): string {
  const udt = col.udtName.toLowerCase()
  const dt = col.dataType.toLowerCase()

  if (dt === 'user-defined') {
    return `public.${quoteIdent(col.udtName)}`
  }
  if (dt === 'array' || udt.startsWith('_')) {
    const elemUdt = udt.replace(/^_/, '')
    const elemType = formatPgColumnType({ ...col, dataType: elemUdt, udtName: elemUdt })
    return `${elemType}[]`
  }

  switch (udt) {
    case 'int2':
      return 'smallint'
    case 'int4':
      return 'integer'
    case 'int8':
      return 'bigint'
    case 'bool':
      return 'boolean'
    case 'float4':
      return 'real'
    case 'float8':
      return 'double precision'
    case 'numeric':
      if (col.numericPrecision && col.numericScale !== null && col.numericScale !== undefined) {
        return `numeric(${col.numericPrecision}, ${col.numericScale})`
      }
      return 'numeric'
    case 'varchar':
      return col.characterMaximumLength
        ? `character varying(${col.characterMaximumLength})`
        : 'character varying'
    case 'bpchar':
      return col.characterMaximumLength ? `character(${col.characterMaximumLength})` : 'char'
    case 'timestamptz':
      return 'timestamp with time zone'
    case 'timestamp':
      return 'timestamp without time zone'
    case 'jsonb':
      return 'jsonb'
    case 'json':
      return 'json'
    case 'uuid':
      return 'uuid'
    case 'bytea':
      return 'bytea'
    case 'date':
      return 'date'
    case 'text':
      return 'text'
    default:
      return dt || 'text'
  }
}

function orderSelfReferencingRows(table: BackupTableDump): Array<Record<string, unknown>> {
  const selfFkCols = table.foreignKeys
    .filter((fk) => fk.refTable === table.name)
    .map((fk) => fk.column)

  if (selfFkCols.length === 0 || table.rows.length <= 1) return table.rows

  const pkCol = table.primaryKey[0] ?? 'id'
  const remaining = [...table.rows]
  const insertedIds = new Set<unknown>()
  const result: Array<Record<string, unknown>> = []

  let progress = true
  while (remaining.length > 0 && progress) {
    progress = false
    for (let i = 0; i < remaining.length; ) {
      const row = remaining[i]!
      const ready = selfFkCols.every((col) => {
        const refVal = row[col]
        return refVal === null || refVal === undefined || insertedIds.has(refVal)
      })
      if (ready) {
        result.push(row)
        insertedIds.add(row[pkCol])
        remaining.splice(i, 1)
        progress = true
      } else {
        i += 1
      }
    }
  }
  return [...result, ...remaining]
}

/**
 * Generates a portable, standard PostgreSQL `.sql` script (`schema-and-data`, `data-only`, or `schema-only`)
 * compatible with `psql`, pgAdmin, Neon SQL Editor, and `/admin/database` transactional restore.
 */
export function serializeArchiveToSql(
  archive: LogicalBackupArchive,
  options: {
    contentMode?: BackupContentMode
    includeTransaction?: boolean
    includeTruncate?: boolean
    upsertOnConflict?: boolean
  } = {},
): string {
  const {
    contentMode = archive.contentMode ?? 'schema-and-data',
    includeTransaction = true,
    includeTruncate = true,
    upsertOnConflict = false,
  } = options

  const lines: string[] = []
  const totalRows = archive.tables.reduce((s, t) => s + t.rowCount, 0)

  lines.push('-- ============================================================================')
  lines.push('-- PoCMS PostgreSQL Logical SQL Dump')
  lines.push(`-- Created At   : ${archive.createdAt}`)
  lines.push(`-- Content Mode : ${contentMode}`)
  lines.push(`-- Server       : ${archive.serverVersion ?? 'PostgreSQL'}`)
  lines.push(`-- Tables       : ${archive.tables.length} (${totalRows} total rows)`)
  lines.push(`-- Checksum     : ${archive.checksumSha256}`)
  lines.push('-- ============================================================================')
  lines.push('')

  if (includeTransaction) {
    lines.push('BEGIN;')
  }
  lines.push('SET standard_conforming_strings = on;')
  lines.push('')

  const { ordered } = topologicalSortTables(archive.tables)
  const byName = new Map(archive.tables.map((t) => [t.name, t]))
  const orderedTables = ordered
    .map((name) => byName.get(name))
    .filter((t): t is BackupTableDump => Boolean(t))

  // 1. Schema DDL (Enums, Sequences, Tables, Foreign Keys)
  if (contentMode !== 'data-only') {
    for (const en of archive.enums ?? []) {
      const vals = en.values.map((v) => escapePgStringLiteral(v)).join(', ')
      lines.push(
        `DO $$ BEGIN CREATE TYPE public.${quoteIdent(en.name)} AS ENUM (${vals}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      )
    }
    if ((archive.enums?.length ?? 0) > 0) lines.push('')

    for (const seq of archive.sequences) {
      lines.push(`CREATE SEQUENCE IF NOT EXISTS public.${quoteIdent(seq.sequenceName)};`)
    }
    if (archive.sequences.length > 0) lines.push('')

    const seqByTableCol = new Map(
      archive.sequences.map((s) => [`${s.tableName}.${s.columnName}`, s.sequenceName]),
    )

    for (const tbl of orderedTables) {
      if (tbl.columns.length === 0) continue
      lines.push(`CREATE TABLE IF NOT EXISTS public.${quoteIdent(tbl.name)} (`)
      const colDefs: string[] = []
      for (const col of tbl.columns) {
        const pgType = formatPgColumnType(col)
        const seqName = seqByTableCol.get(`${tbl.name}.${col.name}`)
        let defaultClause = ''
        if (seqName) {
          defaultClause = ` DEFAULT nextval('public.${quoteIdent(seqName)}'::regclass)`
        } else if (col.columnDefault && !col.columnDefault.startsWith('nextval(')) {
          defaultClause = ` DEFAULT ${col.columnDefault}`
        }
        const nullClause = col.isNullable ? '' : ' NOT NULL'
        colDefs.push(`  ${quoteIdent(col.name)} ${pgType}${defaultClause}${nullClause}`)
      }
      if (tbl.primaryKey.length > 0) {
        colDefs.push(
          `  PRIMARY KEY (${tbl.primaryKey.map((pk) => quoteIdent(pk)).join(', ')})`,
        )
      }
      lines.push(colDefs.join(',\n'))
      lines.push(');')
      lines.push('')
    }

    for (const tbl of orderedTables) {
      tbl.foreignKeys.forEach((fk, idx) => {
        const cname =
          fk.constraintName || `${tbl.name}_${fk.column}_${fk.refTable}_fk_${idx + 1}`
        const onDelete =
          fk.onDelete && fk.onDelete !== 'NO ACTION' ? ` ON DELETE ${fk.onDelete}` : ''
        lines.push(
          `DO $$ BEGIN ALTER TABLE public.${quoteIdent(tbl.name)} ADD CONSTRAINT ${quoteIdent(cname)} FOREIGN KEY (${quoteIdent(fk.column)}) REFERENCES public.${quoteIdent(fk.refTable)}(${quoteIdent(fk.refColumn)})${onDelete}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        )
      })
    }
    lines.push('')
  }

  // 2. Data DML (TRUNCATE / INSERT / ON CONFLICT / setval)
  if (contentMode !== 'schema-only') {
    const dataTables = orderedTables.filter(
      (t) => t.name !== 'payload_migrations' || contentMode === 'schema-and-data',
    )

    if (includeTruncate && !upsertOnConflict && dataTables.length > 0) {
      const truncTargets = dataTables
        .filter((t) => t.name !== 'payload_migrations' && t.name !== 'audit_logs')
        .map((t) => `public.${quoteIdent(t.name)}`)
      if (truncTargets.length > 0) {
        lines.push(`TRUNCATE TABLE ${truncTargets.join(', ')} RESTART IDENTITY CASCADE;`)
        lines.push('')
      }
    }

    for (const tbl of dataTables) {
      if (tbl.rows.length === 0) continue
      const orderedRows = orderSelfReferencingRows(tbl)
      const colNames =
        tbl.columns.length > 0
          ? tbl.columns.map((c) => c.name)
          : Object.keys(orderedRows[0] ?? {})
      if (colNames.length === 0) continue

      const colMetaMap = new Map(tbl.columns.map((c) => [c.name, c]))
      const quotedCols = colNames.map((c) => quoteIdent(c)).join(', ')

      let conflictClause = ''
      if (upsertOnConflict && tbl.primaryKey.length > 0) {
        const pkQuoted = tbl.primaryKey.map((pk) => quoteIdent(pk)).join(', ')
        const nonPkCols = colNames.filter((c) => !tbl.primaryKey.includes(c))
        if (nonPkCols.length > 0) {
          const updates = nonPkCols
            .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
            .join(', ')
          conflictClause = ` ON CONFLICT (${pkQuoted}) DO UPDATE SET ${updates}`
        } else {
          conflictClause = ` ON CONFLICT (${pkQuoted}) DO NOTHING`
        }
      } else if (tbl.name === 'payload_migrations' && tbl.primaryKey.length > 0) {
        const pkQuoted = tbl.primaryKey.map((pk) => quoteIdent(pk)).join(', ')
        conflictClause = ` ON CONFLICT (${pkQuoted}) DO NOTHING`
      }

      const batchSize = 100
      for (let offset = 0; offset < orderedRows.length; offset += batchSize) {
        const chunk = orderedRows.slice(offset, offset + batchSize)
        const tuples = chunk.map((row) => {
          const vals = colNames.map((col) => formatPgLiteral(row[col], colMetaMap.get(col)))
          return `  (${vals.join(', ')})`
        })
        lines.push(
          `INSERT INTO public.${quoteIdent(tbl.name)} (${quotedCols}) VALUES\n${tuples.join(',\n')}${conflictClause};`,
        )
      }
      lines.push('')
    }

    for (const seq of archive.sequences) {
      const nextVal = Math.max(seq.maxId, 1)
      const isCalled = seq.maxId > 0 ? 'true' : 'false'
      lines.push(
        `SELECT setval('public.${quoteIdent(seq.sequenceName)}', ${nextVal}, ${isCalled});`,
      )
    }
    if (archive.sequences.length > 0) lines.push('')
  }

  if (includeTransaction) {
    lines.push('COMMIT;')
  }

  return lines.join('\n') + '\n'
}

/* -------------------------------------------------------------------------- */
/* Quote & Dollar-Quote Aware PostgreSQL SQL Statement Parser                 */
/* -------------------------------------------------------------------------- */

/**
 * Splits a PostgreSQL SQL script into individual statements while respecting:
 *   - `--` single-line comments
 *   - `/* ... *\/` nested block comments
 *   - `'...'` single-quoted strings (including `''` and `E'...'` escapes)
 *   - `"..."` double-quoted identifiers
 *   - `$$...$$` and `$tag$...$tag$` dollar-quoted blocks (`DO $$ ... END $$;`)
 */
export function splitSqlStatements(sqlScript: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  const len = sqlScript.length

  let inSingleQuote = false
  let singleQuoteEscape = false
  let inDoubleQuote = false
  let dollarTag: string | null = null
  let blockCommentDepth = 0

  while (i < len) {
    const ch = sqlScript[i]!
    const next = i + 1 < len ? sqlScript[i + 1]! : ''

    // Inside block comment
    if (blockCommentDepth > 0) {
      if (ch === '/' && next === '*') {
        blockCommentDepth += 1
        i += 2
        continue
      }
      if (ch === '*' && next === '/') {
        blockCommentDepth -= 1
        i += 2
        continue
      }
      i += 1
      continue
    }

    // Inside dollar-quoted string
    if (dollarTag !== null) {
      if (sqlScript.startsWith(dollarTag, i)) {
        current += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      current += ch
      i += 1
      continue
    }

    // Inside single-quoted string
    if (inSingleQuote) {
      current += ch
      if (singleQuoteEscape && ch === '\\') {
        if (i + 1 < len) {
          current += sqlScript[i + 1]!
          i += 2
          continue
        }
      }
      if (ch === "'") {
        if (next === "'") {
          current += "'"
          i += 2
          continue
        }
        inSingleQuote = false
        singleQuoteEscape = false
      }
      i += 1
      continue
    }

    // Inside double-quoted identifier
    if (inDoubleQuote) {
      current += ch
      if (ch === '"') {
        if (next === '"') {
          current += '"'
          i += 2
          continue
        }
        inDoubleQuote = false
      }
      i += 1
      continue
    }

    // Line comment `-- ...`
    if (ch === '-' && next === '-') {
      while (i < len && sqlScript[i] !== '\n') i += 1
      continue
    }

    // Block comment `/* ... */`
    if (ch === '/' && next === '*') {
      blockCommentDepth = 1
      i += 2
      continue
    }

    // psql meta-commands at start of line (`\restrict`, `\connect`, `\set`) -> skip line
    if (ch === '\\' && (current.trim().length === 0 || sqlScript[i - 1] === '\n')) {
      while (i < len && sqlScript[i] !== '\n') i += 1
      continue
    }

    // Start of single-quoted literal (or `E'...'`)
    if (ch === "'") {
      const prevChar = current.length > 0 ? current[current.length - 1]! : ''
      inSingleQuote = true
      singleQuoteEscape = prevChar === 'E' || prevChar === 'e'
      current += ch
      i += 1
      continue
    }

    // Start of double-quoted identifier
    if (ch === '"') {
      inDoubleQuote = true
      current += ch
      i += 1
      continue
    }

    // Start of dollar-quoted block `$tag$...$tag$`
    if (ch === '$') {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sqlScript.slice(i))
      if (match) {
        dollarTag = match[0]
        current += dollarTag
        i += dollarTag.length
        continue
      }
    }

    // Statement terminator
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed.length > 0) {
        statements.push(trimmed)
      }
      current = ''
      i += 1
      continue
    }

    current += ch
    i += 1
  }

  const trailing = current.trim()
  if (trailing.length > 0) {
    statements.push(trailing)
  }

  return statements
}

const FORBIDDEN_SQL_RESTORE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\s*DROP\s+DATABASE\b/i, reason: 'DROP DATABASE is forbidden.' },
  { pattern: /^\s*(CREATE|DROP|ALTER)\s+ROLE\b/i, reason: 'Role DDL is forbidden in restores.' },
  { pattern: /^\s*ALTER\s+SYSTEM\b/i, reason: 'ALTER SYSTEM is forbidden.' },
  { pattern: /\bCOPY\b[\s\S]*\bPROGRAM\b/i, reason: 'COPY ... PROGRAM is forbidden.' },
]

/**
 * Analyzes a `.sql` restore script, strips outer transaction control (`BEGIN`/`COMMIT`) and
 * non-superuser session settings (`session_replication_role`), and extracts affected tables.
 */
export function analyzeSqlRestoreStatements(sqlText: string): {
  executableStatements: string[]
  referencedTables: string[]
  insertCount: number
  ddlCount: number
  warnings: string[]
} {
  const rawStatements = splitSqlStatements(sqlText)
  const executableStatements: string[] = []
  const tables = new Set<string>()
  const warnings: string[] = []
  let insertCount = 0
  let ddlCount = 0

  for (const stmt of rawStatements) {
    for (const rule of FORBIDDEN_SQL_RESTORE_PATTERNS) {
      if (rule.pattern.test(stmt)) {
        throw new Error(`Unsafe SQL restore statement blocked: ${rule.reason}`)
      }
    }

    // Outer transaction wrapper is controlled by `executeLogicalRestore`
    if (/^\s*(BEGIN|COMMIT|END|START\s+TRANSACTION)\b/i.test(stmt)) {
      continue
    }

    if (/^\s*SET\s+(SESSION\s+)?session_replication_role\b/i.test(stmt)) {
      warnings.push(
        'Skipped SET session_replication_role (requires PostgreSQL SUPERUSER, not permitted on Neon).',
      )
      continue
    }

    const tablePatterns = [
      /\bINSERT\s+INTO\s+(?:public\.)?"?([A-Za-z0-9_$-]+)"?/gi,
      /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?"?([A-Za-z0-9_$-]+)"?/gi,
      /\bUPDATE\s+(?:ONLY\s+)?(?:public\.)?"?([A-Za-z0-9_$-]+)"?/gi,
      /\bALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?"?([A-Za-z0-9_$-]+)"?/gi,
    ]
    for (const rx of tablePatterns) {
      let m: RegExpExecArray | null
      while ((m = rx.exec(stmt)) !== null) {
        if (m[1]) tables.add(m[1])
      }
    }

    if (/^\s*TRUNCATE\b/i.test(stmt)) {
      const cleaned = stmt
        .replace(/^\s*TRUNCATE(?:\s+TABLE)?/i, '')
        .replace(/\bRESTART\s+IDENTITY\b/gi, '')
        .replace(/\bCONTINUE\s+IDENTITY\b/gi, '')
        .replace(/\bCASCADE\b/gi, '')
        .replace(/\bRESTRICT\b/gi, '')
      for (const part of cleaned.split(',')) {
        const tName = part.trim().replace(/^public\./i, '').replace(/"/g, '').trim()
        if (tName) tables.add(tName)
      }
    }

    if (/^\s*INSERT\b/i.test(stmt)) insertCount += 1
    if (/^\s*(CREATE|ALTER|DROP)\b/i.test(stmt)) ddlCount += 1

    executableStatements.push(stmt)
  }

  return {
    executableStatements,
    referencedTables: [...tables].sort(),
    insertCount,
    ddlCount,
    warnings,
  }
}

/* -------------------------------------------------------------------------- */
/* Streaming JSON Lines / NDJSON Serializer & Parser                          */
/* -------------------------------------------------------------------------- */

export function serializeArchiveToNdjson(archive: LogicalBackupArchive): string {
  const lines: string[] = []
  lines.push(
    JSON.stringify({
      record: 'header',
      format: NDJSON_BACKUP_FORMAT,
      createdAt: archive.createdAt,
      appVersion: archive.appVersion,
      payloadVersion: archive.payloadVersion,
      serverVersion: archive.serverVersion,
      databaseName: archive.databaseName,
      redactedSecrets: archive.redactedSecrets,
      anonymizedPii: Boolean(archive.anonymizedPii),
      contentMode: archive.contentMode ?? 'schema-and-data',
    }),
  )

  for (const en of archive.enums ?? []) {
    lines.push(JSON.stringify({ record: 'enum', data: en }))
  }

  for (const mig of archive.migrations) {
    lines.push(JSON.stringify({ record: 'migration', data: mig }))
  }

  for (const tbl of archive.tables) {
    lines.push(
      JSON.stringify({
        record: 'table',
        name: tbl.name,
        columns: tbl.columns,
        primaryKey: tbl.primaryKey,
        foreignKeys: tbl.foreignKeys,
        rowCount: tbl.rowCount,
      }),
    )
    for (const row of tbl.rows) {
      lines.push(
        JSON.stringify({
          record: 'row',
          table: tbl.name,
          data: row,
        }),
      )
    }
  }

  for (const seq of archive.sequences) {
    lines.push(JSON.stringify({ record: 'sequence', data: seq }))
  }

  lines.push(
    JSON.stringify({
      record: 'footer',
      checksumSha256: archive.checksumSha256,
    }),
  )

  return lines.join('\n') + '\n'
}

export function parseNdjsonToArchive(ndjsonText: string): LogicalBackupArchive {
  const rawLines = ndjsonText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (rawLines.length === 0) {
    throw new Error('NDJSON backup file is empty.')
  }

  let header: Record<string, unknown> | null = null
  const enums: BackupEnumMeta[] = []
  const migrations: LogicalBackupArchive['migrations'] = []
  const tablesMap = new Map<string, BackupTableDump>()
  const tablesOrder: string[] = []
  const sequences: LogicalBackupArchive['sequences'] = []
  let footerChecksum: string | null = null

  for (const line of rawLines) {
    const parsed = JSON.parse(line) as Record<string, unknown>
    const rec = parsed.record

    if (rec === 'header') {
      if (parsed.format !== NDJSON_BACKUP_FORMAT) {
        throw new Error(`Unsupported NDJSON backup format "${String(parsed.format)}".`)
      }
      header = parsed
    } else if (rec === 'enum' && parsed.data) {
      enums.push(parsed.data as BackupEnumMeta)
    } else if (rec === 'migration' && parsed.data) {
      migrations.push(parsed.data as LogicalBackupArchive['migrations'][number])
    } else if (rec === 'table' && typeof parsed.name === 'string') {
      const dump: BackupTableDump = {
        name: parsed.name,
        columns: (parsed.columns as BackupColumnMeta[]) ?? [],
        primaryKey: (parsed.primaryKey as string[]) ?? [],
        foreignKeys: (parsed.foreignKeys as BackupTableDump['foreignKeys']) ?? [],
        rowCount: 0,
        rows: [],
      }
      tablesMap.set(parsed.name, dump)
      tablesOrder.push(parsed.name)
    } else if (rec === 'row' && typeof parsed.table === 'string' && parsed.data) {
      let tbl = tablesMap.get(parsed.table)
      if (!tbl) {
        tbl = {
          name: parsed.table,
          columns: [],
          primaryKey: ['id'],
          foreignKeys: [],
          rowCount: 0,
          rows: [],
        }
        tablesMap.set(parsed.table, tbl)
        tablesOrder.push(parsed.table)
      }
      tbl.rows.push(parsed.data as Record<string, unknown>)
      tbl.rowCount = tbl.rows.length
    } else if (rec === 'sequence' && parsed.data) {
      sequences.push(parsed.data as LogicalBackupArchive['sequences'][number])
    } else if (rec === 'footer' && typeof parsed.checksumSha256 === 'string') {
      footerChecksum = parsed.checksumSha256
    }
  }

  if (!header) {
    throw new Error('Malformed NDJSON backup: missing header record.')
  }

  const tables = tablesOrder.map((name) => tablesMap.get(name)!).filter(Boolean)
  const expectedChecksum = computeArchiveChecksum({ tables, sequences, migrations })
  if (footerChecksum && footerChecksum !== expectedChecksum) {
    throw new Error('NDJSON backup SHA-256 checksum mismatch (corrupted stream).')
  }

  return {
    format: LOGICAL_BACKUP_FORMAT,
    createdAt: typeof header.createdAt === 'string' ? header.createdAt : new Date().toISOString(),
    appVersion: typeof header.appVersion === 'string' ? header.appVersion : '1.0.0',
    payloadVersion: typeof header.payloadVersion === 'string' ? header.payloadVersion : '3.90.2',
    serverVersion: typeof header.serverVersion === 'string' ? header.serverVersion : null,
    databaseName: typeof header.databaseName === 'string' ? header.databaseName : null,
    redactedSecrets: Boolean(header.redactedSecrets),
    anonymizedPii: Boolean(header.anonymizedPii),
    contentMode: (header.contentMode as BackupContentMode | undefined) ?? 'schema-and-data',
    enums,
    migrations,
    tables,
    sequences,
    checksumSha256: footerChecksum ?? expectedChecksum,
  }
}

/* -------------------------------------------------------------------------- */
/* RFC-4180 CSV Table Serializer & Parser                                     */
/* -------------------------------------------------------------------------- */

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str =
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function serializeTableToCsv(table: BackupTableDump): string {
  const colNames =
    table.columns.length > 0
      ? table.columns.map((c) => c.name)
      : table.rows[0]
        ? Object.keys(table.rows[0])
        : []

  if (colNames.length === 0) return ''

  const lines: string[] = [colNames.map((c) => escapeCsvCell(c)).join(',')]
  for (const row of table.rows) {
    lines.push(colNames.map((col) => escapeCsvCell(row[col])).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/**
 * State-machine RFC-4180 CSV parser supporting quoted fields, embedded newlines, and `""` escapes.
 */
export function parseCsvRecords(csvText: string): {
  headers: string[]
  rows: Array<Record<string, string>>
} {
  const clean = csvText.replace(/^\uFEFF/, '')
  const matrix: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false
  let i = 0

  while (i < clean.length) {
    const ch = clean[i]!
    const next = i + 1 < clean.length ? clean[i + 1]! : ''

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentCell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      currentCell += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (ch === ',') {
      currentRow.push(currentCell)
      currentCell = ''
      i += 1
      continue
    }

    if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell)
      matrix.push(currentRow)
      currentRow = []
      currentCell = ''
      i += 2
      continue
    }

    if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell)
      matrix.push(currentRow)
      currentRow = []
      currentCell = ''
      i += 1
      continue
    }

    currentCell += ch
    i += 1
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    matrix.push(currentRow)
  }

  if (matrix.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = matrix[0]!.map((h) => h.trim()).filter((h) => h.length > 0)
  const rows: Array<Record<string, string>> = []
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r]!
    if (cells.length === 1 && cells[0] === '') continue
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? ''
    })
    rows.push(obj)
  }

  return { headers, rows }
}

/**
 * Coerces a CSV string cell into a typed PostgreSQL parameter value using `information_schema` column metadata.
 */
export function coerceCsvCellValue(
  rawCell: string,
  colMeta: BackupColumnMeta,
): unknown {
  if (rawCell === '') {
    return colMeta.isNullable ? null : ''
  }

  const udt = colMeta.udtName.toLowerCase()
  const dt = colMeta.dataType.toLowerCase()

  if (udt === 'int2' || udt === 'int4' || udt === 'int8') {
    const n = Number(rawCell)
    if (Number.isNaN(n)) throw new Error(`Invalid integer "${rawCell}" for column "${colMeta.name}".`)
    return n
  }

  if (udt === 'numeric' || udt === 'float4' || udt === 'float8') {
    const n = Number(rawCell)
    if (Number.isNaN(n)) throw new Error(`Invalid number "${rawCell}" for column "${colMeta.name}".`)
    return n
  }

  if (udt === 'bool' || dt === 'boolean') {
    const lower = rawCell.trim().toLowerCase()
    return lower === 'true' || lower === 't' || lower === '1' || lower === 'yes'
  }

  if (udt === 'json' || udt === 'jsonb' || dt === 'json' || dt === 'jsonb') {
    // Validate JSON syntax and return stringified JSON for node-postgres
    const parsed = JSON.parse(rawCell)
    return JSON.stringify(parsed)
  }

  return rawCell
}
