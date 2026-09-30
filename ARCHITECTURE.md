# Midnight ZK Auction — Architecture & Privacy Documentation

## 1. What This DApp Does

A sealed-bid auction implemented as a Compact smart contract on the Midnight Preview network.
Bidders submit encrypted commitments on-chain during the open phase, then reveal their bids
after the organizer closes the auction. The highest revealed bid wins.

---

## 2. Commitment Scheme (Contract-level privacy)

### How `place_bid()` works

```
bidderId   = persistentHash<Bytes<32>>(bidderSecret)
commitment = persistentHash<[Uint<64>, Bytes<32>]>([bidAmount, bidSalt])
ledger.commitments.insert(bidderId, commitment)
```

The on-chain ledger stores **only** `(bidderId, commitment)`. Neither `bidAmount`
nor `bidSalt` are disclosed to the ledger during `place_bid()`.

### How `reveal_bid()` works

```
// Re-derive locally and verify against on-chain commitment
assert(commitments.lookup(bidderId) == persistentHash([amount, salt]))
// Only now is the amount used for winner selection
if amount > highestBid → update winner
```

The circuit proves (in zero-knowledge) that the revealer knows the preimage of the
stored commitment, without the verifier needing to see the amount until the proof is accepted.

### Winner selection with private bid amounts

All bids remain sealed until `close_auction()` is called. After close, bidders reveal
their bids one at a time. The Compact circuit enforces that each revealed amount must match
the original commitment; fraudulent reveals (changing the amount) are rejected by the ZK proof.

Winner selection is sequential: the first bidder to reveal above the current `highestBid`
becomes the new `highestBidder`. Equal bids preserve the first revealer as winner
(strict `>` comparison in the circuit). This design is compatible with private bid amounts
because no amount is known to any party until after the bidding phase closes.

---

## 3. What Bidder Anonymity DOES and DOES NOT Mean

### What the ZK circuit DOES guarantee

| Property | Status |
|----------|--------|
| Bid amount hidden during open phase | ✅ On-chain ledger never sees `bidAmount` during `place_bid()` |
| Bidder identity hidden (not wallet address) | ✅ `bidderId = hash(secret)` — not linked to wallet |
| Bid commitment is binding | ✅ Reveal must match exact `(amount, salt)` pair |
| Reserve price enforced in circuit | ✅ Prover cannot bypass the `amount >= reserve` check |
| Organizer cannot close early without key | ✅ `close_auction()` requires proof of organizer preimage |
| Bidder cannot rebid after commitment | ✅ Duplicate `bidderId` rejected by circuit assertion |

### What the ZK circuit DOES NOT guarantee

| Limitation | Explanation |
|------------|-------------|
| **Wallet ↔ bid correlation** | The Midnight node and indexer record which wallet address pays the gas fee for each `place_bid()` transaction. An observer who sees both the public transaction graph AND can correlate timing patterns could link a wallet address to a bidder. |
| **Mempool timing** | Transaction submission timestamps are visible to node operators. A bidder who submits near a unique time-of-day may be identifiable. |
| **IP-level deanonymization** | Without a proxy/relay, the bidder's IP address is visible to the node they submit to. |
| **Number of bids** | The total number of commitments in `ledger.commitments` is public, revealing bid count. |
| **Reveal order vs. wallet** | Each `reveal_bid()` transaction is also signed by a wallet. The same wallet that paid for `place_bid()` will usually pay for `reveal_bid()`, enabling graph analysis. |

### Mitigation strategies (not implemented in this DApp)

- **Proxy relayer**: Route bid transactions through a relaying service that decouples the submitting wallet from the bidder identity.
- **Time obfuscation**: Randomise submission timing relative to the bidding window.
- **Multiple wallet addresses**: Each bid from a fresh wallet funded via a mixer.

> **Conclusion**: The ZK circuit provides **content privacy** (bid amounts and secret inputs
> are hidden from the ledger), but does NOT provide **metadata privacy** (who bid, when, from
> where). This matches standard ZK application limitations on transparent networks.

