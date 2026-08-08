# FAQ

## Is Evernet a Filecoin / decentralized storage marketplace for Stellar?

No. Evernet is **data integrity infrastructure**. Encrypted storage is the delivery mechanism; the product is portable proof that data has not been altered. Stellar holds the control plane (quota, leases, content hashes); ciphertext stays off-chain.

## Does Stellar store my files?

No. Stellar stores integrity and capacity state. File bytes (ciphertext) live on the Evernet Storage API.

## Can Evernet read my documents?

Vault uploads are encrypted client-side with AES-GCM. Servers persist ciphertext. Integrating apps must keep the same guarantee if they encrypt outside the vault UI.

## What network am I on?

The integrity control plane is live on **Stellar Testnet** today. Mainnet is on the roadmap.

## How do I pay?

Native **XLM** for capacity plans (Starter / Growth / Pro). Every wallet includes **5 GB** free. There is no custom storage token.

## How do partners integrate?

Use the public API (OpenAPI / `/s3/v1`), API keys, and/or `evernet-sdk`. See [Services](../services/README.md) and [Quick start](../getting-started/quick-start.md).

## Who are your partners?

SigeaCloud, Obsideo, Era Digitalis, Peridot, and Indikin — see [Partners](../partners/README.md). Separately, Evernet runs a paid pilot with a German healthcare institution.

## Where should reviewers start?

1. [What is Evernet](../README.md)
2. [Why Evernet](../why-evernet.md)
3. [Use cases](../use-cases/README.md)
4. [Services](../services/README.md)
5. [Partners](../partners/README.md)
6. [Roadmap](../roadmap.md)
