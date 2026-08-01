import { Keypair, Transaction } from '@stellar/stellar-sdk'

const base = process.argv[2] || 'http://localhost:8787'

async function main() {
  const kp = Keypair.random()
  console.log('test wallet', kp.publicKey())

  const health = await (await fetch(`${base}/health`)).json()
  console.log('health', health)

  const challenge = await (
    await fetch(`${base}/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: kp.publicKey() }),
    })
  ).json()
  if (!challenge.transaction) throw new Error(`challenge failed: ${JSON.stringify(challenge)}`)

  const tx = new Transaction(challenge.transaction, challenge.network)
  tx.sign(kp)

  const verified = await (
    await fetch(`${base}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: kp.publicKey(), signedTransaction: tx.toXDR() }),
    })
  ).json()
  if (!verified.token) throw new Error(`verify failed: ${JSON.stringify(verified)}`)
  console.log('auth ok, token issued')

  const auth = { Authorization: `Bearer ${verified.token}` }
  console.log('profile', await (await fetch(`${base}/profile`, { headers: auth })).json())

  const form = new FormData()
  const payload = new Blob([`evernet smoke ${Date.now()}`])
  form.append('file', payload, 'smoke.bin')
  form.append('name', 'smoke.txt')
  form.append('mimeType', 'text/plain')
  form.append('encrypted', 'false')

  const uploaded = await (
    await fetch(`${base}/objects`, { method: 'POST', headers: auth, body: form })
  ).json()
  if (!uploaded.object) throw new Error(`upload failed: ${JSON.stringify(uploaded)}`)
  console.log('uploaded', uploaded.object.hash, 'tx', uploaded.object.registrationTx ?? 'none')

  const listed = await (await fetch(`${base}/objects`, { headers: auth })).json()
  console.log('objects after upload', listed.objects.length)

  const download = await fetch(`${base}/objects/${uploaded.object.hash}`, { headers: auth })
  console.log('download', download.status, await download.text())

  const deleted = await (
    await fetch(`${base}/objects/${uploaded.object.hash}`, { method: 'DELETE', headers: auth })
  ).json()
  console.log('deleted', deleted.ok === true)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
