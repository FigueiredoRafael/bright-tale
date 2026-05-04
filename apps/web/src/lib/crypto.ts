import { randomBytes, createCipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getSecretKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) throw new Error('ENCRYPTION_SECRET is required')
  if (secret.length !== 64 || !/^[0-9a-fA-F]+$/.test(secret)) {
    throw new Error('ENCRYPTION_SECRET must be a 64-character hex string')
  }
  return Buffer.from(secret, 'hex')
}

export interface AeadOptions { aad?: string }

export function encrypt(plaintext: string, opts: AeadOptions = {}): string {
  const key = getSecretKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function aadFor(table: string, column: string, rowId: string, scope: string): string {
  return `${table}:${column}:${rowId}:${scope}`
}
