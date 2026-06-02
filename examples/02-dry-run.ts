/**
 * 02 — Dry-run a flip end-to-end without spending USDC.
 *
 * Hits POST /flip/dry-run on the gateway. Same response shape as the real
 * /x402/flip — but no payment, no on-chain transaction, no VRF callback.
 * Use this to validate your client's request/response handling BEFORE you
 * wire up x402 payment and burn real USDC.
 *
 * Note: dry-run still requires the x-agent-id header (the SDK supplies it),
 * matching the real-flip identity flow.
 */
import { FliprAgent } from "@flipr/agent-sdk";

async function main() {
  const agent = new FliprAgent({
    evmPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
    agentId: "dry-run-test-bot",
    network: "mainnet",
  });

  const result = await agent.dryRun();

  console.log("Dry-run response (matches real flip shape):");
  console.log(JSON.stringify(result, null, 2));
  console.log("\nIf you can parse `result.result`, `result.streak`, and `result.txHash` here,");
  console.log("your client is ready for the real POST /x402/flip path.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
