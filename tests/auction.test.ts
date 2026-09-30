/**
 * auction-runtime.test.ts
 *
 * Replaces hand-written JS simulation tests with tests that execute the
 * generated Compact contract runtime against real ledger state transitions.
 *
 * State threading pattern (discovered via runtime debugging):
 *   - Initial state: `contract.initialState()` → `result.currentContractState`
 *   - After each circuit call: `result.context.callProofDataTrace[0].finalQueryContext.state`
 *     returns a `ChargedState` which is assigned to a new `ContractState.data`
 *
 * All assertions use the `ledger()` deserialiser from the compiled managed contract.
 *
 * Coverage:
 *  - Happy-path: initialize → place_bid → close_auction → reveal_bid
 *  - Winner selection across multiple bidders with different bid amounts
 *  - All negative (unauthorized / incorrect-state) cases (GUARD-1 through GUARD-9)
 *  - Commitment scheme: same amount + different salts → different on-chain commitments
 *  - Reinitialization prevention (GUARD-1)
 *  - Admin authorization on close_auction (GUARD-6)
 */

import { describe, it, expect } from 'vitest';
import * as rt from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/contract/index.js';

// ─── Constants ─────────────────────────────────────────────────────────────────
const COIN_KEY    = new Uint8Array(32).fill(0x01);
const CONTRACT_ADDR = rt.dummyContractAddress();
const COST_MODEL  = rt.CostModel.initialCostModel();

type PS = Record<string, never>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Produce a repeatable 32-byte buffer filled with byte `b`. */
const b32 = (b: number): Uint8Array => new Uint8Array(32).fill(b);

/** Build witness functions for a given role configuration. */
function makeWitnesses(opts: {
  bidAmount?: bigint;
  bidSecret?: Uint8Array;
  bidSalt?: Uint8Array;
  orgSecret?: Uint8Array;
}) {
  const {
    bidAmount = 200n,
    bidSecret = b32(0xAA),
    bidSalt   = b32(0xBB),
    orgSecret = b32(0xFF),
  } = opts;
  return {
    getBidAmount:       (_c: any): [PS, bigint]     => [{} as PS, bidAmount],
    getBidSecret:       (_c: any): [PS, Uint8Array] => [{} as PS, bidSecret],
    getBidSalt:         (_c: any): [PS, Uint8Array] => [{} as PS, bidSalt],
    getOrganizerSecret: (_c: any): [PS, Uint8Array] => [{} as PS, orgSecret],
  };
}

/**
 * Bootstrap a fresh (uninitialized) contract state.
 */
async function buildFreshState(w: ReturnType<typeof makeWitnesses>) {
  const contract = new Contract(w);
  const result = await contract.initialState({
    initialPrivateState: {} as PS,
    initialZswapLocalState: {
      coinPublicKey: COIN_KEY,
      inputs: [],
      outputs: [],
      currentIndex: 0n,
    } as any,
  });
  return { contract, contractState: result.currentContractState };
}

/**
 * Build a CircuitContext that wraps the given ContractState.
 * Only accepts a `ContractState` (which has a `.data: ChargedState` field).
 */
function mkCtx(circuitId: string, contractState: rt.ContractState): rt.CircuitContext<PS> {
  return rt.createCircuitContext(
    circuitId,
    CONTRACT_ADDR,
    COIN_KEY,
    contractState,
    {} as PS,
    undefined,
    undefined,
    COST_MODEL,
  );
}

/**
 * Extract the updated ContractState from a circuit call result.
 *
 * The `finalQueryContext.state` property (NOT .state() method) returns the
 * ChargedState object containing the post-circuit ledger. Assign it directly
 * to a rebuilt ContractState with the contract's registered operations.
 */
function nextState(result: rt.CircuitResults<PS>): rt.ContractState {
  const chargedState = (result.context.callProofDataTrace[0].finalQueryContext as any).state as rt.ChargedState;
  const cs = new rt.ContractState();
  cs.data = chargedState;
  cs.setOperation('initialize',    new rt.ContractOperation());
  cs.setOperation('place_bid',     new rt.ContractOperation());
  cs.setOperation('close_auction', new rt.ContractOperation());
  cs.setOperation('reveal_bid',    new rt.ContractOperation());
  return cs;
}

