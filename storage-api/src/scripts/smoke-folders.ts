import { Keypair, Transaction } from '@stellar/stellar-sdk'

const base = process.argv[2] || 'http://localhost:8787'

async function main() {
  const kp = Keypair.random()
  const address = kp.publicKey()
  console.log('wallet', address)

  const challenge = await (
    await fetch(`${base}/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
  ).json()
  const tx = new Transaction(challenge.transaction, challenge.network)
  tx.sign(kp)
  const verified = await (
    await fetch(`${base}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, signedTransaction: tx.toXDR() }),
    })
  ).json()
  if (!verified.token) throw new Error(JSON.stringify(verified))
  const auth = { Authorization: `Bearer ${verified.token}` }

  const created = await (
    await fetch(`${base}/folders`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'Docs/Receipts' }),
    })
  ).json()
  console.log('folders after create', created.folders)

  const form = new FormData()
  form.append('file', new Blob([`folder smoke ${Date.now()}`]), 'note.txt')
  form.append('name', 'note.txt')
  form.append('mimeType', 'text/plain')
  form.append('encrypted', 'false')
  form.append('folder', 'Docs/Receipts')
  const uploaded = await (
    await fetch(`${base}/objects`, { method: 'POST', headers: auth, body: form })
  ).json()
  if (!uploaded.object) throw new Error(JSON.stringify(uploaded))
  console.log('uploaded into', uploaded.object.folder, uploaded.object.hash)

  const moveRes = await fetch(`${base}/objects/${uploaded.object.hash}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: 'Docs', name: 'moved-note.txt' }),
  })
  const moved = await moveRes.json()
  if (!moved.object) throw new Error(`move failed: ${moveRes.status} ${JSON.stringify(moved)}`)
  console.log('moved to', moved.object.folder, 'as', moved.object.name)

  const renamed = await (
    await fetch(`${base}/folders`, {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Docs', to: 'Documents' }),
    })
  ).json()
  console.log('renamed Docs → Documents, moved objects:', renamed.moved)

  const listing = await (await fetch(`${base}/objects`, { headers: auth })).json()
  console.log(
    'listing',
    listing.folders,
    listing.objects.map((o: { folder: string; name: string }) => `${o.folder}/${o.name}`),
  )

  const deleted = await (
    await fetch(`${base}/folders?path=Documents&recursive=true`, {
      method: 'DELETE',
      headers: auth,
    })
  ).json()
  console.log('recursive delete', deleted.ok, 'removed', deleted.deletedHashes?.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
