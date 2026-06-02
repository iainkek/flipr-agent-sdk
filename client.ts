import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const TESTNET_URL = "https://flipr-x402-testnet.fly.dev";
const MAINNET_URL = "https://flipr-x402.fly.dev";

// Type-only import for lazy Solana deps so EVM-only agents don't need @x402/svm installed.
type ExactSvmSchemeType = InstanceType<typeof import("@x402/svm")["ExactSvmScheme"]>;

/**
 * Extract the base58-encoded public key from a 64-byte base58 Solana secret key.
 * Used to set `address` on the FliprAgent before the async signer is initialised.
 */
function _b58PubkeyFromSecret(base58Secret: string): string {
  try {
    // Dynamic require — bs58 is a peer dep; may not be installed for EVM-only agents.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bs58 = require("bs58");
    const bytes = bs58.decode(base58Secret);
    const pubkeyBytes = bytes.slice(32); // ed25519: first 32 = private, last 32 = public
    return bs58.encode(pubkeyBytes);
  } catch {
    return base58Secret.slice(0, 44); // best-effort fallback (first 44 chars of b58 key)
  }
}

export interface FliprAgentConfig {
  /** EVM (Base) private key — `0x`-prefixed hex. Required for Base flips. */
  evmPrivateKey?: `0x${string}`;
  /** Solana private key — base58-encoded 64-byte keypair secret. Required for Solana flips. */
  solanaPrivateKey?: string;
  /**
   * Helius (or other) Solana RPC URL. Highly recommended for production —
   * the public mainnet RPC rate-limits getLatestBlockhash at any real volume.
   * Format: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
   * Sign up free at https://helius.dev (10M credits/month free tier).
   * Falls back to `https://api.mainnet-beta.solana.com` if not provided.
   */
  heliusRpcUrl?: string;
  gatewayUrl?: string;
  agentId?: string;
  /** EVM RPC URL for Base path — defaults to public RPC via viem. */
  rpcUrl?: string;
  network?: "mainnet" | "testnet";
}

export interface FlipResult {
  result: "heads" | "tails";
  streak: number;
  txHash: string;
  requestId: string;
  wallet: string;
  agentId: string;
  /** Solana path only — CCTP V2 bridge ID used to track burn→mint→flip lifecycle. */
  bridgeId?: string;
  /** Solana path only — ms from payment submission to CCTP mint confirmed on Base. */
  bridgeLatencyMs?: number;
  /** Which chain was used for payment. */
  chain?: "base" | "solana";
}

export interface PotInfo {
  twoHourPot: {
    timeRemainingSeconds: number;
    topStreaks: Array<{ wallet: string; streak: number }>;
  };
  jackpot: {
    timeRemainingSeconds: number;
    targetStreak: number;
    roundId: number;
  };
  totalFlips: number;
  totalVolume: string;
}

export interface AgentStats {
  agentId: string;
  wallet: string;
  currentStreak: number;
  maxStreakWeekly: number;
  maxStreakLifetime: number;
  totalFlips: number;
  totalSpentWei: string;
  balanceWei: string;
}

export interface WithdrawResult {
  agentId: string;
  wallet: string;
  withdrawnWei: string;
  receivedUSDC: string;
  txHash: string;
}

export type Signal = "strong_buy" | "buy" | "neutral" | "wait";

export interface PotOpportunity {
  potValueWei: string;
  potValueETH: string;
  potValueUSD: string;
  topStreak: number;
  streakToWin: number;
  expectedFlips: number;
  expectedCostWei: string;
  expectedCostETH: string;
  expectedCostUSD: string;
  roi: number;
  timeRemainingSeconds: number;
  signal: Signal;
  // Jackpot-specific (present when this represents a jackpot opportunity)
  targetStreak?: number;
  roundId?: number;
}

export interface ReferralInfo {
  agentId: string;
  refCode: string;
  refLink: string;
  commissionRate: string;
  minPayout: string;
}

export interface ReferralStats {
  agentId: string;
  refCode: string;
  totalVolumeWei: string;
  totalVolumeETH: string;
  commissionEarnedWei: string;
  commissionEarnedETH: string;
  commissionPaidWei: string;
  commissionPaidETH: string;
  pendingPayoutWei: string;
  pendingPayoutETH: string;
  referredFlips: number;
  payoutEligible: boolean;
  commissionRate: string;
  minPayout: string;
}

