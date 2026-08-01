import 'dotenv/config'
import app from './app.js'
import { config } from './config.js'
import { onChainEnabled } from './soroban.js'

app.listen(config.port, () => {
  console.log(`Evernet storage API on :${config.port} (${config.network}, onChain=${onChainEnabled()})`)
})
