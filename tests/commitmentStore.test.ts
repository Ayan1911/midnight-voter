/**
 * Tests for CommitmentStore service.
 *
 * Uses a stubbed localStorage to avoid DOM dependency in tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub localStorage before importing CommitmentStore
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
});

import { CommitmentStore } from '../src/services/commitmentStore';
import type { BidCommitment } from '../src/services/commitmentStore';

function makeBid(overrides: Partial<BidCommitment> = {}): BidCommitment {
  return {
    bidderId: 'bidder-' + Math.random().toString(36).slice(2),
    commitment: 'commitment-hash',
    amount: 500n,
    secret: 'secret-hex',
    salt: 'salt-hex',
    timestamp: Date.now(),
    contractAddress: '0xCONTRACT',
    ...overrides,
  };
}

describe('CommitmentStore', () => {
  let cs: CommitmentStore;

  beforeEach(() => {
    localStorage.clear();
    cs = new CommitmentStore();
  });

  it('starts empty', () => {
    expect(cs.count).toBe(0);
    expect(cs.getLatest()).toBeUndefined();
  });

  it('adds a commitment and retrieves it', () => {
    const bid = makeBid({ bidderId: 'alice', contractAddress: '0xABC' });
    cs.add(bid);
    const found = cs.get('alice', '0xABC');
    expect(found).toBeDefined();
    expect(found!.amount).toBe(500n);
  });

  it('persists commitments across instances (simulating reload)', () => {
    const bid = makeBid({ bidderId: 'bob', contractAddress: '0xDEF' });
    cs.add(bid);

    const cs2 = new CommitmentStore();
    const found = cs2.get('bob', '0xDEF');
    expect(found).toBeDefined();
    expect(found!.bidderId).toBe('bob');
  });

  it('throws on duplicate bidderId+contract pair', () => {
    const bid = makeBid({ bidderId: 'alice', contractAddress: '0xABC' });
    cs.add(bid);
    expect(() => cs.add({ ...bid })).toThrow(/Duplicate bid/);
  });

  it('allows same bidderId on different contracts', () => {
    const bid1 = makeBid({ bidderId: 'alice', contractAddress: '0xABC' });
    const bid2 = makeBid({ bidderId: 'alice', contractAddress: '0xXYZ' });
    expect(() => { cs.add(bid1); cs.add(bid2); }).not.toThrow();
    expect(cs.count).toBe(2);
  });

  it('getByContract returns only matching commitments', () => {
    cs.add(makeBid({ contractAddress: '0xABC' }));
    cs.add(makeBid({ contractAddress: '0xABC' }));
    cs.add(makeBid({ contractAddress: '0xOTHER' }));
    expect(cs.getByContract('0xABC')).toHaveLength(2);
    expect(cs.getByContract('0xOTHER')).toHaveLength(1);
  });

  it('removes a commitment by bidderId and contractAddress', () => {
    const bid = makeBid({ bidderId: 'charlie', contractAddress: '0xABC' });
    cs.add(bid);
    expect(cs.count).toBe(1);
    const removed = cs.remove('charlie', '0xABC');
    expect(removed).toBe(true);
    expect(cs.count).toBe(0);
  });

  it('remove returns false when bidderId does not exist', () => {
    expect(cs.remove('nonexistent', '0xABC')).toBe(false);
  });

  it('clear() empties the store and localStorage', () => {
    cs.add(makeBid());
    cs.clear();
    expect(cs.count).toBe(0);
    expect(localStorage.getItem('zk_auction_commitments_v2')).toBeNull();
  });

  it('preserves BigInt values through serialisation round-trip', () => {
    const bid = makeBid({ amount: 9007199254740993n }); // > Number.MAX_SAFE_INTEGER
    cs.add(bid);
    const cs2 = new CommitmentStore();
    const found = cs2.get(bid.bidderId, bid.contractAddress);
    expect(found!.amount).toBe(9007199254740993n);
  });
});