---

## 4. Production Proof-Server Architecture

### Overview

```
User Browser / CLI
       │
       ▼  (circuit transcript, witness inputs)
┌──────────────────┐
│  Proving Server  │  ← https://proof-server.preview.midnight.network
│  (stateless REST)│    Accepts: circuit ID + witness + ledger snapshot
│                  │    Returns: serialized ZK proof (Groth16 / Plonk)
└────────┬─────────┘
         │ proof blob
         ▼
┌──────────────────┐
│   Midnight Node  │  ← https://rpc.preview.midnight.network
│   (tx submission)│    Accepts: proof + signed transaction
└────────┬─────────┘
         │ confirmed tx
         ▼
┌──────────────────┐
│  Indexer GraphQL │  ← https://indexer.preview.midnight.network
│  (state queries) │    Serves: contract state, tx status, events
└──────────────────┘
```

### Proof generation time

Proof generation is performed **client-side** by the `@midnight-ntwrk/compact-runtime`
combined with the proving server. Typical times on Preview:

| Circuit | Estimated time |
|---------|---------------|
| `initialize` | 15–40 seconds |
| `place_bid` | 20–60 seconds |
| `close_auction` | 10–30 seconds |
| `reveal_bid` | 20–60 seconds |

These times depend on the proving server load, network latency, and circuit complexity.
**Do not assume proofs will complete in < 10 seconds.** The UI must handle long-running
async operations without blocking (never use `alert()` during proof generation).

### Verifier keys

The compiled verifier keys (`managed/keys/*.verifier`) are embedded in the contract at
deployment time. Any transaction submitting a proof for circuit `X` must produce a proof
that verifies against the stored verifier key for `X`. Mismatched verifier keys are
rejected by the on-chain verifier with no gas refund.

The SHA-256 hash of `contract/auction.compact` is recorded in CI
(see `.github/workflows/ci.yml`) to detect accidental circuit modifications that would
invalidate deployed contracts.

---

## 5. Verifying a Deployed Contract Independently

To verify a claimed `contractAddress` and `txId` against the Preview indexer/explorer:

### Via explorer (manual)

```
https://explorer.preview.midnight.network/transaction/<txId>
https://explorer.preview.midnight.network/contract/<contractAddress>
```

### Via indexer GraphQL (programmatic)

```graphql
query {
  contract(address: "<contractAddress>") {
    address
    state { key value }
  }
  transaction(id: "<txId>") {
    status
    blockHeight
    timestamp
  }
}
```

Endpoint: `https://indexer.preview.midnight.network/api/v1/graphql`

A contract is **genuine** if:
1. `contract.address` matches the claimed address exactly
2. `transaction.status` is `"confirmed"`
3. The state contains `isInitialized: true` and `isOpen: true` (for a freshly deployed auction)

---

## 6. Authorization Summary

| Action | Who can call | Circuit guard |
|--------|-------------|--------------|
| `initialize(reserve)` | Anyone — but only once | `assert(!isInitialized)` |
| `place_bid()` | Any bidder with a valid amount | `assert(isOpen)`, `assert(amount >= reserve)` |
| `close_auction()` | Organizer only | `assert(hash(orgSecret) == organizer)` |
| `reveal_bid()` | Any bidder with their preimage | `assert(!isOpen)`, commitment match assertion |

---

## 7. Known Limitations and Open Work

- **Finality**: Midnight Preview uses probabilistic finality. Transactions should be
  considered confirmed after 10+ block confirmations for high-value auctions.
- **No token transfer**: This contract tracks *who wins* but does not move actual tokens.
  Real settlement requires integration with Midnight's shielded token transfer.
- **No winner notification**: The `highestBidder` field holds an anonymous bidderId (hash),
  not a wallet address. Off-chain coordination is required to notify the winner.
- **Single-bid-per-bidder**: Each bidder identity (secret hash) can place exactly one bid.
  This is intentional but prevents bid correction if a bidder mistyped their amount.