/**
 * Read the typed ledger state from a circuit result.
 */
function readLedger(result: rt.CircuitResults<PS>): ReturnType<typeof ledger> {
  const chargedState = (result.context.callProofDataTrace[0].finalQueryContext as any).state as rt.ChargedState;
  return ledger(chargedState);
}

// ─── Full-lifecycle setup helper ─────────────────────────────────────────────

/**
 * Run initialize → N place_bids → close_auction.
 * Bidder i uses bidSecret=b32(i+1), bidSalt=b32(i+0x80), amount=amounts[i].
 * Returns the ContractState ready for reveal_bid calls.
 */
async function closedAuction(amounts: bigint[], reserve = 10n) {
  const orgSec = b32(0xFF);

  const { contractState: initCs } = await buildFreshState(makeWitnesses({ orgSecret: orgSec }));
  const orgContract = new Contract(makeWitnesses({ orgSecret: orgSec }));

  let r = await orgContract.circuits.initialize(mkCtx('initialize', initCs), reserve);
  let cs = nextState(r);

  for (let i = 0; i < amounts.length; i++) {
    const bw = makeWitnesses({
      bidAmount: amounts[i],
      bidSecret: b32(i + 1),
      bidSalt:   b32(i + 0x80),
      orgSecret: orgSec,
    });
    const bc = new Contract(bw);
    const br = await bc.circuits.place_bid(mkCtx('place_bid', cs));
    cs = nextState(br);
  }

  const closeContract = new Contract(makeWitnesses({ orgSecret: orgSec }));
  const cr = await closeContract.circuits.close_auction(mkCtx('close_auction', cs));
  cs = nextState(cr);

  return { closedState: cs, orgSec };
}

// ─── initialize() tests ────────────────────────────────────────────────────────

describe('Compact Contract Runtime — initialize()', () => {

  it('sets isInitialized=true, isOpen=true, and stores reserve price on-chain', async () => {
    const { contract, contractState } = await buildFreshState(makeWitnesses({ orgSecret: b32(0xFF) }));
    const result = await contract.circuits.initialize(mkCtx('initialize', contractState), 100n);
    const s = readLedger(result);

    expect(s.isInitialized).toBe(true);
    expect(s.isOpen).toBe(true);
    expect(s.minReserveBid).toBe(100n);
    expect(s.highestBid).toBe(0n);
    expect(s.commitments.isEmpty()).toBe(true);
  });

  it('stores organizer as hash of organizerSecret — raw secret never on-chain', async () => {
    const orgSec = b32(0xFF);
    const { contract, contractState } = await buildFreshState(makeWitnesses({ orgSecret: orgSec }));
    const result = await contract.circuits.initialize(mkCtx('initialize', contractState), 100n);
    const s = readLedger(result);

    // Organizer hash is non-zero (was derived from orgSec)
    expect(s.organizer).toHaveLength(32);
    expect(Array.from(s.organizer).some(b => b !== 0)).toBe(true);
    // Must NOT equal the raw secret bytes (hash ≠ preimage)
    expect(Array.from(s.organizer)).not.toEqual(Array.from(orgSec));
  });

  it('GUARD-1: rejects reinitialization after auction has already begun', async () => {
    const { contract, contractState } = await buildFreshState(makeWitnesses({ orgSecret: b32(0xFF) }));
    const r1 = await contract.circuits.initialize(mkCtx('initialize', contractState), 100n);
    const state2 = nextState(r1);

    await expect(contract.circuits.initialize(mkCtx('initialize', state2), 200n))
      .rejects.toThrow(/Auction already initialized/);
  });
});

// ─── place_bid() tests ─────────────────────────────────────────────────────────

