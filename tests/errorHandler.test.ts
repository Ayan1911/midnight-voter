/**
 * Tests for errorHandler utility.
 *
 * Verifies correct classification of all known error patterns and
 * the fallback UNKNOWN case.
 */
import { describe, it, expect } from 'vitest';
import { classifyError, logError } from '../src/utils/errorHandler';

describe('classifyError', () => {
  it('classifies wallet-not-found errors', () => {
    const result = classifyError(new Error('No Midnight wallet extension found.'));
    expect(result.code).toBe('WALLET_NOT_FOUND');
    expect(result.userMessage).toContain('wallet');
    expect(result.recovery).toBeTruthy();
  });

  it('classifies connection rejected errors', () => {
    const result = classifyError(new Error('Connection rejected by user'));
    expect(result.code).toBe('WALLET_REJECTED');
  });

  it('classifies auction closed errors', () => {
    const result = classifyError(new Error('Auction is closed for bidding'));
    expect(result.code).toBe('AUCTION_CLOSED');
  });

  it('classifies bid below reserve errors', () => {
    const result = classifyError(new Error('Bid is below reserve price'));
    expect(result.code).toBe('BID_BELOW_RESERVE');
  });

  it('classifies double-bid errors', () => {
    const result = classifyError(new Error('Bid already placed'));
    expect(result.code).toBe('BID_ALREADY_PLACED');
  });

  it('classifies reveal-before-close errors', () => {
    const result = classifyError(new Error('Auction is still open for bidding'));
    expect(result.code).toBe('REVEAL_BEFORE_CLOSE');
  });

  it('classifies invalid reveal errors', () => {
    const result = classifyError(new Error('Invalid bid reveal - commitment mismatch'));
    expect(result.code).toBe('INVALID_REVEAL');
  });

  it('classifies proof generation failures', () => {
    const result = classifyError(new Error('ZK proof generation failed after timeout'));
    expect(result.code).toBe('PROOF_GENERATION_FAILED');
  });

  it('classifies insufficient funds errors', () => {
    const result = classifyError(new Error('Transaction rejected: insufficient funds for fee'));
    expect(result.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('classifies indexer unavailability', () => {
    const result = classifyError(new TypeError('fetch failed'));
    expect(result.code).toBe('INDEXER_UNAVAILABLE');
  });

  it('returns UNKNOWN for unrecognised errors', () => {
    const result = classifyError(new Error('Some completely unknown runtime error'));
    expect(result.code).toBe('UNKNOWN');
    expect(result.userMessage).toContain('unexpected');
  });

  it('handles non-Error thrown values (strings, objects)', () => {
    const result = classifyError('plain string error');
    expect(result.code).toBe('UNKNOWN');
    expect(result.original).toBeInstanceOf(Error);
  });

  it('attaches the original Error to the result', () => {
    const err = new Error('Bid already placed');
    const result = classifyError(err);
    expect(result.original).toBe(err);
  });
});

describe('logError', () => {
  it('returns a classified AuctionError without throwing', () => {
    const result = logError('TestContext', new Error('Bid already placed'));
    expect(result.code).toBe('BID_ALREADY_PLACED');
  });
});
