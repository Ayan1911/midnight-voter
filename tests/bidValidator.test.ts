/**
 * Tests for bidValidator utility.
 *
 * Covers amount boundary checks, secret/salt entropy guards, and reveal validation.
 */
import { describe, it, expect } from 'vitest';
import { validateBidInputs, validateRevealInputs } from '../src/utils/bidValidator';

const RESERVE = 100n;
const validSecret = new Uint8Array(32).fill(0xAB);
const validSalt   = new Uint8Array(32).fill(0xCD);

describe('validateBidInputs', () => {
  it('accepts a valid bid above the reserve price', () => {
    const result = validateBidInputs('200', validSecret, validSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a bid below the reserve price', () => {
    const result = validateBidInputs('50', validSecret, validSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('reserve'))).toBe(true);
  });

  it('rejects a non-numeric bid amount', () => {
    const result = validateBidInputs('abc', validSecret, validSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('positive integer'))).toBe(true);
  });

  it('rejects a zero bid', () => {
    const result = validateBidInputs('0', validSecret, validSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(false);
  });

  it('rejects an all-zeros secret', () => {
    const zeroSecret = new Uint8Array(32);
    const result = validateBidInputs('200', zeroSecret, validSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('zeros'))).toBe(true);
  });

  it('rejects an all-zeros salt', () => {
    const zeroSalt = new Uint8Array(32);
    const result = validateBidInputs('200', validSecret, zeroSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('zeros'))).toBe(true);
  });

  it('warns when secret and salt are identical', () => {
    const same = new Uint8Array(32).fill(0xFF);
    const result = validateBidInputs('200', same, same, { minReserveBid: RESERVE, checkSaltEntropy: false });
    expect(result.valid).toBe(true); // warnings don't fail validation
    expect(result.warnings.some(w => w.includes('identical'))).toBe(true);
  });

  it('rejects wrong-length secret', () => {
    const shortSecret = new Uint8Array(16);
    const result = validateBidInputs('200', shortSecret, validSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('32-byte'))).toBe(true);
  });

  it('accepts exactly the reserve price as a valid bid', () => {
    const result = validateBidInputs('100', validSecret, validSalt, { minReserveBid: RESERVE });
    expect(result.valid).toBe(true);
  });

  it('rejects bid exceeding maxBid', () => {
    const result = validateBidInputs('1000', validSecret, validSalt, {
      minReserveBid: RESERVE,
      maxBid: 500n,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('maximum'))).toBe(true);
  });
});

describe('validateRevealInputs', () => {
  const validCommitment = 'a'.repeat(64);

  it('passes with valid inputs', () => {
    const result = validateRevealInputs(200n, validSecret, validSalt, validCommitment);
    expect(result.valid).toBe(true);
  });

  it('rejects zero amount', () => {
    const result = validateRevealInputs(0n, validSecret, validSalt, validCommitment);
    expect(result.valid).toBe(false);
  });

  it('rejects malformed commitment hex', () => {
    const result = validateRevealInputs(200n, validSecret, validSalt, 'not-hex');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('hex string'))).toBe(true);
  });
});
