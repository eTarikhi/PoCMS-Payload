import crypto from 'node:crypto'
import zlib from 'node:zlib'

import {
  LOGICAL_BACKUP_FORMAT,
  type BackupTableDump,
  type LogicalBackupArchive,
} from '../shared'

export const ENCRYPTED_ENVELOPE_FORMAT = 'pocms-aes-256-gcm-v1' as const

export type EncryptedBackupEnvelope = {
  envelope: typeof ENCRYPTED_ENVELOPE_FORMAT
  createdAt: string
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
  const { compress = true, encryptionSecret = null } = options
  const jsonBytes = Buffer.from(JSON.stringify(archive), 'utf8')
  const innerBytes = compress ? zlib.gzipSync(jsonBytes, { level: 6 }) : jsonBytes

  if (!encryptionSecret) {
    return {
      bytes: innerBytes,
      encrypted: false,
      compressed: compress,
      contentType: compress ? 'application/gzip' : 'application/json',
      extension: compress ? '.json.gz' : '.json',
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
    createdAt: archive.createdAt,
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
    extension: compress ? '.enc.json.gz' : '.enc.json',
  }
}

/**
 * Unpacks, optionally decrypts, decompresses, and integrity-verifies a logical backup archive.
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
  const inputBuf =
    typeof rawInput === 'string' ? Buffer.from(rawInput, 'utf8') : Buffer.from(rawInput)

  if (inputBuf.length === 0) {
    throw new Error('Backup archive is empty.')
  }

  const decompressedOuter = isGzipBuffer(inputBuf) ? zlib.gunzipSync(inputBuf) : inputBuf
  let parsedOuter: unknown
  try {
    parsedOuter = JSON.parse(decompressedOuter.toString('utf8'))
  } catch {
    throw new Error('Backup file is not valid JSON or gzip-compressed JSON.')
  }

  let encrypted = false
  let candidate: unknown = parsedOuter

  if (
    parsedOuter &&
    typeof parsedOuter === 'object' &&
    (parsedOuter as { envelope?: unknown }).envelope === ENCRYPTED_ENVELOPE_FORMAT
  ) {
    encrypted = true
    const secret = options.encryptionSecret?.trim()
    if (!secret) {
      throw new Error(
        'Backup archive is encrypted (AES-256-GCM), but neither DATABASE_BACKUP_SECRET nor PAYLOAD_SECRET is configured to decrypt it.',
      )
    }

    const envObj = parsedOuter as EncryptedBackupEnvelope
    try {
      const salt = Buffer.from(envObj.salt, 'base64')
      const iv = Buffer.from(envObj.iv, 'base64')
      const authTag = Buffer.from(envObj.authTag, 'base64')
      const ciphertext = Buffer.from(envObj.ciphertext, 'base64')
      const key = crypto.scryptSync(secret, salt, 32)
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(authTag)
      const decryptedInner = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      const unpackedInner =
        envObj.compressed || isGzipBuffer(decryptedInner)
          ? zlib.gunzipSync(decryptedInner)
          : decryptedInner
      candidate = JSON.parse(unpackedInner.toString('utf8'))
    } catch {
      throw new Error(
        'Failed to decrypt backup archive: encryption key mismatch or tampered ciphertext.',
      )
    }
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
