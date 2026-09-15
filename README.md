# Midnight Network ZK Sealed-Bid Auction dApp

> **Live Deployment:** [preview.midnight.network](https://preview.midnight.network)
> **Demo Application Video:** [Watch Demo](#)
> **Deployed Contract Address:** `(Check src/config/contract-config.json after deployment)`
> **Deployment Tx Hash:** `(Check src/config/contract-config.json after deployment)`

## Level 1: Project Setup (New Moon)
### Project Idea
A Zero-Knowledge Sealed-Bid Auction where bidders can submit their bids completely encrypted. The public ledger never sees the bid amounts or the secret keys, ensuring full auction privacy until resolution.

### Setup Instructions
1. Install Node.js v22+.
2. Install dependencies: `npm install`
3. Compile the ZK circuits: `npm run compact:compile`
4. Deploy the contract using a Lace wallet mnemonic in `.env`: `npm run deploy:preview`
5. Run the frontend UI: `npm run dev`

### Ledger vs Witness
- **Ledger (Public):** The contract stores `isOpen`, `totalBids`, `minReserveBid`, `highestBidCommitment`, and `nullifiers` publicly on-chain.
- **Witness (Private):** The bid `amount`, user `secret`, and `salt` never leave the user's machine. They are used purely to construct the ZK proof.

## Level 2: Privacy Behavior (Crescent Moon)
The application utilizes the **1AM Wallet DApp Connector API** to communicate with the Midnight extension. The `window.midnight.mn1am` connector successfully:
- Connects and requests user authorization.
- Generates ZK proofs locally via the ProofStation.
- Enforces double-bid protection via local `persistentHash` of the user's secret.

## Level 3: Privacy Model (Half Moon)
### Privacy Model Analysis
- **Secrecy:** No bidder knows the highest bid during the auction, preventing last-minute outbidding manipulation.
- **Anonymity:** Bids are committed via ZK proofs, meaning the ledger only sees a verified transaction and a nullifier, protecting the bidder's identity and bid amount.

### CI/CD
This project features an automated GitHub Actions pipeline that verifies:
- Compact Compiler ZKIR generation.
- Node.js Unit Testing.
- Vite Production Build.
