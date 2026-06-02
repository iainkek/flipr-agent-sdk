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
        topStreaks: Array<{
            wallet: string;
            streak: number;
        }>;
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
        strategies?: {
            twoHourPot_match: string;
            twoHourPot_beat: string;
            jackpot: string;
        };
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
    changes: Array<{
        from: Signal;
        to: Signal;
        timestamp: string;
    }>;
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
export declare class FliprAgent {
    private fetchWithPay;
    private baseUrl;
    private agentId;
    /** EVM address (Base path) or Solana base58 pubkey (Solana path). */
    readonly address: string;
    readonly network: "mainnet" | "testnet";
    private _solanaKey?;
    private _heliusRpcUrl?;
    private _solanaScheme?;
    private _solanaAgentId?;
    constructor(config: FliprAgentConfig);
    /**
     * Generate a fresh ephemeral EVM private key. Useful for quickstart flows
     * (especially testnet) where you don't want to pre-provision a wallet.
     *
     * SECURITY: For mainnet you almost certainly want a managed/persistent key
     * instead — losing this key loses any funds in the wallet, and any winnings
     * accumulate on this address.
     */
    static generatePrivateKey(): `0x${string}`;
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
    static testnetQuickstart(options?: {
        agentId?: string;
        gatewayUrl?: string;
        rpcUrl?: string;
    }): Promise<QuickStartResult>;
    /**
     * Claim testnet USDC for an existing FliprAgent. Sends to `this.address`
     * (the wallet derived from the private key) by default, so funds land where
     * the SDK can sign with them.
     *
     * Mainnet returns a 404 — this is testnet-only by design.
     */
    claimTestnetFaucet(toAddress?: string): Promise<FaucetClaimResult>;
    /**
     * Public read-only base URL — useful when you want to render a link to e.g.
     * the integration guide or dashboard alongside the SDK.
     */
    get url(): string;
    flip(options?: {
        ref?: string;
    }): Promise<FlipResult>;
    /** @internal — Solana payment path. Called by flip() when solanaPrivateKey was provided. */
    private _flipSolana;
    /**
     * POST /flip/dry-run — FREE.
     *
     * Validates the full request shape (x-agent-id header, response parsing) without
     * burning USDC or firing VRF. Returns the same FlipResult shape as flip(), with
     * placeholder result/streak/txHash. Use this before flip() to confirm your
     * client is wired correctly.
     */
    dryRun(): Promise<FlipResult>;
    /**
     * GET /opportunity — FREE.
     *
     * Returns the live ROI for both the 2-hour pot (beat strategy) and the jackpot
     * (target streak). ROI > 1.0 = positive expected value. Alias of getOpportunity()
     * with a more action-oriented name for strategy code.
     */
    checkOpportunity(): Promise<OpportunityInfo>;
    getPot(): Promise<PotInfo>;
    getStats(): Promise<AgentStats>;
    listAgents(options?: {
        limit?: number;
        offset?: number;
    }): Promise<AgentListResult>;
    getOpportunity(): Promise<OpportunityInfo>;
    /**
     * POST /x402/opportunity/subscribe — costs $0.001 USDC.
     *
     * @param callbackUrl HTTPS URL the gateway will POST to.
     * @param options.roiThreshold Minimum best ROI for the webhook to fire.
     *   Default 1.0 — only fire on positive-EV emergence. Set to 0 to receive
     *   every 5-min cycle regardless of ROI. (`signalThreshold` retained as an
     *   alias for older code; ignored by the gateway.)
     */
    subscribeOpportunityWebhook(callbackUrl: string, options?: {
        roiThreshold?: number;
        signalThreshold?: Signal;
    }): Promise<WebhookSubscription>;
    subscribeOpportunityWebhook(callbackUrl: string, signalThreshold?: Signal): Promise<WebhookSubscription>;
    unsubscribeOpportunityWebhook(subscriptionId: string): Promise<void>;
    getOpportunityHistory(limit?: number): Promise<SignalHistoryResponse>;
    registerReferral(): Promise<ReferralInfo>;
    getReferralLeaderboard(limit?: number): Promise<ReferralLeaderboard>;
    getReferralStats(): Promise<ReferralStats>;
    /**
     * Phase 16 (REF2-09b) — register the EVM address where the operator
     * should send your accrued referral commission from the team wallet.
     * Free, requires x-agent-id. Replaces the v1 `claimReferralPayout`
     * (deprecated; the gateway no longer sends ETH for referrals).
     */
    setReferralPayoutAddress(address: string): Promise<{
        agentId: string;
        refCode: string;
        payoutAddress: string;
    }>;
    /**
     * Phase 16 (REF2-08) — get accrued referral commission, eligibility,
     * registered payout address, and operator manual-payout instructions.
     */
    getReferralPayoutStatus(): Promise<Record<string, unknown>>;
    /**
     * @deprecated since Phase 16 (REF2-06). Gateway no longer sends ETH for
     * referrals. Use `setReferralPayoutAddress(address)` to register your
     * payout EVM address; the operator pays manually from the team wallet
     * and records the txHash via the dashboard panel. Returns 410 Gone on
     * mainnet/testnet. Removal scheduled for v2.1.
     */
    claimReferralPayout(_toAddress: string): Promise<ReferralPayoutResult>;
    getGameInfo(): Promise<Record<string, unknown>>;
    getHealth(): Promise<GatewayHealth>;
    getStatus(): Promise<GatewayStatus>;
    withdraw(toAddress: string): Promise<WithdrawResult>;
}
