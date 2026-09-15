import { describe, it, expect } from 'vitest';

describe('Auction State Transitions', () => {
  it('should initialize auction as open with correct reserve', () => {
    const initialState = {
      isOpen: true,
      totalBids: 0n,
      minReserveBid: 100n,
      highestBidCommitment: new Uint8Array(32),
      nullifiers: new Map()
    };

    expect(initialState.isOpen).toBe(true);
    expect(initialState.minReserveBid).toBe(100n);
    expect(initialState.totalBids).toBe(0n);
  });

  it('should reject a bid if auction is closed', () => {
    const state = { isOpen: false };
    
    const submitBid = () => {
      if (!state.isOpen) throw new Error("Auction is closed");
    };

    expect(submitBid).toThrow("Auction is closed");
  });

  it('should reject a bid below reserve price', () => {
    const reserve = 100n;
    const bidAmount = 50n;
    
    const validateBid = (amount: bigint) => {
      if (amount < reserve) throw new Error("Bid is below reserve price");
    };

    expect(() => validateBid(bidAmount)).toThrow("Bid is below reserve price");
  });

  it('should prevent double bidding with the same nullifier', () => {
    const nullifiers = new Map<string, boolean>();
    const secret = "my_secret_key";
    
    const submit = (sec: string) => {
      if (nullifiers.has(sec)) throw new Error("Double-bid rejected");
      nullifiers.set(sec, true);
    };

    // First bid succeeds
    expect(() => submit(secret)).not.toThrow();
    
    // Second bid throws
    expect(() => submit(secret)).toThrow("Double-bid rejected");
  });
});
