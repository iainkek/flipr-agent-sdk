# @flipr/agent-sdk

TypeScript SDK for the [Flipr x402 agent gateway](https://flipr-x402.fly.dev) — autonomous agents pay USDC over the x402 protocol to flip coins on-chain on Base (Chainlink VRF). Streaks, pots, jackpots, referrals — all gated by per-call payments, no API keys.

The SDK wraps `@x402/fetch` + `viem` so you don't have to learn the x402 protocol to ship. One install, one constructor, you flip.

> Need to see real working code without the SDK? **[https://flipr-x402.fly.dev/integration](https://flipr-x402.fly.dev/integration)** has copy-paste paths in 4 languages (MCP one-tool-call, raw `@x402/fetch`, Python+httpx, raw curl).

## Install

```bash
npm install @flipr/agent-sdk
```

That's it. `@x402/fetch`, `@x402/evm`, and `viem` are bundled as direct deps — you don't import them.

## 60-second testnet quickstart (no setup, no real money)

```ts
import { FliprAgent } from "@flipr/agent-sdk";

// Generates a fresh key, claims $2 testnet USDC, returns a ready agent.
const { agent, privateKey } = await FliprAgent.testnetQuickstart();

const flip = await agent.flip();
console.log(flip.result, "streak:", flip.streak, "tx:", flip.txHash);

// Save `privateKey` if you want a persistent identity across runs.
```

This kicks off Base Sepolia, claims free testnet USDC from the gateway faucet, registers an `x-agent-id`, and signs the x402 payment authorization with the generated key. Cold-start to first flip: ~60s in our integration tests.

## 30-second mainnet quickstart (real USDC)

```ts
import { FliprAgent } from "@flipr/agent-sdk";

const agent = new FliprAgent({
  evmPrivateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
  agentId: "my-bot-v1",
});

const flip = await agent.flip();
console.log(flip.result, "streak:", flip.streak);
```

The SDK handles the 402 PAYMENT-REQUIRED handshake, signs the EIP-712 transferWithAuthorization with your private key, and settles USDC over `@x402/fetch`. You receive a typed `FlipResult` with the on-chain VRF outcome.

> **Mainnet wallet must hold USDC on Base.** Fund the address derived from `AGENT_PRIVATE_KEY`. ETH for gas is *not* required — the gateway treasury pays the L2 gas for your flip.

## Solana mainnet flip (3 lines)

```ts
import { FliprAgent } from "@flipr/agent-sdk";

const agent = new FliprAgent({
  solanaPrivateKey: process.env.SOL_KEY,  // base58, 64 bytes
  agentId: "my-sol-bot",
  heliusRpcUrl: process.env.HELIUS_RPC_URL,  // recommended — see helius.dev
});

const flip = await agent.flip();
// flip.result:          'heads' | 'tails'
// flip.txHash:          Base flip tx hash
// flip.bridgeId:        CCTP V2 bridge ID (Solana-specific)
// flip.bridgeLatencyMs: ~10-30s typical bridge time
// flip.agentId:         'sol-<hex>' deterministic from your pubkey
```

**Solana install** — Solana deps are optional peer deps. Install them alongside the SDK:
```bash
npm install @flipr/agent-sdk @x402/svm @solana/kit bs58
```

**Note:** Use a [Helius](https://helius.dev) RPC URL for production — the public `api.mainnet-beta.solana.com` rate-limits `getLatestBlockhash` at real volume. Free tier is 10M credits/month.

**What happens under the hood:** Your USDC stays on Solana for the payment; the SDK bridges it to Base per-flip via Circle CCTP V2 (~10-30s). The flip executes on the existing Base CoinFlip contract. Credits and agentId are chain-portable.

## Mainnet vs testnet

```ts
// Mainnet (default) — uses https://flipr-x402.fly.dev, Base chain, real USDC
const mainnet = new FliprAgent({ evmPrivateKey: pk });

// Testnet — uses https://flipr-x402-testnet.fly.dev, Base Sepolia, free testnet USDC
const testnet = new FliprAgent({ evmPrivateKey: pk, network: "testnet" });

// Override the gateway URL explicitly (e.g. local dev)
const local = new FliprAgent({ evmPrivateKey: pk, gatewayUrl: "http://localhost:3000" });
```

## Methods

### Static factories (testnet quickstart)

| Method | Notes |
| --- | --- |
| `FliprAgent.testnetQuickstart(opts?)` | Generates a fresh key, claims testnet faucet USDC for it, returns `{ agent, privateKey, address, faucet }`. |
| `FliprAgent.generatePrivateKey()` | Returns a fresh `0x${string}` private key. Persist + use with the constructor for stable identity. |

### Instance methods

| Method | Endpoint | Cost | Notes |
| --- | --- | --- | --- |
| `flip(options?)` | `POST /x402/flip` | live USDC quote | Real on-chain flip. `options.ref` adds a referral code. |
| `dryRun()` | `POST /flip/dry-run` | **free** | Validates request shape end-to-end without USDC or VRF. |
| `claimTestnetFaucet(toAddress?)` | `POST /faucet/testnet-usdc` | **free** (testnet) | Claim $2 testnet USDC. Defaults to your derived address. |
| `withdraw(toAddress)` | `POST /x402/withdraw` | $0.001 USDC | Swaps your wallet's ETH balance to USDC and sends it. |
| `subscribeOpportunityWebhook(url, opts?)` | `POST /x402/opportunity/subscribe` | $0.001 USDC | Webhook fires on opportunity emergence. `opts.roiThreshold` defaults to 1.0. |
| `unsubscribeOpportunityWebhook(id)` | `DELETE /x402/opportunity/subscribe/:id` | **free** | Paying to delete makes no sense. |
| `setReferralPayoutAddress(address)` | `POST /referral/payout-address` | **free** | Register the EVM address that should receive manual commission payouts (Phase 16). |
| `getReferralPayoutStatus()` | `GET /referral/:id/payout-status` | **free** | Accrued amount + eligibility + operator instructions for manual payout from team wallet. |
| `claimReferralPayout(toAddress)` | _DEPRECATED_ | n/a | Throws synchronous deprecation `Error` (Phase 16, REF2-06). The gateway no longer sends ETH for referrals; use `setReferralPayoutAddress` + `getReferralPayoutStatus` instead. Old `POST /x402/referral/payout` returns 410 Gone (removal v2.1). |
| `getPot()` | `GET /pot` | **free** | Current pot balances + top streaks. |
| `getStats()` | `GET /agent/:id` | **free** | Your agent's wallet, streak, totals. |
| `listAgents(opts?)` | `GET /agents` | **free** | Paginated agent directory. |
| `getOpportunity()` | `GET /opportunity` | **free** | Live ROI for both pots + signal. |
| `checkOpportunity()` | `GET /opportunity` | **free** | Alias for `getOpportunity()` (strategy-code naming). |
| `getOpportunityHistory(limit?)` | `GET /opportunity/history` | **free** | Recent signal history. |
| `registerReferral()` | `POST /referral` | **free** | Register your agent as a referrer (rate-limited). |
| `getReferralLeaderboard(limit?)` | `GET /referral/leaderboard` | **free** | Top referrers by volume. |
| `getReferralStats()` | `GET /referral/:id` | **free** | Your referral earnings + payout eligibility. |
| `getGameInfo()` | `GET /game-info` | **free** | Static game rules + denomination model. |
| `getHealth()` | `GET /health` | **free** | Fast liveness probe. |
| `getStatus()` | `GET /status` | **free** | Subsystem health (RPC, facilitator, CDP, Redis). |

> **Free reads use plain `fetch`.** Only the four state-mutating endpoints (`flip`, `withdraw`, subscribe, referral payout) wrap fetch with `@x402/fetch` for payment. Reading the pot or your stats does NOT cost USDC.

## Strategy helper: only flip when ROI is positive

```ts
import { FliprAgent } from "@flipr/agent-sdk";

const agent = new FliprAgent({ evmPrivateKey: pk, agentId: "ev-bot" });

async function flipIfWorthIt(minRoi = 1.5) {
  const opp = await agent.checkOpportunity();
  const bestRoi = Math.max(opp.twoHourPot.roi, opp.jackpot.roi);
  if (bestRoi < minRoi) {
    console.log(`Skipping — best ROI ${bestRoi.toFixed(2)} < threshold ${minRoi}`);
    return null;
  }
  console.log(`Flipping — bestROI=${bestRoi.toFixed(2)}`);
  return agent.flip();
}

// Run every 10 minutes
setInterval(() => flipIfWorthIt(1.5).catch(console.error), 10 * 60_000);
```

## Webhook on opportunity emergence (don't poll)

```ts
const { id } = await agent.subscribeOpportunityWebhook(
  "https://my-app.example.com/flipr-hook",
  { roiThreshold: 1.5 }, // only fire when best ROI crosses above 1.5x
);

// Your endpoint receives a POST when an opportunity emerges (transitions
// below→above threshold). Each emergence = one webhook delivery, then
// silence until ROI drops back below and crosses again. Payload includes
// `triggerReason` ("first_eval_above" | "emerged") and `bestROI`.
```

Set `roiThreshold: 0` to receive every 5-min cycle regardless of ROI (legacy behavior).

## API surface notes

- **Identity is `x-agent-id`.** The SDK injects this on every request, defaulting to your wallet address. Override with `agentId` in the constructor for a stable handle (e.g. `"my-bot-v1"`).
- **Read endpoints are free** because the gateway runs `readLimiter` (Express rate limiter, 100 req / 15 min per identity) — pay-walling reads at $0.001 was friction, not protection. State-mutating endpoints are still paid because they cost gas/treasury ETH.
- **The 402 quote drifts.** `flip()` pays whatever USDC the gateway demands at the moment of the request (live ETH/USD price; refreshes every 60s). Don't hardcode the USD figure.
- **Testnet faucet enforces 24h per-agent cooldown.** Reuse a stable `agentId` across runs and the second claim within 24h returns 429. Use `claimTestnetFaucet(toAddress)` with a custom `toAddress` to redirect a single claim.

## Examples

See `examples/`:

- `01-read-pot.ts` — read pot balances over plain HTTP, no payment, no auth.
- `02-dry-run.ts` — validate your integration end-to-end without USDC.
- `03-real-flip.ts` — actual paid flip (costs real USDC, only run when you mean it).

## License

MIT
