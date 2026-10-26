import crypto from 'node:crypto'
import zlib from 'node:zlib'

import {
  LOGICAL_BACKUP_FORMAT,
  NDJSON_BACKUP_FORMAT,
  type BackupExportFormat,
  type BackupTableDump,
  type LogicalBackupArchive,
} from '../shared'

export const ENCRYPTED_ENVELOPE_FORMAT = 'pocms-aes-256-gcm-v1' as const

export type EncryptedBackupEnvelope = {
  envelope: typeof ENCRYPTED_ENVELOPE_FORMAT
  createdAt: string
  payloadFormat?: BackupExportFormat
  kdf: 'scrypt'
  salt: string
  iv: string
  authTag: string
  compressed: boolean
  ciphertext: string
}

/**
 * Resolves the backup encryption secret (`DATABASE_BACKUP_SECRET` preferred, falling back to `PAYLOAD_SECRET`).
 */
export function resolveBackupEncryptionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.DATABASE_BACKUP_SECRET?.trim()
  if (explicit && explicit.length >= 8) return explicit
  const payloadSecret = env.PAYLOAD_SECRET?.trim()
  if (payloadSecret && payloadSecret.length >= 8) return payloadSecret
  return null
}

/**
 * Computes a deterministic SHA-256 checksum over the logical archive's schema + rows + sequences + migrations.
 */
export function computeArchiveChecksum(input: {
  tables: BackupTableDump[]
  sequences: LogicalBackupArchive['sequences']
  migrations: LogicalBackupArchive['migrations']
}): string {
  const hash = crypto.createHash('sha256')
  hash.update(
    JSON.stringify({
      tables: input.tables,
      sequences: input.sequences,
      migrations: input.migrations,
    }),
  )
  return hash.digest('hex')
}

function isGzipBuffer(buf: Uint8Array): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b
}

const MIME_BY_FORMAT: Record<BackupExportFormat, string> = {
  sql: 'application/sql; charset=utf-8',
  json: 'application/json; charset=utf-8',
  ndjson: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
}

/**
 * Packs any backup payload (`sql`, `json`, `ndjson`, `csv`) with optional gzip compression
 * and AES-256-GCM authenticated encryption.
 */