describe('Compact Contract Runtime — place_bid()', () => {

  async function openedAuction(reserve = 100n, orgSec = b32(0xFF)) {
    const { contractState } = await buildFreshState(makeWitnesses({ orgSecret: orgSec }));
    const orgContract = new Contract(makeWitnesses({ orgSecret: orgSec }));
    const r = await orgContract.circuits.initialize(mkCtx('initialize', contractState), reserve);
    return nextState(r);
  }

  it('inserts a sealed commitment — bid amount not disclosed to ledger', async () => {
    const openState = await openedAuction();
    const bw = makeWitnesses({ bidAmount: 200n, bidSecret: b32(0xAA), bidSalt: b32(0xBB) });
    const bc = new Contract(bw);
    const result = await bc.circuits.place_bid(mkCtx('place_bid', openState));
    const s = readLedger(result);

    expect(s.commitments.isEmpty()).toBe(false);
    expect(s.commitments.size()).toBe(1n);
    expect(s.highestBid).toBe(0n); // amount sealed — ledger does not know it yet
  });

  it('GUARD-3: rejects bid below reserve price in the ZK circuit', async () => {
    const openState = await openedAuction(500n);
    const bw = makeWitnesses({ bidAmount: 100n }); // 100 < 500 reserve
    const bc = new Contract(bw);
    await expect(bc.circuits.place_bid(mkCtx('place_bid', openState)))
      .rejects.toThrow(/Bid is below reserve price/);
  });

  it('GUARD-4: rejects duplicate bid from the same bidder identity', async () => {
    const openState = await openedAuction();
    const bw = makeWitnesses({ bidAmount: 200n, bidSecret: b32(0xAA), bidSalt: b32(0xBB) });
    const bc = new Contract(bw);
    const r1 = await bc.circuits.place_bid(mkCtx('place_bid', openState));
    const afterFirst = nextState(r1);

    await expect(bc.circuits.place_bid(mkCtx('place_bid', afterFirst)))
      .rejects.toThrow(/Bid already placed/);
  });

  it('GUARD-2: rejects bids after the organizer closes the auction', async () => {
    const orgSec = b32(0xFF);
    let state = await openedAuction(100n, orgSec);

    const closeContract = new Contract(makeWitnesses({ orgSecret: orgSec }));
    const cr = await closeContract.circuits.close_auction(mkCtx('close_auction', state));
    state = nextState(cr);

    const bw = makeWitnesses({ bidAmount: 200n });
    const bc = new Contract(bw);
    await expect(bc.circuits.place_bid(mkCtx('place_bid', state)))
      .rejects.toThrow(/Auction is closed for bidding/);
  });
});

// ─── close_auction() tests ─────────────────────────────────────────────────────

describe('Compact Contract Runtime — close_auction()', () => {

  async function openedState(reserve = 100n) {
    const orgSec = b32(0xFF);
    const { contractState } = await buildFreshState(makeWitnesses({ orgSecret: orgSec }));
    const c = new Contract(makeWitnesses({ orgSecret: orgSec }));
    const r = await c.circuits.initialize(mkCtx('initialize', contractState), reserve);
    return { state: nextState(r), orgSec };
  }

  it('sets isOpen=false when the correct organizer calls close_auction', async () => {
    const { state, orgSec } = await openedState();
    const cc = new Contract(makeWitnesses({ orgSecret: orgSec }));
    const result = await cc.circuits.close_auction(mkCtx('close_auction', state));
    expect(readLedger(result).isOpen).toBe(false);
  });

  it('GUARD-6: rejects close_auction from unauthorized caller (wrong secret)', async () => {
    const { state } = await openedState();
    const attacker = new Contract(makeWitnesses({ orgSecret: b32(0x00) })); // wrong preimage
    await expect(attacker.circuits.close_auction(mkCtx('close_auction', state)))
      .rejects.toThrow(/Unauthorized/);
  });

  it('GUARD-5: rejects double-close attempt (auction already closed)', async () => {
    const { state, orgSec } = await openedState();
    const cc = new Contract(makeWitnesses({ orgSecret: orgSec }));
    const r = await cc.circuits.close_auction(mkCtx('close_auction', state));
    const closedState = nextState(r);

    await expect(cc.circuits.close_auction(mkCtx('close_auction', closedState)))
      .rejects.toThrow(/already closed/);
  });
});

