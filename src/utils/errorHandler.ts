/**
 * errorHandler.ts - Centralised error classification and user-facing message mapping.
 *
 * Translates raw Error objects (from the Midnight SDK, wallet, or network) into
 * structured error records with user-friendly messages and recovery suggestions.
 */

export type AuctionErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'WALLET_REJECTED'
  | 'WALLET_WRONG_NETWORK'
  | 'CONTRACT_NOT_INITIALIZED'
  | 'CONTRACT_ALREADY_INITIALIZED'
  | 'AUCTION_CLOSED'
  | 'BID_BELOW_RESERVE'
  | 'BID_ALREADY_PLACED'
  | 'REVEAL_BEFORE_CLOSE'
  | 'INVALID_REVEAL'
  | 'PROOF_GENERATION_FAILED'
  | 'TX_SUBMISSION_FAILED'
  | 'INDEXER_UNAVAILABLE'
  | 'INSUFFICIENT_FUNDS'
  | 'UNKNOWN';

export interface AuctionError {
  code: AuctionErrorCode;
  userMessage: string;
  recovery: string;
  original?: Error;
}

const MESSAGE_MAP: Record<string, { code: AuctionErrorCode; userMessage: string; recovery: string }> = {
  'No Midnight wallet': {
    code: 'WALLET_NOT_FOUND',
    userMessage: 'No Midnight wallet extension found.',
    recovery: 'Install the Lace or 1AM wallet extension and refresh the page.',
  },
  'Connection rejected': {
    code: 'WALLET_REJECTED',
    userMessage: 'Wallet connection was rejected.',
    recovery: 'Click the connect button again and approve the request in your wallet.',
  },
  'wrong network': {
    code: 'WALLET_WRONG_NETWORK',
    userMessage: 'Your wallet is connected to the wrong network.',
    recovery: 'Switch your wallet to Midnight Preview Testnet and reconnect.',
  },
  'Auction already initialized': {
    code: 'CONTRACT_ALREADY_INITIALIZED',
    userMessage: 'This auction has already been initialized.',
    recovery: 'You cannot initialize the auction again. Check the contract address.',
  },
  'Auction is closed': {
    code: 'AUCTION_CLOSED',
    userMessage: 'The auction is no longer accepting bids.',
    recovery: 'Wait for the reveal phase to begin, then use the Reveal Bid button.',
  },
  'Bid is below reserve': {
    code: 'BID_BELOW_RESERVE',
    userMessage: 'Your bid is below the minimum reserve price.',
    recovery: 'Enter a higher bid amount that meets or exceeds the reserve price.',
  },
  'Bid already placed': {
    code: 'BID_ALREADY_PLACED',
    userMessage: 'You have already submitted a sealed bid for this auction.',
    recovery: 'Each bidder can only place one bid per auction. Wait for the reveal phase.',
  },
  'still open': {
    code: 'REVEAL_BEFORE_CLOSE',
    userMessage: 'You cannot reveal your bid while the auction is still open.',
    recovery: 'Wait for the auction organizer to close the auction, then reveal your bid.',
  },
  'Invalid bid reveal': {
    code: 'INVALID_REVEAL',
    userMessage: 'Your bid reveal does not match the stored commitment.',
    recovery: 'Ensure you are using the correct bid amount, secret, and salt from your saved commitment.',
  },
  'proof': {
    code: 'PROOF_GENERATION_FAILED',
    userMessage: 'Zero-knowledge proof generation failed.',
    recovery: 'This may be a temporary issue. Try again. If it persists, check that the proving server is reachable.',
  },
  'insufficient': {
    code: 'INSUFFICIENT_FUNDS',
    userMessage: 'Insufficient tNIGHT to cover transaction fees.',
    recovery: 'Visit the faucet at https://faucet.midnight.network to top up your wallet.',
  },
  'fetch': {
    code: 'INDEXER_UNAVAILABLE',
    userMessage: 'Could not reach the Midnight indexer.',
    recovery: 'Check your internet connection. The indexer may be temporarily unavailable.',
  },
};

/**
 * Classify a raw error into a structured AuctionError.
 * Uses substring matching on the error message for SDK errors that don't
 * have typed error classes.
 */
export function classifyError(err: unknown): AuctionError {
  const raw = err instanceof Error ? err : new Error(String(err));
  const msg = raw.message.toLowerCase();

  for (const [pattern, mapping] of Object.entries(MESSAGE_MAP)) {
    if (msg.includes(pattern.toLowerCase())) {
      return { ...mapping, original: raw };
    }
  }

  return {
    code: 'UNKNOWN',
    userMessage: 'An unexpected error occurred.',
    recovery: `Details: ${raw.message}`,
    original: raw,
  };
}

/**
 * Log a classified error to the console in a consistent format.
 */
export function logError(context: string, err: unknown): AuctionError {
  const classified = classifyError(err);
  console.error(`[${context}] ${classified.code}: ${classified.userMessage}`, classified.original);
  return classified;
}
