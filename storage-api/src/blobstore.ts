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
  listKeys(prefix: string): Promise<string[]>
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
    writeFileSync(this.file(key), JSON.stringify(value))
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

  async listKeys(prefix: string): Promise<string[]> {
    const dir = path.join(config.dataDir, prefix)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => path.posix.join(prefix.replace(/\\/g, '/').replace(/\/$/, ''), entry))
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    const keys = await this.listKeys(prefix)
    const out: T[] = []
    for (const key of keys) {
      const parsed = await this.getJson<T>(key)
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
      cacheControlMaxAge: 0,
      token: config.blobToken,
    })
    return res.url
  }

  private async fetchUrl(url: string): Promise<Buffer | null> {
    const bust = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`
    try {
      const res = await fetch(`${url}${bust}`, { cache: 'no-store' })
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } catch {
      return null
    }
  }

  async getBytes(locator: string): Promise<Buffer | null> {
    const { get, head } = await this.sdk()

    try {
      const result = await get(locator, {
        access: 'public',
        token: config.blobToken,
        useCache: false,
      })
      if (result?.stream) {
        return Buffer.from(await new Response(result.stream as ReadableStream).arrayBuffer())
      }
    } catch {
      /* fall through */
    }

    try {
      if (locator.startsWith('http')) return this.fetchUrl(locator)
      const meta = await head(locator, { token: config.blobToken })
      return this.fetchUrl(meta.url)
    } catch {
      return null
    }
  }

  async delBytes(locator: string): Promise<void> {
    const { del } = await this.sdk()
    try {
      await del(locator, { token: config.blobToken })
    } catch {
      /* already gone */
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
    await this.delBytes(key)
  }

  async listKeys(prefix: string): Promise<string[]> {
    const { list } = await this.sdk()
    const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`
    const found = await list({ prefix: normalized, limit: 1000, token: config.blobToken })
    return found.blobs.map((b) => b.pathname).filter(Boolean)
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    const keys = await this.listKeys(prefix)
    const results = await Promise.all(keys.map((key) => this.getJson<T>(key)))
    return results.filter((r): r is Awaited<T> => r !== null)
  }
}

export const driver: Driver = config.blobToken ? new VercelBlobDriver() : new LocalDriver()