// ─── reveal_bid() and winner selection tests ───────────────────────────────────

describe('Compact Contract Runtime — reveal_bid() and winner selection', () => {

  it('updates highestBid after a valid reveal', async () => {
    const { closedState } = await closedAuction([200n]);
    const rc = new Contract(makeWitnesses({ bidAmount: 200n, bidSecret: b32(1), bidSalt: b32(0x80) }));
    const result = await rc.circuits.reveal_bid(mkCtx('reveal_bid', closedState));
    expect(readLedger(result).highestBid).toBe(200n);
  });

  it('winner selection: highest bid wins across multiple reveals', async () => {
    // Bids: [150, 300, 200] → winner must be bidder #1 with 300n
    const { closedState } = await closedAuction([150n, 300n, 200n]);
    let cs = closedState;

    // Reveal bidder 0 (150n)
    const r0 = new Contract(makeWitnesses({ bidAmount: 150n, bidSecret: b32(1), bidSalt: b32(0x80) }));
    const res0 = await r0.circuits.reveal_bid(mkCtx('reveal_bid', cs));
    expect(readLedger(res0).highestBid).toBe(150n);
    cs = nextState(res0);

    // Reveal bidder 1 (300n) — new winner
    const r1 = new Contract(makeWitnesses({ bidAmount: 300n, bidSecret: b32(2), bidSalt: b32(0x81) }));
    const res1 = await r1.circuits.reveal_bid(mkCtx('reveal_bid', cs));
    expect(readLedger(res1).highestBid).toBe(300n);
    cs = nextState(res1);

    // Reveal bidder 2 (200n) — lower, winner must not change
    const r2 = new Contract(makeWitnesses({ bidAmount: 200n, bidSecret: b32(3), bidSalt: b32(0x82) }));
    const res2 = await r2.circuits.reveal_bid(mkCtx('reveal_bid', cs));
    expect(readLedger(res2).highestBid).toBe(300n); // 300n still wins
  });

  it('equal bids: first revealer keeps the win (strict > comparison in circuit)', async () => {
    const { closedState } = await closedAuction([200n, 200n]);
    let cs = closedState;

    const r0 = new Contract(makeWitnesses({ bidAmount: 200n, bidSecret: b32(1), bidSalt: b32(0x80) }));
    const res0 = await r0.circuits.reveal_bid(mkCtx('reveal_bid', cs));
    const firstWinner = Array.from(readLedger(res0).highestBidder);
    cs = nextState(res0);

    const r1 = new Contract(makeWitnesses({ bidAmount: 200n, bidSecret: b32(2), bidSalt: b32(0x81) }));
    const res1 = await r1.circuits.reveal_bid(mkCtx('reveal_bid', cs));
    // Second reveal (same amount) must NOT replace the first winner
    expect(Array.from(readLedger(res1).highestBidder)).toEqual(firstWinner);
  });

  it('GUARD-7: rejects reveal_bid before auction is closed', async () => {
    const orgSec = b32(0xFF);
    const { contractState } = await buildFreshState(makeWitnesses({ orgSecret: orgSec }));
    const c = new Contract(makeWitnesses({ orgSecret: orgSec }));
    let r = await c.circuits.initialize(mkCtx('initialize', contractState), 100n);
    let cs = nextState(r);

    // Place one bid
    const bw = makeWitnesses({ bidAmount: 200n, bidSecret: b32(1), bidSalt: b32(0x80) });
    const bc = new Contract(bw);
    const br = await bc.circuits.place_bid(mkCtx('place_bid', cs));
    cs = nextState(br);

    // Attempt reveal without closing first
    const rc = new Contract(bw);
    await expect(rc.circuits.reveal_bid(mkCtx('reveal_bid', cs)))
      .rejects.toThrow(/still open/);
  });

  it('GUARD-9: rejects reveal with wrong amount — commitment mismatch', async () => {
    const { closedState } = await closedAuction([200n]);
    const rc = new Contract(makeWitnesses({
      bidAmount: 999n,   // WRONG — actual bid was 200n
      bidSecret: b32(1),
      bidSalt:   b32(0x80),
    }));
    await expect(rc.circuits.reveal_bid(mkCtx('reveal_bid', closedState)))
      .rejects.toThrow(/commitment mismatch|Invalid bid reveal/);
  });

  it('GUARD-9: rejects reveal with wrong salt — commitment mismatch', async () => {
    const { closedState } = await closedAuction([200n]);
    const rc = new Contract(makeWitnesses({
      bidAmount: 200n,
      bidSecret: b32(1),
      bidSalt:   b32(0x00),  // WRONG salt
    }));
    await expect(rc.circuits.reveal_bid(mkCtx('reveal_bid', closedState)))
      .rejects.toThrow(/commitment mismatch|Invalid bid reveal/);
  });

  it('GUARD-8: rejects reveal from bidder who never placed a commitment', async () => {
    const { closedState } = await closedAuction([200n]);
    // Secret 0xDD never placed a bid
    const rc = new Contract(makeWitnesses({ bidAmount: 200n, bidSecret: b32(0xDD), bidSalt: b32(0x80) }));
    await expect(rc.circuits.reveal_bid(mkCtx('reveal_bid', closedState)))
      .rejects.toThrow(/No commitment found/);
  });
});

