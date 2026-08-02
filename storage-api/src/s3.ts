import { Router, type Response } from 'express'
import type { AuthedRequest } from './auth.js'
import { requireWallet, verifyToken } from './auth.js'
import {
  createShareGrant,
  listShareGrants,
  resolveShareToken,
  revokeShareGrant,
} from './grants.js'
import { ingestObject } from './ingest.js'
import {
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_MAX,
  abortMultipartSession,
  assembleMultipart,
  cleanupMultipartSession,
  createMultipartSession,
  putMultipartPart,
} from './multipart.js'
import { applyLifecycle } from './lifecycle.js'
import {
  findByKey,
  findVersion,
  listByPrefix,
  listVersionsByPrefix,
  objectKey,
  parseObjectKey,
} from './objectKey.js'
import { createPresignToken, verifyPresignToken } from './presign.js'
import { publicObject } from './publicMeta.js'
import {
  TRASH_TTL_MS,
  createDeleteMarker,
  deleteObjectLocal,
  getLifecycleRules,
  getObject,
  getObjectByVersion,
  getVersioning,
  listFolders,
  listObjects,
  purgeExpiredTrash,
  readBlob,
  restoreObject,
  restoreVersionLocal,
  setLatestVersion,
  setLifecycleRules,
  setVersioning,
  trashObject,
  type LifecycleRule,
  type VersioningStatus,
} from './store.js'
import { deleteObjectOnChain, getMergedProfile } from './soroban.js'
import { debitProjectUpload } from './projects.js'

function sendErr(res: Response, err: unknown, fallback = 'Request failed') {
  const e = err as Error & { status?: number; hash?: string; remaining?: number; need?: number }
  const status = e.status || 400
  const body: Record<string, unknown> = { error: e.message || fallback }
  if (e.hash) body.hash = e.hash
  if (e.remaining != null) body.remaining = e.remaining
  if (e.need != null) body.need = e.need
  res.status(status).json(body)
}

function applyRange(buf: Buffer, rangeHeader: string | undefined): {
  body: Buffer
  status: number
  contentRange?: string
} {
  if (!rangeHeader?.startsWith('bytes=')) return { body: buf, status: 200 }
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!m) return { body: buf, status: 200 }
  const start = m[1] === '' ? 0 : Number(m[1])
  const end = m[2] === '' ? buf.length - 1 : Number(m[2])
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= buf.length
  ) {
    return { body: buf, status: 200 }
  }
  const safeEnd = Math.min(end, buf.length - 1)
  return {
    body: buf.subarray(start, safeEnd + 1),
    status: 206,
    contentRange: `bytes ${start}-${safeEnd}/${buf.length}`,
  }
}

function setObjectHeaders(
  res: Response,
  meta: NonNullable<Awaited<ReturnType<typeof getObject>>>,
  opts?: { cacheMaxAge?: number },
) {
  res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('ETag', `"${meta.hash}"`)
  res.setHeader('X-Object-Hash', meta.hash)
  res.setHeader('X-Object-Key', encodeURIComponent(objectKey(meta)))
  res.setHeader('X-Object-Name', encodeURIComponent(meta.name))
  res.setHeader('X-Object-Size', String(meta.size))
  res.setHeader('X-Object-Encrypted', String(meta.encrypted))
  res.setHeader('X-Object-Version-Id', meta.versionId || meta.hash)
  res.setHeader('X-Object-Is-Latest', String(meta.isLatest !== false))
  const maxAge = opts?.cacheMaxAge
  if (maxAge != null && maxAge > 0) {
    res.setHeader('Cache-Control', `private, max-age=${maxAge}`)
  } else {
    res.setHeader('Cache-Control', 'private, no-store')
  }
  res.setHeader(
    'Access-Control-Expose-Headers',
    'ETag, X-Object-Hash, X-Object-Key, X-Object-Name, X-Object-Size, X-Object-Encrypted, X-Object-Version-Id, X-Object-Is-Latest, Content-Range, Accept-Ranges',
  )
}

