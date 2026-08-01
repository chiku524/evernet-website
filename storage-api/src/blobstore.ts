import { createHmac, randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

/**
 * Serverless instances get a fresh, empty /tmp, so anything written to local
 * disk on Vercel disappears between requests. When a Blob token is present we
 * persist to Vercel Blob instead; local disk stays as the dev driver.
 */
export interface Driver {
  readonly name: string
  putBytes(key: string, data: Buffer, contentType: string): Promise<string>
  getBytes(locator: string): Promise<Buffer | null>
  delBytes(locator: string): Promise<void>
  putJson(key: string, value: unknown): Promise<void>
  getJson<T>(key: string): Promise<T | null>
  delJson(key: string): Promise<void>
  listJson<T>(prefix: string): Promise<T[]>
}

/** Opaque, non-enumerable path segment: blob pathnames are world-readable. */
export function pathId(value: string): string {
  return createHmac('sha256', config.jwtSecret).update(value).digest('hex').slice(0, 32)
}

export function randomKey(): string {
  return randomBytes(24).toString('hex')
}

class LocalDriver implements Driver {
  readonly name = 'local-disk'

  private file(key: string): string {
    const full = path.join(config.dataDir, key)
    mkdirSync(path.dirname(full), { recursive: true })
    return full
  }

  async putBytes(key: string, data: Buffer): Promise<string> {
    writeFileSync(this.file(key), data)
    return key
  }

  async getBytes(locator: string): Promise<Buffer | null> {
    const full = path.join(config.dataDir, locator)
    return existsSync(full) ? readFileSync(full) : null
  }

  async delBytes(locator: string): Promise<void> {
    const full = path.join(config.dataDir, locator)
    if (existsSync(full)) rmSync(full)
  }

  async putJson(key: string, value: unknown): Promise<void> {
    writeFileSync(this.file(key), JSON.stringify(value, null, 2))
  }

  async getJson<T>(key: string): Promise<T | null> {
    const full = path.join(config.dataDir, key)
    if (!existsSync(full)) return null
    try {
      return JSON.parse(readFileSync(full, 'utf8')) as T
    } catch {
      return null
    }
  }

  async delJson(key: string): Promise<void> {
    await this.delBytes(key)
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    const dir = path.join(config.dataDir, prefix)
    if (!existsSync(dir)) return []
    const out: T[] = []
    for (const entry of readdirSync(dir)) {
      const parsed = await this.getJson<T>(path.posix.join(prefix, entry))
      if (parsed) out.push(parsed)
    }
    return out
  }
}

class VercelBlobDriver implements Driver {
  readonly name = 'vercel-blob'

  private async sdk() {
    return import('@vercel/blob')
  }

  async putBytes(key: string, data: Buffer, contentType: string): Promise<string> {
    const { put } = await this.sdk()
    const res = await put(key, data, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: config.blobToken,
    })
    return res.url
  }

  async getBytes(locator: string): Promise<Buffer | null> {
    const url = locator.startsWith('http') ? locator : await this.urlFor(locator)
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  }

  async delBytes(locator: string): Promise<void> {
    const { del } = await this.sdk()
    try {
      await del(locator, { token: config.blobToken })
    } catch {
      /* already gone */
    }
  }

  private async urlFor(key: string): Promise<string | null> {
    const { head } = await this.sdk()
    try {
      const meta = await head(key, { token: config.blobToken })
      return meta.url
    } catch {
      return null
    }
  }

  async putJson(key: string, value: unknown): Promise<void> {
    await this.putBytes(key, Buffer.from(JSON.stringify(value)), 'application/json')
  }

  async getJson<T>(key: string): Promise<T | null> {
    const buf = await this.getBytes(key)
    if (!buf) return null
    try {
      return JSON.parse(buf.toString('utf8')) as T
    } catch {
      return null
    }
  }

  async delJson(key: string): Promise<void> {
    const url = await this.urlFor(key)
    if (url) await this.delBytes(url)
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    const { list } = await this.sdk()
    const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`
    const found = await list({ prefix: normalized, limit: 1000, token: config.blobToken })
    const results = await Promise.all(
      found.blobs.map(async (b): Promise<T | null> => {
        const res = await fetch(b.url)
        if (!res.ok) return null
        try {
          return (await res.json()) as T
        } catch {
          return null
        }
      }),
    )
    return results.filter((r): r is Awaited<T> => r !== null)
  }
}

export const driver: Driver = config.blobToken ? new VercelBlobDriver() : new LocalDriver()
