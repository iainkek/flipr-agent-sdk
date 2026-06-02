/**
 * 03 — Pay USDC to flip a real coin on-chain.
 *
 * !!! THIS COSTS ~$1.20 USDC PER RUN !!!
 *
 * Only run this when you actually intend to spend money. The wallet derived
 * from AGENT_PRIVATE_KEY must hold USDC on Base mainnet (or Base Sepolia
 * testnet USDC if network: "testnet"). You do NOT need ETH for gas — the
 * gateway treasury pays gas for your flip.
 *
 * For testnet: https://faucet.circle.com (free Base Sepolia USDC).
 * For mainnet: bridge from any L1/L2 or buy directly on Base.
 *
 * Recommended workflow:
 *   1. Run examples/02-dry-run.ts first to validate your client.
 *   2. Run examples/01-read-pot.ts and confirm ROI > 1.0 before flipping.
 *   3. Then run this.
 */
import { FliprAgent } from "@flipr/agent-sdk";

async function main() {
  const pk = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) {
    console.error("Set AGENT_PRIVATE_KEY (a 0x-prefixed 32-byte hex string).");
    process.exit(1);
  }

  const agent = new FliprAgent({
    evmPrivateKey: pk,
    agentId: process.env.AGENT_ID || "real-flip-example",
    network: (process.env.NETWORK as "mainnet" | "testnet") || "mainnet",
  });

  // Sanity check: confirm the opportunity is positive EV before paying.
  const opp = await agent.checkOpportunity();
  console.log("Signal:", opp.signal, "| 2h ROI:", opp.twoHourPot.roi.toFixed(2), "| jp ROI:", opp.jackpot.roi.toFixed(2));

  if (opp.signal === "wait") {
    console.log("Signal is 'wait' — skipping flip. Edit this example to override.");
    return;
  }

  console.log("Flipping… (this will charge ~$" + opp.flipPriceUSD + " USDC)");
  const result = await agent.flip();
  console.log("Result:", result.result, "| streak:", result.streak, "| tx:", result.txHash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