export function packBackupDocument(
  rawTextOrBytes: string | Buffer,
  options: {
    format: BackupExportFormat
    createdAt?: string
    compress?: boolean
    encryptionSecret?: string | null
  },
): {
  bytes: Buffer
  encrypted: boolean
  compressed: boolean
  contentType: string
  extension: string
} {
  const {
    format,
    createdAt = new Date().toISOString(),
    compress = true,
    encryptionSecret = null,
  } = options

  const plainBytes =
    typeof rawTextOrBytes === 'string'
      ? Buffer.from(rawTextOrBytes, 'utf8')
      : Buffer.from(rawTextOrBytes)
  const innerBytes = compress ? zlib.gzipSync(plainBytes, { level: 6 }) : plainBytes

  if (!encryptionSecret) {
    return {
      bytes: innerBytes,
      encrypted: false,
      compressed: compress,
      contentType: compress ? 'application/gzip' : MIME_BY_FORMAT[format],
      extension: compress ? `.${format}.gz` : `.${format}`,
    }
  }

  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(encryptionSecret, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encryptedPayload = Buffer.concat([cipher.update(innerBytes), cipher.final()])
  const authTag = cipher.getAuthTag()

  const envelope: EncryptedBackupEnvelope = {
    envelope: ENCRYPTED_ENVELOPE_FORMAT,
    createdAt,
    payloadFormat: format,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    compressed: compress,
    ciphertext: encryptedPayload.toString('base64'),
  }

  const outerJson = Buffer.from(JSON.stringify(envelope), 'utf8')
  const outerBytes = compress ? zlib.gzipSync(outerJson, { level: 6 }) : outerJson

  return {
    bytes: outerBytes,
    encrypted: true,
    compressed: compress,
    contentType: 'application/octet-stream',
    extension: compress ? `.enc.${format}.gz` : `.enc.${format}`,
  }
}

/**
 * Unpacks, optionally decrypts, decompresses, and auto-identifies the format (`sql`, `json`, `ndjson`, `csv`)
 * of any uploaded or Cloud Vault backup file.
 */
export function unpackBackupDocument(
  rawInput: Buffer | Uint8Array | string,
  options: {
    encryptionSecret?: string | null
    formatHint?: BackupExportFormat | null
  } = {},
): {
  text: string
  detectedFormat: BackupExportFormat
  encrypted: boolean
} {
  const inputBuf =
    typeof rawInput === 'string' ? Buffer.from(rawInput, 'utf8') : Buffer.from(rawInput)

  if (inputBuf.length === 0) {
    throw new Error('Backup archive is empty.')
  }

  const decompressedOuter = isGzipBuffer(inputBuf) ? zlib.gunzipSync(inputBuf) : inputBuf
  const outerText = decompressedOuter.toString('utf8')

  let encrypted = false
  let innerText = outerText
  let envelopeFormatHint: BackupExportFormat | undefined

  if (outerText.trimStart().startsWith('{')) {
    try {
      const maybeEnvelope = JSON.parse(outerText) as Partial<EncryptedBackupEnvelope>
      if (maybeEnvelope.envelope === ENCRYPTED_ENVELOPE_FORMAT) {
        encrypted = true
        envelopeFormatHint = maybeEnvelope.payloadFormat
        const secret = options.encryptionSecret?.trim()
        if (!secret) {
          throw new Error(
            'Backup archive is encrypted (AES-256-GCM), but neither DATABASE_BACKUP_SECRET nor PAYLOAD_SECRET is configured to decrypt it.',
          )
        }
        try {
          const salt = Buffer.from(maybeEnvelope.salt ?? '', 'base64')
          const iv = Buffer.from(maybeEnvelope.iv ?? '', 'base64')
          const authTag = Buffer.from(maybeEnvelope.authTag ?? '', 'base64')
          const ciphertext = Buffer.from(maybeEnvelope.ciphertext ?? '', 'base64')
          const key = crypto.scryptSync(secret, salt, 32)
          const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
          decipher.setAuthTag(authTag)
          const decryptedInner = Buffer.concat([decipher.update(ciphertext), decipher.final()])
          const plainBuf =
            maybeEnvelope.compressed || isGzipBuffer(decryptedInner)
              ? zlib.gunzipSync(decryptedInner)
              : decryptedInner
          innerText = plainBuf.toString('utf8')
        } catch {
          throw new Error(
            'Failed to decrypt backup archive: encryption key mismatch or tampered ciphertext.',
          )
        }
      }
    } catch (err) {
      if (encrypted) throw err
      // Not single-document JSON (e.g. multi-line NDJSON starting with `{`) — continue format detection below.
    }
  }

  const trimmed = innerText.trimStart()
  let detectedFormat: BackupExportFormat | null = envelopeFormatHint ?? null

  if (!detectedFormat) {
    if (trimmed.startsWith('{')) {
      const firstNewline = trimmed.indexOf('\n')
      const firstLine = firstNewline === -1 ? trimmed : trimmed.slice(0, firstNewline).trim()
      try {
        const firstObj = JSON.parse(firstLine) as Record<string, unknown>
        if (firstObj.record === 'header' && firstObj.format === NDJSON_BACKUP_FORMAT) {
          detectedFormat = 'ndjson'
        } else if (firstObj.format === LOGICAL_BACKUP_FORMAT) {
          detectedFormat = 'json'
        }
      } catch {
        // Might be multi-line pretty-printed JSON
        try {
          const fullObj = JSON.parse(trimmed) as Record<string, unknown>
          if (fullObj.format === LOGICAL_BACKUP_FORMAT) {
            detectedFormat = 'json'
          }
        } catch {
          detectedFormat = null
        }
      }
    }

    if (!detectedFormat) {
      if (
        trimmed.startsWith('--') ||
        trimmed.startsWith('/*') ||
        /^(BEGIN|SET|CREATE|INSERT|TRUNCATE|ALTER|DROP|DO|SELECT)\b/i.test(trimmed)
      ) {
        detectedFormat = 'sql'
      } else if (options.formatHint) {
        detectedFormat = options.formatHint
      } else if (trimmed.includes(',') || trimmed.includes('\n')) {
        detectedFormat = 'csv'
      }
    }
  }

  return {
    text: innerText,
    detectedFormat: detectedFormat ?? 'json',
    encrypted,
  }
}

/**
 * Packs a `LogicalBackupArchive` into a compressed `.json.gz` buffer or an AES-256-GCM
 * authenticated-encryption `.enc.json.gz` buffer suitable for Vercel Blob cloud storage.
 */
export function packLogicalBackup(
  archive: LogicalBackupArchive,
  options: {
    compress?: boolean
    encryptionSecret?: string | null
  } = {},
): {
  bytes: Buffer
  encrypted: boolean
  compressed: boolean
  contentType: string
  extension: string
} {
  return packBackupDocument(JSON.stringify(archive), {
    format: 'json',
    createdAt: archive.createdAt,
    compress: options.compress ?? true,
    encryptionSecret: options.encryptionSecret ?? null,
  })
}

/**
 * Unpacks, optionally decrypts, decompresses, and integrity-verifies a logical JSON backup archive.
 */
export function unpackLogicalBackup(
  rawInput: Buffer | Uint8Array | string,
  options: {
    encryptionSecret?: string | null
  } = {},
): {
  archive: LogicalBackupArchive
  encrypted: boolean
  checksumVerified: boolean
} {
  const { text, encrypted } = unpackBackupDocument(rawInput, {
    encryptionSecret: options.encryptionSecret,
    formatHint: 'json',
  })

  let candidate: unknown
  try {
    candidate = JSON.parse(text)
  } catch {
    throw new Error('Backup file is not valid JSON or gzip-compressed JSON.')
  }

  if (
    !candidate ||
    typeof candidate !== 'object' ||
    (candidate as { format?: unknown }).format !== LOGICAL_BACKUP_FORMAT
  ) {
    throw new Error(
      `Unsupported backup archive format (expected "${LOGICAL_BACKUP_FORMAT}").`,
    )
  }

  const archive = candidate as LogicalBackupArchive
  if (!Array.isArray(archive.tables) || !Array.isArray(archive.sequences)) {
    throw new Error('Malformed backup archive: missing tables or sequences array.')
  }

  const recomputed = computeArchiveChecksum({
    tables: archive.tables,
    sequences: archive.sequences,
    migrations: archive.migrations ?? [],
  })
  const checksumVerified = recomputed === archive.checksumSha256
  if (!checksumVerified) {
    throw new Error('Backup archive SHA-256 checksum verification failed (corrupted payload).')
  }

  return {
    archive,
    encrypted,
    checksumVerified,
  }
}
