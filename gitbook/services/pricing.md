# Pricing & capacity

Capacity is settled in **native XLM**. There is no custom storage token.

## Plans

| Plan | Capacity | Price |
|------|----------|-------|
| **Free** | 5 GB included with every wallet | — |
| **Starter** | +10 GB | 5 XLM |
| **Growth** | +50 GB | 20 XLM |
| **Pro** | +200 GB | 60 XLM |

### Plan intent

| Plan | Best for |
|------|----------|
| Starter | Extra room for docs and credentials |
| Growth | Media, archives, and team vaults |
| Pro | High-volume dApp and enterprise data |

Leases: **30 days** per purchase (as implemented with the Testnet control plane).

## Purchase flow

1. Wallet pays treasury in XLM.
2. API verifies payment on Horizon.
3. `credit_purchase` updates Soroban quota.
4. Vault / API reflect new capacity for that `G…` address.

## Enterprise path

Enterprise SLA, compliance tiers, and GDPR/MiCA-oriented options are on the roadmap. Contact [hello@evernet.tech](mailto:hello@evernet.tech) for regulated deployments and pilots.
