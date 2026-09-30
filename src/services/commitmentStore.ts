/**
 * CommitmentStore - Manages local sealed-bid commitment data with localStorage persistence.
 *
 * Separation of concerns: this service owns all commitment-related storage logic,
 * so main.ts doesn't reach into localStorage directly for bid data.
 */

export interface BidCommitment {
  /** Hex-encoded bidder identity hash (SHA-256 of secret) */
  bidderId: string;
  /** Hex-encoded commitment hash (SHA-256 of [amount, salt]) */
  commitment: string;
  /** Raw bid amount in tNIGHT (smallest unit) */
  amount: bigint;
  /** Hex-encoded 32-byte secret used to derive bidderId */
  secret: string;
  /** Hex-encoded 32-byte salt mixed into the commitment hash */
  salt: string;
  /** Timestamp (ms since epoch) when the commitment was created */
  timestamp: number;
  /** Which contract address this commitment was placed on */
  contractAddress: string;
}

const STORAGE_KEY = 'zk_auction_commitments_v2';

/** Serialise BigInt-containing objects to JSON. */
function serialise(commitments: BidCommitment[]): string {
  return JSON.stringify(commitments, (_key, value) =>
    typeof value === 'bigint' ? { __bigint: value.toString() } : value
  );
}

/** Deserialise JSON back into BidCommitment objects with BigInt fields restored. */
function deserialise(raw: string): BidCommitment[] {
  return JSON.parse(raw, (_key, value) => {
    if (value && typeof value === 'object' && '__bigint' in value) {
      return BigInt(value.__bigint);
    }
    return value;
  }) as BidCommitment[];
}

export class CommitmentStore {
  private commitments: BidCommitment[] = [];

  constructor() {
    this.load();
  }

  /** Load commitments from localStorage. */
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.commitments = deserialise(raw);
      }
    } catch (err) {
      console.warn('[CommitmentStore] Failed to load commitments from storage:', err);
      this.commitments = [];
    }
  }

  /** Persist commitments to localStorage. */
  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, serialise(this.commitments));
    } catch (err) {
      console.error('[CommitmentStore] Failed to persist commitments:', err);
    }
  }

  /**
   * Add a new commitment. Throws if a commitment already exists for
   * the given bidderId on the same contract (prevents double-submit).
   */
  add(commitment: BidCommitment): void {
    const duplicate = this.commitments.find(
      (c) => c.bidderId === commitment.bidderId && c.contractAddress === commitment.contractAddress
    );
    if (duplicate) {
      throw new Error(
        `[CommitmentStore] Duplicate bid detected for bidderId ${commitment.bidderId} on contract ${commitment.contractAddress}`
      );
    }
    this.commitments.push(commitment);
    this.save();
  }

  /** Retrieve a commitment for the given bidderId and contract. Returns undefined if not found. */
  get(bidderId: string, contractAddress: string): BidCommitment | undefined {
    return this.commitments.find(
      (c) => c.bidderId === bidderId && c.contractAddress === contractAddress
    );
  }

  /** Retrieve all commitments for a specific contract. */
  getByContract(contractAddress: string): BidCommitment[] {
    return this.commitments.filter((c) => c.contractAddress === contractAddress);
  }

  /** Return the most recent commitment for any contract (used for auto-reveal UX). */
  getLatest(): BidCommitment | undefined {
    return this.commitments.at(-1);
  }

  /** Remove a commitment after a successful reveal. */
  remove(bidderId: string, contractAddress: string): boolean {
    const before = this.commitments.length;
    this.commitments = this.commitments.filter(
      (c) => !(c.bidderId === bidderId && c.contractAddress === contractAddress)
    );
    const removed = this.commitments.length < before;
    if (removed) this.save();
    return removed;
  }

  /** Wipe all commitments (e.g., for testing or reset flow). */
  clear(): void {
    this.commitments = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  get count(): number {
    return this.commitments.length;
  }
}

/** Singleton instance for application-wide commitment tracking. */
export const commitmentStore = new CommitmentStore();
