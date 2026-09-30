/**
 * auctionPoller.ts - Polls on-chain auction state via the public indexer and
 * emits structured events through AuctionEventEmitter.
 *
 * Decouples state synchronisation from the UI layer; main.ts only subscribes
 * to events rather than querying the indexer directly.
 */

import { auctionEvents } from './auctionEventEmitter';

export interface AuctionOnChainState {
  isInitialized: boolean;
  isOpen: boolean;
  organizer: string;
  minReserveBid: bigint;
  commitmentCount: number;
  highestBid: bigint;
  highestBidder: string;
}

export interface AuctionPollerOptions {
  /** Polling interval in milliseconds. Default: 5000ms */
  intervalMs?: number;
  /** GraphQL endpoint of the Midnight indexer */
  indexerUrl: string;
  /** Deployed contract address to watch */
  contractAddress: string;
}

export class AuctionPoller {
  private intervalMs: number;
  private indexerUrl: string;
  private contractAddress: string;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastState: AuctionOnChainState | null = null;
  private running = false;

  constructor(options: AuctionPollerOptions) {
    this.intervalMs = options.intervalMs ?? 5000;
    this.indexerUrl = options.indexerUrl;
    this.contractAddress = options.contractAddress;
  }

  /** Start periodic polling. Fires immediately on first call. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.poll(); // immediate first poll
    this.timerId = setInterval(() => this.poll(), this.intervalMs);
  }

  /** Stop polling and clear the timer. */
  stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /** Force a one-shot poll outside of the scheduled interval. */
  async forcePoll(): Promise<AuctionOnChainState | null> {
    return this.poll();
  }

  private async poll(): Promise<AuctionOnChainState | null> {
    try {
      const state = await this.fetchState();
      if (!state) return null;

      const changed =
        !this.lastState ||
        this.lastState.isOpen !== state.isOpen ||
        this.lastState.highestBid !== state.highestBid ||
        this.lastState.commitmentCount !== state.commitmentCount;

      if (changed) {
        auctionEvents.emit({
          type: 'auction:state_updated',
          isOpen: state.isOpen,
          highestBid: state.highestBid,
          commitmentCount: state.commitmentCount,
        });

        // Detect auction close transition
        if (this.lastState?.isOpen && !state.isOpen) {
          auctionEvents.emit({
            type: 'auction:closed',
            finalHighestBid: state.highestBid,
          });
        }
      }

      this.lastState = state;
      return state;
    } catch (err) {
      console.warn('[AuctionPoller] Poll failed:', err);
      return null;
    }
  }

  /**
   * Fetch on-chain state via a lightweight GraphQL introspection query.
   * Falls back gracefully to null on network failure so the UI stays responsive.
   */
  private async fetchState(): Promise<AuctionOnChainState | null> {
    const query = `
      query AuctionState($address: String!) {
        contract(address: $address) {
          state {
            isInitialized
            isOpen
            organizer
            minReserveBid
            highestBid
            highestBidder
            commitments {
              totalCount
            }
          }
        }
      }
    `;

    const resp = await fetch(this.indexerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { address: this.contractAddress } }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      throw new Error(`Indexer HTTP ${resp.status}: ${resp.statusText}`);
    }

    const json = await resp.json();
    const raw = json?.data?.contract?.state;
    if (!raw) return null;

    return {
      isInitialized: Boolean(raw.isInitialized),
      isOpen: Boolean(raw.isOpen),
      organizer: String(raw.organizer ?? ''),
      minReserveBid: BigInt(raw.minReserveBid ?? 0),
      commitmentCount: Number(raw.commitments?.totalCount ?? 0),
      highestBid: BigInt(raw.highestBid ?? 0),
      highestBidder: String(raw.highestBidder ?? ''),
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  get cachedState(): AuctionOnChainState | null {
    return this.lastState;
  }
}