export interface ReferralLeaderboard {
  leaderboard: Array<{
    rank: number;
    agentId: string;
    refCode: string;
    referredFlips: number;
    commissionEarnedETH: string;
    totalVolumeETH: string;
  }>;
  total: number;
}

export interface ReferralPayoutResult {
  agentId: string;
  paidWei: string;
  paidETH: string;
  toAddress: string;
  txHash: string;
}

export interface AgentListResult {
  agents: Array<{
    agentId: string;
    walletAddress: string;
    firstSeen: string;
    lastActive: string;
    totalFlips: number;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface SubsystemHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs?: number;
  lastCheck: string;
  error?: string;
}

export interface GatewayHealth {
  status: "healthy" | "degraded" | "down";
  uptime: number;
  version: string;
  subsystems: SubsystemHealth[];
  agentCount: number;
  totalFlips: number;
  timestamp: string;
}

export interface GatewayStatus extends GatewayHealth {
  treasuryAddress: string;
}

/**
 * Strategy analysis returned for the 2-hour pot's match/beat options
 * and for the jackpot's single target-based strategy.
 */
export interface StrategyAnalysis {
  flipsNeeded: number;
  costWei: string;
  costETH: string;
  costUSD: string;
  expectedPayoutWei: string;
  expectedPayoutETH: string;
  expectedPayoutUSD: string;
  /** ROI > 1.0 = positive expected value */
  roi: number;
  /** Win probability over `flipsNeeded` flips (50% per flip compounded) */
  probability: number;
  ev: string;
}

/** 2-hour pot — competitive (match or beat top streak to win). */
export interface TwoHourPotAnalysis {
  potValueWei: string;
  potValueETH: string;
  potValueUSD: string;
  topStreak: number;
  topStreakUsers: number;
  matchStrategy: StrategyAnalysis;
  beatStrategy: StrategyAnalysis;
}

/** Jackpot — target-based (hit `targetStreak` consecutive heads to win). */
export interface JackpotAnalysis {
  potValueWei: string;
  potValueETH: string;
  potValueUSD: string;
  payoutPercent: number;
  rolloverPercent: number;
  targetStreak: number;
  roundId: number;
  /** Always "target" — jackpot is NOT competitive match/beat. */
  strategyType: "target";
  /** Single strategy: hit exactly `targetStreak` consecutive heads. */
  strategy: StrategyAnalysis;
  _warning?: string;
}

/**
 * Live response shape from `GET /opportunity`. Matches the actual API,
 * NOT the legacy `signal`/`fourHourPot` shape — the gateway never returned
 * those. Use `twoHourPot.matchStrategy.roi` (or `beatStrategy.roi`) to
 * decide whether the 2-hour flip has positive EV; jackpot ROI is almost
 * always &lt; 1.0 (target-based, ~thousands of flips on average).
 */
export interface OpportunityInfo {
  game?: {
    name?: string;
    description?: string;
    howToPlay?: string;
    strategies?: { twoHourPot_match: string; twoHourPot_beat: string; jackpot: string };
    roi?: string;
    WARNING?: string;
  };
  twoHourPot: TwoHourPotAnalysis;
  jackpot: JackpotAnalysis;
  flipPriceWei: string;
  flipPriceETH: string;
  flipPriceUSD: string;
  ethPriceUSD: number;
  totalEVPerFlip?: string;
  timestamp: string;
}

export interface SignalHistoryEntry {
  signal: Signal;
  timestamp: string;
  twoHourROI: number;
  jackpotROI: number;
}

export interface WebhookSubscription {
  id: string;
  agentId: string;
  callbackUrl: string;
  /**
   * Effective ROI threshold for the subscription. Default 1.0. Webhook fires only
   * when best ROI (max of twoHourPot.beat and jackpot strategies) crosses above
   * this value — emergence semantics. Set to 0 for legacy fire-every-cycle.
   */
  roiThreshold: number;
  createdAt: string;
  _hint?: string;
}

export interface SignalHistoryResponse {
  signals: SignalHistoryEntry[];
  changes: Array<{ from: Signal; to: Signal; timestamp: string }>;
}

export interface FaucetClaimResult {
  success: true;
  recipient: string;
  recipientType: "custom" | "managed";
  amountUSDC: string;
  txHash: string;
  cooldownHours: number;
  agentId: string;
  hint?: string;
}

export interface QuickStartResult {
  agent: FliprAgent;
  privateKey: `0x${string}`;
  address: string;
  faucet: FaucetClaimResult;
}

export class FliprAgent {
  private fetchWithPay: typeof fetch;
  private baseUrl: string;
  private agentId: string;
  /** EVM address (Base path) or Solana base58 pubkey (Solana path). */
  public readonly address: string;
  public readonly network: "mainnet" | "testnet";

