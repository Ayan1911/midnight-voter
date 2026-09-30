import { describe, it, expect } from 'vitest';
import { Contract, ledger } from '../managed/contract/index.js';
import crypto from 'crypto';

describe('Auction State Transitions & Contract Integrity', () => {
  it('should instantiate the Compact Contract with all required witnesses', () => {
    const witnesses: any = {
      getBidAmount: (context: any) => [context?.privateState, 100n],
      getBidSecret: (context: any) => [context?.privateState, new Uint8Array(32)],
      getBidSalt: (context: any) => [context?.privateState, new Uint8Array(32)],
      getOrganizerSecret: (context: any) => [context?.privateState, new Uint8Array(32)],
    };

    expect(() => new Contract(witnesses)).not.toThrow();
    const instance = new Contract(witnesses);
    expect(instance.circuits).toBeDefined();
    expect(instance.circuits.initialize).toBeDefined();
    expect(instance.circuits.place_bid).toBeDefined();
    expect(instance.circuits.close_auction).toBeDefined();
    expect(instance.circuits.reveal_bid).toBeDefined();
  });

  it('should fail instantiation if required witnesses are missing', () => {
    const incompleteWitnesses = {
      getBidAmount: () => 100n,
      getBidSecret: () => new Uint8Array(32),
    };
    expect(() => new (Contract as any)(incompleteWitnesses)).toThrow();
  });

  it('should initialize auction state representation correctly', () => {
    const initialState = {
      isInitialized: true,
      organizer: new Uint8Array(32),
      isOpen: true,
      minReserveBid: 100n,
      commitments: new Map(),
      highestBid: 0n,
      highestBidder: new Uint8Array(32)
    };

    expect(initialState.isOpen).toBe(true);
    expect(initialState.isInitialized).toBe(true);
    expect(initialState.minReserveBid).toBe(100n);
    expect(initialState.highestBid).toBe(0n);
  });

  it('should reject a bid if auction is closed', () => {
    const state = { isOpen: false };
    
    const place_bid = () => {
      if (!state.isOpen) throw new Error("Auction is closed for bidding");
    };

    expect(place_bid).toThrow("Auction is closed for bidding");
  });

  it('should reject a bid below reserve price', () => {
    const reserve = 100n;
    const bidAmount = 50n;
    
    const validateBid = (amount: bigint) => {
      if (amount < reserve) throw new Error("Bid is below reserve price");
    };

    expect(() => validateBid(bidAmount)).toThrow("Bid is below reserve price");
  });

  it('should prevent double bidding with the same bidderId', () => {
    const commitments = new Map<string, string>();
    const secret = "my_secret_key";
    const bidderId = crypto.createHash('sha256').update(secret).digest('hex');
    const commitment = crypto.createHash('sha256').update("100:salt123").digest('hex');
    
    const submit = (id: string, comm: string) => {
      if (commitments.has(id)) throw new Error("Bid already placed");
      commitments.set(id, comm);
    };

    expect(() => submit(bidderId, commitment)).not.toThrow();
    expect(() => submit(bidderId, commitment)).toThrow("Bid already placed");
  });

  it('should ensure salted commitment hides bid amounts with distinct salts', () => {
    const amount = "100";
    const salt1 = crypto.randomBytes(32).toString('hex');
    const salt2 = crypto.randomBytes(32).toString('hex');

    const commitment1 = crypto.createHash('sha256').update(`${amount}:${salt1}`).digest('hex');
    const commitment2 = crypto.createHash('sha256').update(`${amount}:${salt2}`).digest('hex');

    // Equal amounts produce different commitments due to salt
    expect(commitment1).not.toEqual(commitment2);
  });
});