async function sendObjectBytes(
  res: Response,
  meta: Awaited<ReturnType<typeof getObject>>,
  rangeHeader?: string,
  opts?: { cacheMaxAge?: number; ifNoneMatch?: string },
) {
  if (!meta || meta.isDeleteMarker) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const etag = `"${meta.hash}"`
  if (opts?.ifNoneMatch && opts.ifNoneMatch.replace(/W\//, '') === etag) {
    setObjectHeaders(res, meta, opts)
    res.status(304).end()
    return
  }
  const blob = await readBlob(meta)
  if (!blob) {
    res.status(404).json({ error: 'Blob missing' })
    return
  }
  const ranged = applyRange(blob, rangeHeader)
  res.status(ranged.status)
  setObjectHeaders(res, meta, opts)
  if (ranged.contentRange) res.setHeader('Content-Range', ranged.contentRange)
  res.send(ranged.body)
}

function optionalBearerWallet(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (!token || token.startsWith('evn_')) return null
  return verifyToken(token)
}

export const s3Router = Router()

/** Capability probe for cloud-storage surface. */
s3Router.get('/', (_req, res) => {
  res.json({
    name: 'Evernet S3-shaped API',
    version: '4',
    notes:
      'JSON S3-shaped API. Opt-in versioning, lifecycle rules, soft-delete trash (30d), multipart, shares.',
    maxSimplePutBytes: 80 * 1024 * 1024,
    maxPartBytes: MULTIPART_PART_MAX,
    maxParts: MULTIPART_MAX_PARTS,
    trashTtlMs: TRASH_TTL_MS,
    endpoints: {
      list: 'GET /s3/v1/objects?prefix=&delimiter=/&trash=',
      versions: 'GET /s3/v1/versions?prefix=',
      put: 'PUT /s3/v1/object?key=',
      get: 'GET /s3/v1/object?key=&versionId= (Range + If-None-Match)',
      head: 'HEAD /s3/v1/object?key=&versionId=',
      copy: 'POST /s3/v1/copy',
      delete: 'DELETE /s3/v1/object?key=&versionId=&permanent=',
      restore: 'POST /s3/v1/restore',
      restoreVersion: 'POST /s3/v1/restore-version',
      deleteBatch: 'POST /s3/v1/delete',
      versioning: 'GET/PUT /s3/v1/versioning',
      lifecycle: 'GET/PUT /s3/v1/lifecycle',
      multipartCreate: 'POST /s3/v1/multipart',
      multipartPart: 'PUT /s3/v1/multipart/:uploadId/:partNumber',
      multipartComplete: 'POST /s3/v1/multipart/:uploadId/complete',
      multipartAbort: 'DELETE /s3/v1/multipart/:uploadId',
      presign: 'POST /s3/v1/presign',
      presignedGet: 'GET /s3/v1/presigned/:token',
      grants: 'POST/GET /s3/v1/grants · DELETE /s3/v1/grants/:id',
      sharedGet: 'GET /s3/v1/shared/:token',
    },
  })
})

/** Public/short-lived signed download — no wallet header. */
s3Router.get('/presigned/:token', async (req, res) => {
  try {
    const payload = verifyPresignToken(String(req.params.token))
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired presign token' })
      return
    }
    const meta = await getObject(payload.sub, payload.hash)
    const remaining = Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
    await sendObjectBytes(res, meta, req.headers.range, {
      cacheMaxAge: Math.min(300, remaining),
    })
  } catch (err) {
    sendErr(res, err, 'Presigned download failed')
  }
})

/** Revocable share link (optional grantee wallet restriction). */
s3Router.get('/shared/:token', async (req, res) => {
  try {
    const caller = optionalBearerWallet(req)
    const resolved = await resolveShareToken(String(req.params.token), caller)
    if (!resolved) {
      res.status(401).json({
        error: 'Invalid, expired, revoked, or unauthorized share token',
      })
      return
    }
    const meta = await getObject(resolved.grant.owner, resolved.grant.hash)
    const remaining = Math.max(0, Math.floor((resolved.grant.expiresAt - Date.now()) / 1000))
    await sendObjectBytes(res, meta, req.headers.range, {
      cacheMaxAge: Math.min(300, remaining),
    })
  } catch (err) {
    sendErr(res, err, 'Shared download failed')
  }
})

