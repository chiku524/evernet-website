import { objectKey } from './objectKey.js'
import { abortMultipartOlderThan } from './multipart.js'
import { deleteObjectOnChain } from './soroban.js'
import {
  createDeleteMarker,
  deleteObjectLocal,
  loadVaultForLifecycle,
  markLifecycleRun,
  type LifecycleRule,
  type StoredObjectMeta,
  type VersioningStatus,
} from './store.js'

const LIFECYCLE_MIN_INTERVAL_MS = 5 * 60 * 1000

export type LifecycleApplyResult = {
  skipped: boolean
  expiredCurrent: number
  expiredNoncurrent: number
  abortedMultipart: number
}

function matchesPrefix(key: string, prefix: string): boolean {
  if (!prefix) return true
  return key.startsWith(prefix)
}

function ageMs(createdAt: number): number {
  return Date.now() - createdAt
}

async function expireCurrent(
  owner: string,
  obj: StoredObjectMeta,
  versioning: VersioningStatus,
): Promise<void> {
  if (versioning === 'Enabled') {
    await createDeleteMarker(owner, obj.folder, obj.name, obj.projectId)
    return
  }
  await deleteObjectLocal(owner, obj.hash)
  if (!obj.isDeleteMarker) {
    await deleteObjectOnChain({ owner, hashHex: obj.hash }).catch(() => undefined)
  }
}

/**
 * Apply vault lifecycle rules. Rate-limited to once per LIFECYCLE_MIN_INTERVAL_MS per owner.
 */
export async function applyLifecycle(owner: string): Promise<LifecycleApplyResult> {
  const vault = await loadVaultForLifecycle(owner)
  const last = vault.lifecycleLastRunAt || 0
  if (Date.now() - last < LIFECYCLE_MIN_INTERVAL_MS) {
    return { skipped: true, expiredCurrent: 0, expiredNoncurrent: 0, abortedMultipart: 0 }
  }

  const versioning = vault.versioning || 'Disabled'
  const rules = (vault.lifecycleRules || []).filter((r) => r.enabled)
  let expiredCurrent = 0
  let expiredNoncurrent = 0
  let abortedMultipart = 0

  if (!rules.length) {
    await markLifecycleRun(owner)
    return { skipped: false, expiredCurrent, expiredNoncurrent, abortedMultipart }
  }

  const active = Object.values(vault.objects).filter((o) => !o.deletedAt)

  for (const rule of rules) {
    if (rule.expirationDays) {
      const maxAge = rule.expirationDays * 86_400_000
      const currents = active.filter(
        (o) =>
          o.isLatest &&
          !o.isDeleteMarker &&
          matchesPrefix(objectKey(o), rule.prefix) &&
          ageMs(o.createdAt) >= maxAge,
      )
      for (const obj of currents) {
        await expireCurrent(owner, obj, versioning)
        expiredCurrent += 1
      }
    }

    if (rule.noncurrentDays) {
      const maxAge = rule.noncurrentDays * 86_400_000
      // Reload after possible mutations
      const fresh = await loadVaultForLifecycle(owner)
      const noncurrent = Object.values(fresh.objects).filter(
        (o) =>
          !o.deletedAt &&
          !o.isLatest &&
          matchesPrefix(objectKey(o), rule.prefix) &&
          ageMs(o.createdAt) >= maxAge,
      )
      for (const obj of noncurrent) {
        await deleteObjectLocal(owner, obj.hash)
        if (!obj.isDeleteMarker) {
          await deleteObjectOnChain({ owner, hashHex: obj.hash }).catch(() => undefined)
        }
        expiredNoncurrent += 1
      }
    }

    if (rule.abortMultipartDays) {
      const aborted = await abortMultipartOlderThan(
        owner,
        rule.abortMultipartDays * 86_400_000,
      )
      abortedMultipart += aborted.length
    }
  }

  await markLifecycleRun(owner)
  return { skipped: false, expiredCurrent, expiredNoncurrent, abortedMultipart }
}

export function summarizeRules(rules: LifecycleRule[]): {
  ruleCount: number
  enabledCount: number
} {
  return {
    ruleCount: rules.length,
    enabledCount: rules.filter((r) => r.enabled).length,
  }
}
