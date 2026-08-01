import { randomBytes } from 'node:crypto'
import { driver, pathId } from './blobstore.js'

export type ProjectRecord = {
  id: string
  owner: string
  name: string
  /** Soft cap within the wallet pool; omit/null = no project-level cap. */
  maxBytes: number | null
  /** Bytes uploaded through this project’s API keys (credited on upload). */
  usedBytes: number
  createdAt: number
  archivedAt?: number
}

export type PublicProject = {
  id: string
  name: string
  maxBytes: number | null
  usedBytes: number
  createdAt: number
  remainingBytes: number | null
}

type OwnerIndex = { owner: string; ids: string[] }

function projectPath(id: string): string {
  return `v1/projects/${id}.json`
}

function ownerIndexPath(owner: string): string {
  return `v1/projects/by-owner/${pathId(owner)}.json`
}

function toPublic(p: ProjectRecord): PublicProject {
  return {
    id: p.id,
    name: p.name,
    maxBytes: p.maxBytes,
    usedBytes: p.usedBytes,
    createdAt: p.createdAt,
    remainingBytes: p.maxBytes == null ? null : Math.max(0, p.maxBytes - p.usedBytes),
  }
}

async function readIndex(owner: string): Promise<OwnerIndex> {
  return (await driver.getJson<OwnerIndex>(ownerIndexPath(owner))) ?? { owner, ids: [] }
}

export async function listProjects(owner: string): Promise<PublicProject[]> {
  const index = await readIndex(owner)
  const rows = await Promise.all(index.ids.map((id) => driver.getJson<ProjectRecord>(projectPath(id))))
  return rows
    .filter((p): p is ProjectRecord => Boolean(p) && !p!.archivedAt)
    .map(toPublic)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  return driver.getJson<ProjectRecord>(projectPath(id))
}

export async function createProject(
  owner: string,
  input: { name: string; maxBytes?: number | null },
): Promise<PublicProject> {
  const name = input.name.trim().slice(0, 64) || 'project'
  const id = randomBytes(8).toString('hex')
  const maxBytes =
    input.maxBytes === undefined || input.maxBytes === null
      ? null
      : Math.max(0, Math.floor(Number(input.maxBytes)))
  const record: ProjectRecord = {
    id,
    owner,
    name,
    maxBytes,
    usedBytes: 0,
    createdAt: Date.now(),
  }
  await driver.putJson(projectPath(id), record)
  const index = await readIndex(owner)
  if (!index.ids.includes(id)) {
    index.ids.push(id)
    await driver.putJson(ownerIndexPath(owner), index)
  }
  return toPublic(record)
}

export async function updateProject(
  owner: string,
  id: string,
  patch: { name?: string; maxBytes?: number | null },
): Promise<PublicProject | null> {
  const rec = await getProject(id)
  if (!rec || rec.owner !== owner || rec.archivedAt) return null
  if (patch.name !== undefined) rec.name = patch.name.trim().slice(0, 64) || rec.name
  if (patch.maxBytes !== undefined) {
    rec.maxBytes =
      patch.maxBytes === null ? null : Math.max(0, Math.floor(Number(patch.maxBytes)))
  }
  await driver.putJson(projectPath(id), rec)
  return toPublic(rec)
}

export async function archiveProject(owner: string, id: string): Promise<boolean> {
  const rec = await getProject(id)
  if (!rec || rec.owner !== owner) return false
  rec.archivedAt = Date.now()
  await driver.putJson(projectPath(id), rec)
  return true
}

/** Enforce soft cap and credit usage for a project-bound upload. */
export async function creditProjectUpload(
  projectId: string,
  bytes: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = await getProject(projectId)
  if (!rec || rec.archivedAt) return { ok: false, error: 'Project not found' }
  if (rec.maxBytes != null && rec.usedBytes + bytes > rec.maxBytes) {
    return {
      ok: false,
      error: `Project quota exceeded (${rec.usedBytes + bytes} > ${rec.maxBytes})`,
    }
  }
  rec.usedBytes += bytes
  await driver.putJson(projectPath(projectId), rec)
  return { ok: true }
}

export async function debitProjectUpload(projectId: string, bytes: number): Promise<void> {
  const rec = await getProject(projectId)
  if (!rec) return
  rec.usedBytes = Math.max(0, rec.usedBytes - bytes)
  await driver.putJson(projectPath(projectId), rec)
}