s3Router.use(requireWallet)

s3Router.get('/objects', async (req: AuthedRequest, res) => {
  try {
    await applyLifecycle(req.wallet!).catch(() => undefined)
    const trashQ = String(req.query.trash || '')
    const trash: boolean | 'only' =
      trashQ === '1' || trashQ === 'true' ? true : trashQ === 'only' ? 'only' : false
    const objects = await listObjects(req.wallet!, { trash })
    const listed = listByPrefix(objects, {
      prefix: String(req.query.prefix || ''),
      delimiter: req.query.delimiter === undefined ? '/' : String(req.query.delimiter),
    })
    res.json({
      ...listed,
      keyCount: listed.contents.length,
      prefix: String(req.query.prefix || ''),
      delimiter: req.query.delimiter === undefined ? '/' : String(req.query.delimiter),
      trash,
      trashTtlMs: TRASH_TTL_MS,
      versioning: await getVersioning(req.wallet!),
    })
  } catch (err) {
    sendErr(res, err, 'List failed')
  }
})

s3Router.get('/versions', async (req: AuthedRequest, res) => {
  try {
    await applyLifecycle(req.wallet!).catch(() => undefined)
    const all = await listObjects(req.wallet!, { latestOnly: false })
    const versions = listVersionsByPrefix(all, { prefix: String(req.query.prefix || '') })
    res.json({
      versions,
      keyCount: versions.length,
      prefix: String(req.query.prefix || ''),
      versioning: await getVersioning(req.wallet!),
    })
  } catch (err) {
    sendErr(res, err, 'List versions failed')
  }
})

s3Router.get('/versioning', async (req: AuthedRequest, res) => {
  try {
    res.json({ status: await getVersioning(req.wallet!) })
  } catch (err) {
    sendErr(res, err, 'Get versioning failed')
  }
})

s3Router.put('/versioning', async (req: AuthedRequest, res) => {
  try {
    const status = String(req.body?.status || '') as VersioningStatus
    const next = await setVersioning(req.wallet!, status)
    res.json({ status: next })
  } catch (err) {
    sendErr(res, err, 'Set versioning failed')
  }
})

s3Router.get('/lifecycle', async (req: AuthedRequest, res) => {
  try {
    res.json({ rules: await getLifecycleRules(req.wallet!) })
  } catch (err) {
    sendErr(res, err, 'Get lifecycle failed')
  }
})

s3Router.put('/lifecycle', async (req: AuthedRequest, res) => {
  try {
    const rules = (req.body?.rules || []) as LifecycleRule[]
    const saved = await setLifecycleRules(req.wallet!, rules)
    res.json({ rules: saved })
  } catch (err) {
    sendErr(res, err, 'Set lifecycle failed')
  }
})

s3Router.put('/object', async (req: AuthedRequest, res) => {
  try {
    await applyLifecycle(req.wallet!).catch(() => undefined)
    const key = String(req.query.key || '')
    const { folder, name } = parseObjectKey(key)
    const owner = req.wallet!
    const existing = findByKey(await listObjects(owner, { latestOnly: false }), key, {
      includeDeleteMarkers: true,
    })
    const data = Buffer.isBuffer(req.body) ? req.body : undefined
    if (!data?.length) {
      res.status(400).json({ error: 'Raw request body required (application/octet-stream)' })
      return
    }

    const result = await ingestObject({
      owner,
      data,
      name,
      folder,
      mimeType: String(req.headers['x-evernet-mime'] || 'application/octet-stream'),
      encrypted: String(req.headers['x-evernet-encrypted'] ?? 'true') !== 'false',
      projectId: req.projectId,
      overwriteKey: String(req.query.overwrite || 'true') !== 'false',
      existingByKey: existing && !existing.isDeleteMarker ? existing : existing ?? null,
    })

    res.status(201).json({
      key: objectKey(result.object),
      versionId: result.object.versionId || result.object.hash,
      object: publicObject(result.object),
      profile: result.profile,
      folders: await listFolders(owner),
    })
  } catch (err) {
    sendErr(res, err, 'Put failed')
  }
})

