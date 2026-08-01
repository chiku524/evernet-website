/**
 * Canonical integrator recipe:
 *   encrypt client-side → put object → receive content hash (+ optional Soroban tx)
 *
 * Usage:
 *   npm run example:encrypt-upload -- [apiBaseUrl]
 */
import { Keypair, Transaction } from '@stellar/stellar-sdk'
import { EvernetClient, walletPassphrase } from '../src/index.js'

const baseUrl = process.argv[2] || 'https://evernet-storage-api.vercel.app'

async function main() {
  const client = new EvernetClient({ baseUrl })
  const kp = Keypair.random()
  console.log('wallet', kp.publicKey())
  console.log('health', await client.health())

  await client.loginWithSigner(kp.publicKey(), async (xdr, network) => {
    const tx = new Transaction(xdr, network)
    tx.sign(kp)
    return tx.toXDR()
  })
  console.log('authed')

  const passphrase = walletPassphrase(kp.publicKey())
  const plain = new TextEncoder().encode(`evernet encrypt→upload ${new Date().toISOString()}`)
  const uploaded = await client.encryptAndUpload({
    data: plain,
    name: 'hello.txt',
    mimeType: 'text/plain',
    folder: 'sdk-demo',
    passphrase,
  })

  console.log('hash', uploaded.object.hash)
  console.log('registrationTx', uploaded.object.registrationTx ?? '(off-chain only)')
  console.log('size', uploaded.object.size, 'encrypted', uploaded.object.encrypted)

  const decrypted = await client.downloadAndDecrypt(uploaded.object.hash, passphrase)
  const text = await decrypted.file.text()
  console.log('round-trip', text.slice(0, 80))

  // Optional: mint a server API key for later non-interactive use
  const key = await client.createApiKey('sdk-example')
  console.log('apiKey (save once)', key.key)

  const serverClient = new EvernetClient({ baseUrl, token: key.key })
  const usage = await serverClient.getUsage()
  console.log('usage via api key', usage.auth, 'used', usage.profile.usedBytes)

  await client.revokeApiKey(key.id)
  await client.deleteObject(uploaded.object.hash)
  console.log('cleaned up')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