// ─── Commitment scheme properties ─────────────────────────────────────────────

describe('Compact Contract Runtime — commitment scheme properties', () => {

  it('same amount + different salts → different on-chain commitment values', async () => {
    const orgSec = b32(0xFF);
    const { contractState } = await buildFreshState(makeWitnesses({ orgSecret: orgSec }));
    const oc = new Contract(makeWitnesses({ orgSecret: orgSec }));
    let r = await oc.circuits.initialize(mkCtx('initialize', contractState), 10n);
    let cs = nextState(r);

    // Bidder A: amount=100, salt=0x11
    const bcA = new Contract(makeWitnesses({ bidAmount: 100n, bidSecret: b32(0x01), bidSalt: b32(0x11) }));
    const rA = await bcA.circuits.place_bid(mkCtx('place_bid', cs));
    cs = nextState(rA);

    // Bidder B: amount=100, salt=0x22 — same amount, different salt
    const bcB = new Contract(makeWitnesses({ bidAmount: 100n, bidSecret: b32(0x02), bidSalt: b32(0x22) }));
    const rB = await bcB.circuits.place_bid(mkCtx('place_bid', cs));

    const finalState = readLedger(rB);
    const entries = [...finalState.commitments];
    expect(entries).toHaveLength(2);

    // The two commitment values must differ despite equal bid amounts
    const [, commA] = entries[0];
    const [, commB] = entries[1];
    expect(Array.from(commA)).not.toEqual(Array.from(commB));
  });

  it('same bidder identity (same secret) cannot bid twice even with different amounts', async () => {
    const orgSec = b32(0xFF);
    const { contractState } = await buildFreshState(makeWitnesses({ orgSecret: orgSec }));
    const oc = new Contract(makeWitnesses({ orgSecret: orgSec }));
    let r = await oc.circuits.initialize(mkCtx('initialize', contractState), 10n);
    let cs = nextState(r);

    // First bid: amount=100, secret=0x01, salt=0x11
    const bwA = makeWitnesses({ bidAmount: 100n, bidSecret: b32(0x01), bidSalt: b32(0x11) });
    const bcA = new Contract(bwA);
    const rA = await bcA.circuits.place_bid(mkCtx('place_bid', cs));
    cs = nextState(rA);

    // Second bid: SAME secret → same bidderId → must be rejected (GUARD-4)
    const bwB = makeWitnesses({ bidAmount: 500n, bidSecret: b32(0x01), bidSalt: b32(0x22) });
    const bcB = new Contract(bwB);
    await expect(bcB.circuits.place_bid(mkCtx('place_bid', cs)))
      .rejects.toThrow(/Bid already placed/);
  });
});