s3Router.get('/object', async (req: AuthedRequest, res) => {
  try {
    const key = String(req.query.key || '')
    const versionId = String(req.query.versionId || '')
    let meta = null
    if (versionId) {
      meta = await getObjectByVersion(req.wallet!, key, versionId)
    } else {
      meta = findByKey(await listObjects(req.wallet!, { latestOnly: false }), key) ?? null
    }
    await sendObjectBytes(res, meta, req.headers.range, {
      ifNoneMatch: req.headers['if-none-match'],
    })
  } catch (err) {
    sendErr(res, err, 'Get failed')
  }
})

s3Router.head('/object', async (req: AuthedRequest, res) => {
  try {
    const key = String(req.query.key || '')
    const versionId = String(req.query.versionId || '')
    let meta = null
    if (versionId) {
      meta = await getObjectByVersion(req.wallet!, key, versionId)
    } else {
      meta = findByKey(await listObjects(req.wallet!, { latestOnly: false }), key) ?? null
    }
    if (!meta || meta.isDeleteMarker) {
      res.status(404).end()
      return
    }
    setObjectHeaders(res, meta)
    res.status(200).end()
  } catch {
    res.status(400).end()
  }
})

s3Router.post('/copy', async (req: AuthedRequest, res) => {
  try {
    const owner = req.wallet!
    const fromKey = String(req.body?.fromKey || req.body?.source || '')
    const toKey = String(req.body?.toKey || req.body?.destination || '')
    const source = findByKey(await listObjects(owner), fromKey)
    if (!source) {
      res.status(404).json({ error: 'Source not found' })
      return
    }
    const data = await readBlob(source)
    if (!data) {
      res.status(404).json({ error: 'Source blob missing' })
      return
    }
    const { folder, name } = parseObjectKey(toKey)
    const existing = findByKey(await listObjects(owner), toKey)
    const result = await ingestObject({
      owner,
      data,
      name,
      folder,
      mimeType: source.mimeType,
      encrypted: source.encrypted,
      projectId: req.projectId,
      overwriteKey: true,
      existingByKey: existing ?? null,
    })
    res.status(201).json({
      key: objectKey(result.object),
      object: publicObject(result.object),
      profile: result.profile,
      copiedFrom: fromKey,
      folders: await listFolders(owner),
    })
  } catch (err) {
    sendErr(res, err, 'Copy failed')
  }
})

s3Router.post('/grants', async (req: AuthedRequest, res) => {
  try {
    if (req.authType === 'api_key') {
      res.status(403).json({ error: 'Create share grants with a wallet session' })
      return
    }
    const owner = req.wallet!
    let meta = req.body?.hash ? await getObject(owner, String(req.body.hash)) : null
    if (!meta && req.body?.key) {
      meta = findByKey(await listObjects(owner), String(req.body.key)) ?? null
    }
    if (!meta) {
      res.status(404).json({ error: 'Object not found' })
      return
    }
    const created = await createShareGrant({
      owner,
      meta,
      expiresInSec: Number(req.body?.expiresInSec) || undefined,
      grantee: req.body?.grantee === undefined ? null : String(req.body.grantee),
    })
    const base = `${req.protocol}://${req.get('host')}`
    res.status(201).json({
      ...created,
      url: `${base}${created.urlPath}`,
    })
  } catch (err) {
    sendErr(res, err, 'Create grant failed')
  }
})

s3Router.get('/grants', async (req: AuthedRequest, res) => {
  try {
    if (req.authType === 'api_key') {
      res.status(403).json({ error: 'List share grants with a wallet session' })
      return
    }
    res.json({ grants: await listShareGrants(req.wallet!) })
  } catch (err) {
    sendErr(res, err, 'List grants failed')
  }
})

