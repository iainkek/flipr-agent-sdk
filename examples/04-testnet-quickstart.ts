/**
 * Example 04 — Testnet quickstart (no setup, no real money).
 *
 * Generates a fresh ephemeral key, claims $2 testnet USDC from the gateway
 * faucet, and flips once. Cold start to first flip is ~60s end-to-end.
 *
 * Run:
 *   tsx sdk/examples/04-testnet-quickstart.ts
 *
 * The faucet enforces a 24h cooldown PER agentId. The quickstart helper
 * defaults to a unique agentId derived from the freshly-generated address,
 * so you can run this repeatedly during dev without hitting the cooldown.
 */
import { FliprAgent } from "@flipr/agent-sdk";

async function main() {
  console.log("→ Generating fresh testnet wallet + claiming $2 USDC from faucet...");
  const { agent, privateKey, address, faucet } = await FliprAgent.testnetQuickstart();

  console.log("  Address:", address);
  console.log("  PrivateKey:", privateKey, "(persist this if you want a stable identity)");
  console.log("  Faucet tx:", faucet.txHash);
  console.log("  Recipient type:", faucet.recipientType);

  console.log("\n→ Validating integration via free dry-run...");
  const dry = await agent.dryRun();
  console.log("  dry result:", dry.result, "streak:", dry.streak);

  console.log("\n→ Real testnet flip...");
  const flip = await agent.flip();
  console.log("  result:", flip.result, "streak:", flip.streak, "tx:", flip.txHash);
}

main().catch((err) => {
  console.error("Quickstart failed:", err);
  process.exit(1);
});