  // Solana path state — populated lazily in _initSolana()
  private _solanaKey?: string;
  private _heliusRpcUrl?: string;
  private _solanaScheme?: ExactSvmSchemeType;
  private _solanaAgentId?: string;  // 'sol-<hex>' derived from identity endpoint

  constructor(config: FliprAgentConfig) {
    const isTestnet = config.network === "testnet";
    this.network = isTestnet ? "testnet" : "mainnet";
    this.baseUrl = config.gatewayUrl || (isTestnet ? TESTNET_URL : MAINNET_URL);

    // Chain selection: Base if evmPrivateKey provided (or both), Solana if only solanaPrivateKey.
    if (!config.evmPrivateKey && !config.solanaPrivateKey) {
      throw new Error("FliprAgent requires either evmPrivateKey (Base) or solanaPrivateKey (Solana).");
    }

    if (config.solanaPrivateKey && !config.evmPrivateKey) {
      // Solana-only path — fetchWithPay is plain fetch; Solana uses manual envelope.
      this.fetchWithPay = fetch;
      this._solanaKey = config.solanaPrivateKey;
      this._heliusRpcUrl = config.heliusRpcUrl;
      // Derive a placeholder address from the base58 key until we init the signer.
      // Real agentId is fetched from /agent/<pubkey>/identity on first flip.
      // For now set address = pubkey (b58 encoded, 44 chars) so it's useful for
      // funding checks.
      this.address = _b58PubkeyFromSecret(config.solanaPrivateKey);
      this.agentId = config.agentId || this.address;
      return;
    }

    // Base (EVM) path — existing implementation unchanged.
    const chain = isTestnet ? baseSepolia : base;
    const chainId = isTestnet ? "eip155:84532" : "eip155:8453";
    const account = privateKeyToAccount(config.evmPrivateKey!);
    const publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });
    const signer = toClientEvmSigner(account, publicClient);
    const client = new x402Client(
      (_version, accepts) => {
        const evmEntry = accepts.find((a: any) => typeof a?.network === "string" && /^eip155:/.test(a.network));
        return evmEntry ?? accepts[0];
      },
    );
    client.register(chainId, new ExactEvmScheme(signer));
    this.fetchWithPay = wrapFetchWithPayment(fetch, client);
    this.agentId = config.agentId || account.address;
    this.address = account.address;
  }

  /**
   * Generate a fresh ephemeral EVM private key. Useful for quickstart flows
   * (especially testnet) where you don't want to pre-provision a wallet.
   *
   * SECURITY: For mainnet you almost certainly want a managed/persistent key
   * instead — losing this key loses any funds in the wallet, and any winnings
   * accumulate on this address.
   */
  static generatePrivateKey(): `0x${string}` {
    return generatePrivateKey();
  }

  /**
   * One-call testnet quickstart. Generates a fresh private key, claims $2
   * testnet USDC from the gateway faucet (sent directly to the new key's
   * address), and returns a ready-to-flip FliprAgent plus the key (so you
   * can persist it if you want a stable identity).
   *
   * Cold-start time is dominated by the faucet swap (~10s in our tests).
   * The faucet enforces a 24h cooldown per agentId — supply your own
   * stable agentId across runs, or the SDK will use the wallet address.
   *
   * Use this for demos and end-to-end integration tests. For production
   * use the regular constructor with a persistent key.
   *
   * @param options.agentId  Stable identifier across runs (default: wallet address).
   * @param options.gatewayUrl  Override testnet URL (default: flipr-x402-testnet.fly.dev).
   *
   * @example
   * const { agent, privateKey } = await FliprAgent.testnetQuickstart();
   * const flip = await agent.flip();
   */
  static async testnetQuickstart(options?: {
    agentId?: string;
    gatewayUrl?: string;
    rpcUrl?: string;
  }): Promise<QuickStartResult> {
    const privateKey = generatePrivateKey();
    const tempAccount = privateKeyToAccount(privateKey);
    const agentId = options?.agentId || `quickstart-${tempAccount.address.slice(2, 10)}`;
    const gatewayUrl = options?.gatewayUrl || TESTNET_URL;

    const faucetRes = await fetch(`${gatewayUrl}/faucet/testnet-usdc`, {
      method: "POST",
      headers: {
        "x-agent-id": agentId,
        "content-type": "application/json",
      },
      body: JSON.stringify({ toAddress: tempAccount.address }),
    });
    if (!faucetRes.ok) {
      const body = await faucetRes.text();
      throw new Error(
        `Testnet quickstart faucet failed (${faucetRes.status}): ${body}. ` +
          `If this is a 'FAUCET_COOLDOWN' or 'FAUCET_DAILY_CAP', wait or supply a fresh agentId.`,
      );
    }
    const faucet = (await faucetRes.json()) as FaucetClaimResult;

    const agent = new FliprAgent({
      evmPrivateKey: privateKey,
      agentId,
      network: "testnet",
      gatewayUrl,
      rpcUrl: options?.rpcUrl,
    });

    return {
      agent,
      privateKey,
      address: tempAccount.address,
      faucet,
    };
  }

  /**
   * Claim testnet USDC for an existing FliprAgent. Sends to `this.address`
   * (the wallet derived from the private key) by default, so funds land where
   * the SDK can sign with them.
   *
   * Mainnet returns a 404 — this is testnet-only by design.
   */
  async claimTestnetFaucet(toAddress?: string): Promise<FaucetClaimResult> {
    if (this.network === "mainnet") {
      throw new Error("claimTestnetFaucet is testnet-only. Construct FliprAgent with network: 'testnet' to use the faucet.");
    }
    const res = await fetch(`${this.baseUrl}/faucet/testnet-usdc`, {
      method: "POST",
      headers: {
        "x-agent-id": this.agentId,
        "content-type": "application/json",
      },
      body: JSON.stringify({ toAddress: toAddress || this.address }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Faucet claim failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<FaucetClaimResult>;
  }

  /**
   * Public read-only base URL — useful when you want to render a link to e.g.
   * the integration guide or dashboard alongside the SDK.
   */
  get url(): string {
    return this.baseUrl;
  }

  async flip(options?: { ref?: string }): Promise<FlipResult> {
    // Route to Solana path if this agent was constructed with solanaPrivateKey.
    if (this._solanaKey) {
      return this._flipSolana(options);
    }
    // Base (EVM) path — unchanged.
    const url = options?.ref
      ? `${this.baseUrl}/x402/flip?ref=${encodeURIComponent(options.ref)}`
      : `${this.baseUrl}/x402/flip`;
    const res = await this.fetchWithPay(url, {
      method: "POST",
      headers: {
        "x-agent-id": this.agentId,
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Flip failed (${res.status}): ${body}`);
    }
    const result = await res.json() as FlipResult;
    return { ...result, chain: "base" };
  }

  /** @internal — Solana payment path. Called by flip() when solanaPrivateKey was provided. */
  private async _flipSolana(options?: { ref?: string }): Promise<FlipResult> {
    // Lazy-import Solana deps — not required for Base-only agents.
    const [
      { ExactSvmScheme, MAINNET_RPC_URL, DEVNET_RPC_URL },
      { createKeyPairSignerFromBytes, address: addressFn },
      { default: bs58 },
    ] = await Promise.all([
      import("@x402/svm"),
      import("@solana/kit"),
      import("bs58"),
    ]);

    // Init scheme once and cache.
    if (!this._solanaScheme) {
      const secretBytes = bs58.decode(this._solanaKey!);
      const signer = await createKeyPairSignerFromBytes(secretBytes);
      const rpcUrl = this._heliusRpcUrl || (this.network === "testnet" ? DEVNET_RPC_URL : MAINNET_RPC_URL);
      this._solanaScheme = new ExactSvmScheme(signer, { rpcUrl });

      // Resolve agentId from identity endpoint — 'sol-<hex>' form.
      if (!this.agentId || this.agentId === this.address) {
        try {
          const idRes = await fetch(`${this.baseUrl}/agent/${encodeURIComponent(signer.address)}/identity`);
          if (idRes.ok) {
            const id = await idRes.json() as any;
            if (id?.agentId) this._solanaAgentId = id.agentId;
          }
        } catch { /* non-fatal — fall back to address */ }
      }
    }
    const effectiveAgentId = this._solanaAgentId || this.agentId;

    const flipPath = options?.ref
      ? `${this.baseUrl}/x402/flip?ref=${encodeURIComponent(options.ref)}`
      : `${this.baseUrl}/x402/flip`;

    // Step 1: Probe for the 402 challenge.
    const probe = await fetch(flipPath, {
      method: "POST",
      headers: { "x-agent-id": effectiveAgentId, "content-type": "application/json" },
      body: "{}",
    });
    if (probe.status !== 402) {
      const body = await probe.text();
      throw new Error(`Expected 402 from Solana probe; got ${probe.status}: ${body}`);
    }

    // Step 2: Parse accepts[] — prefer v2 header, fall back to v1 body.
    let challenge: any;
    const headerB64 = probe.headers.get("payment-required");
    if (headerB64) {
      try { challenge = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8")); } catch { /* fall through */ }
    }
    if (!challenge) challenge = await probe.clone().json();

    const solanaReqs = (challenge.accepts as any[]).find(
      (a: any) => typeof a?.network === "string" && a.network.startsWith("solana:"),
    );
    if (!solanaReqs) throw new Error("Gateway 402 has no Solana accept entry. Ensure gateway is v164+.");

    // Step 3: Normalise raw string addresses into @solana/kit branded Address types.
    // Required — createPaymentPayload calls findAssociatedTokenPda / setTransactionMessageFeePayer
    // which both require kit-branded Address objects, not plain strings.
    const normalisedReqs = {
      ...solanaReqs,
      asset: addressFn(solanaReqs.asset),
      payTo: addressFn(solanaReqs.payTo),
      extra: { ...solanaReqs.extra, feePayer: addressFn(solanaReqs.extra.feePayer) },
    };

    // Step 4: Sign — TWO positional args (x402Version, paymentRequirements).
    const signed = await this._solanaScheme!.createPaymentPayload(2, normalisedReqs);

    // Step 5: Build X-PAYMENT envelope (4 required fields).
    const envelope = {
      x402Version: 2,
      scheme: "exact",
      network: solanaReqs.network,
      payload: signed.payload,
    };
    const xPayment = Buffer.from(JSON.stringify(envelope)).toString("base64");

    // Step 6: Submit the flip.
    const payStart = Date.now();
    const flipRes = await fetch(flipPath, {
      method: "POST",
      headers: {
        "x-agent-id": effectiveAgentId,
        "content-type": "application/json",
        "x-payment": xPayment,
      },
      body: "{}",
    });
    if (flipRes.status !== 202) {
      const body = await flipRes.text();
      throw new Error(`Solana flip payment rejected (${flipRes.status}): ${body}`);
    }
    const { bridgeId, pollUrl } = await flipRes.json() as { bridgeId: string; pollUrl: string };

    // Step 7: Poll bridge until flip_resolved or terminal failure (up to 90s).
    const TERMINAL_FAIL = new Set([
      "failed_burn_credited", "failed_mint_credited", "flip_failed_credited", "failed_stuck",
    ]);
    let mintConfirmedAt: number | undefined;
    for (let i = 0; i < 23; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const pollRes = await fetch(pollUrl);
      if (!pollRes.ok) continue;
      const rec = await pollRes.json() as any;
      if (rec.status === "mint_confirmed" && !mintConfirmedAt) mintConfirmedAt = Date.now();
      if (rec.status === "flip_resolved") {
        return {
          result: rec.flipResult as "heads" | "tails",
          streak: 0,
          txHash: rec.flipTxHash ?? "",
          requestId: rec.flipRequestId ?? "",
          wallet: rec.derivedAddress ?? this.address,
          agentId: effectiveAgentId,
          bridgeId,
          bridgeLatencyMs: mintConfirmedAt ? mintConfirmedAt - payStart : undefined,
          chain: "solana",
        };
      }
      if (TERMINAL_FAIL.has(rec.status)) {
        throw new Error(
          `Solana flip failed with status '${rec.status}'. ` +
          (rec.nextAction ?? "Your USDC was credited back — safe to retry."),
        );
      }
    }
    throw new Error(
      `Solana bridge timed out after 90s. Bridge ID: ${bridgeId}. ` +
      `Poll ${pollUrl} manually for resolution.`,
    );
  }

  /**
   * POST /flip/dry-run — FREE.
   *
   * Validates the full request shape (x-agent-id header, response parsing) without
   * burning USDC or firing VRF. Returns the same FlipResult shape as flip(), with
   * placeholder result/streak/txHash. Use this before flip() to confirm your
   * client is wired correctly.
   */
  async dryRun(): Promise<FlipResult> {
    const res = await fetch(`${this.baseUrl}/flip/dry-run`, {
      method: "POST",
      headers: {
        "x-agent-id": this.agentId,
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Dry-run failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<FlipResult>;
  }

  /**
   * GET /opportunity — FREE.
   *
   * Returns the live ROI for both the 2-hour pot (beat strategy) and the jackpot
   * (target streak). ROI > 1.0 = positive expected value. Alias of getOpportunity()
   * with a more action-oriented name for strategy code.
   */
  async checkOpportunity(): Promise<OpportunityInfo> {
    return this.getOpportunity();
  }

  async getPot(): Promise<PotInfo> {
    // FREE — no payment required
    const res = await fetch(`${this.baseUrl}/pot`);
    if (!res.ok) {
      throw new Error(`Pot query failed (${res.status})`);
    }
    return res.json() as Promise<PotInfo>;
  }

  async getStats(): Promise<AgentStats> {
    // FREE — no payment required
    const res = await fetch(
      `${this.baseUrl}/agent/${this.agentId}`,
    );
    if (!res.ok) {
      throw new Error(`Stats query failed (${res.status})`);
    }
    return res.json() as Promise<AgentStats>;
  }

  async listAgents(options?: { limit?: number; offset?: number }): Promise<AgentListResult> {
    // FREE — no payment required
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${this.baseUrl}/agents${qs}`);
    if (!res.ok) {
      throw new Error(`Agent list failed (${res.status})`);
    }
    return res.json() as Promise<AgentListResult>;
  }

  async getOpportunity(): Promise<OpportunityInfo> {
    // FREE — no payment required
    const res = await fetch(`${this.baseUrl}/opportunity`);
    if (!res.ok) {
      throw new Error(`Opportunity query failed (${res.status})`);
    }
    return res.json() as Promise<OpportunityInfo>;
  }

  /**
   * POST /x402/opportunity/subscribe — costs $0.001 USDC.
   *
   * @param callbackUrl HTTPS URL the gateway will POST to.
   * @param options.roiThreshold Minimum best ROI for the webhook to fire.
   *   Default 1.0 — only fire on positive-EV emergence. Set to 0 to receive
   *   every 5-min cycle regardless of ROI. (`signalThreshold` retained as an
   *   alias for older code; ignored by the gateway.)
   */
  async subscribeOpportunityWebhook(
    callbackUrl: string,
    options?: { roiThreshold?: number; signalThreshold?: Signal },
  ): Promise<WebhookSubscription>;
  // Overload: legacy positional Signal argument for backward compat.
  async subscribeOpportunityWebhook(callbackUrl: string, signalThreshold?: Signal): Promise<WebhookSubscription>;
  async subscribeOpportunityWebhook(
    callbackUrl: string,
    optionsOrSignal?: { roiThreshold?: number; signalThreshold?: Signal } | Signal,
  ): Promise<WebhookSubscription> {
    const opts = typeof optionsOrSignal === "object" ? optionsOrSignal : {};
    const body: Record<string, unknown> = { callbackUrl };
    if (typeof opts.roiThreshold === "number") body.roiThreshold = opts.roiThreshold;

    const res = await this.fetchWithPay(`${this.baseUrl}/x402/opportunity/subscribe`, {
      method: "POST",
      headers: { "x-agent-id": this.agentId, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const responseBody = await res.text();
      throw new Error(`Webhook subscribe failed (${res.status}): ${responseBody}`);
    }
    return res.json() as Promise<WebhookSubscription>;
  }

  async unsubscribeOpportunityWebhook(subscriptionId: string): Promise<void> {
    // FREE — no payment required (paying to delete makes no sense)
    const res = await fetch(`${this.baseUrl}/x402/opportunity/subscribe/${subscriptionId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(`Webhook unsubscribe failed (${res.status})`);
    }
  }

  async getOpportunityHistory(limit?: number): Promise<SignalHistoryResponse> {
    // FREE — no payment required
    const url = limit
      ? `${this.baseUrl}/opportunity/history?limit=${limit}`
      : `${this.baseUrl}/opportunity/history`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Opportunity history failed (${res.status})`);
    }
    return res.json() as Promise<SignalHistoryResponse>;
  }

  async registerReferral(): Promise<ReferralInfo> {
    // FREE — rate-limited only, requires x-agent-id
    const res = await fetch(`${this.baseUrl}/referral`, {
      method: "POST",
      headers: {
        "x-agent-id": this.agentId,
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Referral registration failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ReferralInfo>;
  }

  async getReferralLeaderboard(limit?: number): Promise<ReferralLeaderboard> {
    // FREE
    const url = limit
      ? `${this.baseUrl}/referral/leaderboard?limit=${limit}`
      : `${this.baseUrl}/referral/leaderboard`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Referral leaderboard failed (${res.status})`);
    }
    return res.json() as Promise<ReferralLeaderboard>;
  }

  async getReferralStats(): Promise<ReferralStats> {
    // FREE
    const res = await fetch(`${this.baseUrl}/referral/${this.agentId}`);
    if (!res.ok) {
      throw new Error(`Referral stats query failed (${res.status})`);
    }
    return res.json() as Promise<ReferralStats>;
  }

  /**
   * Phase 16 (REF2-09b) — register the EVM address where the operator
   * should send your accrued referral commission from the team wallet.
   * Free, requires x-agent-id. Replaces the v1 `claimReferralPayout`
   * (deprecated; the gateway no longer sends ETH for referrals).
   */
  async setReferralPayoutAddress(address: string): Promise<{ agentId: string; refCode: string; payoutAddress: string }> {
    const res = await fetch(`${this.baseUrl}/referral/payout-address`, {
      method: "POST",
      headers: {
        "x-agent-id": this.agentId,
        "content-type": "application/json",
      },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Set referral payout address failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<{ agentId: string; refCode: string; payoutAddress: string }>;
  }

  /**
   * Phase 16 (REF2-08) — get accrued referral commission, eligibility,
   * registered payout address, and operator manual-payout instructions.
   */
  async getReferralPayoutStatus(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/referral/${encodeURIComponent(this.agentId)}/payout-status`);
    if (!res.ok) {
      throw new Error(`Referral payout status query failed (${res.status})`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  /**
   * @deprecated since Phase 16 (REF2-06). Gateway no longer sends ETH for
   * referrals. Use `setReferralPayoutAddress(address)` to register your
   * payout EVM address; the operator pays manually from the team wallet
   * and records the txHash via the dashboard panel. Returns 410 Gone on
   * mainnet/testnet. Removal scheduled for v2.1.
   */
  async claimReferralPayout(_toAddress: string): Promise<ReferralPayoutResult> {
    throw new Error(
      "claimReferralPayout() is deprecated (Phase 16, REF2-06). The gateway no longer sends ETH for referrals. " +
      "Use setReferralPayoutAddress(address) to register your payout EVM address, then the operator pays manually " +
      "from the team wallet and records the txHash via the dashboard panel. " +
      "Removal scheduled for v2.1.",
    );
  }

  async getGameInfo(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/game-info`);
    if (!res.ok) throw new Error(`Game info failed (${res.status})`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  async getHealth(): Promise<GatewayHealth> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Health check failed (${res.status})`);
    }
    return res.json() as Promise<GatewayHealth>;
  }

  async getStatus(): Promise<GatewayStatus> {
    // FREE — infrastructure introspection
    const res = await fetch(`${this.baseUrl}/status`);
    if (!res.ok) {
      throw new Error(`Status check failed (${res.status})`);
    }
    return res.json() as Promise<GatewayStatus>;
  }

  async withdraw(toAddress: string): Promise<WithdrawResult> {
    const res = await this.fetchWithPay(`${this.baseUrl}/x402/withdraw`, {
      method: "POST",
      headers: {
        "x-agent-id": this.agentId,
        "content-type": "application/json",
      },
      body: JSON.stringify({ toAddress }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Withdraw failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<WithdrawResult>;
  }
}