s3Router.delete('/grants/:id', async (req: AuthedRequest, res) => {
  try {
    if (req.authType === 'api_key') {
      res.status(403).json({ error: 'Revoke share grants with a wallet session' })
      return
    }
    const ok = await revokeShareGrant(req.wallet!, String(req.params.id))
    if (!ok) {
      res.status(404).json({ error: 'Grant not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    sendErr(res, err, 'Revoke grant failed')
  }
})

s3Router.delete('/object', async (req: AuthedRequest, res) => {
  try {
    const owner = req.wallet!
    const key = String(req.query.key || '')
    const versionId = String(req.query.versionId || '')
    const permanent =
      String(req.query.permanent || '').toLowerCase() === 'true' ||
      String(req.query.permanent || '') === '1'
    const versioning = await getVersioning(owner)
    const all = await listObjects(owner, { latestOnly: false })

    if (versionId) {
      const meta = findVersion(all, key, versionId)
      if (!meta) {
        res.status(404).json({ error: 'Version not found' })
        return
      }
      const profile = await deleteObjectLocal(owner, meta.hash)
      if (meta.projectId && !meta.deletedAt && !meta.isDeleteMarker) {
        await debitProjectUpload(meta.projectId, meta.size).catch(() => undefined)
      }
      if (!meta.isDeleteMarker) {
        await deleteObjectOnChain({ owner, hashHex: meta.hash }).catch(() => undefined)
      }
      // If we removed the latest, promote newest remaining version
      if (meta.isLatest) {
        const remaining = (await listObjects(owner, { latestOnly: false })).filter(
          (o) => objectKey(o) === key,
        )
        if (remaining.length) {
          const bytes = remaining.filter((o) => !o.isDeleteMarker)
          const newest = [...(bytes.length ? bytes : remaining)].sort(
            (a, b) => b.createdAt - a.createdAt,
          )[0]
          await setLatestVersion(owner, key, newest.versionId || newest.hash)
        }
      }
      res.json({
        ok: true,
        key,
        versionId,
        permanent: true,
        profile: await getMergedProfile(owner),
        folders: await listFolders(owner),
      })
      return
    }

    if (versioning === 'Enabled' && !permanent) {
      const latest = findByKey(all, key, { includeDeleteMarkers: true })
      if (!latest) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      if (latest.isDeleteMarker) {
        res.json({
          ok: true,
          key,
          deleteMarker: true,
          versionId: latest.versionId,
          profile: await getMergedProfile(owner),
          folders: await listFolders(owner),
        })
        return
      }
      const marker = await createDeleteMarker(owner, latest.folder, latest.name, latest.projectId)
      res.json({
        ok: true,
        key,
        deleteMarker: true,
        versionId: marker.versionId,
        profile: await getMergedProfile(owner),
        folders: await listFolders(owner),
      })
      return
    }

    const active = findByKey(all, key)
    const trashed = permanent
      ? findByKey(await listObjects(owner, { trash: 'only', latestOnly: false }), key, {
          includeTrash: true,
        })
      : undefined
    const meta = active || trashed
    if (!meta) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (permanent || meta.deletedAt) {
      const profile = await deleteObjectLocal(owner, meta.hash)
      if (meta.projectId && !meta.deletedAt) {
        await debitProjectUpload(meta.projectId, meta.size).catch(() => undefined)
      }
      await deleteObjectOnChain({ owner, hashHex: meta.hash }).catch(() => undefined)
      res.json({
        ok: true,
        key,
        permanent: true,
        profile,
        folders: await listFolders(owner),
      })
      return
    }
    const profile = await trashObject(owner, meta.hash)
    if (meta.projectId) {
      await debitProjectUpload(meta.projectId, meta.size).catch(() => undefined)
    }
    res.json({
      ok: true,
      key,
      trashed: true,
      trashTtlMs: TRASH_TTL_MS,
      profile,
      folders: await listFolders(owner),
    })
  } catch (err) {
    sendErr(res, err, 'Delete failed')
  }
})

s3Router.post('/restore-version', async (req: AuthedRequest, res) => {
  try {
    const owner = req.wallet!
    const key = String(req.body?.key || '')
    const versionId = String(req.body?.versionId || '')
    if (!key || !versionId) {
      res.status(400).json({ error: 'key and versionId required' })
      return
    }
    const object = await restoreVersionLocal(owner, key, versionId)
    res.json({
      ok: true,
      key: objectKey(object),
      versionId: object.versionId || object.hash,
      object: publicObject(object),
      folders: await listFolders(owner),
      profile: await getMergedProfile(owner),
    })
  } catch (err) {
    sendErr(res, err, 'Restore version failed')
  }
})

s3Router.post('/restore', async (req: AuthedRequest, res) => {
  try {
    const owner = req.wallet!
    let hash = String(req.body?.hash || '')
    if (!hash && req.body?.key) {
      const meta = findByKey(await listObjects(owner, { trash: 'only' }), String(req.body.key), {
        includeTrash: true,
      })
      if (!meta) {
        res.status(404).json({ error: 'Not found in trash' })
        return
      }
      hash = meta.hash
    }
    if (!hash) {
      res.status(400).json({ error: 'hash or key required' })
      return
    }
    const object = await restoreObject(owner, hash)
    res.json({
      ok: true,
      key: objectKey(object),
      object: publicObject(object),
      folders: await listFolders(owner),
      profile: await getMergedProfile(owner),
    })
  } catch (err) {
    sendErr(res, err, 'Restore failed')
  }
})

s3Router.post('/delete', async (req: AuthedRequest, res) => {
  try {
    const owner = req.wallet!
    const permanent =
      String(req.body?.permanent || '').toLowerCase() === 'true' || req.body?.permanent === true
    const keys = Array.isArray(req.body?.keys)
      ? (req.body.keys as unknown[]).map(String)
      : []
    const prefix = req.body?.prefix != null ? String(req.body.prefix) : ''
    const targets = new Map<
      string,
      { hash: string; size: number; projectId?: string; deletedAt?: number }
    >()

    const active = await listObjects(owner)
    const trashOnly = permanent || keys.length ? await listObjects(owner, { trash: 'only' }) : []
    const pool = permanent ? [...active, ...trashOnly] : active

    if (prefix) {
      const listed = listByPrefix(pool, { prefix, delimiter: '' })
      for (const item of listed.contents) {
        const meta = findByKey(pool, item.key, { includeTrash: true })
        if (meta) {
          targets.set(meta.hash, {
            hash: meta.hash,
            size: meta.size,
            projectId: meta.projectId,
            deletedAt: meta.deletedAt,
          })
        }
      }
    }
    for (const key of keys) {
      const meta =
        findByKey(active, key) || findByKey(trashOnly, key, { includeTrash: true })
      if (meta) {
        targets.set(meta.hash, {
          hash: meta.hash,
          size: meta.size,
          projectId: meta.projectId,
          deletedAt: meta.deletedAt,
        })
      }
    }

    let deleted = 0
    let trashed = 0
    for (const item of targets.values()) {
      if (permanent || item.deletedAt) {
        await deleteObjectLocal(owner, item.hash)
        if (item.projectId && !item.deletedAt) {
          await debitProjectUpload(item.projectId, item.size).catch(() => undefined)
        }
        await deleteObjectOnChain({ owner, hashHex: item.hash }).catch(() => undefined)
        deleted += 1
      } else {
        await trashObject(owner, item.hash)
        if (item.projectId) {
          await debitProjectUpload(item.projectId, item.size).catch(() => undefined)
        }
        trashed += 1
      }
    }

    res.json({
      ok: true,
      deleted,
      trashed,
      permanent,
      trashTtlMs: TRASH_TTL_MS,
      profile: await getMergedProfile(owner),
      folders: await listFolders(owner),
    })
  } catch (err) {
    sendErr(res, err, 'Batch delete failed')
  }
})

s3Router.post('/purge-trash', async (req: AuthedRequest, res) => {
  try {
    const purged = await purgeExpiredTrash(req.wallet!)
    await Promise.all(
      purged.map((hash) =>
        deleteObjectOnChain({ owner: req.wallet!, hashHex: hash }).catch(() => undefined),
      ),
    )
    res.json({ ok: true, purged: purged.length, hashes: purged })
  } catch (err) {
    sendErr(res, err, 'Purge failed')
  }
})

s3Router.post('/presign', async (req: AuthedRequest, res) => {
  try {
    const owner = req.wallet!
    let hash = String(req.body?.hash || '')
    if (!hash && req.body?.key) {
      const meta = findByKey(await listObjects(owner), String(req.body.key))
      if (!meta) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      hash = meta.hash
    }
    if (!hash) {
      res.status(400).json({ error: 'hash or key required' })
      return
    }
    const meta = await getObject(owner, hash)
    if (!meta) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const { token, expiresAt } = createPresignToken({
      owner,
      hash,
      expiresInSec: Number(req.body?.expiresInSec) || 3600,
    })
    const base = `${req.protocol}://${req.get('host')}`
    res.json({
      url: `${base}/s3/v1/presigned/${token}`,
      token,
      expiresAt,
      key: objectKey(meta),
      hash: meta.hash,
    })
  } catch (err) {
    sendErr(res, err, 'Presign failed')
  }
})

s3Router.post('/multipart', async (req: AuthedRequest, res) => {
  try {
    const session = await createMultipartSession({
      owner: req.wallet!,
      key: String(req.body?.key || ''),
      mimeType: req.body?.mimeType,
      encrypted: req.body?.encrypted !== false,
      projectId: req.projectId,
    })
    res.status(201).json({
      uploadId: session.uploadId,
      key: session.key,
      expiresAt: session.expiresAt,
      maxPartBytes: MULTIPART_PART_MAX,
      maxParts: MULTIPART_MAX_PARTS,
    })
  } catch (err) {
    sendErr(res, err, 'Multipart create failed')
  }
})

s3Router.put('/multipart/:uploadId/:partNumber', async (req: AuthedRequest, res) => {
  try {
    const data = Buffer.isBuffer(req.body) ? req.body : undefined
    if (!data?.length) {
      res.status(400).json({ error: 'Raw part body required' })
      return
    }
    const part = await putMultipartPart({
      owner: req.wallet!,
      uploadId: String(req.params.uploadId),
      partNumber: Number(req.params.partNumber),
      data,
    })
    res.json({
      uploadId: req.params.uploadId,
      partNumber: part.partNumber,
      etag: part.etag,
      size: part.size,
    })
  } catch (err) {
    sendErr(res, err, 'Part upload failed')
  }
})

s3Router.post('/multipart/:uploadId/complete', async (req: AuthedRequest, res) => {
  try {
    const owner = req.wallet!
    const uploadId = String(req.params.uploadId)
    const parts = (req.body?.parts as Array<{ partNumber: number; etag?: string }>) || []
    const numbers = parts.map((p) => Number(p.partNumber)).filter((n) => n > 0)
    const { session, data } = await assembleMultipart(owner, uploadId, numbers)
    const existing = findByKey(await listObjects(owner), session.key)
    const result = await ingestObject({
      owner,
      data,
      name: session.name,
      folder: session.folder,
      mimeType: session.mimeType,
      encrypted: session.encrypted,
      projectId: session.projectId || req.projectId,
      overwriteKey: true,
      existingByKey: existing ?? null,
    })
    await cleanupMultipartSession(owner, uploadId)
    res.status(201).json({
      key: objectKey(result.object),
      object: publicObject(result.object),
      profile: result.profile,
      folders: await listFolders(owner),
    })
  } catch (err) {
    sendErr(res, err, 'Multipart complete failed')
  }
})

s3Router.delete('/multipart/:uploadId', async (req: AuthedRequest, res) => {
  try {
    const ok = await abortMultipartSession(req.wallet!, String(req.params.uploadId))
    if (!ok) {
      res.status(404).json({ error: 'Upload session not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    sendErr(res, err, 'Abort failed')
  }
})

s3Router.get('/profile', async (req: AuthedRequest, res) => {
  try {
    res.json(await getMergedProfile(req.wallet!))
  } catch (err) {
    sendErr(res, err, 'Profile failed')
  }
})
