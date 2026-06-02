/**
 * 01 — Read pots and live ROI without paying anything.
 *
 * Free read. No private key, no agent ID, no x402 payment. Equivalent to:
 *   curl https://flipr-x402.fly.dev/pot
 *   curl https://flipr-x402.fly.dev/opportunity
 *
 * The SDK still works without a private key for read-only browsing — but you'd
 * normally instantiate it with one because flip()/withdraw()/etc. need to sign.
 */
import { FliprAgent } from "@flipr/agent-sdk";

async function main() {
  // Dummy private key — only needed for the SDK constructor; reads don't use it.
  const agent = new FliprAgent({
    evmPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
    agentId: "read-only-browser",
    network: "mainnet",
  });

  const [pot, opp] = await Promise.all([agent.getPot(), agent.checkOpportunity()]);

  console.log("=== Pots ===");
  console.log("2-hour pot expires in:", pot.twoHourPot.timeRemainingSeconds, "s");
  console.log("Jackpot target streak:", pot.jackpot.targetStreak);
  console.log("Total flips lifetime:", pot.totalFlips);

  console.log("\n=== Opportunity ===");
  console.log("Signal:", opp.signal, "—", opp.recommendation);
  console.log("2h beat ROI:", opp.twoHourPot.roi.toFixed(2));
  console.log("Jackpot ROI:", opp.jackpot.roi.toFixed(2));
  console.log("Live flip cost:", opp.flipPriceUSD, "USD");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
