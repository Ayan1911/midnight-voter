/**
 * bidValidator.ts - Client-side validation for bid submission inputs.
 *
 * Validates amount ranges, secret entropy, and salt uniqueness before
 * constructing a ZK proof, preventing wasted proof generation on invalid inputs.
 */

export interface BidValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BidValidationOptions {
  /** Minimum reserve bid in tNIGHT (smallest unit). */
  minReserveBid: bigint;
  /** Maximum sensible bid (anti-overflow guard). Default: 2^53 - 1. */
  maxBid?: bigint;
  /** Whether to check that the salt is truly random (entropy check). Default: true. */
  checkSaltEntropy?: boolean;
}

/**
 * Validate all inputs required for place_bid() before proof generation.
 */
export function validateBidInputs(
  amountStr: string,
  secret: Uint8Array,
  salt: Uint8Array,
  options: BidValidationOptions
): BidValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { minReserveBid, maxBid = BigInt(Number.MAX_SAFE_INTEGER), checkSaltEntropy = true } = options;

  // --- Amount validation ---
  let amount: bigint;
  try {
    if (!/^\d+$/.test(amountStr.trim())) {
      throw new Error('not a positive integer');
    }
    amount = BigInt(amountStr.trim());
  } catch {
    errors.push('Bid amount must be a positive integer (in tNIGHT).');
    return { valid: false, errors, warnings };
  }

  if (amount <= 0n) {
    errors.push('Bid amount must be greater than zero.');
  }
  if (amount < minReserveBid) {
    errors.push(`Bid amount (${amount}) is below the reserve price (${minReserveBid} tNIGHT).`);
  }
  if (amount > maxBid) {
    errors.push(`Bid amount exceeds the maximum allowed value (${maxBid} tNIGHT).`);
  }

  // --- Secret validation ---
  if (!(secret instanceof Uint8Array) || secret.length !== 32) {
    errors.push('Bid secret must be a 32-byte Uint8Array.');
  } else if (isAllZeros(secret)) {
    errors.push('Bid secret must not be all zeros — this would expose your identity.');
  }

  // --- Salt validation ---
  if (!(salt instanceof Uint8Array) || salt.length !== 32) {
    errors.push('Bid salt must be a 32-byte Uint8Array.');
  } else {
    if (isAllZeros(salt)) {
      errors.push('Bid salt must not be all zeros — this makes your commitment predictable.');
    }
    if (checkSaltEntropy && hasPoorEntropy(salt)) {
      warnings.push('Bid salt has low entropy. Consider generating it with crypto.getRandomValues().');
    }
  }

  // --- Cross-field check: secret and salt must differ ---
  if (
    secret instanceof Uint8Array && salt instanceof Uint8Array &&
    secret.length === 32 && salt.length === 32 &&
    arraysEqual(secret, salt)
  ) {
    warnings.push('Bid secret and salt are identical. Using the same value weakens privacy — generate independent random bytes for each.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate reveal inputs before submitting reveal_bid().
 */
export function validateRevealInputs(
  amount: bigint,
  secret: Uint8Array,
  salt: Uint8Array,
  storedCommitmentHex: string
): BidValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (amount <= 0n) errors.push('Reveal amount must be greater than zero.');
  if (!(secret instanceof Uint8Array) || secret.length !== 32) errors.push('Secret must be 32 bytes.');
  if (!(salt instanceof Uint8Array) || salt.length !== 32) errors.push('Salt must be 32 bytes.');
  if (!/^[0-9a-f]{64}$/i.test(storedCommitmentHex)) {
    errors.push('Stored commitment is not a valid 32-byte hex string.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Private helpers ---

function isAllZeros(buf: Uint8Array): boolean {
  return buf.every((b) => b === 0);
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Rough entropy check: counts distinct bytes.
 * A truly random 32-byte buffer should have at least ~10 distinct values.
 */
function hasPoorEntropy(buf: Uint8Array, threshold = 8): boolean {
  return new Set(buf).size < threshold;
}
